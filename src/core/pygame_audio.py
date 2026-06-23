"""pygame 音频后端 — 用于 CLI/TUI 模式。

基于 pygame.mixer.music，无需 Qt 依赖。
支持 MP3, OGG, WAV 等格式（通过 SDL_mixer）。
"""

import threading
import time
from typing import Callable, Optional

try:
    import pygame
    HAS_PYGAME = True
except ImportError:
    HAS_PYGAME = False

from .audio_backend import AudioBackend, PlaybackState


class PygameAudioBackend(AudioBackend):
    """基于 pygame.mixer.music 的音频后端。"""

    def __init__(self) -> None:
        if not HAS_PYGAME:
            raise ImportError("pygame 未安装。请执行: pip install pygame")

        self._audio_ok = True
        if not pygame.mixer.get_init():
            try:
                pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=4096)
            except pygame.error:
                self._audio_ok = False

        self._state = PlaybackState.STOPPED
        self._volume = 80
        self._saved_volume = 80
        self._muted = False
        self._current_source: str = ""
        self._duration: int = 0
        self._position: int = 0
        self._start_time: float = 0.0
        self._on_track_finished: Optional[Callable[[], None]] = None
        self._monitor_thread: Optional[threading.Thread] = None
        self._monitor_running = False

        if self._audio_ok:
            pygame.mixer.music.set_volume(self._volume / 100.0)
            pygame.mixer.music.set_endevent(pygame.USEREVENT + 1)
            self._start_monitor()

    # ── AudioBackend 接口 ────────────────────────────────

    def load(self, source: str) -> None:
        self._current_source = source
        if self._audio_ok:
            try:
                pygame.mixer.music.load(source)
            except pygame.error:
                pass
        self._duration = self._estimate_duration(source)

    def play(self) -> None:
        if self._audio_ok and self._current_source:
            pygame.mixer.music.play()
            self._state = PlaybackState.PLAYING
            self._start_time = time.time()
        elif self._current_source:
            self._state = PlaybackState.PLAYING  # 模拟（无音频设备）
            self._start_time = time.time()

    def pause(self) -> None:
        if self._audio_ok:
            pygame.mixer.music.pause()
        self._state = PlaybackState.PAUSED

    def stop(self) -> None:
        if self._audio_ok:
            pygame.mixer.music.stop()
        self._state = PlaybackState.STOPPED
        self._position = 0

    def seek(self, position_ms: int) -> None:
        if self._audio_ok:
            try:
                pos_sec = position_ms / 1000.0
                pygame.mixer.music.play(start=pos_sec)
                self._start_time = time.time() - pos_sec
                if self._state != PlaybackState.PLAYING:
                    pygame.mixer.music.pause()
            except Exception:
                self._position = position_ms

    def set_volume(self, volume: int) -> None:
        self._volume = max(0, min(100, volume))
        if self._audio_ok and not self._muted:
            pygame.mixer.music.set_volume(self._volume / 100.0)

    def get_position(self) -> int:
        if self._state == PlaybackState.PLAYING:
            return int((time.time() - self._start_time) * 1000)
        return self._position

    def get_duration(self) -> int:
        return self._duration

    @property
    def state(self) -> PlaybackState:
        return self._state

    @property
    def volume(self) -> int:
        return self._volume

    # ── 内部方法 ─────────────────────────────────────────

    def _estimate_duration(self, source: str) -> int:
        try:
            from mutagen import File as MutagenFile
            audio = MutagenFile(source)
            if audio and hasattr(audio, "info") and audio.info:
                return int(getattr(audio.info, "length", 0) * 1000)
        except Exception:
            pass
        return 0

    def _start_monitor(self) -> None:
        if self._monitor_running:
            return
        self._monitor_running = True

        def _monitor():
            while self._monitor_running:
                try:
                    for event in pygame.event.get():
                        if event.type == pygame.USEREVENT + 1:
                            self._state = PlaybackState.STOPPED
                            self._position = 0
                            if self._on_track_finished:
                                self._on_track_finished()
                except Exception:
                    pass
                time.sleep(0.2)

        self._monitor_thread = threading.Thread(target=_monitor, daemon=True)
        self._monitor_thread.start()

    def stop_monitor(self) -> None:
        self._monitor_running = False
