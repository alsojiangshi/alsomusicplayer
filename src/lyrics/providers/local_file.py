"""本地文件歌词提供者。

处理本地 .lrc 和 .txt 文件的导入。
"""

import os
from pathlib import Path
from typing import Optional

from .base import LyricsProvider


class LocalFileProvider(LyricsProvider):
    """本地文件歌词提供者。

    搜索与音频文件同目录的 .lrc 文件，或导入指定的歌词文件。
    """

    @property
    def name(self) -> str:
        return "local"

    def search(
        self,
        title: str,
        artist: str,
        album: str = "",
        duration: float = 0.0,
    ) -> Optional[dict]:
        """本地文件不支持搜索，返回 None。"""
        return None

    def find_local_lrc(self, audio_file_path: str) -> Optional[str]:
        """在音频文件同目录下查找 .lrc 歌词文件。

        查找顺序：
        1. 同目录下的 .lrc 文件
        2. 匹配文件名的 .lrc 文件
        """
        if not os.path.exists(audio_file_path):
            return None

        audio_dir = Path(audio_file_path).parent
        audio_name = Path(audio_file_path).stem

        # 1. 同文件名的 .lrc
        lrc_path = audio_dir / f"{audio_name}.lrc"
        if lrc_path.exists():
            return str(lrc_path)

        # 2. 同目录下的任何 .lrc
        for item in audio_dir.glob("*.lrc"):
            return str(item)

        return None

    def import_content(self, content: str) -> Optional[dict]:
        """从文本内容导入歌词。

        自动检测是否为 LRC 格式或纯文本。

        Args:
            content: 歌词文件内容。

        Returns:
            统一格式的歌词数据。
        """
        if not content.strip():
            return None

        # 检测是否包含 LRC 时间标签
        import re
        has_timestamps = bool(re.search(r"\[\d{2}:\d{2}", content))

        return {
            "source": "local_import",
            "plain_text": content if not has_timestamps else None,
            "synced_text": content if has_timestamps else None,
            "language": "original",
        }
