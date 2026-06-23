"""LRC 歌词解析器。

支持标准 LRC 格式的解析，包括：
- 带时间戳的同步歌词 `[mm:ss.xx]`
- 增强格式 `[mm:ss.xx]<mm:ss.xx> 逐字时间`
- 无时间戳的纯文本歌词
- 元数据标签 `[ti:xxx]`, `[ar:xxx]` 等
"""

import re
from typing import Optional


class LRCParser:
    """LRC 歌词文件解析器。"""

    # 匹配标准时间标签 [mm:ss.xx] 或 [mm:ss]
    TIMESTAMP_RE = re.compile(r"\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]")

    # 匹配元数据标签 [key:value]
    META_RE = re.compile(r"\[([a-z]+):(.+?)\]", re.IGNORECASE)

    # 匹配逐字时间标签 <mm:ss.xx>
    WORD_TIME_RE = re.compile(r"<(\d{2}):(\d{2})(?:\.(\d{1,3}))?>")

    def __init__(self) -> None:
        self._metadata: dict[str, str] = {}

    @property
    def metadata(self) -> dict[str, str]:
        """解析出的元数据（标题、艺术家等）。"""
        return self._metadata

    def parse(self, lrc_text: str) -> list[tuple[float, str]]:
        """解析 LRC 文本为时间-歌词行列表。

        Args:
            lrc_text: LRC 格式的歌词文本。

        Returns:
            [(time_in_seconds, lyric_text), ...] 按时间排序的列表。
            纯文本歌词会以 [(0.0, "line1"), (0.0, "line2"), ...] 返回。
        """
        self._metadata = {}
        lines = lrc_text.strip().split("\n")
        result: list[tuple[float, str]] = []
        has_timestamps = False

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # 提取元数据
            meta_match = self.META_RE.match(line)
            if meta_match:
                self._metadata[meta_match.group(1)] = meta_match.group(2).strip()
                continue

            # 提取时间戳
            timestamps = self.TIMESTAMP_RE.findall(line)

            if timestamps:
                has_timestamps = True
                # 移除时间标签后的文本
                text = self.TIMESTAMP_RE.sub("", line).strip()
                # 移除逐字时间标签
                text = self.WORD_TIME_RE.sub("", text).strip()

                for ts in timestamps:
                    minutes = int(ts[0])
                    seconds = int(ts[1])
                    milliseconds = int(ts[2].ljust(3, "0")[:3]) if ts[2] else 0
                    time_sec = minutes * 60.0 + seconds + milliseconds / 1000.0
                    result.append((time_sec, text))
            else:
                # 无时间戳行
                if line and not line.startswith("["):
                    result.append((0.0, line))

        # 如果没有任何时间戳，返回纯文本
        if not has_timestamps:
            return [(0.0, line) for line in lrc_text.strip().split("\n") if line.strip()]

        # 按时间排序
        result.sort(key=lambda x: x[0])
        return result

    def is_synced(self, lrc_text: str) -> bool:
        """判断 LRC 文本是否包含时间戳（同步歌词）。"""
        return bool(self.TIMESTAMP_RE.search(lrc_text))

    def parse_to_plain(self, lrc_text: str) -> str:
        """将 LRC 文本转换为纯文本（移除所有时间标签）。"""
        text = self.TIMESTAMP_RE.sub("", lrc_text)
        text = self.WORD_TIME_RE.sub("", text)
        # 移除元数据标签
        text = self.META_RE.sub("", text)
        # 清理空行和多余空白
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        return "\n".join(lines)

    def generate_lrc(self, lyrics: list[tuple[float, str]], metadata: Optional[dict] = None) -> str:
        """从歌词数据生成 LRC 格式文本。

        Args:
            lyrics: [(time_seconds, text), ...] 列表。
            metadata: 可选的元数据字典 {ti: title, ar: artist}。

        Returns:
            LRC 格式文本。
        """
        lines: list[str] = []

        if metadata:
            for key, value in metadata.items():
                lines.append(f"[{key}:{value}]")

        for time_sec, text in lyrics:
            minutes = int(time_sec // 60)
            seconds = int(time_sec % 60)
            centiseconds = int((time_sec % 1) * 100)
            timestamp = f"[{minutes:02d}:{seconds:02d}.{centiseconds:02d}]"
            lines.append(f"{timestamp}{text}")

        return "\n".join(lines)
