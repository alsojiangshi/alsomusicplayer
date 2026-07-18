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
    pub desktop_lyrics_locked: bool,
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
            desktop_lyrics_locked: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct UiSettings {
    pub language_preference: String,
    pub resolved_language: String,
    pub auto_lyrics_scope: String,
    pub auto_lyrics_playlist_ids: Vec<i64>,
    pub online_sources: Vec<OnlineSourceSetting>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct OnlineSourceSetting {
    pub id: String,
    pub label: String,
    pub resource_type: String,
    pub provider_type: String,
    pub base_url: String,
    pub enabled: bool,
    pub priority: i64,
}

impl Default for OnlineSourceSetting {
    fn default() -> Self {
        Self {
            id: String::new(),
            label: String::new(),
            resource_type: "lyrics".to_string(),
            provider_type: "lrclib".to_string(),
            base_url: String::new(),
            enabled: true,
            priority: 100,
        }
    }
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            language_preference: "system".to_string(),
            resolved_language: "en-US".to_string(),
            auto_lyrics_scope: "off".to_string(),
            auto_lyrics_playlist_ids: Vec::new(),
            online_sources: vec![
                OnlineSourceSetting {
                    id: "lrclib-default".to_string(),
                    label: "LRCLIB".to_string(),
                    resource_type: "lyrics".to_string(),
                    provider_type: "lrclib".to_string(),
                    base_url: "https://lrclib.net/api".to_string(),
                    enabled: true,
                    priority: 10,
                },
                OnlineSourceSetting {
                    id: "netease-lyrics-default".to_string(),
                    label: "NetEase Lyrics".to_string(),
                    resource_type: "lyrics".to_string(),
                    provider_type: "netease".to_string(),
                    base_url: "https://music.163.com".to_string(),
                    enabled: false,
                    priority: 20,
                },
                OnlineSourceSetting {
                    id: "netease-music-default".to_string(),
                    label: "NetEase Music".to_string(),
                    resource_type: "music".to_string(),
                    provider_type: "netease".to_string(),
                    base_url: "https://music.163.com".to_string(),
                    enabled: true,
                    priority: 10,
                },
            ],
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
    pub ui_settings: UiSettings,
    pub startup: StartupDiagnostics,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StartupDiagnostics {
    pub storage_mode: String,
    pub app_data_dir: String,
    pub database_path: String,
    pub portable_root: Option<String>,
    pub portable_marker_path: Option<String>,
    pub recovered_session_keys: Vec<String>,
    pub warnings: Vec<String>,
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

    pub fn bootstrap(
        &self,
        desktop_lyrics_supported: bool,
        initial_startup: &StartupDiagnostics,
    ) -> Result<LibraryBootstrap, String> {
        let playback_session =
            self.load_session_resilient::<PlaybackSnapshot>("playback_session")?;
        let ui_settings = self.load_session_resilient::<UiSettings>("ui_settings")?;
        let mut startup = initial_startup.clone();

        if playback_session.recovered {
            startup
                .recovered_session_keys
                .push("playback_session".to_string());
        }
        if ui_settings.recovered {
            startup
                .recovered_session_keys
                .push("ui_settings".to_string());
        }

        startup.recovered_session_keys.sort();
        startup.recovered_session_keys.dedup();
        let recovery_warnings = startup
            .recovered_session_keys
            .iter()
            .map(|key| format!("Reset invalid startup session data for {key}."))
            .collect::<Vec<_>>();
        for warning in recovery_warnings {
            if !startup.warnings.contains(&warning) {
                startup.warnings.push(warning);
            }
        }

        Ok(LibraryBootstrap {
            tracks: self.list_tracks()?,
            playlists: self.list_playlists()?,
            roots: self.list_roots()?,
            session: playback_session.value.unwrap_or_default(),
            desktop_lyrics_supported,
            ui_settings: ui_settings.value.unwrap_or_default(),
            startup,
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

    pub fn update_track_fingerprint(&self, track_id: i64, fingerprint: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE tracks SET fingerprint = ?, updated_at = ? WHERE id = ?",
                params![fingerprint, now_iso(), track_id],
            )
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

    pub fn add_tracks_to_playlist(
        &self,
        playlist_id: i64,
        track_ids: &[i64],
    ) -> Result<(), String> {
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

    pub fn remove_tracks_from_playlist(
        &self,
        playlist_id: i64,
        track_ids: &[i64],
    ) -> Result<(), String> {
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

    pub fn load_session_resilient<T: DeserializeOwned>(
        &self,
        key: &str,
    ) -> Result<SessionLoadResult<T>, String> {
        let raw = self
            .conn
            .query_row("SELECT value FROM sessions WHERE key = ?", [key], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(|err| err.to_string())?;

        match raw {
            Some(payload) => match serde_json::from_str::<T>(&payload) {
                Ok(value) => Ok(SessionLoadResult {
                    value: Some(value),
                    recovered: false,
                }),
                Err(err) => {
                    eprintln!("reset invalid session '{key}': {err}");
                    self.delete_session(key)?;
                    Ok(SessionLoadResult {
                        value: None,
                        recovered: true,
                    })
                }
            },
            None => Ok(SessionLoadResult {
                value: None,
                recovered: false,
            }),
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

    fn delete_session(&self, key: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM sessions WHERE key = ?", [key])
            .map_err(|err| err.to_string())?;
        Ok(())
    }
}

pub struct SessionLoadResult<T> {
    pub value: Option<T>,
    pub recovered: bool,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        env,
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_database_path() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let sequence = COUNTER.fetch_add(1, Ordering::Relaxed);
        env::temp_dir().join(format!(
            "also-music-player-test-{timestamp}-{sequence}.sqlite3"
        ))
    }

    #[test]
    fn load_session_resilient_resets_invalid_payloads() {
        let path = temp_database_path();
        let db = AppDatabase::open(&path).expect("open temporary database");

        db.conn
            .execute(
                "INSERT INTO sessions (key, value, updated_at) VALUES (?, ?, ?)",
                params!["playback_session", "{invalid", now_iso()],
            )
            .expect("insert invalid session");

        let result = db
            .load_session_resilient::<PlaybackSnapshot>("playback_session")
            .expect("recover invalid session");

        assert!(result.recovered);
        assert!(result.value.is_none());

        let remaining: Option<String> = db
            .conn
            .query_row(
                "SELECT value FROM sessions WHERE key = ?",
                ["playback_session"],
                |row| row.get(0),
            )
            .optional()
            .expect("query session after recovery");

        assert!(remaining.is_none());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn bootstrap_reports_recovered_startup_sessions() {
        let path = temp_database_path();
        let db = AppDatabase::open(&path).expect("open temporary database");

        db.conn
            .execute(
                "INSERT INTO sessions (key, value, updated_at) VALUES (?, ?, ?)",
                params!["ui_settings", "{\"broken\":", now_iso()],
            )
            .expect("insert invalid ui settings");

        let bootstrap = db
            .bootstrap(
                true,
                &StartupDiagnostics {
                    storage_mode: "system".to_string(),
                    app_data_dir: "C:/AppData/AlsoMusicPlayer".to_string(),
                    database_path: path.to_string_lossy().to_string(),
                    portable_root: None,
                    portable_marker_path: None,
                    recovered_session_keys: Vec::new(),
                    warnings: Vec::new(),
                },
            )
            .expect("bootstrap with recovery");

        assert_eq!(
            bootstrap.ui_settings.language_preference,
            UiSettings::default().language_preference
        );
        assert_eq!(
            bootstrap.ui_settings.resolved_language,
            UiSettings::default().resolved_language
        );
        assert_eq!(
            bootstrap.startup.recovered_session_keys,
            vec!["ui_settings".to_string()]
        );
        assert_eq!(
            bootstrap.startup.database_path,
            path.to_string_lossy().to_string()
        );
        assert_eq!(bootstrap.startup.storage_mode, "system".to_string());

        let _ = std::fs::remove_file(path);
    }
}
