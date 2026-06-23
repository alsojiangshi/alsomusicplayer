"""音乐库页面。

显示所有已导入的音乐文件，支持搜索、过滤和排序。
"""

from typing import Optional

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QComboBox,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from ..core.library_manager import LibraryManager
from ..core.playlist_engine import PlaylistEngine
from .components.search_bar import SearchBar
from .components.song_table import SongTable


class LibraryPage(QWidget):
    """音乐库页面。

    展示导入的音乐库，支持搜索、按来源过滤。

    Signals:
        import_requested: 请求打开导入对话框
    """

    import_requested = Signal()

    def __init__(
        self,
        library_manager: LibraryManager,
        playlist_engine: PlaylistEngine,
        parent=None,
    ) -> None:
        super().__init__(parent)
        self._library = library_manager
        self._playlist = playlist_engine

        self._setup_ui()
        self._connect_signals()
        self._refresh()

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.setSpacing(16)

        # ── 顶部栏：搜索 + 过滤 + 操作 ────────────────────
        top_layout = QHBoxLayout()
        top_layout.setSpacing(12)

        self._search_bar = SearchBar("搜索标题、艺术家、专辑...")
        top_layout.addWidget(self._search_bar, stretch=1)

        # 来源过滤
        self._source_filter = QComboBox()
        self._source_filter.addItem("全部来源", "all")
        self._source_filter.addItem("📁 本地", "local")
        self._source_filter.addItem("☁️ S3", "s3")
        self._source_filter.addItem("📋 OpenList", "openlist")
        top_layout.addWidget(self._source_filter)

        # 导入按钮
        self._import_btn = QPushButton("＋ 导入音乐")
        self._import_btn.setProperty("accent", True)
        top_layout.addWidget(self._import_btn)

        layout.addLayout(top_layout)

        # ── 统计信息 ──────────────────────────────────────
        stats_layout = QHBoxLayout()
        stats_layout.setSpacing(16)
        self._song_count_label = QLabel("共 0 首歌曲")
        self._song_count_label.setStyleSheet("color: #8b949e; font-size: 12px;")
        stats_layout.addWidget(self._song_count_label)
        stats_layout.addStretch()

        # 播放选中按钮
        self._play_selected_btn = QPushButton("▶ 播放选中")
        self._play_selected_btn.setProperty("flat", True)
        stats_layout.addWidget(self._play_selected_btn)

        # 添加到队列按钮
        self._add_queue_btn = QPushButton("📋 加入队列")
        self._add_queue_btn.setProperty("flat", True)
        stats_layout.addWidget(self._add_queue_btn)

        layout.addLayout(stats_layout)

        # ── 歌曲表格 ──────────────────────────────────────
        self._song_table = SongTable()
        layout.addWidget(self._song_table, stretch=1)

    def _connect_signals(self) -> None:
        self._search_bar.text_changed.connect(self._on_search)
        self._source_filter.currentIndexChanged.connect(self._on_filter_changed)
        self._import_btn.clicked.connect(self.import_requested.emit)

        self._song_table.song_double_clicked.connect(self._on_song_double_clicked)
        self._song_table.play_requested.connect(self._play_song)
        self._song_table.add_to_queue_requested.connect(self._add_to_queue)

        self._play_selected_btn.clicked.connect(self._on_play_selected)
        self._add_queue_btn.clicked.connect(self._on_add_selected_to_queue)

    def _refresh(self) -> None:
        """刷新歌曲列表。"""
        source = self._source_filter.currentData()
        query = self._search_bar.text().strip()

        songs = self._library.search(query=query if query else None, source=source)

        self._song_table.load_songs(songs)
        self._song_count_label.setText(f"共 {len(songs)} 首歌曲")

    def _on_search(self, _text: str) -> None:
        self._refresh()

    def _on_filter_changed(self) -> None:
        self._refresh()

    def _on_song_double_clicked(self, song_id: int) -> None:
        self._play_song(song_id)

    def _play_song(self, song_id: int) -> None:
        """播放指定歌曲（替换整个队列）。"""
        songs = self._library.get_all_songs()
        song_map = {s["id"]: s for s in songs}

        target = song_map.get(song_id)
        if not target:
            return

        self._playlist.set_queue(songs, start_index=songs.index(target))
        self._playlist.play_current()

    def _add_to_queue(self, song_id: int) -> None:
        """将歌曲添加到播放队列末尾。"""
        song = self._library.get_song(song_id)
        if song:
            self._playlist.add_to_queue([song])

    def _on_play_selected(self) -> None:
        """播放选中的歌曲。"""
        ids = self._song_table.get_selected_song_ids()
        if ids:
            self._play_song(ids[0])

    def _on_add_selected_to_queue(self) -> None:
        """将选中的歌曲加入队列。"""
        ids = self._song_table.get_selected_song_ids()
        songs = [self._library.get_song(sid) for sid in ids]
        songs = [s for s in songs if s is not None]
        if songs:
            self._playlist.add_to_queue(songs)

    def refresh(self) -> None:
        """外部调用刷新。"""
        self._refresh()
