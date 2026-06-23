"""歌曲列表表格组件。"""

from typing import Optional

from PySide6.QtCore import (
    Qt,
    Signal,
)
from PySide6.QtGui import QAction
from PySide6.QtWidgets import (
    QAbstractItemView,
    QHeaderView,
    QMenu,
    QTableWidget,
    QTableWidgetItem,
)

from ...utils.file_utils import format_duration


class SongTable(QTableWidget):
    """歌曲表格组件。

    显示歌曲列表，支持排序、右键菜单和交互操作。

    Signals:
        song_double_clicked(int): 双击歌曲，传递 song_id
        song_selected(int): 选中歌曲，传递 song_id
        play_requested(int): 请求播放
        add_to_queue_requested(int): 请求添加到队列
    """

    song_double_clicked = Signal(int)
    song_selected = Signal(int)
    play_requested = Signal(int)
    add_to_queue_requested = Signal(int)

    COLUMNS = ["", "标题", "艺术家", "专辑", "时长", "格式"]

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self._song_ids: list[int] = []  # 行索引 -> song_id 映射
        self._setup_table()

    def _setup_table(self) -> None:
        """初始化表格样式和行为。"""
        self.setColumnCount(len(self.COLUMNS))
        self.setHorizontalHeaderLabels(self.COLUMNS)

        # 列宽策略
        header = self.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.Fixed)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(4, QHeaderView.ResizeMode.Fixed)
        header.setSectionResizeMode(5, QHeaderView.ResizeMode.Fixed)

        self.setColumnWidth(0, 40)   # # 号
        self.setColumnWidth(4, 60)   # 时长
        self.setColumnWidth(5, 50)   # 格式

        # 行为
        self.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.setSelectionMode(QAbstractItemView.SelectionMode.ExtendedSelection)
        self.setAlternatingRowColors(True)
        self.setShowGrid(False)
        self.verticalHeader().setVisible(False)
        self.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)

        # 信号
        self.cellDoubleClicked.connect(self._on_double_click)
        self.itemSelectionChanged.connect(self._on_selection_changed)
        self.customContextMenuRequested.connect(self._show_context_menu)

    def load_songs(self, songs: list[dict]) -> None:
        """加载歌曲列表。

        Args:
            songs: 歌曲字典列表，需包含 id, title, artist, album, duration, format。
        """
        self.setRowCount(0)
        self._song_ids.clear()

        self.setRowCount(len(songs))
        for row, song in enumerate(songs):
            self._song_ids.append(song["id"])

            # # 号
            num_item = QTableWidgetItem(str(row + 1))
            num_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            num_item.setData(Qt.ItemDataRole.UserRole, song["id"])
            self.setItem(row, 0, num_item)

            # 标题
            title_item = QTableWidgetItem(song.get("title", "Unknown"))
            self.setItem(row, 1, title_item)

            # 艺术家
            artist_item = QTableWidgetItem(song.get("artist", "Unknown"))
            self.setItem(row, 2, artist_item)

            # 专辑
            album_item = QTableWidgetItem(song.get("album", "Unknown"))
            self.setItem(row, 3, album_item)

            # 时长
            duration_str = format_duration(song.get("duration", 0))
            dur_item = QTableWidgetItem(duration_str)
            dur_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.setItem(row, 4, dur_item)

            # 格式
            fmt_item = QTableWidgetItem(song.get("format", ""))
            fmt_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.setItem(row, 5, fmt_item)

        # 滚动到顶部
        if songs:
            self.scrollToTop()

    def get_selected_song_ids(self) -> list[int]:
        """获取当前选中行的歌曲 ID 列表。"""
        ids = []
        for row in range(self.rowCount()):
            if self.item(row, 0) and self.item(row, 0).isSelected():
                ids.append(self._song_ids[row])
        return ids

    def get_song_id_at_row(self, row: int) -> Optional[int]:
        """获取指定行的歌曲 ID。"""
        if 0 <= row < len(self._song_ids):
            return self._song_ids[row]
        return None

    def select_song_by_id(self, song_id: int) -> None:
        """根据歌曲 ID 选中对应行。"""
        try:
            row = self._song_ids.index(song_id)
            self.selectRow(row)
            self.scrollToItem(self.item(row, 0))
        except ValueError:
            pass

    def _on_double_click(self, row: int, _col: int) -> None:
        song_id = self.get_song_id_at_row(row)
        if song_id is not None:
            self.song_double_clicked.emit(song_id)

    def _on_selection_changed(self) -> None:
        ids = self.get_selected_song_ids()
        if ids:
            self.song_selected.emit(ids[0])

    def _show_context_menu(self, pos) -> None:
        row = self.rowAt(pos.y())
        song_id = self.get_song_id_at_row(row)
        if song_id is None:
            return

        menu = QMenu(self)
        menu.setStyleSheet(self.styleSheet())

        play_action = QAction("▶ 播放", self)
        play_action.triggered.connect(lambda: self.play_requested.emit(song_id))
        menu.addAction(play_action)

        queue_action = QAction("📋 添加到队列", self)
        queue_action.triggered.connect(lambda: self.add_to_queue_requested.emit(song_id))
        menu.addAction(queue_action)

        menu.exec(self.viewport().mapToGlobal(pos))
