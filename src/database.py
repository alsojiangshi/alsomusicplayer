"""数据库管理模块。

使用 SQLite 作为嵌入式数据库，管理歌曲、播放列表、歌词缓存等数据。
"""

import sqlite3
import threading
from pathlib import Path
from typing import Optional

from .config import config


SCHEMA_SQL = """
-- 歌曲主表
CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT DEFAULT 'Unknown Artist',
    album TEXT DEFAULT 'Unknown Album',
    duration REAL DEFAULT 0,
    file_path TEXT NOT NULL UNIQUE,
    file_hash TEXT,
    format TEXT,
    bitrate INTEGER,
    sample_rate INTEGER,
    channels INTEGER DEFAULT 2,
    file_size INTEGER,
    cover_art BLOB,
    source TEXT DEFAULT 'local',
    source_config TEXT,
    date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album);
CREATE INDEX IF NOT EXISTS idx_songs_source ON songs(source);

-- 播放列表
CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 播放列表-歌曲关联
CREATE TABLE IF NOT EXISTS playlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    UNIQUE(playlist_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id);

-- 歌词缓存
CREATE TABLE IF NOT EXISTS lyrics_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE,
    plain_text TEXT,
    synced_text TEXT,
    source TEXT,
    language TEXT DEFAULT 'original',
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 收藏
CREATE TABLE IF NOT EXISTS favorites (
    song_id INTEGER PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 播放历史
CREATE TABLE IF NOT EXISTS play_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER REFERENCES songs(id) ON DELETE SET NULL,
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_play_history_time ON play_history(played_at DESC);

-- 设置
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- FTS 全文搜索
CREATE VIRTUAL TABLE IF NOT EXISTS songs_fts USING fts5(
    title, artist, album, content='songs', content_rowid='id'
);

-- FTS 同步触发器
CREATE TRIGGER IF NOT EXISTS songs_ai AFTER INSERT ON songs BEGIN
    INSERT INTO songs_fts(rowid, title, artist, album)
    VALUES (new.id, new.title, new.artist, new.album);
END;

CREATE TRIGGER IF NOT EXISTS songs_ad AFTER DELETE ON songs BEGIN
    INSERT INTO songs_fts(songs_fts, rowid, title, artist, album)
    VALUES ('delete', old.id, old.title, old.artist, old.album);
END;

CREATE TRIGGER IF NOT EXISTS songs_au AFTER UPDATE ON songs BEGIN
    INSERT INTO songs_fts(songs_fts, rowid, title, artist, album)
    VALUES ('delete', old.id, old.title, old.artist, old.album);
    INSERT INTO songs_fts(rowid, title, artist, album)
    VALUES (new.id, new.title, new.artist, new.album);
END;
"""


class Database:
    """数据库连接管理器（线程安全）。"""

    def __init__(self, db_path: Optional[str] = None) -> None:
        self._db_path = db_path or config.db_path
        self._local = threading.local()

    @property
    def _conn(self) -> sqlite3.Connection:
        """获取当前线程的数据库连接。"""
        if not hasattr(self._local, "conn") or self._local.conn is None:
            self._local.conn = sqlite3.connect(self._db_path)
            self._local.conn.execute("PRAGMA journal_mode=WAL")
            self._local.conn.execute("PRAGMA foreign_keys=ON")
            self._local.conn.row_factory = sqlite3.Row
        return self._local.conn

    def initialize(self) -> None:
        """初始化数据库表结构。"""
        # 确保数据目录存在
        Path(self._db_path).parent.mkdir(parents=True, exist_ok=True)
        conn = self._conn
        conn.executescript(SCHEMA_SQL)
        conn.commit()

    def execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        """执行 SQL 语句。"""
        return self._conn.execute(sql, params)

    def executemany(self, sql: str, params_list: list) -> sqlite3.Cursor:
        """批量执行 SQL 语句。"""
        return self._conn.executemany(sql, params_list)

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def fetch_one(self, sql: str, params: tuple = ()) -> Optional[sqlite3.Row]:
        """查询单条记录。"""
        cursor = self.execute(sql, params)
        return cursor.fetchone()

    def fetch_all(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        """查询多条记录。"""
        cursor = self.execute(sql, params)
        return cursor.fetchall()

    def insert(self, sql: str, params: tuple = ()) -> int:
        """插入记录并返回自增 ID。"""
        cursor = self.execute(sql, params)
        self.commit()
        return cursor.lastrowid

    def close(self) -> None:
        """关闭当前线程的数据库连接。"""
        if hasattr(self._local, "conn") and self._local.conn is not None:
            self._local.conn.close()
            self._local.conn = None


# 全局数据库实例
db = Database()
