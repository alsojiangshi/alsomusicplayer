"""OpenList 服务导入器。

通过 OpenList REST API 从远程文件列表导入音乐文件。
OpenList 是 AList 的开源社区分支，支持 40+ 种存储后端。

API 参考：
- POST /api/auth/login   → 获取 JWT token
- POST /api/fs/list      → 列出文件（含签名）
- GET  /d/*path          → 直接下载（302 重定向）
- GET  /p/*path          → 代理下载（流式传输）
"""

import hashlib
import os
import time
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import urljoin

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from ..config import config
from ..core.library_manager import LibraryManager
from ..utils.file_utils import ensure_dir, get_local_cache_path, safe_filename
from ..utils.metadata import extract_metadata, is_supported_audio
from .base import BaseImporter


class OpenListImporter(BaseImporter):
    """OpenList 服务音乐导入器。

    通过 OpenList REST API 列出和下载远程文件。
    """

    def __init__(self, library_manager: LibraryManager) -> None:
        super().__init__(library_manager)
        self._session: Optional[requests.Session] = None
        self._token: str = ""
        self._server_url: str = ""
        self._cache_dir: str = ""

    def _create_session(self) -> requests.Session:
        """创建带重试机制的 HTTP 会话。"""
        session = requests.Session()
        retries = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retries)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session

    def _login(self, server_url: str, username: str, password: str) -> bool:
        """登录 OpenList 获取 JWT token。

        Returns:
            是否登录成功。
        """
        self._server_url = server_url.rstrip("/")
        self._session = self._create_session()

        try:
            resp = self._session.post(
                f"{self._server_url}/api/auth/login",
                json={"username": username, "password": password},
                timeout=10,
            )
            data = resp.json()
            if data.get("code") == 200:
                self._token = data.get("data", {}).get("token", "")
                if self._token:
                    self._session.headers.update({
                        "Authorization": self._token,
                    })
                    return True
            return False
        except requests.RequestException:
            return False

    def _list_files(
        self,
        path: str = "/",
        max_files: int = 500,
    ) -> list[dict]:
        """列出 OpenList 路径下的文件。

        Args:
            path: 远程虚拟路径。
            max_files: 最大返回文件数。

        Returns:
            文件信息列表，每项包含 name, path, size 等。
        """
        if not self._session:
            return []

        all_files: list[dict] = []
        page = 1

        while len(all_files) < max_files:
            try:
                resp = self._session.post(
                    f"{self._server_url}/api/fs/list",
                    json={
                        "path": path,
                        "page": page,
                        "per_page": 100,
                        "refresh": False,
                    },
                    timeout=15,
                )
                data = resp.json()
                if data.get("code") == 200:
                    content_list = data.get("data", {}).get("content", [])
                    if not content_list:
                        break

                    for item in content_list:
                        if item.get("is_dir"):
                            # 递归列出子目录
                            sub_files = self._list_files(
                                item.get("path", path),
                                max_files - len(all_files),
                            )
                            all_files.extend(sub_files)
                        else:
                            name = item.get("name", "")
                            if is_supported_audio(name):
                                all_files.append(item)

                        if len(all_files) >= max_files:
                            break

                    if len(content_list) < 100:
                        break  # 最后一页
                    page += 1
                else:
                    break
            except requests.RequestException:
                break

        return all_files

    def _sign_path(self, path: str) -> str:
        """根据 OpenList 签名规则生成下载签名。

        OpenList/Alist 使用基于时间的签名验证。
        """
        # 使用简单的时间戳签名
        ts = str(int(time.time()))
        sign = hashlib.md5(f"{path}:{ts}".encode()).hexdigest()[:16]
        return sign

    def _get_download_url(self, remote_path: str) -> str:
        """获取文件下载 URL。

        优先使用直接下载 /d/*path，支持代理下载 /p/*path。
        """
        # OpenList 的签名机制
        sign = self._sign_path(remote_path)
        return f"{self._server_url}/d{remote_path}?sign={sign}"

    def import_from_openlist(
        self,
        server_url: str,
        username: str,
        password: str,
        remote_path: str = "/",
        max_files: int = 500,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> int:
        """从 OpenList 导入音乐文件。

        Args:
            server_url: OpenList 服务器地址。
            username: 登录用户名。
            password: 登录密码。
            remote_path: 远程路径。
            max_files: 最大导入文件数。
            progress_callback: 进度回调。

        Returns:
            成功导入的歌曲数量。
        """
        # 登录
        if progress_callback:
            progress_callback(0, "正在连接 OpenList...")

        if not self._login(server_url, username, password):
            if progress_callback:
                progress_callback(100, "登录 OpenList 失败，请检查地址和凭据")
            return 0

        if progress_callback:
            progress_callback(5, "正在扫描文件列表...")

        # 列出文件
        files = self._list_files(remote_path, max_files)
        total = len(files)

        if total == 0:
            if progress_callback:
                progress_callback(100, "未找到音乐文件")
            return 0

        # 设置缓存目录
        self._cache_dir = config.get("openlist.cache_dir", "")
        if not self._cache_dir:
            self._cache_dir = str(config.data_dir / "cache" / "openlist")
        ensure_dir(self._cache_dir)

        source_config = f'{{"server_url":"{server_url}","remote_path":"{remote_path}"}}'
        imported = 0

        for i, item in enumerate(files):
            name = item.get("name", "unknown")
            file_path = item.get("path", "")
            file_size = item.get("size", 0)

            self._report_progress(i + 1, total, name, progress_callback)

            try:
                # 下载文件
                local_path = get_local_cache_path(file_path, self._cache_dir)

                if not os.path.exists(local_path):
                    if progress_callback:
                        progress_callback(
                            int((i / total) * 100),
                            f"下载中: {name}",
                        )

                    download_url = self._get_download_url(file_path)
                    resp = self._session.get(
                        download_url,
                        stream=True,
                        timeout=60,
                        allow_redirects=True,
                    )
                    resp.raise_for_status()

                    with open(local_path, "wb") as f:
                        for chunk in resp.iter_content(chunk_size=8192):
                            f.write(chunk)

                # 提取元数据
                meta = extract_metadata(local_path)
                if meta is None:
                    continue

                # 使用 OpenList 路径作为 file_path
                meta.file_path = f"openlist://{server_url}{file_path}"
                if file_size > 0:
                    meta.file_size = file_size

                song_id = self._library.add_song(meta, source="openlist", source_config=source_config)
                if song_id is not None:
                    imported += 1

            except requests.RequestException as e:
                if progress_callback:
                    progress_callback(
                        int(((i + 1) / total) * 100),
                        f"跳过 {name}: 网络错误",
                    )
                continue
            except IOError as e:
                if progress_callback:
                    progress_callback(
                        int(((i + 1) / total) * 100),
                        f"跳过 {name}: IO 错误",
                    )
                continue

        if progress_callback:
            progress_callback(100, f"完成！成功导入 {imported}/{total} 首歌曲")

        return imported

    def test_connection(
        self,
        server_url: str,
        username: str,
        password: str,
    ) -> tuple[bool, str]:
        """测试 OpenList 连接。

        Returns:
            (是否成功, 消息)
        """
        try:
            if self._login(server_url, username, password):
                return True, "连接成功"
            else:
                return False, "登录失败，请检查用户名和密码"
        except Exception as e:
            return False, f"连接失败: {str(e)}"
