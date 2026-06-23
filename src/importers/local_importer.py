"""本地文件导入器。

支持导入单个文件或递归扫描目录。
"""

from pathlib import Path
from typing import Callable, Optional

from ..core.library_manager import LibraryManager
from ..utils.metadata import (
    SUPPORTED_EXTENSIONS,
    extract_metadata,
    is_supported_audio,
    scan_directory,
)
from .base import BaseImporter


class LocalImporter(BaseImporter):
    """本地文件导入器。

    扫描并导入本地音频文件到音乐库。
    """

    def __init__(self, library_manager: LibraryManager) -> None:
        super().__init__(library_manager)

    def import_files(
        self,
        files: list[str],
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> int:
        """导入本地文件。

        Args:
            files: 文件或目录路径列表（目录会被递归扫描）。
            progress_callback: 进度回调。

        Returns:
            成功导入的歌曲数量。
        """
        # 展开目录
        all_files: list[str] = []
        for path in files:
            p = Path(path)
            if p.is_dir():
                scanned = scan_directory(str(p), recursive=True)
                all_files.extend(scanned)
            elif p.is_file() and is_supported_audio(str(p)):
                all_files.append(str(p.resolve()))

        total = len(all_files)
        imported = 0

        for i, file_path in enumerate(all_files):
            self._report_progress(i + 1, total, Path(file_path).name, progress_callback)

            meta = extract_metadata(file_path)
            if meta is None:
                continue

            song_id = self._library.add_song(meta, source="local")
            if song_id is not None:
                imported += 1

        if progress_callback:
            progress_callback(100, f"完成！成功导入 {imported} 首歌曲")

        return imported

    def import_directory(
        self,
        dir_path: str,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> int:
        """导入目录中的所有音频文件。"""
        files = scan_directory(dir_path, recursive=True)
        return self.import_files(files, progress_callback)
