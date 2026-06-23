"""歌词展示页面。

显示同步/非同步歌词，支持滚动高亮和手动搜索。
"""

from typing import Optional

from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from ..core.audio_engine import AudioEngine
from ..core.playlist_engine import PlaylistEngine
from ..lyrics.lyrics_manager import LyricsManager


class LyricsPage(QWidget):
    """歌词展示页面。"""

    def __init__(
        self,
        audio_engine: AudioEngine,
        playlist_engine: PlaylistEngine,
        lyrics_manager: LyricsManager,
        parent=None,
    ) -> None:
        super().__init__(parent)
        self._audio = audio_engine
        self._playlist = playlist_engine
        self._lyrics_mgr = lyrics_manager

        self._synced_lines: list[tuple[float, str]] = []  # [(time_sec, text), ...]
        self._current_line_idx: int = -1

        self._setup_ui()
        self._connect_signals()

        # 歌词刷新定时器
        self._update_timer = QTimer(self)
        self._update_timer.setInterval(100)
        self._update_timer.timeout.connect(self._update_highlight)
        self._update_timer.start()

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # ── 头部操作栏 ────────────────────────────────────
        header = QHBoxLayout()
        header.setSpacing(8)

        title = QLabel("🎤 歌词")
        title.setStyleSheet("font-size: 18px; font-weight: bold;")
        header.addWidget(title)
        header.addStretch()

        self._search_btn = QPushButton("🔍 在线搜索")
        self._search_btn.setToolTip("搜索在线歌词")
        header.addWidget(self._search_btn)

        self._import_btn = QPushButton("📂 导入本地歌词")
        self._import_btn.setToolTip("导入 .lrc 或 .txt 文件")
        header.addWidget(self._import_btn)

        header.addStretch()
        layout.addLayout(header)

        # ── 歌词来源标签 ──────────────────────────────────
        self._source_label = QLabel("")
        self._source_label.setStyleSheet("font-size: 11px; color: #6e7681; padding: 0 4px;")
        self._source_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self._source_label)

        # ── 歌词滚动区域 ──────────────────────────────────
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setStyleSheet("""
            QScrollArea {
                background-color: transparent;
                border: none;
            }
        """)

        self._lyrics_container = QWidget()
        self._lyrics_container.setStyleSheet("background-color: transparent;")
        self._lyrics_layout = QVBoxLayout(self._lyrics_container)
        self._lyrics_layout.setSpacing(8)
        self._lyrics_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # 空歌词占位
        self._empty_label = QLabel("暂无歌词\n\n播放歌曲或点击搜索获取歌词")
        self._empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._empty_label.setStyleSheet("color: #6e7681; font-size: 14px; padding: 60px;")
        self._lyrics_layout.addWidget(self._empty_label)
        self._lyrics_layout.addStretch()

        scroll.setWidget(self._lyrics_container)
        layout.addWidget(scroll, stretch=1)

    def _connect_signals(self) -> None:
        self._playlist.current_changed.connect(self._on_track_changed)
        self._search_btn.clicked.connect(self._on_search_online)
        self._import_btn.clicked.connect(self._on_import_local)

    def _on_track_changed(self, _index: int) -> None:
        """当前曲目切换时加载歌词。"""
        track = self._playlist.current_track
        if track is None:
            self._clear_lyrics()
            return

        song_id = track.get("id")
        title = track.get("title", "")
        artist = track.get("artist", "")

        if song_id is None:
            self._clear_lyrics()
            return

        # 尝试从缓存/在线获取歌词
        self._load_lyrics(song_id, title, artist)

    def _load_lyrics(self, song_id: int, title: str, artist: str) -> None:
        """加载歌词。"""
        # 先检查本地缓存
        lyrics_data = self._lyrics_mgr.get_cached_lyrics(song_id)
        if lyrics_data:
            self._display_lyrics(lyrics_data)
        else:
            self._display_lyrics(None)
            # 自动在线搜索
            self._lyrics_mgr.search_online_async(song_id, title, artist, self._on_lyrics_fetched)

    def _on_lyrics_fetched(self, song_id: int, lyrics_data: Optional[dict]) -> None:
        """在线歌词获取回调。"""
        track = self._playlist.current_track
        if track and track.get("id") == song_id and lyrics_data:
            self._display_lyrics(lyrics_data)

    def _display_lyrics(self, lyrics_data: Optional[dict]) -> None:
        """显示歌词。

        Args:
            lyrics_data: {
                "source": str,
                "synced_text": str | None,  # LRC 格式
                "plain_text": str | None,
            }
        """
        # 清除旧歌词
        self._clear_lyrics()

        if lyrics_data is None:
            self._source_label.setText("")
            return

        synced = lyrics_data.get("synced_text")
        plain = lyrics_data.get("plain_text")
        source = lyrics_data.get("source", "未知")

        self._source_label.setText(f"来源: {source}")

        if synced:
            self._display_synced_lyrics(synced)
        elif plain:
            self._display_plain_lyrics(plain)
        else:
            self._empty_label.setText("未找到歌词\n\n点击上方按钮搜索")

    def _display_synced_lyrics(self, lrc_text: str) -> None:
        """显示同步歌词（LRC 格式）。"""
        self._synced_lines = self._lyrics_mgr.lrc_parser.parse(lrc_text)

        for time_sec, text in self._synced_lines:
            label = QLabel(text if text.strip() else "♪")
            label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            label.setWordWrap(True)
            label.setStyleSheet("""
                color: #6e7681;
                font-size: 15px;
                padding: 4px 16px;
            """)
            self._lyrics_layout.addWidget(label)

        self._lyrics_layout.addStretch()
        self._current_line_idx = -1

    def _display_plain_lyrics(self, plain_text: str) -> None:
        """显示纯文本歌词（无时间戳）。"""
        lines = plain_text.strip().split("\n")
        for line in lines:
            label = QLabel(line.strip() or " ")
            label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            label.setWordWrap(True)
            label.setStyleSheet("""
                color: #8b949e;
                font-size: 15px;
                padding: 4px 16px;
            """)
            self._lyrics_layout.addWidget(label)

        self._lyrics_layout.addStretch()

    def _update_highlight(self) -> None:
        """根据当前播放位置更新歌词高亮。"""
        if not self._synced_lines:
            return

        position_sec = self._audio.position / 1000.0

        # 找到当前应高亮的行
        new_idx = -1
        for i, (time_sec, _text) in enumerate(self._synced_lines):
            if time_sec <= position_sec:
                new_idx = i
            else:
                break

        if new_idx == self._current_line_idx:
            return

        self._current_line_idx = new_idx

        # 更新所有行的样式
        for i in range(self._lyrics_layout.count()):
            widget = self._lyrics_layout.itemAt(i)
            if widget and isinstance(widget.widget(), QLabel) and widget.widget() is not self._empty_label:
                label = widget.widget()
                if i == new_idx:
                    label.setStyleSheet("""
                        color: #00d2ff;
                        font-size: 18px;
                        font-weight: bold;
                        padding: 4px 16px;
                    """)
                else:
                    label.setStyleSheet("""
                        color: #6e7681;
                        font-size: 15px;
                        padding: 4px 16px;
                    """)

    def _clear_lyrics(self) -> None:
        """清除所有歌词显示。"""
        self._synced_lines = []
        self._current_line_idx = -1

        # 移除所有歌词标签，保留 stretch
        while self._lyrics_layout.count() > 0:
            item = self._lyrics_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        self._empty_label = QLabel("加载歌词中...")
        self._empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._empty_label.setStyleSheet("color: #6e7681; font-size: 14px; padding: 60px;")
        self._lyrics_layout.addWidget(self._empty_label)
        self._lyrics_layout.addStretch()

    def _on_search_online(self) -> None:
        """手动在线搜索歌词。"""
        track = self._playlist.current_track
        if track is None:
            return

        song_id = track.get("id")
        title = track.get("title", "")
        artist = track.get("artist", "")

        if song_id is None:
            return

        self._empty_label.setText("搜索歌词中...")
        self._lyrics_mgr.search_online_async(
            song_id, title, artist,
            lambda sid, data: self._on_lyrics_fetched(sid, data),
            force=True,
        )

    def _on_import_local(self) -> None:
        """导入本地歌词文件。"""
        track = self._playlist.current_track
        if track is None:
            return

        from PySide6.QtWidgets import QFileDialog

        file_path, _ = QFileDialog.getOpenFileName(
            self, "选择歌词文件", "",
            "歌词文件 (*.lrc *.txt);;所有文件 (*)"
        )
        if not file_path:
            return

        song_id = track.get("id")
        if song_id is None:
            return

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
        except UnicodeDecodeError:
            try:
                with open(file_path, "r", encoding="gbk") as f:
                    content = f.read()
            except Exception:
                return

        self._lyrics_mgr.import_local_lyrics(song_id, content)
        self._load_lyrics(song_id, track.get("title", ""), track.get("artist", ""))

    def refresh(self) -> None:
        """外部调用刷新。"""
        track = self._playlist.current_track
        if track:
            self._load_lyrics(
                track.get("id", 0),
                track.get("title", ""),
                track.get("artist", ""),
            )
