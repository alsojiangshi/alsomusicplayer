"""顶部状态行。"""

from textual.app import ComposeResult
from textual.containers import Horizontal
from textual.widgets import Static

from ...core.audio_backend import AudioBackend, PlaybackState
from ...core.playlist_engine_cli import PlaylistEngineCLI


class StatusLine(Horizontal):
    def __init__(self, audio: AudioBackend, playlist: PlaylistEngineCLI) -> None:
        super().__init__(id="status-line")
        self._audio = audio
        self._playlist = playlist

    def compose(self) -> ComposeResult:
        yield Static("🎵 就绪", id="status-text")

    def refresh_state(self) -> None:
        track = self._playlist.current_track
        state = self._audio.state
        size = self._playlist.queue_size
        status = self.query_one("#status-text", Static)

        if track:
            title = track.get("title", "?")[:40]
            artist = track.get("artist", "?")[:20]
            idx = self._playlist.current_index + 1
            s = "▶" if state == PlaybackState.PLAYING else ("⏸" if state == PlaybackState.PAUSED else "⏹")
            status.update(f" {s}  [{idx}/{size}]  {title} — {artist}")
        else:
            status.update(f" 🎵 就绪  |  {size} 首歌曲")
