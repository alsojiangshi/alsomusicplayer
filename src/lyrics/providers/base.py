"""歌词提供者抽象基类。"""

from abc import ABC, abstractmethod
from typing import Optional


class LyricsProvider(ABC):
    """歌词提供者接口。

    所有在线/本地歌词源都应实现此接口。
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """提供者名称，如 'lrclib', 'netease', 'local'。"""
        ...

    @abstractmethod
    def search(
        self,
        title: str,
        artist: str,
        album: str = "",
        duration: float = 0.0,
    ) -> Optional[dict]:
        """搜索歌词。

        Args:
            title: 歌曲标题。
            artist: 艺术家名称。
            album: 专辑名称（可选）。
            duration: 歌曲时长（秒，可选，用于精确匹配）。

        Returns:
            {
                "source": str,        # 来源标识
                "plain_text": str,    # 纯文本歌词
                "synced_text": str | None,  # 同步歌词（LRC 格式）
                "language": str,      # 语言
            }
            或 None（未找到）。
        """
        ...
