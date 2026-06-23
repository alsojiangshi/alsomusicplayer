"""S3 / MinIO 对象存储导入器。

支持从兼容 S3 协议的对象存储（如 AWS S3、MinIO）导入音乐文件。
文件会先下载到本地缓存目录，然后提取元数据。
"""

import os
import tempfile
from pathlib import Path
from typing import Callable, Optional

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from ..config import config
from ..core.library_manager import LibraryManager
from ..utils.file_utils import ensure_dir, get_local_cache_path
from ..utils.metadata import FORMAT_MAP, extract_metadata, is_supported_audio
from .base import BaseImporter


class S3Importer(BaseImporter):
    """S3 / MinIO 音乐文件导入器。"""

    def __init__(self, library_manager: LibraryManager) -> None:
        super().__init__(library_manager)
        self._cache_dir = ""

    def _create_client(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        region: str = "us-east-1",
        use_ssl: bool = True,
    ):
        """创建 S3 客户端。"""
        scheme = "https" if use_ssl else "http"
        endpoint_url = endpoint if endpoint.startswith("http") else f"{scheme}://{endpoint}"

        return boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=BotoConfig(
                signature_version="s3v4",
                retries={"max_attempts": 3},
            ),
        )

    def _list_objects(
        self,
        client,
        bucket: str,
        prefix: str = "",
        max_keys: int = 500,
    ) -> list[dict]:
        """列出存储桶中的音乐文件。

        Returns:
            包含 Key, Size 等信息的对象列表。
        """
        objects: list[dict] = []
        continuation_token = None

        while len(objects) < max_keys:
            params = {
                "Bucket": bucket,
                "Prefix": prefix,
                "MaxKeys": min(1000, max_keys - len(objects)),
            }
            if continuation_token:
                params["ContinuationToken"] = continuation_token

            resp = client.list_objects_v2(**params)

            for obj in resp.get("Contents", []):
                key = obj.get("Key", "")
                if is_supported_audio(key) and obj.get("Size", 0) > 0:
                    objects.append(obj)

            if not resp.get("IsTruncated"):
                break
            continuation_token = resp.get("NextContinuationToken")

        return objects

    def import_from_s3(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        prefix: str = "",
        region: str = "us-east-1",
        use_ssl: bool = True,
        max_files: int = 500,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> int:
        """从 S3/MinIO 导入音乐文件。

        Args:
            endpoint: S3 服务地址。
            access_key: 访问密钥。
            secret_key: 秘密密钥。
            bucket: 存储桶名称。
            prefix: 对象键前缀。
            region: 区域。
            use_ssl: 是否使用 HTTPS。
            max_files: 最大导入文件数。
            progress_callback: 进度回调。

        Returns:
            成功导入的歌曲数量。
        """
        # 设置缓存目录
        self._cache_dir = config.get("s3.cache_dir", "")
        if not self._cache_dir:
            self._cache_dir = str(config.data_dir / "cache" / "s3")
        ensure_dir(self._cache_dir)

        if progress_callback:
            progress_callback(0, "正在连接 S3 服务...")

        client = self._create_client(endpoint, access_key, secret_key, region, use_ssl)

        if progress_callback:
            progress_callback(5, "正在扫描文件列表...")

        objects = self._list_objects(client, bucket, prefix, max_files)
        total = len(objects)
        imported = 0

        if total == 0:
            if progress_callback:
                progress_callback(100, "未找到音乐文件")
            return 0

        source_config = f'{{"endpoint":"{endpoint}","bucket":"{bucket}"}}'

        for i, obj in enumerate(objects):
            key = obj["Key"]
            filename = Path(key).name

            self._report_progress(i + 1, total, filename, progress_callback)

            try:
                # 下载到本地缓存
                local_path = get_local_cache_path(key, self._cache_dir)

                if not os.path.exists(local_path):
                    if progress_callback:
                        progress_callback(
                            int(((i) / total) * 100),
                            f"下载中: {filename}",
                        )
                    client.download_file(bucket, key, local_path)

                # 提取元数据
                meta = extract_metadata(local_path)
                if meta is None:
                    continue

                # 使用 S3 key 作为 file_path
                meta.file_path = f"s3://{bucket}/{key}"

                song_id = self._library.add_song(meta, source="s3", source_config=source_config)
                if song_id is not None:
                    imported += 1

            except ClientError as e:
                if progress_callback:
                    progress_callback(
                        int(((i + 1) / total) * 100),
                        f"跳过 {filename}: {e}",
                    )
                continue

        if progress_callback:
            progress_callback(100, f"完成！成功导入 {imported}/{total} 首歌曲")

        return imported

    def test_connection(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        region: str = "us-east-1",
        use_ssl: bool = True,
    ) -> tuple[bool, str]:
        """测试 S3 连接。

        Returns:
            (是否成功, 消息)
        """
        try:
            client = self._create_client(endpoint, access_key, secret_key, region, use_ssl)
            client.head_bucket(Bucket=bucket)
            return True, "连接成功"
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            return False, f"连接失败: {error_code}"
        except Exception as e:
            return False, f"连接失败: {str(e)}"
