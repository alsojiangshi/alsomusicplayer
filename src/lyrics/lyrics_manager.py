"""歌词管理器模块。

编排歌词的搜索、缓存、导入流程。
"""

from typing import Callable, Optional

from PySide6.QtCore import QThreadPool

from ..config import config
from ..core.library_manager import LibraryManager
from ..database import db
from ..utils.workers import Worker
from .lrc_parser import LRCParser
from .providers.base import LyricsProvider
from .providers.local_file import LocalFileProvider
from .providers.lrclib import LRCLibProvider
from .providers.netease import NeteaseProvider


class LyricsManager:
    """歌词管理编排器。

    负责：
    - 管理歌词提供者（LRCLIB, 网易云, 本地）
    - 缓存已获取的歌词
    - 编排搜索优先级
    """

    def __init__(self, library_manager: LibraryManager) -> None:
        self._library = library_manager
        self.lrc_parser = LRCParser()

        # 初始化提供者
        self._providers: dict[str, LyricsProvider] = {
            "lrclib": LRCLibProvider(),
            "netease": NeteaseProvider(),
            "local": LocalFileProvider(),
        }

    def get_cached_lyrics(self, song_id: int) -> Optional[dict]:
        """从数据库获取缓存的歌词。

        Returns:
            歌词数据字典，如果不存在则返回 None。
        """
        row = db.fetch_one(
            "SELECT * FROM lyrics_cache WHERE song_id = ?",
            (song_id,),
        )
        if row:
            return {
                "source": row["source"],
                "plain_text": row["plain_text"],
                "synced_text": row["synced_text"],
                "language": row["language"],
            }
        return None

    def search_online(
        self,
        title: str,
        artist: str,
        album: str = "",
        duration: float = 0.0,
        providers: Optional[list[str]] = None,
    ) -> Optional[dict]:
        """在线搜索歌词（同步方法）。

        Args:
            title: 歌曲标题。
            artist: 艺术家名称。
            album: 专辑名称。
            duration: 歌曲时长（秒）。
            providers: 要使用的提供者列表，None 表示使用配置中的所有。

        Returns:
            歌词数据字典，或 None。
        """
        if providers is None:
            providers = config.get("lyrics.providers", ["lrclib", "netease"])

        for provider_name in providers:
            provider = self._providers.get(provider_name)
            if provider is None:
                continue

            result = provider.search(title, artist, album, duration)
            if result:
                return result

        return None

    def search_online_async(
        self,
        song_id: int,
        title: str,
        artist: str,
        callback: Callable[[int, Optional[dict]], None],
        album: str = "",
        duration: float = 0.0,
        force: bool = False,
    ) -> None:
        """在线搜索歌词（异步方法，在后台线程中运行）。

        Args:
            song_id: 歌曲 ID，用于缓存关联。
            title: 标题。
            artist: 艺术家。
            callback: 完成回调 (song_id, lyrics_data)。
            album: 专辑。
            duration: 时长。
            force: 强制重新搜索（忽略缓存）。
        """
        if not force:
            cached = self.get_cached_lyrics(song_id)
            if cached:
                callback(song_id, cached)
                return

        def _search():
            lyrics_data = self.search_online(title, artist, album, duration)
            if lyrics_data:
                self._cache_lyrics(song_id, lyrics_data)
            return lyrics_data

        worker = Worker(_search)
        worker.signals.result.connect(
            lambda data: callback(song_id, data)
        )
        worker.signals.error.connect(
            lambda e: callback(song_id, None)
        )
        QThreadPool.globalInstance().start(worker)

    def import_local_lyrics(self, song_id: int, content: str) -> bool:
        """导入本地歌词文件内容。

        Args:
            song_id: 关联的歌曲 ID。
            content: 歌词文件文本内容。

        Returns:
            是否成功导入。
        """
        if not content.strip():
            return False

        provider = self._providers["local"]
        lyrics_data = provider.import_content(content)

        if lyrics_data is None:
            return False

        self._cache_lyrics(song_id, lyrics_data)
        return True

    def find_local_lrc_file(self, audio_file_path: str) -> Optional[str]:
        """查找与音频文件关联的本地 .lrc 文件。"""
        provider = self._providers["local"]
        return provider.find_local_lrc(audio_file_path)

    def _cache_lyrics(self, song_id: int, lyrics_data: dict) -> None:
        """将歌词缓存到数据库。"""
        db.execute(
            """
            INSERT OR REPLACE INTO lyrics_cache
            (song_id, plain_text, synced_text, source, language)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                song_id,
                lyrics_data.get("plain_text"),
                lyrics_data.get("synced_text"),
                lyrics_data.get("source"),
                lyrics_data.get("language", "original"),
            ),
        )
        db.commit()
