"""导入器抽象基类。"""

from abc import ABC, abstractmethod
from typing import Callable, Optional


class BaseImporter(ABC):
    """所有导入器的基类。

    定义了导入器应该实现的接口。
    """

    def __init__(self, library_manager) -> None:
        self._library = library_manager

    @abstractmethod
    def import_files(
        self,
        files: list[str],
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> int:
        """导入文件列表。

        Args:
            files: 文件路径列表。
            progress_callback: 进度回调 (百分比, 当前文件名)。

        Returns:
            成功导入的歌曲数量。
        """
        ...

    def _report_progress(
        self,
        current: int,
        total: int,
        filename: str,
        callback: Optional[Callable[[int, str], None]],
    ) -> None:
        """报告导入进度。"""
        if callback:
            percent = int((current / total) * 100) if total > 0 else 0
            callback(percent, f"导入中 ({current}/{total}): {filename}")
