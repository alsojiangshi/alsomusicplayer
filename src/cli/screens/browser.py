"""音乐浏览器屏幕 — 歌曲列表与导航。"""

from typing import Callable, Optional

from textual.containers import Vertical, Horizontal
from textual.screen import Screen
from textual.widgets import DataTable, Input, Label, Static


class BrowserScreen(Vertical):
    """歌曲浏览器组件。"""

    def __init__(
        self,
        tracks: list[dict],
        selected_index: int = -1,
        name: Optional[str] = None,
        id: Optional[str] = None,
    ) -> None:
        super().__init__(name=name, id=id)
        self._tracks = tracks
        self._selected_index = selected_index
        self.play_requested: Optional[Callable[[int], None]] = None

    def compose(self):
        yield Static("📚 音乐库", classes="screen-title")
        yield Input(placeholder="搜索 🔍  输入关键词过滤...", id="search-input")
        yield DataTable(id="song-table", cursor_type="row", zebra_stripes=True)

    def on_mount(self) -> None:
        table = self.query_one("#song-table", DataTable)
        table.add_columns("#", "标题", "艺术家", "专辑", "时长")
        self._populate_table(table, self._tracks)

    def _populate_table(self, table: DataTable, tracks: list[dict]) -> None:
        table.clear()
        for i, track in enumerate(tracks):
            mins = int(track.get("duration", 0) // 60)
            secs = int(track.get("duration", 0) % 60)
            table.add_row(
                str(i + 1),
                track.get("title", "?")[:40],
                track.get("artist", "?")[:25],
                track.get("album", "?")[:30],
                f"{mins:02d}:{secs:02d}",
                key=str(i),
            )
        if tracks:
            table.focus()

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        """选中一行时播放。"""
        if event.row_key and event.row_key.isdigit():
            idx = int(event.row_key.value)
            if self.play_requested:
                self.play_requested(idx)

    def on_input_changed(self, event: Input.Changed) -> None:
        """搜索过滤。"""
        query = event.value.strip().lower()
        table = self.query_one("#song-table", DataTable)
        if not query:
            self._populate_table(table, self._tracks)
        else:
            filtered = [
                t for t in self._tracks
                if (query in (t.get("title", "") or "").lower()
                    or query in (t.get("artist", "") or "").lower()
                    or query in (t.get("album", "") or "").lower())
            ]
            self._populate_table(table, filtered)

    @property
    def highlighted_index(self) -> int:
        """当前高亮行的原始索引。"""
        table = self.query_one("#song-table", DataTable)
        if table.cursor_row >= 0 and table.cursor_row < len(self._tracks):
            return table.cursor_row
        return -1
