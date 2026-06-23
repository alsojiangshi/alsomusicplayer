"""CLI 播放列表引擎 — 基于回调而非 Qt 信号。

复用于 CLI/TUI 模式，与 core/playlist_engine.py (Qt 版) 接口一致。
"""

import random
from typing import Callable, Optional

from .audio_backend import AudioBackend, PlaybackMode, PlaybackState


class PlaylistEngineCLI:
    """CLI 兼容的播放列表引擎（回调模式）。

    与 Qt 版 PlaylistEngine 共享相同的队列管理逻辑，
    但使用普通回调代替 PySide6 Signal。
    """

    def __init__(self, audio: AudioBackend) -> None:
        self._audio = audio
        self._queue: list[dict] = []
        self._original_queue: list[dict] = []
        self._current_index: int = -1
        self._mode: PlaybackMode = PlaybackMode.SEQUENTIAL

        # 回调
        self._on_current_changed: Optional[Callable[[int], None]] = None
        self._on_queue_changed: Optional[Callable[[], None]] = None

        # 监听曲目结束
        self._audio.set_on_track_finished(self._on_track_finished)

    # ── 属性 ────────────────────────────────────────────

    @property
    def current_index(self) -> int:
        return self._current_index

    @property
    def current_track(self) -> Optional[dict]:
        if 0 <= self._current_index < len(self._queue):
            return self._queue[self._current_index]
        return None

    @property
    def queue_size(self) -> int:
        return len(self._queue)

    @property
    def mode(self) -> PlaybackMode:
        return self._mode

    @property
    def queue(self) -> list[dict]:
        return list(self._queue)

    # ── 回调设置 ────────────────────────────────────────

    def set_on_current_changed(self, cb: Optional[Callable[[int], None]]):
        self._on_current_changed = cb

    def set_on_queue_changed(self, cb: Optional[Callable[[], None]]):
        self._on_queue_changed = cb

    # ── 队列操作 ────────────────────────────────────────

    def set_queue(self, tracks: list[dict], start_index: int = 0) -> None:
        self._queue = list(tracks)
        self._original_queue = list(tracks)
        if self._mode == PlaybackMode.SHUFFLE and self._queue:
            random.shuffle(self._queue)
        self._current_index = max(0, min(start_index, len(self._queue) - 1)) if self._queue else -1
        if self._on_queue_changed:
            self._on_queue_changed()

    def add_to_queue(self, tracks: list[dict]) -> None:
        self._queue.extend(tracks)
        self._original_queue.extend(tracks)
        if self._on_queue_changed:
            self._on_queue_changed()

    def clear_queue(self) -> None:
        self._audio.stop()
        self._queue.clear()
        self._original_queue.clear()
        self._current_index = -1

    # ── 播放控制 ────────────────────────────────────────

    def play_index(self, index: int) -> bool:
        if not 0 <= index < len(self._queue):
            return False
        self._current_index = index
        track = self._queue[index]
        self._audio.load(track["path"])
        self._audio.play()
        if self._on_current_changed:
            self._on_current_changed(index)
        return True

    def play_current(self) -> bool:
        return self.play_index(self._current_index)

    def next(self) -> bool:
        if not self._queue:
            return False
        if self._mode == PlaybackMode.SHUFFLE:
            return self._play_random()
        elif self._mode == PlaybackMode.REPEAT_ONE:
            return self.play_current()
        elif self._current_index >= len(self._queue) - 1:
            if self._mode == PlaybackMode.REPEAT_ALL:
                return self.play_index(0)
            self._audio.stop()
            return False
        else:
            return self.play_index(self._current_index + 1)

    def previous(self) -> bool:
        if not self._queue:
            return False
        if self._audio.get_position() > 3000:
            return self.play_current()
        elif self._current_index <= 0:
            return self.play_index(0)
        else:
            return self.play_index(self._current_index - 1)

    def _play_random(self) -> bool:
        if not self._queue:
            return False
        if len(self._queue) == 1:
            return self.play_index(0)
        new_idx = random.choice([i for i in range(len(self._queue)) if i != self._current_index])
        return self.play_index(new_idx)

    def _on_track_finished(self) -> None:
        self.next()

    # ── 播放模式 ────────────────────────────────────────

    def set_mode(self, mode: PlaybackMode) -> None:
        if mode == self._mode:
            return
        prev = self._mode
        self._mode = mode
        if mode == PlaybackMode.SHUFFLE and prev != PlaybackMode.SHUFFLE:
            current = self.current_track
            self._original_queue = list(self._queue)
            if current:
                others = [t for t in self._queue if t != current]
                random.shuffle(others)
                self._queue = [current] + others
            else:
                random.shuffle(self._queue)
        elif mode != PlaybackMode.SHUFFLE and prev == PlaybackMode.SHUFFLE:
            if self._original_queue:
                current = self.current_track
                self._queue = list(self._original_queue)
                if current and current in self._queue:
                    self._current_index = self._queue.index(current)

    def cycle_mode(self) -> PlaybackMode:
        modes = [PlaybackMode.SEQUENTIAL, PlaybackMode.SHUFFLE,
                 PlaybackMode.REPEAT_ONE, PlaybackMode.REPEAT_ALL]
        current_idx = modes.index(self._mode)
        next_mode = modes[(current_idx + 1) % len(modes)]
        self.set_mode(next_mode)
        return next_mode
