"""音乐库管理模块。

提供歌曲、播放列表、收藏和播放历史的 CRUD 操作。
"""

from typing import Optional

from ..database import db
from ..utils.metadata import TrackMetadata


class LibraryManager:
    """音乐库管理器。

    封装所有与音乐库相关的数据库操作。
    """

    def __init__(self) -> None:
        db.initialize()

    # ── 歌曲操作 ────────────────────────────────────────

    def add_song(self, meta: TrackMetadata, source: str = "local", source_config: str = "") -> Optional[int]:
        """添加一首歌曲到音乐库。

        Args:
            meta: 文件元数据。
            source: 来源类型 ('local', 's3', 'openlist')。
            source_config: 来源配置 JSON。

        Returns:
            新歌曲的 ID，如果已存在则返回 None。
        """
        existing = db.fetch_one(
            "SELECT id FROM songs WHERE file_path = ?",
            (meta.file_path,),
        )
        if existing:
            return None

        # 检查哈希重复
        if meta.file_hash:
            dup = db.fetch_one(
                "SELECT id FROM songs WHERE file_hash = ?",
                (meta.file_hash,),
            )
            if dup:
                return None

        sql = """
            INSERT INTO songs
            (title, artist, album, duration, file_path, file_hash,
             format, bitrate, sample_rate, channels, file_size,
             cover_art, source, source_config)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        return db.insert(sql, (
            meta.title,
            meta.artist,
            meta.album,
            meta.duration,
            meta.file_path,
            meta.file_hash,
            meta.format,
            meta.bitrate,
            meta.sample_rate,
            meta.channels,
            meta.file_size,
            meta.cover_art,
            source,
            source_config,
        ))

    def get_song(self, song_id: int) -> Optional[dict]:
        """获取单首歌曲信息。"""
        row = db.fetch_one("SELECT * FROM songs WHERE id = ?", (song_id,))
        return dict(row) if row else None

    def get_all_songs(self) -> list[dict]:
        """获取所有歌曲。"""
        rows = db.fetch_all("SELECT * FROM songs ORDER BY date_added DESC")
        return [dict(r) for r in rows]

    def search(
        self,
        query: Optional[str] = None,
        source: Optional[str] = None,
        limit: int = 1000,
    ) -> list[dict]:
        """搜索歌曲。

        Args:
            query: 搜索关键词（标题/艺术家/专辑）。
            source: 按来源过滤 ('local', 's3', 'openlist', 'all')。
            limit: 最大返回数。

        Returns:
            匹配的歌曲列表。
        """
        if query:
            # 使用 FTS 全文搜索
            sql = """
                SELECT s.* FROM songs s
                JOIN songs_fts fts ON s.id = fts.rowid
                WHERE songs_fts MATCH ?
            """
            params: list = [query]
        else:
            sql = "SELECT * FROM songs WHERE 1=1"
            params = []

        if source and source != "all":
            sql += " AND s.source = ?" if query else " AND source = ?"
            params.append(source)

        sql += " ORDER BY date_added DESC LIMIT ?"
        params.append(limit)

        rows = db.fetch_all(sql, tuple(params))
        return [dict(r) for r in rows]

    def get_songs_by_source(self, source: str) -> list[dict]:
        """按来源获取歌曲。"""
        rows = db.fetch_all(
            "SELECT * FROM songs WHERE source = ? ORDER BY date_added DESC",
            (source,),
        )
        return [dict(r) for r in rows]

    def delete_song(self, song_id: int) -> bool:
        """删除歌曲。"""
        db.execute("DELETE FROM songs WHERE id = ?", (song_id,))
        db.commit()
        return True

    def get_song_count(self) -> int:
        """获取歌曲总数。"""
        row = db.fetch_one("SELECT COUNT(*) as cnt FROM songs")
        return row["cnt"] if row else 0

    # ── 播放列表操作 ────────────────────────────────────

    def create_playlist(self, name: str) -> int:
        """创建播放列表。"""
        return db.insert("INSERT INTO playlists (name) VALUES (?)", (name,))

    def delete_playlist(self, playlist_id: int) -> None:
        """删除播放列表。"""
        db.execute("DELETE FROM playlists WHERE id = ?", (playlist_id,))
        db.commit()

    def get_all_playlists(self) -> list[dict]:
        """获取所有播放列表（含歌曲数量）。"""
        sql = """
            SELECT p.*, COUNT(pi.id) as song_count
            FROM playlists p
            LEFT JOIN playlist_items pi ON p.id = pi.playlist_id
            GROUP BY p.id
            ORDER BY p.created_at DESC
        """
        rows = db.fetch_all(sql)
        return [dict(r) for r in rows]

    def get_playlist(self, playlist_id: int) -> Optional[dict]:
        """获取单个播放列表信息。"""
        row = db.fetch_one("SELECT * FROM playlists WHERE id = ?", (playlist_id,))
        return dict(row) if row else None

    def get_playlist_songs(self, playlist_id: int) -> list[dict]:
        """获取播放列表中的歌曲。"""
        sql = """
            SELECT s.* FROM songs s
            JOIN playlist_items pi ON s.id = pi.song_id
            WHERE pi.playlist_id = ?
            ORDER BY pi.position ASC
        """
        rows = db.fetch_all(sql, (playlist_id,))
        return [dict(r) for r in rows]

    def add_songs_to_playlist(self, playlist_id: int, song_ids: list[int]) -> int:
        """向播放列表添加歌曲。"""
        # 获取当前最大位置
        row = db.fetch_one(
            "SELECT MAX(position) as max_pos FROM playlist_items WHERE playlist_id = ?",
            (playlist_id,),
        )
        pos = (row["max_pos"] or 0)

        count = 0
        for sid in song_ids:
            try:
                pos += 1
                db.execute(
                    "INSERT OR IGNORE INTO playlist_items (playlist_id, song_id, position) VALUES (?, ?, ?)",
                    (playlist_id, sid, pos),
                )
                count += 1
            except Exception:
                pass
        db.commit()
        return count

    def remove_song_from_playlist(self, playlist_id: int, song_id: int) -> None:
        """从播放列表移除歌曲。"""
        db.execute(
            "DELETE FROM playlist_items WHERE playlist_id = ? AND song_id = ?",
            (playlist_id, song_id),
        )
        db.commit()

    # ── 收藏操作 ────────────────────────────────────────

    def toggle_favorite(self, song_id: int) -> bool:
        """切换收藏状态，返回是否已收藏。"""
        existing = db.fetch_one("SELECT * FROM favorites WHERE song_id = ?", (song_id,))
        if existing:
            db.execute("DELETE FROM favorites WHERE song_id = ?", (song_id,))
            db.commit()
            return False
        else:
            db.execute("INSERT INTO favorites (song_id) VALUES (?)", (song_id,))
            db.commit()
            return True

    def is_favorite(self, song_id: int) -> bool:
        row = db.fetch_one("SELECT * FROM favorites WHERE song_id = ?", (song_id,))
        return row is not None

    def get_favorites(self) -> list[dict]:
        sql = """
            SELECT s.* FROM songs s
            JOIN favorites f ON s.id = f.song_id
            ORDER BY f.added_at DESC
        """
        rows = db.fetch_all(sql)
        return [dict(r) for r in rows]

    # ── 播放历史操作 ────────────────────────────────────

    def add_history(self, song_id: int) -> None:
        db.execute("INSERT INTO play_history (song_id) VALUES (?)", (song_id,))
        db.commit()

    def get_history(self, limit: int = 50) -> list[dict]:
        sql = """
            SELECT DISTINCT s.*, h.played_at
            FROM songs s
            JOIN play_history h ON s.id = h.song_id
            ORDER BY h.played_at DESC
            LIMIT ?
        """
        rows = db.fetch_all(sql, (limit,))
        return [dict(r) for r in rows]

    # ── 统计信息 ────────────────────────────────────────

    def get_stats(self) -> dict:
        """获取音乐库统计信息。"""
        total = db.fetch_one("SELECT COUNT(*) as cnt FROM songs")
        total_duration = db.fetch_one("SELECT SUM(duration) as total FROM songs")
        sources = db.fetch_all(
            "SELECT source, COUNT(*) as cnt FROM songs GROUP BY source"
        )

        return {
            "total_songs": total["cnt"] if total else 0,
            "total_duration": total_duration["total"] if total_duration else 0,
            "by_source": {r["source"]: r["cnt"] for r in sources},
        }

    def close(self) -> None:
        """关闭数据库连接。"""
        db.close()
