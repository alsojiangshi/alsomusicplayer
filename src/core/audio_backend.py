"""音频后端抽象接口。

定义音频播放引擎的统一接口，GUI (QMediaPlayer) 和 CLI (pygame) 各自实现。
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Callable, Optional


class PlaybackState(Enum):
    STOPPED = "stopped"
    PLAYING = "playing"
    PAUSED = "paused"


class PlaybackMode(Enum):
    SEQUENTIAL = "sequential"
    SHUFFLE = "shuffle"
    REPEAT_ONE = "repeat_one"
    REPEAT_ALL = "repeat_all"


class AudioBackend(ABC):
    """音频后端抽象基类。"""

    @abstractmethod
    def load(self, source: str) -> None:
        """加载音频源（文件路径或 URL）。"""
        ...

    @abstractmethod
    def play(self) -> None:
        """开始或恢复播放。"""
        ...

    @abstractmethod
    def pause(self) -> None:
        """暂停播放。"""
        ...

    @abstractmethod
    def stop(self) -> None:
        """停止播放。"""
        ...

    @abstractmethod
    def seek(self, position_ms: int) -> None:
        """跳转到指定位置（毫秒）。"""
        ...

    @abstractmethod
    def set_volume(self, volume: int) -> None:
        """设置音量 (0-100)。"""
        ...

    @abstractmethod
    def get_position(self) -> int:
        """获取当前播放位置（毫秒）。"""
        ...

    @abstractmethod
    def get_duration(self) -> int:
        """获取当前曲目总时长（毫秒）。"""
        ...

    @property
    @abstractmethod
    def state(self) -> PlaybackState:
        ...

    @property
    @abstractmethod
    def volume(self) -> int:
        ...

    def set_on_track_finished(self, callback: Optional[Callable[[], None]]) -> None:
        """设置曲目结束回调（CLI 使用回调，GUI 使用 Qt 信号）。"""
        self._on_track_finished = callback

    def play_pause(self) -> None:
        """切换播放/暂停。"""
        if self.state == PlaybackState.PLAYING:
            self.pause()
        else:
            self.play()

    def volume_up(self, step: int = 5) -> None:
        self.set_volume(min(100, self.volume + step))

    def volume_down(self, step: int = 5) -> None:
        self.set_volume(max(0, self.volume - step))

    def toggle_mute(self) -> bool:
        if getattr(self, "_muted", False):
            self._muted = False
            self.set_volume(self._saved_volume)
        else:
            self._muted = True
            self._saved_volume = self.volume
            self.set_volume(0)
        return self._muted

    def get_progress(self) -> float:
        """获取播放进度 (0.0 ~ 1.0)。"""
        dur = self.get_duration()
        if dur <= 0:
            return 0.0
        return self.get_position() / dur
