"""播放列表管理页面。

支持创建、删除、重命名播放列表，管理列表中的歌曲。
"""

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QSplitter,
    QVBoxLayout,
    QWidget,
)

from ..core.library_manager import LibraryManager
from ..core.playlist_engine import PlaylistEngine
from .components.song_table import SongTable


class PlaylistPage(QWidget):
    """播放列表管理页面。"""

    def __init__(
        self,
        library_manager: LibraryManager,
        playlist_engine: PlaylistEngine,
        parent=None,
    ) -> None:
        super().__init__(parent)
        self._library = library_manager
        self._playlist = playlist_engine

        self._current_playlist_id: int | None = None

        self._setup_ui()
        self._connect_signals()
        self._refresh_playlists()

    def _setup_ui(self) -> None:
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # ── 分割器 ────────────────────────────────────────
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # 左侧：播放列表列表
        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)
        left_layout.setContentsMargins(16, 16, 8, 16)
        left_layout.setSpacing(12)

        # 头部
        header_layout = QHBoxLayout()
        title = QLabel("🎵 播放列表")
        title.setStyleSheet("font-size: 16px; font-weight: bold;")
        header_layout.addWidget(title)
        header_layout.addStretch()

        self._new_pl_btn = QPushButton("＋")
        self._new_pl_btn.setFixedSize(32, 32)
        self._new_pl_btn.setToolTip("新建播放列表")
        header_layout.addWidget(self._new_pl_btn)

        self._del_pl_btn = QPushButton("🗑")
        self._del_pl_btn.setFixedSize(32, 32)
        self._del_pl_btn.setToolTip("删除播放列表")
        header_layout.addWidget(self._del_pl_btn)

        left_layout.addLayout(header_layout)

        # 播放列表
        self._playlist_list = QListWidget()
        left_layout.addWidget(self._playlist_list, stretch=1)

        splitter.addWidget(left_widget)

        # 右侧：播放列表中的歌曲
        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)
        right_layout.setContentsMargins(8, 16, 16, 16)
        right_layout.setSpacing(12)

        # 头部
        self._pl_info_label = QLabel("选择一个播放列表")
        self._pl_info_label.setStyleSheet("font-size: 16px; font-weight: bold;")
        right_layout.addWidget(self._pl_info_label)

        # 添加歌曲按钮
        action_layout = QHBoxLayout()
        self._add_songs_btn = QPushButton("＋ 添加歌曲到列表")
        action_layout.addWidget(self._add_songs_btn)
        action_layout.addStretch()

        self._play_all_btn = QPushButton("▶ 播放全部")
        self._play_all_btn.setProperty("accent", True)
        action_layout.addWidget(self._play_all_btn)
        right_layout.addLayout(action_layout)

        # 歌曲表
        self._song_table = SongTable()
        right_layout.addWidget(self._song_table, stretch=1)

        splitter.addWidget(right_widget)
        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 3)

        layout.addWidget(splitter)

    def _connect_signals(self) -> None:
        self._new_pl_btn.clicked.connect(self._create_playlist)
        self._del_pl_btn.clicked.connect(self._delete_playlist)
        self._playlist_list.currentRowChanged.connect(self._on_playlist_selected)

        self._song_table.song_double_clicked.connect(self._play_song_from_list)
        self._play_all_btn.clicked.connect(self._play_all)

    def _refresh_playlists(self) -> None:
        self._playlist_list.clear()
        playlists = self._library.get_all_playlists()
        for pl in playlists:
            item = QListWidgetItem(f"📋 {pl['name']} ({pl['song_count']})")
            item.setData(Qt.ItemDataRole.UserRole, pl["id"])
            self._playlist_list.addItem(item)

    def _refresh_songs(self) -> None:
        if self._current_playlist_id is None:
            self._song_table.load_songs([])
            return

        songs = self._library.get_playlist_songs(self._current_playlist_id)
        pl = self._library.get_playlist(self._current_playlist_id)
        if pl:
            self._pl_info_label.setText(f"📋 {pl['name']} · {len(songs)} 首")
        self._song_table.load_songs(songs)

    def _on_playlist_selected(self, row: int) -> None:
        item = self._playlist_list.item(row)
        if item:
            self._current_playlist_id = item.data(Qt.ItemDataRole.UserRole)
            self._refresh_songs()

    def _create_playlist(self) -> None:
        name, ok = QInputDialog.getText(self, "新建播放列表", "请输入播放列表名称：")
        if ok and name.strip():
            self._library.create_playlist(name.strip())
            self._refresh_playlists()

    def _delete_playlist(self) -> None:
        if self._current_playlist_id is None:
            return
        pl = self._library.get_playlist(self._current_playlist_id)
        if pl is None:
            return
        reply = QMessageBox.question(
            self, "确认删除",
            f'确定要删除播放列表 "{pl["name"]}" 吗？\n歌曲不会被删除，只是从列表中移除。',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if reply == QMessageBox.StandardButton.Yes:
            self._library.delete_playlist(self._current_playlist_id)
            self._current_playlist_id = None
            self._song_table.load_songs([])
            self._pl_info_label.setText("选择一个播放列表")
            self._refresh_playlists()

    def _play_song_from_list(self, song_id: int) -> None:
        if self._current_playlist_id is None:
            return
        songs = self._library.get_playlist_songs(self._current_playlist_id)
        target = next((s for s in songs if s["id"] == song_id), None)
        if target:
            self._playlist.set_queue(songs, start_index=songs.index(target))
            self._playlist.play_current()

    def _play_all(self) -> None:
        if self._current_playlist_id is None:
            return
        songs = self._library.get_playlist_songs(self._current_playlist_id)
        if songs:
            self._playlist.set_queue(songs, start_index=0)
            self._playlist.play_current()

    def refresh(self) -> None:
        self._refresh_playlists()
        self._refresh_songs()
