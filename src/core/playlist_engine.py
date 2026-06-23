"""播放列表引擎模块。

管理播放队列、播放模式和歌曲切换逻辑。
"""

import random
from typing import Optional

from PySide6.QtCore import QObject, Signal

from .audio_engine import AudioEngine, PlaybackMode, PlaybackState


class PlaylistEngine(QObject):
    """播放列表引擎。

    维护当前播放队列，根据播放模式自动切换曲目。

    Signals:
        current_changed(int): 当前播放索引变化
        queue_changed: 播放队列变化
        mode_changed(PlaybackMode): 播放模式变化
    """

    current_changed = Signal(int)
    queue_changed = Signal()
    mode_changed = Signal(PlaybackMode)

    def __init__(
        self,
        audio_engine: AudioEngine,
        parent: Optional[QObject] = None,
    ) -> None:
        super().__init__(parent)
        self._audio = audio_engine
        self._queue: list[dict] = []  # 每项: {"id": int, "title": str, "artist": str, "path": str}
        self._original_queue: list[dict] = []  # 用于恢复随机播放前的顺序
        self._current_index: int = -1
        self._mode: PlaybackMode = PlaybackMode.SEQUENTIAL

        # 连接音轨结束信号
        self._audio.track_finished.connect(self._on_track_finished)

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

    # ── 队列操作 ────────────────────────────────────────

    def set_queue(self, tracks: list[dict], start_index: int = 0) -> None:
        """设置播放队列。

        Args:
            tracks: 歌曲信息列表。
            start_index: 起始播放索引。
        """
        self._queue = list(tracks)
        self._original_queue = list(tracks)
        if self._mode == PlaybackMode.SHUFFLE and self._queue:
            random.shuffle(self._queue)
        self._current_index = max(0, min(start_index, len(self._queue) - 1)) if self._queue else -1
        self.queue_changed.emit()
        self.current_changed.emit(self._current_index)

    def add_to_queue(self, tracks: list[dict]) -> None:
        """添加歌曲到队列末尾。"""
        self._queue.extend(tracks)
        self._original_queue.extend(tracks)
        self.queue_changed.emit()

    def add_next(self, tracks: list[dict]) -> None:
        """在当前歌曲之后插入歌曲。"""
        idx = self._current_index + 1
        for i, track in enumerate(tracks):
            self._queue.insert(idx + i, track)
            self._original_queue.insert(idx + i, track)
        self.queue_changed.emit()

    def remove_from_queue(self, index: int) -> None:
        """从队列中移除指定索引的歌曲。"""
        if 0 <= index < len(self._queue):
            removed = self._queue.pop(index)
            if removed in self._original_queue:
                self._original_queue.remove(removed)
            if index < self._current_index:
                self._current_index -= 1
            elif index == self._current_index:
                # 当前歌曲被移除，停止播放
                self._audio.stop()
            self.queue_changed.emit()

    def clear_queue(self) -> None:
        """清空播放队列。"""
        self._audio.stop()
        self._queue.clear()
        self._original_queue.clear()
        self._current_index = -1
        self.queue_changed.emit()

    def move_track(self, from_idx: int, to_idx: int) -> None:
        """移动队列中的歌曲。"""
        if 0 <= from_idx < len(self._queue) and 0 <= to_idx < len(self._queue):
            track = self._queue.pop(from_idx)
            self._queue.insert(to_idx, track)
            if from_idx == self._current_index:
                self._current_index = to_idx
            self.queue_changed.emit()

    # ── 播放控制 ────────────────────────────────────────

    def play_index(self, index: int) -> bool:
        """播放队列中指定索引的歌曲。

        Args:
            index: 目标索引。

        Returns:
            是否成功加载并播放。
        """
        if not 0 <= index < len(self._queue):
            return False

        self._current_index = index
        track = self._queue[index]
        self._audio.load(track["path"])
        self._audio.play()
        self.current_changed.emit(index)
        return True

    def play_current(self) -> bool:
        """播放当前索引的歌曲。"""
        return self.play_index(self._current_index)

    def next(self) -> bool:
        """切换到下一首。"""
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
        """切换到上一首。

        如果播放位置 > 3 秒则重新播放当前曲目，
        否则切换到上一首。
        """
        if not self._queue:
            return False

        if self._audio.position > 3000:
            return self.play_current()
        elif self._current_index <= 0:
            return self.play_index(0)
        else:
            return self.play_index(self._current_index - 1)

    def _play_random(self) -> bool:
        """随机播放一首。"""
        if not self._queue:
            return False
        if len(self._queue) == 1:
            return self.play_index(0)
        new_idx = random.choice([i for i in range(len(self._queue)) if i != self._current_index])
        return self.play_index(new_idx)

    def _on_track_finished(self) -> None:
        """当前曲目播放完成时的自动切歌。"""
        self.next()

    # ── 播放模式 ────────────────────────────────────────

    def set_mode(self, mode: PlaybackMode) -> None:
        """设置播放模式。"""
        if mode == self._mode:
            return

        prev_mode = self._mode
        self._mode = mode

        if mode == PlaybackMode.SHUFFLE and prev_mode != PlaybackMode.SHUFFLE:
            # 重新洗牌
            current_track = self.current_track
            self._original_queue = list(self._queue)
            if current_track:
                others = [t for t in self._queue if t != current_track]
                random.shuffle(others)
                self._queue = [current_track] + others
            else:
                random.shuffle(self._queue)

        elif mode != PlaybackMode.SHUFFLE and prev_mode == PlaybackMode.SHUFFLE:
            # 恢复原始顺序
            if self._original_queue:
                current_track = self.current_track
                self._queue = list(self._original_queue)
                if current_track and current_track in self._queue:
                    self._current_index = self._queue.index(current_track)

        self.mode_changed.emit(mode)

    def cycle_mode(self) -> PlaybackMode:
        """循环切换播放模式。"""
        modes = [
            PlaybackMode.SEQUENTIAL,
            PlaybackMode.SHUFFLE,
            PlaybackMode.REPEAT_ONE,
            PlaybackMode.REPEAT_ALL,
        ]
        current_idx = modes.index(self._mode)
        next_mode = modes[(current_idx + 1) % len(modes)]
        self.set_mode(next_mode)
        return next_mode

    def get_next_track(self) -> Optional[dict]:
        """预览下一首（不实际切换）。"""
        if not self._queue:
            return None
        if self._mode == PlaybackMode.SHUFFLE:
            candidates = [t for t in self._queue if t != self.current_track]
            return random.choice(candidates) if candidates else None
        elif self._mode == PlaybackMode.REPEAT_ONE:
            return self.current_track
        elif self._current_index >= len(self._queue) - 1:
            return self._queue[0] if self._mode == PlaybackMode.REPEAT_ALL else None
        else:
            return self._queue[self._current_index + 1]
