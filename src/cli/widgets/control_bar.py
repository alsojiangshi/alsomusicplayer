"""底部控制栏。"""

from textual.app import ComposeResult
from textual.containers import Horizontal
from textual.widgets import Static

from ...core.audio_backend import AudioBackend, PlaybackMode, PlaybackState
from ...core.playlist_engine_cli import PlaylistEngineCLI


MODE_LABELS = {
    PlaybackMode.SEQUENTIAL: "🔁 顺序",
    PlaybackMode.SHUFFLE: "🔀 随机",
    PlaybackMode.REPEAT_ONE: "🔂 单曲",
    PlaybackMode.REPEAT_ALL: "🔄 全部",
}


class ControlBar(Horizontal):
    def __init__(self, audio: AudioBackend, playlist: PlaylistEngineCLI) -> None:
        super().__init__(id="control-bar")
        self._audio = audio
        self._playlist = playlist

    def compose(self) -> ComposeResult:
        yield Static(" ⏮  ", id="btn-prev", classes="ctrl-btn")
        yield Static(" ▶  ", id="btn-play", classes="ctrl-btn ctrl-play")
        yield Static(" ⏭  ", id="btn-next", classes="ctrl-btn")
        yield Static(" ────────────── ", id="progress-bar")
        yield Static(" 🔊 ", id="btn-vol", classes="ctrl-btn")
        yield Static("    ", id="mode-label")

    def refresh_state(self) -> None:
        state = self._audio.state
        mode = self._playlist.mode

        btn = self.query_one("#btn-play", Static)
        btn.update(" ⏸  " if state == PlaybackState.PLAYING else " ▶  ")

        mode_lbl = self.query_one("#mode-label", Static)
        mode_lbl.update(MODE_LABELS.get(mode, "🔁 顺序"))

        vol = self._audio.volume
        icon = "🔇" if vol == 0 else ("🔈" if vol < 33 else ("🔉" if vol < 66 else "🔊"))
        vol_btn = self.query_one("#btn-vol", Static)
        vol_btn.update(f" {icon} {vol}% ")

        dur = self._audio.get_duration()
        if dur > 0:
            pos = self._audio.get_position() / 1000
            dur_s = dur / 1000
            bar_len = 16
            filled = int((pos / dur_s) * bar_len) if dur_s > 0 else 0
            bar = "█" * filled + "─" * (bar_len - filled)
            progress = self.query_one("#progress-bar", Static)
            progress.update(f" {int(pos/60):02d}:{int(pos%60):02d} {bar} ")
