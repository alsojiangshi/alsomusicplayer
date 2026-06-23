"""CLI/TUI 音乐播放器 — 基于 Textual + pygame 音频后端。

提供终端内的完整音乐播放体验，零 Qt 依赖。
"""

from typing import Optional

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, Horizontal, Vertical
from textual.widgets import Footer, Header, Static

from ..config import config
from ..core.audio_backend import PlaybackMode, PlaybackState
from ..core.library_manager import LibraryManager
from ..core.playlist_engine_cli import PlaylistEngineCLI
from ..core.pygame_audio import PygameAudioBackend
from ..lyrics.lyrics_manager import LyricsManager
from .screens.browser import BrowserScreen
from .screens.now_playing import NowPlayingScreen
from .widgets.control_bar import ControlBar
from .widgets.status_line import StatusLine


class MusicPlayerTUI(App):
    """终端音乐播放器主应用。"""

    CSS_PATH = "styles.tcss"
    TITLE = "🎵 MusicPlayer"
    SUB_TITLE = "Terminal Edition"

    BINDINGS = [
        Binding("space", "play_pause", "播放/暂停", show=True),
        Binding("right", "next_track", "下一首", show=True),
        Binding("left", "prev_track", "上一首", show=True),
        Binding("m", "toggle_mute", "静音", show=True),
        Binding("s", "toggle_shuffle", "随机", show=True),
        Binding("r", "toggle_repeat", "循环", show=True),
        Binding("up", "volume_up", "音量+", show=False),
        Binding("down", "volume_down", "音量-", show=False),
        Binding("f1", "show_browser", "浏览", show=True),
        Binding("f2", "show_now_playing", "正在播放", show=True),
        Binding("q", "quit", "退出", show=True),
    ]

    def __init__(self) -> None:
        super().__init__()
        self.audio = PygameAudioBackend()
        self.library = LibraryManager()
        self.playlist = PlaylistEngineCLI(self.audio)
        self.lyrics_mgr = LyricsManager(self.library)

        self._current_screen: str = "browser"
        self._tracks: list[dict] = []
        self._selected_index: int = -1

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield StatusLine(self.audio, self.playlist)
        yield Container(id="screen-stack")
        yield ControlBar(self.audio, self.playlist)
        yield Footer()

    def on_mount(self) -> None:
        self._load_library()
        self._render_browser()
        self.set_interval(0.5, self._sync_ui)

    def _load_library(self) -> None:
        self._tracks = self.library.get_all_songs()

    def _sync_ui(self) -> None:
        """同步音频状态到 UI。"""
        try:
            self.query_one(ControlBar).refresh_state()
            self.query_one(StatusLine).refresh_state()
        except Exception:
            pass

    # ── Actions ──────────────────────────────────────────

    def action_play_pause(self) -> None:
        if self.playlist.current_track:
            self.audio.play_pause()
        elif self._tracks:
            self._play_all_tracks()

    def action_next_track(self) -> None:
        self.playlist.next()

    def action_prev_track(self) -> None:
        self.playlist.previous()

    def action_toggle_mute(self) -> None:
        self.audio.toggle_mute()

    def action_toggle_shuffle(self) -> None:
        if self.playlist.mode == PlaybackMode.SHUFFLE:
            self.playlist.set_mode(PlaybackMode.SEQUENTIAL)
        else:
            self.playlist.set_mode(PlaybackMode.SHUFFLE)

    def action_toggle_repeat(self) -> None:
        self.playlist.cycle_mode()

    def action_volume_up(self) -> None:
        self.audio.volume_up()

    def action_volume_down(self) -> None:
        self.audio.volume_down()

    def action_show_browser(self) -> None:
        self._current_screen = "browser"
        self._render_browser()

    def action_show_now_playing(self) -> None:
        self._current_screen = "now_playing"
        self._render_now_playing()

    def _play_all_tracks(self) -> None:
        if self._tracks:
            self.playlist.set_queue(self._tracks, start_index=0)
            self.playlist.play_current()

    def _play_track_at(self, index: int) -> None:
        if 0 <= index < len(self._tracks):
            self._selected_index = index
            self.playlist.set_queue(self._tracks, start_index=index)
            self.playlist.play_current()
            self._render_now_playing()

    def _render_browser(self) -> None:
        stack = self.query_one("#screen-stack", Container)
        stack.remove_children()
        browser = BrowserScreen(self._tracks, self._selected_index)
        browser.play_requested = self._play_track_at
        stack.mount(browser)

    def _render_now_playing(self) -> None:
        stack = self.query_one("#screen-stack", Container)
        stack.remove_children()
        now = NowPlayingScreen(self.audio, self.playlist, self.lyrics_mgr)
        stack.mount(now)

    def on_unmount(self) -> None:
        self.audio.stop()


def run_cli() -> None:
    app = MusicPlayerTUI()
    app.run()
