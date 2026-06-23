"""底部播放控制栏组件。"""

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSlider,
    QVBoxLayout,
    QWidget,
)

from ..core.audio_engine import AudioEngine, PlaybackMode, PlaybackState
from ..core.playlist_engine import PlaylistEngine
from ..utils.file_utils import format_duration
from .components.cover_widget import CoverWidget
from .components.seek_slider import SeekSlider


class PlayerBar(QWidget):
    """底部播放控制栏。

    包含专辑封面、歌曲信息、播放控制按钮、进度条、音量控制。

    Signals:
        toggle_lyrics_requested: 请求显示/隐藏歌词面板
    """

    toggle_lyrics_requested = Signal()

    # 播放模式图标映射
    MODE_ICONS = {
        PlaybackMode.SEQUENTIAL: "🔁",
        PlaybackMode.SHUFFLE: "🔀",
        PlaybackMode.REPEAT_ONE: "🔂",
        PlaybackMode.REPEAT_ALL: "🔄",
    }

    def __init__(
        self,
        audio_engine: AudioEngine,
        playlist_engine: PlaylistEngine,
        parent=None,
    ) -> None:
        super().__init__(parent)
        self._audio = audio_engine
        self._playlist = playlist_engine

        self.setObjectName("playerBar")
        self.setFixedHeight(80)
        self.setStyleSheet("""
            #playerBar {
                background-color: #0d1117;
                border-top: 1px solid #30363d;
            }
        """)

        self._setup_ui()
        self._connect_signals()

    def _setup_ui(self) -> None:
        layout = QHBoxLayout(self)
        layout.setContentsMargins(16, 8, 16, 8)
        layout.setSpacing(16)

        # ── 左侧：歌曲信息 + 小封面 ──────────────────────
        left_layout = QHBoxLayout()
        left_layout.setSpacing(10)

        self._small_cover = CoverWidget(size=52)
        left_layout.addWidget(self._small_cover)

        info_layout = QVBoxLayout()
        info_layout.setSpacing(2)
        self._title_label = QLabel("未在播放")
        self._title_label.setStyleSheet("font-size: 13px; font-weight: bold; color: #e6edf3;")
        self._artist_label = QLabel("")
        self._artist_label.setStyleSheet("font-size: 11px; color: #8b949e;")
        info_layout.addWidget(self._title_label)
        info_layout.addWidget(self._artist_label)
        left_layout.addLayout(info_layout)

        layout.addLayout(left_layout, stretch=2)

        # ── 中央：播放控制 + 进度条 ──────────────────────
        center_layout = QVBoxLayout()
        center_layout.setSpacing(4)
        center_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # 播放按钮行
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(8)
        btn_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self._mode_btn = QPushButton("🔁")
        self._mode_btn.setFlat(True)
        self._mode_btn.setFixedSize(32, 32)
        self._mode_btn.setToolTip("播放模式")

        self._prev_btn = QPushButton("⏮")
        self._prev_btn.setFlat(True)
        self._prev_btn.setFixedSize(36, 36)
        self._prev_btn.setToolTip("上一首")

        self._play_pause_btn = QPushButton("▶")
        self._play_pause_btn.setFlat(True)
        self._play_pause_btn.setFixedSize(44, 44)
        self._play_pause_btn.setStyleSheet("""
            QPushButton {
                background-color: #00d2ff;
                color: #0d1117;
                border-radius: 22px;
                font-size: 18px;
            }
            QPushButton:hover {
                background-color: #00e5ff;
            }
        """)

        self._next_btn = QPushButton("⏭")
        self._next_btn.setFlat(True)
        self._next_btn.setFixedSize(36, 36)
        self._next_btn.setToolTip("下一首")

        self._lyrics_btn = QPushButton("🎤")
        self._lyrics_btn.setFlat(True)
        self._lyrics_btn.setFixedSize(32, 32)
        self._lyrics_btn.setToolTip("歌词")

        btn_layout.addWidget(self._mode_btn)
        btn_layout.addStretch()
        btn_layout.addWidget(self._prev_btn)
        btn_layout.addWidget(self._play_pause_btn)
        btn_layout.addWidget(self._next_btn)
        btn_layout.addStretch()
        btn_layout.addWidget(self._lyrics_btn)

        center_layout.addLayout(btn_layout)

        # 进度条行
        seek_layout = QHBoxLayout()
        seek_layout.setSpacing(8)

        self._current_time = QLabel("00:00")
        self._current_time.setStyleSheet("font-size: 11px; color: #8b949e; min-width: 40px;")
        self._current_time.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)

        self._seek_slider = SeekSlider()
        self._seek_slider.setFixedHeight(20)

        self._total_time = QLabel("00:00")
        self._total_time.setStyleSheet("font-size: 11px; color: #8b949e; min-width: 40px;")

        seek_layout.addWidget(self._current_time)
        seek_layout.addWidget(self._seek_slider, stretch=1)
        seek_layout.addWidget(self._total_time)

        center_layout.addLayout(seek_layout)
        layout.addLayout(center_layout, stretch=5)

        # ── 右侧：音量控制 ───────────────────────────────
        right_layout = QHBoxLayout()
        right_layout.setSpacing(8)

        self._volume_btn = QPushButton("🔊")
        self._volume_btn.setFlat(True)
        self._volume_btn.setFixedSize(32, 32)

        self._volume_slider = QSlider(Qt.Orientation.Horizontal)
        self._volume_slider.setRange(0, 100)
        self._volume_slider.setValue(self._audio.volume)
        self._volume_slider.setFixedWidth(100)

        right_layout.addStretch()
        right_layout.addWidget(self._volume_btn)
        right_layout.addWidget(self._volume_slider)

        layout.addLayout(right_layout, stretch=1)

    def _connect_signals(self) -> None:
        """连接音频引擎信号。"""
        # 播放按钮
        self._play_pause_btn.clicked.connect(self._audio.play_pause)
        self._prev_btn.clicked.connect(self._playlist.previous)
        self._next_btn.clicked.connect(self._playlist.next)
        self._mode_btn.clicked.connect(self._on_mode_click)
        self._lyrics_btn.clicked.connect(self.toggle_lyrics_requested.emit)

        # 音频引擎状态
        self._audio.state_changed.connect(self._on_state_changed)
        self._audio.position_changed.connect(self._on_position_changed)
        self._audio.duration_changed.connect(self._on_duration_changed)
        self._audio.volume_changed.connect(self._on_volume_changed)

        # 进度条
        self._seek_slider.seek_requested.connect(self._audio.seek)

        # 音量
        self._volume_slider.valueChanged.connect(self._audio.set_volume)
        self._volume_btn.clicked.connect(self._on_volume_btn_click)

        # 播放列表
        self._playlist.current_changed.connect(self._on_track_changed)
        self._playlist.mode_changed.connect(self._on_mode_changed)

    def _on_state_changed(self, state: PlaybackState) -> None:
        if state == PlaybackState.PLAYING:
            self._play_pause_btn.setText("⏸")
        else:
            self._play_pause_btn.setText("▶")

    def _on_position_changed(self, position_ms: int) -> None:
        if not self._seek_slider.is_seeking:
            self._seek_slider.setValue(position_ms)
        self._current_time.setText(format_duration(position_ms / 1000))

    def _on_duration_changed(self, duration_ms: int) -> None:
        self._seek_slider.set_duration_ms(duration_ms)
        self._total_time.setText(format_duration(duration_ms / 1000))

    def _on_track_changed(self, index: int) -> None:
        track = self._playlist.current_track
        if track:
            self._title_label.setText(track.get("title", "Unknown"))
            self._artist_label.setText(track.get("artist", "Unknown"))
            self._small_cover.set_default_cover(
                track.get("artist", ""), track.get("album", "")
            )

    def _on_mode_changed(self, mode: PlaybackMode) -> None:
        self._mode_btn.setText(self.MODE_ICONS.get(mode, "🔁"))

    def _on_mode_click(self) -> None:
        self._playlist.cycle_mode()

    def _on_volume_changed(self, volume: int) -> None:
        self._volume_slider.blockSignals(True)
        self._volume_slider.setValue(volume)
        self._volume_slider.blockSignals(False)

        if volume == 0:
            self._volume_btn.setText("🔇")
        elif volume < 33:
            self._volume_btn.setText("🔈")
        elif volume < 66:
            self._volume_btn.setText("🔉")
        else:
            self._volume_btn.setText("🔊")

    def _on_volume_btn_click(self) -> None:
        self._audio.toggle_mute()

    def update_track_info(self, title: str, artist: str, cover_data: bytes | None = None) -> None:
        """更新当前曲目信息显示。"""
        self._title_label.setText(title)
        self._artist_label.setText(artist)
        if cover_data:
            self._small_cover.set_cover(cover_data)
        else:
            self._small_cover.set_default_cover(artist)
