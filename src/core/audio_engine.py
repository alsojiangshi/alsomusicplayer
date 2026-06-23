"""音频播放引擎模块。

基于 PySide6 QMediaPlayer 实现跨平台音频播放。
支持 WAV, OGG, MP3, FLAC, M4A 等格式。
"""

from enum import Enum
from typing import Optional

from PySide6.QtCore import (
    QObject,
    QUrl,
    Signal,
    Slot,
)
from PySide6.QtMultimedia import (
    QAudioOutput,
    QMediaFormat,
    QMediaPlayer,
)


class PlaybackState(Enum):
    """播放状态枚举。"""
    STOPPED = "stopped"
    PLAYING = "playing"
    PAUSED = "paused"


class PlaybackMode(Enum):
    """播放模式枚举。"""
    SEQUENTIAL = "sequential"       # 顺序播放
    SHUFFLE = "shuffle"            # 随机播放
    REPEAT_ONE = "repeat_one"      # 单曲循环
    REPEAT_ALL = "repeat_all"      # 列表循环


class AudioEngine(QObject):
    """音频播放引擎。

    封装 QMediaPlayer，提供播放控制、状态管理和信号。

    Signals:
        state_changed(PlaybackState): 播放状态变化
        position_changed(int): 播放位置变化（毫秒）
        duration_changed(int): 总时长变化（毫秒）
        volume_changed(int): 音量变化 (0-100)
        track_finished: 当前曲目播放完成
        error_occurred(str): 播放错误
        metadata_loaded(dict): 元数据加载完成
    """

    state_changed = Signal(PlaybackState)
    position_changed = Signal(int)
    duration_changed = Signal(int)
    volume_changed = Signal(int)
    track_finished = Signal()
    error_occurred = Signal(str)
    metadata_loaded = Signal(dict)

    def __init__(self, parent: Optional[QObject] = None) -> None:
        super().__init__(parent)
        self._player = QMediaPlayer(self)
        self._audio_output = QAudioOutput(self)
        self._player.setAudioOutput(self._audio_output)

        self._current_state = PlaybackState.STOPPED
        self._current_source: str = ""
        self._volume: int = 80
        self._muted: bool = False

        self._audio_output.setVolume(self._volume / 100.0)

        self._setup_connections()

    def _setup_connections(self) -> None:
        """连接 QMediaPlayer 信号到引擎信号。"""
        self._player.playbackStateChanged.connect(self._on_state_changed)
        self._player.positionChanged.connect(self.position_changed.emit)
        self._player.durationChanged.connect(self._on_duration_changed)
        self._player.mediaStatusChanged.connect(self._on_media_status)
        self._player.errorOccurred.connect(self._on_error)

    def _on_state_changed(self, state: QMediaPlayer.PlaybackState) -> None:
        """Qt 播放状态变化处理。"""
        state_map = {
            QMediaPlayer.PlaybackState.PlayingState: PlaybackState.PLAYING,
            QMediaPlayer.PlaybackState.PausedState: PlaybackState.PAUSED,
            QMediaPlayer.PlaybackState.StoppedState: PlaybackState.STOPPED,
        }
        new_state = state_map.get(state, PlaybackState.STOPPED)
        self._current_state = new_state
        self.state_changed.emit(new_state)

    def _on_duration_changed(self, duration: int) -> None:
        """时长变化处理。"""
        if duration > 0:
            self.duration_changed.emit(duration)

    def _on_media_status(self, status: QMediaPlayer.MediaStatus) -> None:
        """媒体状态变化处理。"""
        if status == QMediaPlayer.MediaStatus.EndOfMedia:
            self._current_state = PlaybackState.STOPPED
            self.track_finished.emit()
        elif status == QMediaPlayer.MediaStatus.LoadedMedia:
            pass  # 媒体加载完成
        elif status == QMediaPlayer.MediaStatus.InvalidMedia:
            self.error_occurred.emit("无法播放该文件：格式不支持或文件已损坏")

    def _on_error(self, error: QMediaPlayer.Error, error_string: str) -> None:
        """播放错误处理。"""
        self._current_state = PlaybackState.STOPPED
        error_msg = f"播放错误: {error_string}"
        self.error_occurred.emit(error_msg)

    # ── 公共 API ─────────────────────────────────────────

    @property
    def state(self) -> PlaybackState:
        return self._current_state

    @property
    def volume(self) -> int:
        return self._volume

    @property
    def is_muted(self) -> bool:
        return self._muted

    @property
    def current_source(self) -> str:
        return self._current_source

    @property
    def position(self) -> int:
        """当前播放位置（毫秒）。"""
        return self._player.position()

    @property
    def duration(self) -> int:
        """当前曲目总时长（毫秒）。"""
        return self._player.duration()

    @property
    def progress(self) -> float:
        """播放进度 (0.0 ~ 1.0)。"""
        dur = self._player.duration()
        if dur <= 0:
            return 0.0
        return self._player.position() / dur

    def is_playing(self) -> bool:
        return self._current_state == PlaybackState.PLAYING

    def is_paused(self) -> bool:
        return self._current_state == PlaybackState.PAUSED

    def load(self, source: str) -> None:
        """加载音频源。

        Args:
            source: 文件路径或 URL。
        """
        self._current_source = source
        if source.startswith(("http://", "https://")):
            self._player.setSource(QUrl(source))
        else:
            self._player.setSource(QUrl.fromLocalFile(source))

    def play(self) -> None:
        """开始播放。如果已暂停则恢复。"""
        if self._current_state == PlaybackState.PAUSED:
            self._player.play()
        elif self._current_state == PlaybackState.STOPPED and self._current_source:
            self._player.play()
        elif self._current_state == PlaybackState.PLAYING:
            pass  # 已在播放

    def pause(self) -> None:
        """暂停播放。"""
        self._player.pause()

    def stop(self) -> None:
        """停止播放。"""
        self._player.stop()

    def play_pause(self) -> None:
        """切换播放/暂停。"""
        if self._current_state == PlaybackState.PLAYING:
            self.pause()
        else:
            self.play()

    def seek(self, position_ms: int) -> None:
        """跳转到指定位置。

        Args:
            position_ms: 目标位置（毫秒）。
        """
        self._player.setPosition(max(0, position_ms))

    def seek_relative(self, delta_ms: int) -> None:
        """相对跳转。

        Args:
            delta_ms: 偏移量（毫秒），正数为前进，负数为后退。
        """
        new_pos = self._player.position() + delta_ms
        self.seek(new_pos)

    def set_volume(self, volume: int) -> None:
        """设置音量。

        Args:
            volume: 音量值 (0-100)。
        """
        self._volume = max(0, min(100, volume))
        if not self._muted:
            self._audio_output.setVolume(self._volume / 100.0)
        self.volume_changed.emit(self._volume)

    def volume_up(self, step: int = 5) -> None:
        """增加音量。"""
        self.set_volume(self._volume + step)

    def volume_down(self, step: int = 5) -> None:
        """降低音量。"""
        self.set_volume(self._volume - step)

    def toggle_mute(self) -> bool:
        """切换静音状态，返回新的静音状态。"""
        self._muted = not self._muted
        if self._muted:
            self._audio_output.setVolume(0.0)
        else:
            self._audio_output.setVolume(self._volume / 100.0)
        self.volume_changed.emit(0 if self._muted else self._volume)
        return self._muted

    def reload_volume(self) -> None:
        """重新应用音量设置（用于从静音恢复）。"""
        if self._muted:
            self._audio_output.setVolume(0.0)
        else:
            self._audio_output.setVolume(self._volume / 100.0)
