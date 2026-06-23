"""文件操作工具函数。"""

import os
import shutil
from pathlib import Path
from typing import Optional


def ensure_dir(dir_path: str) -> Path:
    """确保目录存在，不存在则创建。"""
    path = Path(dir_path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def safe_filename(name: str) -> str:
    """将字符串转换为安全的文件名。"""
    unsafe_chars = '<>:"/\\|?*'
    result = name
    for char in unsafe_chars:
        result = result.replace(char, "_")
    return result.strip()


def get_file_size_mb(file_path: str) -> float:
    """获取文件大小（MB）。"""
    try:
        return os.path.getsize(file_path) / (1024 * 1024)
    except OSError:
        return 0.0


def format_duration(seconds: float) -> str:
    """将秒数格式化为 mm:ss 或 hh:mm:ss。

    Args:
        seconds: 时长秒数。

    Returns:
        格式化的时间字符串。
    """
    if not seconds or seconds < 0:
        return "00:00"

    total_seconds = int(seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60

    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def format_file_size(size_bytes: int) -> str:
    """将字节数格式化为可读的文件大小。"""
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


def copy_file_safe(src: str, dst: str) -> bool:
    """安全复制文件，目标存在则跳过。"""
    try:
        if not os.path.exists(dst):
            ensure_dir(str(Path(dst).parent))
            shutil.copy2(src, dst)
        return True
    except (OSError, shutil.Error):
        return False


def get_local_cache_path(original_path: str, cache_base: str) -> str:
    """为远程文件生成本地缓存路径。

    通过哈希原始路径来生成唯一但确定的缓存路径。
    """
    import hashlib

    name_hash = hashlib.md5(original_path.encode()).hexdigest()[:16]
    ext = Path(original_path).suffix
    return str(Path(cache_base) / f"{name_hash}{ext}")
