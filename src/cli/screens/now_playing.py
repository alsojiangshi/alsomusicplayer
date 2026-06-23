"""正在播放屏幕。"""

from typing import Optional

from textual.app import ComposeResult
from textual.containers import Container, Vertical
from textual.widgets import Label, Static

from ...core.audio_backend import AudioBackend, PlaybackState
from ...core.playlist_engine_cli import PlaylistEngineCLI
from ...lyrics.lyrics_manager import LyricsManager


class NowPlayingScreen(Vertical):
    def __init__(
        self,
        audio: AudioBackend,
        playlist: PlaylistEngineCLI,
        lyrics_mgr: LyricsManager,
        name: Optional[str] = None,
        id: Optional[str] = None,
    ) -> None:
        super().__init__(name=name, id=id)
        self._audio = audio
        self._playlist = playlist
        self._lyrics_mgr = lyrics_mgr

    def compose(self) -> ComposeResult:
        yield Static("🎵 正在播放", classes="screen-title")

        track = self._playlist.current_track
        title = track.get("title", "—") if track else "—"
        artist = track.get("artist", "—") if track else "—"

        yield Label(f"🎶 {title}", id="np-title")
        yield Label(f"👤 {artist}", id="np-artist")
        yield Label("00:00 ─────────────── 00:00", id="np-progress")
        yield Container(Label("按 F2 刷新歌词", id="np-lyrics-placeholder"), id="lyrics-container")

    def on_mount(self) -> None:
        self.set_interval(1.0, self._refresh)

    def _refresh(self) -> None:
        track = self._playlist.current_track
        if not track:
            return

        try:
            title_label = self.query_one("#np-title", Label)
            artist_label = self.query_one("#np-artist", Label)
            title_label.update(f"🎶 {track.get('title', '—')[:50]}")
            artist_label.update(f"👤 {track.get('artist', '—')[:50]}")
        except Exception:
            pass

        # 进度
        pos = self._audio.get_position() / 1000.0
        dur = self._audio.get_duration() / 1000.0 if self._audio.get_duration() > 0 else 1
        bar_len = 20
        filled = int((pos / dur) * bar_len) if dur > 0 else 0
        bar = "█" * filled + "─" * (bar_len - filled)
        try:
            progress = self.query_one("#np-progress", Label)
            progress.update(f"{int(pos//60):02d}:{int(pos%60):02d} {bar} {int(dur//60):02d}:{int(dur%60):02d}")
        except Exception:
            pass

        self._update_lyrics(track)

    def _update_lyrics(self, track: dict) -> None:
        container = self.query_one("#lyrics-container", Container)
        data = self._lyrics_mgr.get_cached_lyrics(track.get("id", 0))
        if not data:
            return
        text = data.get("synced_text") or data.get("plain_text", "")
        if not text:
            return
        container.remove_children()
        import re
        lines = text.strip().split("\n")[-8:]
        for line in lines:
            clean = re.sub(r"\[.*?\]", "", line).strip()
            if clean:
                container.mount(Label(f"  {clean[:60]}", classes="lyric-line"))
