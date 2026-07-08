use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub composer: String,
    pub duration: f64,
    pub source_kind: String,
    pub source_locator: String,
    pub resolver_id: Option<String>,
    pub availability: String,
    pub fingerprint: String,
    pub format: String,
    pub bitrate: i64,
    pub sample_rate: i64,
    pub channels: i64,
    pub artwork_ref: Option<String>,
    pub lyric_ref: Option<String>,
    pub has_overrides: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub song_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRoot {
    pub id: i64,
    pub path: String,
    pub added_at: String,
    pub last_scanned_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PlaybackSnapshot {
    pub current_track_id: Option<i64>,
    pub queue: Vec<i64>,
    pub current_index: i64,
    pub audio_state: String,
    pub volume: i64,
    pub muted: bool,
    pub mode: String,
    pub position_ms: i64,
    pub duration_ms: i64,
    pub lyrics_window_visible: bool,
}

impl Default for PlaybackSnapshot {
    fn default() -> Self {
        Self {
            current_track_id: None,
            queue: Vec::new(),
            current_index: -1,
            audio_state: "stopped".to_string(),
            volume: 80,
            muted: false,
            mode: "sequential".to_string(),
            position_ms: 0,
            duration_ms: 0,
            lyrics_window_visible: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLyricsSnapshot {
    pub title: String,
    pub artist: String,
    pub current_line: String,
    pub next_line: String,
    pub is_playing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryBootstrap {
    pub tracks: Vec<Track>,
    pub playlists: Vec<Playlist>,
    pub roots: Vec<LibraryRoot>,
    pub session: PlaybackSnapshot,
    pub desktop_lyrics_supported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackOverrideInput {
    pub track_id: i64,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub composer: Option<String>,
    pub duration: Option<f64>,
    pub artwork_ref: Option<String>,
    pub lyric_ref: Option<String>,
    pub lyric_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsData {
    pub source: String,
    pub plain_text: Option<String>,
    pub synced_text: Option<String>,
    pub language: String,
}

#[derive(Debug, Clone)]
pub struct ScannedTrack {
    pub source_kind: String,
    pub source_locator: String,
    pub resolver_id: Option<String>,
    pub availability: String,
    pub fingerprint: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub composer: String,
    pub duration: f64,
    pub format: String,
    pub bitrate: i64,
    pub sample_rate: i64,
    pub channels: i64,
    pub artwork_ref: Option<String>,
    pub lyric_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub added: i64,
    pub updated: i64,
    pub missing: i64,
    pub errors: Vec<String>,
}

pub struct AppDatabase {
    conn: Connection,
}

impl AppDatabase {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }

        let conn = Connection::open(path).map_err(|err| err.to_string())?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), String> {
        self.conn
            .execute_batch(
                r#"
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS library_roots (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  path TEXT NOT NULL UNIQUE,
                  added_at TEXT NOT NULL,
                  last_scanned_at TEXT
                );

                CREATE TABLE IF NOT EXISTS tracks (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  source_kind TEXT NOT NULL,
                  source_locator TEXT NOT NULL UNIQUE,
                  resolver_id TEXT,
                  availability TEXT NOT NULL DEFAULT 'available',
                  fingerprint TEXT NOT NULL DEFAULT '',
                  scan_title TEXT,
                  scan_artist TEXT,
                  scan_album TEXT,
                  scan_composer TEXT,
                  scan_duration REAL DEFAULT 0,
                  scan_format TEXT,
                  scan_bitrate INTEGER DEFAULT 0,
                  scan_sample_rate INTEGER DEFAULT 0,
                  scan_channels INTEGER DEFAULT 0,
                  scan_artwork_ref TEXT,
                  scan_lyric_ref TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_tracks_source_kind ON tracks(source_kind);
                CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(scan_title);

                CREATE TABLE IF NOT EXISTS track_overrides (
                  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
                  title TEXT,
                  artist TEXT,
                  album TEXT,
                  composer TEXT,
                  duration REAL,
                  artwork_ref TEXT,
                  lyric_ref TEXT,
                  lyric_text TEXT,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS playlists (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL UNIQUE,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS playlist_items (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                  position INTEGER NOT NULL,
                  UNIQUE(playlist_id, track_id)
                );

                CREATE TABLE IF NOT EXISTS lyrics_cache (
                  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
                  source TEXT NOT NULL,
                  plain_text TEXT,
                  synced_text TEXT,
                  language TEXT NOT NULL DEFAULT 'original',
                  fetched_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                "#,
            )
            .map_err(|err| err.to_string())
    }

    pub fn bootstrap(&self, desktop_lyrics_supported: bool) -> Result<LibraryBootstrap, String> {
        Ok(LibraryBootstrap {
            tracks: self.list_tracks()?,
            playlists: self.list_playlists()?,
            roots: self.list_roots()?,
            session: self
                .load_session::<PlaybackSnapshot>("playback_session")?
                .unwrap_or_default(),
            desktop_lyrics_supported,
        })
    }

    pub fn list_tracks(&self) -> Result<Vec<Track>, String> {
        let mut stmt = self
            .conn
            .prepare(
                r#"
                SELECT
                  t.id,
                  COALESCE(NULLIF(o.title, ''), NULLIF(t.scan_title, ''), t.source_locator) AS title,
                  COALESCE(NULLIF(o.artist, ''), NULLIF(t.scan_artist, ''), 'Unknown Artist') AS artist,
                  COALESCE(NULLIF(o.album, ''), NULLIF(t.scan_album, ''), 'Unknown Album') AS album,
                  COALESCE(NULLIF(o.composer, ''), NULLIF(t.scan_composer, ''), '') AS composer,
                  COALESCE(o.duration, t.scan_duration, 0) AS duration,
                  t.source_kind,
                  t.source_locator,
                  t.resolver_id,
                  t.availability,
                  t.fingerprint,
                  COALESCE(t.scan_format, '') AS format,
                  COALESCE(t.scan_bitrate, 0) AS bitrate,
                  COALESCE(t.scan_sample_rate, 0) AS sample_rate,
                  COALESCE(t.scan_channels, 0) AS channels,
                  COALESCE(o.artwork_ref, t.scan_artwork_ref) AS artwork_ref,
                  COALESCE(o.lyric_ref, t.scan_lyric_ref) AS lyric_ref,
                  CASE
                    WHEN o.title IS NOT NULL
                      OR o.artist IS NOT NULL
                      OR o.album IS NOT NULL
                      OR o.composer IS NOT NULL
                      OR o.duration IS NOT NULL
                      OR o.artwork_ref IS NOT NULL
                      OR o.lyric_ref IS NOT NULL
                      OR o.lyric_text IS NOT NULL
                    THEN 1 ELSE 0
                  END AS has_overrides,
                  t.created_at,
                  t.updated_at
                FROM tracks t
                LEFT JOIN track_overrides o ON o.track_id = t.id
                ORDER BY LOWER(COALESCE(NULLIF(o.artist, ''), NULLIF(t.scan_artist, ''), '')) ASC,
                         LOWER(COALESCE(NULLIF(o.album, ''), NULLIF(t.scan_album, ''), '')) ASC,
                         LOWER(COALESCE(NULLIF(o.title, ''), NULLIF(t.scan_title, ''), t.source_locator)) ASC
                "#,
            )
            .map_err(|err| err.to_string())?;

        let rows = stmt
            .query_map([], map_track)
            .map_err(|err| err.to_string())?;

        let mut tracks = Vec::new();
        for row in rows {
            tracks.push(row.map_err(|err| err.to_string())?);
        }

        Ok(tracks)
    }

    pub fn list_roots(&self) -> Result<Vec<LibraryRoot>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, path, added_at, last_scanned_at FROM library_roots ORDER BY added_at DESC")
            .map_err(|err| err.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(LibraryRoot {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    added_at: row.get(2)?,
                    last_scanned_at: row.get(3)?,
                })
            })
            .map_err(|err| err.to_string())?;

        let mut roots = Vec::new();
        for row in rows {
            roots.push(row.map_err(|err| err.to_string())?);
        }
        Ok(roots)
    }

    pub fn list_playlists(&self) -> Result<Vec<Playlist>, String> {
        let mut stmt = self
            .conn
            .prepare(
                r#"
                SELECT
                  p.id,
                  p.name,
                  COUNT(pi.id) AS song_count,
                  p.created_at,
                  p.updated_at
                FROM playlists p
                LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
                GROUP BY p.id
                ORDER BY LOWER(p.name) ASC
                "#,
            )
            .map_err(|err| err.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Playlist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    song_count: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .map_err(|err| err.to_string())?;

        let mut playlists = Vec::new();
        for row in rows {
            playlists.push(row.map_err(|err| err.to_string())?);
        }
        Ok(playlists)
    }

    pub fn playlist_tracks(&self, playlist_id: i64) -> Result<Vec<Track>, String> {
        let mut stmt = self
            .conn
            .prepare(
                r#"
                SELECT
                  t.id,
                  COALESCE(NULLIF(o.title, ''), NULLIF(t.scan_title, ''), t.source_locator) AS title,
                  COALESCE(NULLIF(o.artist, ''), NULLIF(t.scan_artist, ''), 'Unknown Artist') AS artist,
                  COALESCE(NULLIF(o.album, ''), NULLIF(t.scan_album, ''), 'Unknown Album') AS album,
                  COALESCE(NULLIF(o.composer, ''), NULLIF(t.scan_composer, ''), '') AS composer,
                  COALESCE(o.duration, t.scan_duration, 0) AS duration,
                  t.source_kind,
                  t.source_locator,
                  t.resolver_id,
                  t.availability,
                  t.fingerprint,
                  COALESCE(t.scan_format, '') AS format,
                  COALESCE(t.scan_bitrate, 0) AS bitrate,
                  COALESCE(t.scan_sample_rate, 0) AS sample_rate,
                  COALESCE(t.scan_channels, 0) AS channels,
                  COALESCE(o.artwork_ref, t.scan_artwork_ref) AS artwork_ref,
                  COALESCE(o.lyric_ref, t.scan_lyric_ref) AS lyric_ref,
                  CASE
                    WHEN o.title IS NOT NULL
                      OR o.artist IS NOT NULL
                      OR o.album IS NOT NULL
                      OR o.composer IS NOT NULL
                      OR o.duration IS NOT NULL
                      OR o.artwork_ref IS NOT NULL
                      OR o.lyric_ref IS NOT NULL
                      OR o.lyric_text IS NOT NULL
                    THEN 1 ELSE 0
                  END AS has_overrides,
                  t.created_at,
                  t.updated_at
                FROM playlist_items pi
                JOIN tracks t ON t.id = pi.track_id
                LEFT JOIN track_overrides o ON o.track_id = t.id
                WHERE pi.playlist_id = ?
                ORDER BY pi.position ASC
                "#,
            )
            .map_err(|err| err.to_string())?;

        let rows = stmt
            .query_map([playlist_id], map_track)
            .map_err(|err| err.to_string())?;

        let mut tracks = Vec::new();
        for row in rows {
            tracks.push(row.map_err(|err| err.to_string())?);
        }
        Ok(tracks)
    }

    pub fn upsert_root(&self, path: &str) -> Result<(), String> {
        let now = now_iso();
        self.conn
            .execute(
                r#"
                INSERT INTO library_roots (path, added_at, last_scanned_at)
                VALUES (?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET last_scanned_at = excluded.last_scanned_at
                "#,
                params![path, now, now],
            )
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn touch_root(&self, path: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE library_roots SET last_scanned_at = ? WHERE path = ?",
                params![now_iso(), path],
            )
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn upsert_scanned_track(&self, track: &ScannedTrack) -> Result<(i64, bool, bool), String> {
        let existing_id = self
            .conn
            .query_row(
                "SELECT id FROM tracks WHERE source_locator = ?",
                [track.source_locator.as_str()],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|err| err.to_string())?;

        let now = now_iso();
        if let Some(id) = existing_id {
            self.conn
                .execute(
                    r#"
                    UPDATE tracks SET
                      source_kind = ?,
                      resolver_id = ?,
                      availability = ?,
                      fingerprint = ?,
                      scan_title = ?,
                      scan_artist = ?,
                      scan_album = ?,
                      scan_composer = ?,
                      scan_duration = ?,
                      scan_format = ?,
                      scan_bitrate = ?,
                      scan_sample_rate = ?,
                      scan_channels = ?,
                      scan_artwork_ref = ?,
                      scan_lyric_ref = ?,
                      updated_at = ?
                    WHERE id = ?
                    "#,
                    params![
                        track.source_kind,
                        track.resolver_id,
                        track.availability,
                        track.fingerprint,
                        track.title,
                        track.artist,
                        track.album,
                        track.composer,
                        track.duration,
                        track.format,
                        track.bitrate,
                        track.sample_rate,
                        track.channels,
                        track.artwork_ref,
                        track.lyric_ref,
                        now,
                        id
                    ],
                )
                .map_err(|err| err.to_string())?;
            Ok((id, false, true))
        } else {
            self.conn
                .execute(
                    r#"
                    INSERT INTO tracks (
                      source_kind, source_locator, resolver_id, availability, fingerprint,
                      scan_title, scan_artist, scan_album, scan_composer, scan_duration,
                      scan_format, scan_bitrate, scan_sample_rate, scan_channels,
                      scan_artwork_ref, scan_lyric_ref, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    "#,
                    params![
                        track.source_kind,
                        track.source_locator,
                        track.resolver_id,
                        track.availability,
                        track.fingerprint,
                        track.title,
                        track.artist,
                        track.album,
                        track.composer,
                        track.duration,
                        track.format,
                        track.bitrate,
                        track.sample_rate,
                        track.channels,
                        track.artwork_ref,
                        track.lyric_ref,
                        now,
                        now
                    ],
                )
                .map_err(|err| err.to_string())?;
            Ok((self.conn.last_insert_rowid(), true, false))
        }
    }

    pub fn mark_local_tracks_missing(&self) -> Result<i64, String> {
        self.conn
            .execute(
                "UPDATE tracks SET availability = 'missing', updated_at = ? WHERE source_kind = 'local_file'",
                [now_iso()],
            )
            .map(|count| count as i64)
            .map_err(|err| err.to_string())
    }

    pub fn remove_track(&self, track_id: i64) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM tracks WHERE id = ?", [track_id])
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn create_playlist(&self, name: &str) -> Result<Playlist, String> {
        let now = now_iso();
        self.conn
            .execute(
                "INSERT INTO playlists (name, created_at, updated_at) VALUES (?, ?, ?)",
                params![name, now, now],
            )
            .map_err(|err| err.to_string())?;
        let id = self.conn.last_insert_rowid();
        self.playlist_by_id(id)
    }

    pub fn rename_playlist(&self, playlist_id: i64, name: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?",
                params![name, now_iso(), playlist_id],
            )
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn delete_playlist(&self, playlist_id: i64) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM playlists WHERE id = ?", [playlist_id])
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn add_tracks_to_playlist(&self, playlist_id: i64, track_ids: &[i64]) -> Result<(), String> {
        let mut next_position = self
            .conn
            .query_row(
                "SELECT COALESCE(MAX(position), 0) FROM playlist_items WHERE playlist_id = ?",
                [playlist_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|err| err.to_string())?;

        for track_id in track_ids {
            next_position += 1;
            self.conn
                .execute(
                    "INSERT OR IGNORE INTO playlist_items (playlist_id, track_id, position) VALUES (?, ?, ?)",
                    params![playlist_id, track_id, next_position],
                )
                .map_err(|err| err.to_string())?;
        }

        self.conn
            .execute(
                "UPDATE playlists SET updated_at = ? WHERE id = ?",
                params![now_iso(), playlist_id],
            )
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn remove_tracks_from_playlist(&self, playlist_id: i64, track_ids: &[i64]) -> Result<(), String> {
        for track_id in track_ids {
            self.conn
                .execute(
                    "DELETE FROM playlist_items WHERE playlist_id = ? AND track_id = ?",
                    params![playlist_id, track_id],
                )
                .map_err(|err| err.to_string())?;
        }

        self.conn
            .execute(
                "UPDATE playlists SET updated_at = ? WHERE id = ?",
                params![now_iso(), playlist_id],
            )
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn get_track(&self, track_id: i64) -> Result<Track, String> {
        let mut stmt = self
            .conn
            .prepare(
                r#"
                SELECT
                  t.id,
                  COALESCE(NULLIF(o.title, ''), NULLIF(t.scan_title, ''), t.source_locator) AS title,
                  COALESCE(NULLIF(o.artist, ''), NULLIF(t.scan_artist, ''), 'Unknown Artist') AS artist,
                  COALESCE(NULLIF(o.album, ''), NULLIF(t.scan_album, ''), 'Unknown Album') AS album,
                  COALESCE(NULLIF(o.composer, ''), NULLIF(t.scan_composer, ''), '') AS composer,
                  COALESCE(o.duration, t.scan_duration, 0) AS duration,
                  t.source_kind,
                  t.source_locator,
                  t.resolver_id,
                  t.availability,
                  t.fingerprint,
                  COALESCE(t.scan_format, '') AS format,
                  COALESCE(t.scan_bitrate, 0) AS bitrate,
                  COALESCE(t.scan_sample_rate, 0) AS sample_rate,
                  COALESCE(t.scan_channels, 0) AS channels,
                  COALESCE(o.artwork_ref, t.scan_artwork_ref) AS artwork_ref,
                  COALESCE(o.lyric_ref, t.scan_lyric_ref) AS lyric_ref,
                  CASE
                    WHEN o.title IS NOT NULL
                      OR o.artist IS NOT NULL
                      OR o.album IS NOT NULL
                      OR o.composer IS NOT NULL
                      OR o.duration IS NOT NULL
                      OR o.artwork_ref IS NOT NULL
                      OR o.lyric_ref IS NOT NULL
                      OR o.lyric_text IS NOT NULL
                    THEN 1 ELSE 0
                  END AS has_overrides,
                  t.created_at,
                  t.updated_at
                FROM tracks t
                LEFT JOIN track_overrides o ON o.track_id = t.id
                WHERE t.id = ?
                "#,
            )
            .map_err(|err| err.to_string())?;

        stmt.query_row([track_id], map_track)
            .map_err(|err| err.to_string())
    }

    pub fn get_track_override(&self, track_id: i64) -> Result<Option<TrackOverrideInput>, String> {
        self.conn
            .query_row(
                r#"
                SELECT track_id, title, artist, album, composer, duration, artwork_ref, lyric_ref, lyric_text
                FROM track_overrides
                WHERE track_id = ?
                "#,
                [track_id],
                |row| {
                    Ok(TrackOverrideInput {
                        track_id: row.get(0)?,
                        title: row.get(1)?,
                        artist: row.get(2)?,
                        album: row.get(3)?,
                        composer: row.get(4)?,
                        duration: row.get(5)?,
                        artwork_ref: row.get(6)?,
                        lyric_ref: row.get(7)?,
                        lyric_text: row.get(8)?,
                    })
                },
            )
            .optional()
            .map_err(|err| err.to_string())
    }

    pub fn save_track_override(&self, input: &TrackOverrideInput) -> Result<(), String> {
        self.conn
            .execute(
                r#"
                INSERT INTO track_overrides (
                  track_id, title, artist, album, composer, duration, artwork_ref, lyric_ref, lyric_text, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(track_id) DO UPDATE SET
                  title = excluded.title,
                  artist = excluded.artist,
                  album = excluded.album,
                  composer = excluded.composer,
                  duration = excluded.duration,
                  artwork_ref = excluded.artwork_ref,
                  lyric_ref = excluded.lyric_ref,
                  lyric_text = excluded.lyric_text,
                  updated_at = excluded.updated_at
                "#,
                params![
                    input.track_id,
                    null_if_empty(input.title.clone()),
                    null_if_empty(input.artist.clone()),
                    null_if_empty(input.album.clone()),
                    null_if_empty(input.composer.clone()),
                    input.duration,
                    null_if_empty(input.artwork_ref.clone()),
                    null_if_empty(input.lyric_ref.clone()),
                    null_if_empty(input.lyric_text.clone()),
                    now_iso()
                ],
            )
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn save_lyrics_cache(&self, track_id: i64, data: &LyricsData) -> Result<(), String> {
        self.conn
            .execute(
                r#"
                INSERT INTO lyrics_cache (track_id, source, plain_text, synced_text, language, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(track_id) DO UPDATE SET
                  source = excluded.source,
                  plain_text = excluded.plain_text,
                  synced_text = excluded.synced_text,
                  language = excluded.language,
                  fetched_at = excluded.fetched_at
                "#,
                params![
                    track_id,
                    data.source,
                    data.plain_text,
                    data.synced_text,
                    data.language,
                    now_iso()
                ],
            )
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn cached_lyrics(&self, track_id: i64) -> Result<Option<LyricsData>, String> {
        self.conn
            .query_row(
                "SELECT source, plain_text, synced_text, language FROM lyrics_cache WHERE track_id = ?",
                [track_id],
                |row| {
                    Ok(LyricsData {
                        source: row.get(0)?,
                        plain_text: row.get(1)?,
                        synced_text: row.get(2)?,
                        language: row.get(3)?,
                    })
                },
            )
            .optional()
            .map_err(|err| err.to_string())
    }

    pub fn save_session<T: Serialize>(&self, key: &str, value: &T) -> Result<(), String> {
        let payload = serde_json::to_string(value).map_err(|err| err.to_string())?;
        self.conn
            .execute(
                r#"
                INSERT INTO sessions (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                "#,
                params![key, payload, now_iso()],
            )
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn load_session<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>, String> {
        let raw = self
            .conn
            .query_row("SELECT value FROM sessions WHERE key = ?", [key], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(|err| err.to_string())?;

        match raw {
            Some(payload) => serde_json::from_str::<T>(&payload)
                .map(Some)
                .map_err(|err| err.to_string()),
            None => Ok(None),
        }
    }

    pub fn database_path(app_data_dir: &Path) -> PathBuf {
        app_data_dir.join("also-music-player.sqlite3")
    }

    fn playlist_by_id(&self, playlist_id: i64) -> Result<Playlist, String> {
        self.conn
            .query_row(
                r#"
                SELECT
                  p.id,
                  p.name,
                  COUNT(pi.id) AS song_count,
                  p.created_at,
                  p.updated_at
                FROM playlists p
                LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
                WHERE p.id = ?
                GROUP BY p.id
                "#,
                [playlist_id],
                |row| {
                    Ok(Playlist {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        song_count: row.get(2)?,
                        created_at: row.get(3)?,
                        updated_at: row.get(4)?,
                    })
                },
            )
            .map_err(|err| err.to_string())
    }
}

fn map_track(row: &Row<'_>) -> rusqlite::Result<Track> {
    Ok(Track {
        id: row.get(0)?,
        title: row.get(1)?,
        artist: row.get(2)?,
        album: row.get(3)?,
        composer: row.get(4)?,
        duration: row.get(5)?,
        source_kind: row.get(6)?,
        source_locator: row.get(7)?,
        resolver_id: row.get(8)?,
        availability: row.get(9)?,
        fingerprint: row.get(10)?,
        format: row.get(11)?,
        bitrate: row.get(12)?,
        sample_rate: row.get(13)?,
        channels: row.get(14)?,
        artwork_ref: row.get(15)?,
        lyric_ref: row.get(16)?,
        has_overrides: row.get::<_, i64>(17)? > 0,
        created_at: row.get(18)?,
        updated_at: row.get(19)?,
    })
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn null_if_empty(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}
