"""音频文件元数据提取模块。

使用 mutagen 库读取各种音频格式的标签信息。
"""

import hashlib
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from mutagen import File as MutagenFile
from mutagen.flac import FLAC
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4
from mutagen.oggvorbis import OggVorbis
from mutagen.wave import WAVE


# 支持的音频格式扩展名
SUPPORTED_EXTENSIONS: set[str] = {
    ".mp3", ".flac", ".wav", ".ogg", ".oga", ".m4a", ".mp4",
    ".aac", ".wma", ".opus", ".aiff", ".aif",
}

# MIME 类型映射
FORMAT_MAP: dict[str, str] = {
    ".mp3": "MP3",
    ".flac": "FLAC",
    ".wav": "WAV",
    ".ogg": "OGG",
    ".oga": "OGG",
    ".m4a": "M4A",
    ".mp4": "M4A",
    ".aac": "AAC",
    ".wma": "WMA",
    ".opus": "OPUS",
    ".aiff": "AIFF",
    ".aif": "AIFF",
}


@dataclass
class TrackMetadata:
    """音乐文件元数据。"""

    title: str = "Unknown Title"
    artist: str = "Unknown Artist"
    album: str = "Unknown Album"
    duration: float = 0.0  # 秒
    file_path: str = ""
    file_hash: str = ""
    format: str = ""
    bitrate: int = 0  # bps
    sample_rate: int = 0  # Hz
    channels: int = 2
    file_size: int = 0  # bytes
    cover_art: Optional[bytes] = None
    track_number: int = 0
    genre: str = ""

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "duration": self.duration,
            "file_path": self.file_path,
            "file_hash": self.file_hash,
            "format": self.format,
            "bitrate": self.bitrate,
            "sample_rate": self.sample_rate,
            "channels": self.channels,
            "file_size": self.file_size,
            "cover_art": self.cover_art,
        }


def extract_metadata(file_path: str) -> Optional[TrackMetadata]:
    """提取音频文件的元数据。

    Args:
        file_path: 音频文件的完整路径。

    Returns:
        TrackMetadata 对象，如果无法读取则返回 None。
    """
    path = Path(file_path)
    if not path.exists() or not path.is_file():
        return None

    ext = path.suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        return None

    try:
        audio = MutagenFile(file_path)
        if audio is None:
            return _basic_metadata(file_path, ext)

        meta = TrackMetadata()
        meta.file_path = str(path.resolve())
        meta.file_size = path.stat().st_size
        meta.format = FORMAT_MAP.get(ext, ext[1:].upper())

        # 计算文件哈希
        meta.file_hash = _compute_hash(file_path)

        # 提取时长
        if hasattr(audio, "info") and audio.info:
            meta.duration = getattr(audio.info, "length", 0.0) or 0.0
            meta.bitrate = getattr(audio.info, "bitrate", 0) or 0
            meta.sample_rate = getattr(audio.info, "sample_rate", 0) or 0
            meta.channels = getattr(audio.info, "channels", 2) or 2

        # 提取标签
        _extract_tags(audio, meta, ext)

        return meta

    except Exception:
        return _basic_metadata(file_path, ext)


def _extract_tags(audio, meta: TrackMetadata, ext: str) -> None:
    """从音频对象中提取标签信息。"""
    tags = getattr(audio, "tags", None)
    if tags is None:
        return

    # 通用标签映射
    tag_map = {
        "title": ["title", "©nam", "TIT2"],
        "artist": ["artist", "©ART", "TPE1", "albumartist"],
        "album": ["album", "©alb", "TALB"],
        "genre": ["genre", "©gen", "TCON"],
        "tracknumber": ["tracknumber", "trkn", "TRCK"],
    }

    for field, keys in tag_map.items():
        for key in keys:
            if key in tags:
                value = tags[key]
                if isinstance(value, list):
                    value = value[0] if value else ""
                if isinstance(value, str):
                    value = value.strip()
                elif hasattr(value, "text"):
                    value = str(value.text[0]) if value.text else ""
                else:
                    value = str(value)

                if value:
                    if field == "tracknumber":
                        # TRCK 可能是 "3/12" 格式
                        value = str(value).split("/")[0]
                        try:
                            meta.track_number = int(value)
                        except ValueError:
                            pass
                    else:
                        setattr(meta, field, value)
                break

    # 提取封面
    _extract_cover_art(audio, meta, ext)


def _extract_cover_art(audio, meta: TrackMetadata, ext: str) -> None:
    """提取内嵌专辑封面。"""
    try:
        if ext == ".mp3":
            for tag_key in audio.tags or {}:
                if tag_key.startswith("APIC"):
                    meta.cover_art = audio.tags[tag_key].data
                    return
        elif ext in (".flac", ".ogg", ".oga"):
            pics = getattr(audio, "pictures", [])
            if pics:
                meta.cover_art = pics[0].data
        elif ext in (".m4a", ".mp4"):
            if hasattr(audio, "tags"):
                covr = audio.tags.get("covr")
                if covr:
                    meta.cover_art = covr[0] if isinstance(covr, list) else covr
    except Exception:
        pass


def _basic_metadata(file_path: str, ext: str) -> TrackMetadata:
    """当无法读取详细标签时，返回基本元数据。"""
    path = Path(file_path)
    meta = TrackMetadata()
    meta.title = path.stem
    meta.file_path = str(path.resolve())
    meta.file_size = path.stat().st_size
    meta.format = FORMAT_MAP.get(ext, ext[1:].upper())
    meta.file_hash = _compute_hash(file_path)
    return meta


def _compute_hash(file_path: str, chunk_size: int = 8192) -> str:
    """计算文件 MD5 哈希（用于去重）。"""
    md5 = hashlib.md5()
    try:
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(chunk_size), b""):
                md5.update(chunk)
    except IOError:
        return ""
    return md5.hexdigest()


def is_supported_audio(file_path: str) -> bool:
    """检查文件是否为支持的音频格式。"""
    return Path(file_path).suffix.lower() in SUPPORTED_EXTENSIONS


def scan_directory(dir_path: str, recursive: bool = True) -> list[str]:
    """扫描目录中的音频文件。

    Args:
        dir_path: 目录路径。
        recursive: 是否递归扫描子目录。

    Returns:
        音频文件路径列表。
    """
    audio_files: list[str] = []
    path = Path(dir_path)
    if not path.is_dir():
        return audio_files

    pattern = "**/*" if recursive else "*"
    for item in path.glob(pattern):
        if item.is_file() and is_supported_audio(str(item)):
            audio_files.append(str(item.resolve()))

    return audio_files
