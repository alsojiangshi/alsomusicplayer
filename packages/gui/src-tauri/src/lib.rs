mod db;

use db::{
    AppDatabase, DesktopLyricsSnapshot, LibraryBootstrap, LyricsData, PlaybackSnapshot, Playlist,
    ScanSummary, ScannedTrack, Track, TrackOverrideInput, UiSettings,
};
use lofty::{
    file::{AudioFile, TaggedFileExt},
    probe::Probe,
    tag::{Accessor, ItemKey},
};
use regex::Regex;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{hash_map::DefaultHasher, HashSet},
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::UNIX_EPOCH,
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use walkdir::WalkDir;

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "oga", "m4a", "mp4", "aac", "opus", "wma", "aiff", "aif",
];

struct AppState {
    app_data_dir: PathBuf,
    db: Mutex<AppDatabase>,
    desktop_snapshot: Mutex<DesktopLyricsSnapshot>,
    playback_snapshot: Mutex<PlaybackSnapshot>,
    ui_settings: Mutex<UiSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgressEvent {
    current: usize,
    total: usize,
    path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DirectUrlInput {
    url: String,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    composer: Option<String>,
    duration: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolverSearchResult {
    id: String,
    resolver_id: String,
    title: String,
    artist: String,
    album: String,
    duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolverTrackInput {
    id: String,
    title: String,
    artist: String,
    album: String,
    duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutSettings {
    toggle_play_pause: String,
    next_track: String,
    previous_track: String,
    toggle_desktop_lyrics: String,
}

impl Default for ShortcutSettings {
    fn default() -> Self {
        Self {
            toggle_play_pause: "Space".to_string(),
            next_track: "Ctrl+Right".to_string(),
            previous_track: "Ctrl+Left".to_string(),
            toggle_desktop_lyrics: "Ctrl+L".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutCapabilities {
    global_supported: bool,
    desktop_supported: bool,
}

struct TrayLabels {
    show: String,
    toggle: String,
    next: String,
    previous: String,
    lyrics: String,
    quit: String,
}

#[tauri::command]
fn library_bootstrap(state: tauri::State<'_, AppState>) -> Result<LibraryBootstrap, String> {
    let db = state.db.lock().map_err(|err| err.to_string())?;
    db.bootstrap(desktop_lyrics_supported())
}

#[tauri::command]
fn library_pick_folders() -> Vec<String> {
    rfd::FileDialog::new()
        .pick_folders()
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

#[tauri::command]
fn library_pick_files() -> Vec<String> {
    rfd::FileDialog::new()
        .add_filter(
            "Audio",
            &["mp3", "flac", "wav", "ogg", "m4a", "aac", "opus", "wma"],
        )
        .pick_files()
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

#[tauri::command]
fn library_scan_paths(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    paths: Vec<String>,
    remember_root: bool,
) -> Result<ScanSummary, String> {
    let summary = scan_paths(&app, &state, &paths, remember_root)?;
    app.emit("library:changed", ())
        .map_err(|err| err.to_string())?;
    Ok(summary)
}

#[tauri::command]
fn library_refresh(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ScanSummary, String> {
    let roots = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.list_roots()?
    };

    let paths = roots.into_iter().map(|root| root.path).collect::<Vec<_>>();
    let summary = scan_paths(&app, &state, &paths, true)?;
    app.emit("library:changed", ())
        .map_err(|err| err.to_string())?;
    Ok(summary)
}

#[tauri::command]
fn library_remove_track(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    track_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|err| err.to_string())?;
    db.remove_track(track_id)?;
    app.emit("library:changed", ())
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
fn library_reveal_track(state: tauri::State<'_, AppState>, track_id: i64) -> Result<(), String> {
    let track = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.get_track(track_id)?
    };

    reveal_in_folder(&track.source_kind, &track.source_locator)
}

#[tauri::command]
fn library_add_direct_url(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    input: DirectUrlInput,
) -> Result<Track, String> {
    let locator = input.url.trim().to_string();
    if locator.is_empty() {
        return Err("URL is required".to_string());
    }

    let scanned = ScannedTrack {
        source_kind: "direct_url".to_string(),
        source_locator: locator.clone(),
        resolver_id: None,
        availability: "available".to_string(),
        fingerprint: locator.clone(),
        title: input.title.unwrap_or_else(|| fallback_title(&locator)),
        artist: input.artist.unwrap_or_else(|| "Remote Source".to_string()),
        album: input.album.unwrap_or_else(|| "Direct URL".to_string()),
        composer: input.composer.unwrap_or_default(),
        duration: input.duration.unwrap_or_default(),
        format: detect_format(&locator),
        bitrate: 0,
        sample_rate: 0,
        channels: 0,
        artwork_ref: None,
        lyric_ref: None,
    };

    let track = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        let (track_id, _, _) = db.upsert_scanned_track(&scanned)?;
        db.get_track(track_id)?
    };

    app.emit("library:changed", ())
        .map_err(|err| err.to_string())?;
    Ok(track)
}

#[tauri::command]
async fn resolver_search_netease(query: String) -> Result<Vec<ResolverSearchResult>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let mut url =
        Url::parse("https://music.163.com/api/search/get").map_err(|err| err.to_string())?;
    url.query_pairs_mut()
        .append_pair("type", "1")
        .append_pair("limit", "20")
        .append_pair("offset", "0")
        .append_pair("s", query);

    let payload = reqwest::Client::new()
        .get(url)
        .header("User-Agent", "Mozilla/5.0")
        .header("Referer", "https://music.163.com/")
        .send()
        .await
        .map_err(|err| err.to_string())?
        .json::<Value>()
        .await
        .map_err(|err| err.to_string())?;

    let songs = payload
        .get("result")
        .and_then(|result| result.get("songs"))
        .and_then(|songs| songs.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(songs
        .into_iter()
        .map(|item| ResolverSearchResult {
            id: item
                .get("id")
                .and_then(|value| value.as_i64())
                .unwrap_or_default()
                .to_string(),
            resolver_id: "netease".to_string(),
            title: item
                .get("name")
                .and_then(|value| value.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            artist: item
                .get("artists")
                .and_then(|value| value.as_array())
                .and_then(|artists| artists.first())
                .and_then(|artist| artist.get("name"))
                .and_then(|value| value.as_str())
                .unwrap_or("Unknown Artist")
                .to_string(),
            album: item
                .get("album")
                .and_then(|value| value.get("name"))
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string(),
            duration: item
                .get("duration")
                .and_then(|value| value.as_f64())
                .unwrap_or_default()
                / 1000.0,
        })
        .collect())
}

#[tauri::command]
fn resolver_add_track(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    input: ResolverTrackInput,
) -> Result<Track, String> {
    let scanned = ScannedTrack {
        source_kind: "resolver".to_string(),
        source_locator: format!("netease:{}", input.id),
        resolver_id: Some("netease".to_string()),
        availability: "unresolved".to_string(),
        fingerprint: format!("netease:{}", input.id),
        title: input.title,
        artist: input.artist,
        album: input.album,
        composer: String::new(),
        duration: input.duration,
        format: "MP3".to_string(),
        bitrate: 0,
        sample_rate: 0,
        channels: 0,
        artwork_ref: None,
        lyric_ref: None,
    };

    let track = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        let (track_id, _, _) = db.upsert_scanned_track(&scanned)?;
        db.get_track(track_id)?
    };

    app.emit("library:changed", ())
        .map_err(|err| err.to_string())?;
    Ok(track)
}

#[tauri::command]
fn resolve_playback_source(
    state: tauri::State<'_, AppState>,
    track_id: i64,
) -> Result<String, String> {
    let track = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.get_track(track_id)?
    };

    match track.source_kind.as_str() {
        "local_file" | "direct_url" => Ok(track.source_locator),
        "resolver" => {
            if track.resolver_id.as_deref() == Some("netease") {
                let song_id = track
                    .source_locator
                    .split(':')
                    .nth(1)
                    .ok_or_else(|| "Invalid resolver locator".to_string())?;
                Ok(format!(
                    "https://music.163.com/song/media/outer/url?id={song_id}.mp3"
                ))
            } else {
                Err("Unsupported resolver".to_string())
            }
        }
        _ => Err("Unsupported source kind".to_string()),
    }
}

#[tauri::command]
fn playlist_create(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    name: String,
) -> Result<Playlist, String> {
    let playlist = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.create_playlist(name.trim())?
    };
    app.emit("library:changed", ())
        .map_err(|err| err.to_string())?;
    Ok(playlist)
}

#[tauri::command]
fn playlist_rename(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    playlist_id: i64,
    name: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|err| err.to_string())?;
    db.rename_playlist(playlist_id, name.trim())?;
    app.emit("library:changed", ())
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
fn playlist_delete(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    playlist_id: i64,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|err| err.to_string())?;
    db.delete_playlist(playlist_id)?;
    app.emit("library:changed", ())
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
fn playlist_tracks(
    state: tauri::State<'_, AppState>,
    playlist_id: i64,
) -> Result<Vec<Track>, String> {
    let db = state.db.lock().map_err(|err| err.to_string())?;
    db.playlist_tracks(playlist_id)
}

#[tauri::command]
fn playlist_add_tracks(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    playlist_id: i64,
    track_ids: Vec<i64>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|err| err.to_string())?;
    db.add_tracks_to_playlist(playlist_id, &track_ids)?;
    app.emit("library:changed", ())
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
fn playlist_remove_tracks(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    playlist_id: i64,
    track_ids: Vec<i64>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|err| err.to_string())?;
    db.remove_tracks_from_playlist(playlist_id, &track_ids)?;
    app.emit("library:changed", ())
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
fn track_override_get(
    state: tauri::State<'_, AppState>,
    track_id: i64,
) -> Result<Option<TrackOverrideInput>, String> {
    let db = state.db.lock().map_err(|err| err.to_string())?;
    db.get_track_override(track_id)
}

#[tauri::command]
fn track_override_save(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    input: TrackOverrideInput,
) -> Result<Track, String> {
    let track = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.save_track_override(&input)?;
        db.get_track(input.track_id)?
    };
    app.emit("library:changed", ())
        .map_err(|err| err.to_string())?;
    Ok(track)
}

#[tauri::command]
fn lyrics_get(
    state: tauri::State<'_, AppState>,
    track_id: i64,
) -> Result<Option<LyricsData>, String> {
    let track = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        let override_data = db.get_track_override(track_id)?;
        if let Some(override_data) = override_data {
            if let Some(text) = override_data.lyric_text {
                return Ok(Some(lyrics_from_text("override", text)));
            }
            if let Some(path) = override_data.lyric_ref {
                if let Ok(content) = fs::read_to_string(path) {
                    return Ok(Some(lyrics_from_text("override_file", content)));
                }
            }
        }

        db.get_track(track_id)?
    };

    if let Some(data) = read_local_lyrics(&track) {
        return Ok(Some(data));
    }

    let db = state.db.lock().map_err(|err| err.to_string())?;
    db.cached_lyrics(track_id)
}

#[tauri::command]
async fn lyrics_search_online(
    state: tauri::State<'_, AppState>,
    track_id: i64,
) -> Result<Option<LyricsData>, String> {
    let track = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.get_track(track_id)?
    };

    let mut url = Url::parse("https://lrclib.net/api/search").map_err(|err| err.to_string())?;
    url.query_pairs_mut()
        .append_pair("track_name", &track.title)
        .append_pair("artist_name", &track.artist)
        .append_pair("album_name", &track.album);

    let result = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|err| err.to_string())?
        .json::<Value>()
        .await
        .map_err(|err| err.to_string())?;

    let first = result.as_array().and_then(|rows| rows.first()).cloned();
    let Some(item) = first else {
        return Ok(None);
    };

    let data = LyricsData {
        source: "lrclib".to_string(),
        plain_text: item
            .get("plainLyrics")
            .and_then(|value| value.as_str())
            .map(ToString::to_string),
        synced_text: item
            .get("syncedLyrics")
            .and_then(|value| value.as_str())
            .map(ToString::to_string),
        language: "original".to_string(),
    };

    {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.save_lyrics_cache(track_id, &data)?;
    }

    Ok(Some(data))
}

#[tauri::command]
fn session_load(state: tauri::State<'_, AppState>) -> Result<PlaybackSnapshot, String> {
    let db = state.db.lock().map_err(|err| err.to_string())?;
    Ok(db
        .load_session::<PlaybackSnapshot>("playback_session")?
        .unwrap_or_default())
}

#[tauri::command]
fn session_save(
    state: tauri::State<'_, AppState>,
    snapshot: PlaybackSnapshot,
) -> Result<(), String> {
    {
        let mut current = state
            .playback_snapshot
            .lock()
            .map_err(|err| err.to_string())?;
        *current = snapshot.clone();
    }

    let db = state.db.lock().map_err(|err| err.to_string())?;
    db.save_session("playback_session", &snapshot)
}

#[tauri::command]
fn playback_broadcast(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    snapshot: PlaybackSnapshot,
) -> Result<(), String> {
    {
        let mut current = state
            .playback_snapshot
            .lock()
            .map_err(|err| err.to_string())?;
        *current = snapshot.clone();
    }

    app.emit("playback:state", snapshot)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn desktop_lyrics_toggle(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let visible = {
        let snapshot = state
            .playback_snapshot
            .lock()
            .map_err(|err| err.to_string())?;
        !snapshot.lyrics_window_visible
    };
    set_desktop_lyrics_visibility(&app, &state, visible)?;
    Ok(visible)
}

#[tauri::command]
fn desktop_lyrics_set_visible(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    visible: bool,
) -> Result<(), String> {
    set_desktop_lyrics_visibility(&app, &state, visible)
}

#[tauri::command]
fn desktop_lyrics_push(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    snapshot: DesktopLyricsSnapshot,
) -> Result<(), String> {
    {
        let mut current = state
            .desktop_snapshot
            .lock()
            .map_err(|err| err.to_string())?;
        *current = snapshot.clone();
    }

    if let Some(window) = app.get_webview_window("desktop-lyrics") {
        window
            .emit("desktopLyrics:state", snapshot)
            .map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn player_transport(app: AppHandle, action: String) -> Result<(), String> {
    emit_transport(&app, &action)
}

#[tauri::command]
fn shortcuts_load(state: tauri::State<'_, AppState>) -> Result<ShortcutSettings, String> {
    let db = state.db.lock().map_err(|err| err.to_string())?;
    Ok(db
        .load_session::<ShortcutSettings>("shortcut_settings")?
        .unwrap_or_default())
}

#[tauri::command]
fn shortcuts_save(
    state: tauri::State<'_, AppState>,
    settings: ShortcutSettings,
) -> Result<ShortcutCapabilities, String> {
    let db = state.db.lock().map_err(|err| err.to_string())?;
    db.save_session("shortcut_settings", &settings)?;
    Ok(ShortcutCapabilities {
        global_supported: false,
        desktop_supported: desktop_lyrics_supported(),
    })
}

#[tauri::command]
fn settings_save(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    settings: UiSettings,
) -> Result<UiSettings, String> {
    let normalized = normalize_ui_settings(settings);

    {
        let mut current = state.ui_settings.lock().map_err(|err| err.to_string())?;
        *current = normalized.clone();
    }

    {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.save_session("ui_settings", &normalized)?;
    }

    refresh_tray_menu(&app, &normalized)?;
    Ok(normalized)
}

fn scan_paths(
    app: &AppHandle,
    state: &tauri::State<'_, AppState>,
    paths: &[String],
    remember_root: bool,
) -> Result<ScanSummary, String> {
    let mut entries = Vec::new();
    let mut seen = HashSet::new();

    for path in paths {
        let absolute = PathBuf::from(path);
        if absolute.is_dir() {
            for entry in WalkDir::new(&absolute).into_iter().flatten() {
                if entry.file_type().is_file() && is_audio_path(entry.path()) {
                    let normalized = entry.path().to_string_lossy().to_string();
                    if seen.insert(normalized.clone()) {
                        entries.push(normalized);
                    }
                }
            }
        } else if absolute.is_file() && is_audio_path(&absolute) {
            let normalized = absolute.to_string_lossy().to_string();
            if seen.insert(normalized.clone()) {
                entries.push(normalized);
            }
        }
    }

    let total = entries.len();
    let mut summary = ScanSummary {
        added: 0,
        updated: 0,
        missing: 0,
        errors: Vec::new(),
    };

    {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.mark_local_tracks_missing()?;
        if remember_root {
            for path in paths {
                if Path::new(path).is_dir() {
                    db.upsert_root(path)?;
                }
            }
        }
    }

    for (index, path) in entries.iter().enumerate() {
        app.emit(
            "scan:progress",
            ScanProgressEvent {
                current: index + 1,
                total,
                path: path.clone(),
            },
        )
        .map_err(|err| err.to_string())?;

        match read_local_track(path, &state.app_data_dir) {
            Ok(scanned) => {
                let db = state.db.lock().map_err(|err| err.to_string())?;
                let (_, added, updated) = db.upsert_scanned_track(&scanned)?;
                if added {
                    summary.added += 1;
                }
                if updated {
                    summary.updated += 1;
                }
            }
            Err(error) => summary.errors.push(format!("{path}: {error}")),
        }
    }

    if remember_root {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        for path in paths {
            if Path::new(path).is_dir() {
                db.touch_root(path)?;
            }
        }
    }

    app.emit("scan:done", &summary)
        .map_err(|err| err.to_string())?;
    Ok(summary)
}

fn read_local_track(path: &str, app_data_dir: &Path) -> Result<ScannedTrack, String> {
    let tagged_file = Probe::open(path)
        .map_err(|err| err.to_string())?
        .read()
        .map_err(|err| err.to_string())?;

    let properties = tagged_file.properties();
    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());
    let extension = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_uppercase();

    let metadata = fs::metadata(path).map_err(|err| err.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|time| time.as_secs())
        .unwrap_or_default();
    let fingerprint = format!("{}:{modified}", metadata.len());

    let lyric_path = find_local_lrc(path).map(|item| item.to_string_lossy().to_string());
    let artwork_cache_dir = app_data_dir.join("artwork-cache");
    let artwork_ref = tag
        .and_then(|tag| tag.pictures().first())
        .and_then(|picture| write_artwork_cache(path, picture.data(), &artwork_cache_dir))
        .or_else(|| find_local_artwork(path).map(|item| item.to_string_lossy().to_string()));

    Ok(ScannedTrack {
        source_kind: "local_file".to_string(),
        source_locator: path.to_string(),
        resolver_id: None,
        availability: "available".to_string(),
        fingerprint,
        title: tag
            .and_then(|tag| tag.title().map(|value| value.into_owned()))
            .unwrap_or_else(|| fallback_title(path)),
        artist: tag
            .and_then(|tag| tag.artist().map(|value| value.into_owned()))
            .unwrap_or_else(|| "Unknown Artist".to_string()),
        album: tag
            .and_then(|tag| tag.album().map(|value| value.into_owned()))
            .unwrap_or_else(|| "Unknown Album".to_string()),
        composer: tag
            .and_then(|tag| tag.get_string(&ItemKey::Composer).map(ToString::to_string))
            .unwrap_or_default(),
        duration: properties.duration().as_secs_f64(),
        format: extension,
        bitrate: properties.audio_bitrate().unwrap_or(0) as i64,
        sample_rate: properties.sample_rate().unwrap_or(0) as i64,
        channels: properties.channels().unwrap_or(0) as i64,
        artwork_ref,
        lyric_ref: lyric_path,
    })
}

fn read_local_lyrics(track: &Track) -> Option<LyricsData> {
    if track.source_kind != "local_file" {
        return None;
    }

    let lyric_path = track.lyric_ref.clone().or_else(|| {
        find_local_lrc(&track.source_locator).map(|path| path.to_string_lossy().to_string())
    })?;

    let content = fs::read_to_string(lyric_path).ok()?;
    Some(lyrics_from_text("local_file", content))
}

fn lyrics_from_text(source: &str, content: String) -> LyricsData {
    let is_synced = Regex::new(r"\[\d{2}:\d{2}")
        .map(|regex| regex.is_match(&content))
        .unwrap_or(false);

    LyricsData {
        source: source.to_string(),
        plain_text: if is_synced {
            Some(strip_lrc_tags(&content))
        } else {
            Some(content.clone())
        },
        synced_text: if is_synced { Some(content) } else { None },
        language: "original".to_string(),
    }
}

fn strip_lrc_tags(content: &str) -> String {
    content
        .lines()
        .map(|line| {
            Regex::new(r"\[[^\]]+\]")
                .map(|regex| regex.replace_all(line, "").trim().to_string())
                .unwrap_or_else(|_| line.trim().to_string())
        })
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn find_local_lrc<P: AsRef<Path>>(path: P) -> Option<PathBuf> {
    let source = path.as_ref();
    let stem = source.file_stem()?.to_string_lossy().to_string();
    let directory = source.parent()?;
    let candidate = directory.join(format!("{stem}.lrc"));
    if candidate.exists() {
        Some(candidate)
    } else {
        None
    }
}

fn find_local_artwork<P: AsRef<Path>>(path: P) -> Option<PathBuf> {
    let source = path.as_ref();
    let stem = source.file_stem()?.to_string_lossy().to_string();
    let directory = source.parent()?;

    let candidates = [
        format!("{stem}.jpg"),
        format!("{stem}.jpeg"),
        format!("{stem}.png"),
        format!("{stem}.webp"),
        "cover.jpg".to_string(),
        "cover.jpeg".to_string(),
        "cover.png".to_string(),
        "folder.jpg".to_string(),
        "folder.jpeg".to_string(),
        "folder.png".to_string(),
        "front.jpg".to_string(),
        "front.jpeg".to_string(),
        "front.png".to_string(),
    ];

    for candidate in candidates {
        let absolute = directory.join(candidate);
        if absolute.exists() {
            return Some(absolute);
        }
    }

    None
}

fn write_artwork_cache(
    source_path: &str,
    bytes: &[u8],
    artwork_cache_dir: &Path,
) -> Option<String> {
    if bytes.is_empty() {
        return None;
    }

    fs::create_dir_all(artwork_cache_dir).ok()?;

    let mut hasher = DefaultHasher::new();
    source_path.hash(&mut hasher);
    bytes.len().hash(&mut hasher);
    let hash = hasher.finish();
    let extension = image_extension_from_bytes(bytes);
    let target = artwork_cache_dir.join(format!("{hash:016x}.{extension}"));

    fs::write(&target, bytes).ok()?;
    Some(target.to_string_lossy().to_string())
}

fn image_extension_from_bytes(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpg"
    } else if bytes.starts_with(b"GIF8") {
        "gif"
    } else if bytes.starts_with(b"BM") {
        "bmp"
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "webp"
    } else {
        "jpg"
    }
}

fn is_audio_path(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| AUDIO_EXTENSIONS.contains(&extension.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn detect_format(locator: &str) -> String {
    Path::new(locator)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_uppercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "STREAM".to_string())
}

fn fallback_title(locator: &str) -> String {
    let raw = locator
        .split(['/', '\\'])
        .last()
        .unwrap_or(locator)
        .split('?')
        .next()
        .unwrap_or(locator);

    Path::new(raw)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(raw)
        .to_string()
}

fn reveal_in_folder(source_kind: &str, locator: &str) -> Result<(), String> {
    if source_kind != "local_file" {
        return Err("Only local files can be revealed".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", locator])
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let parent = Path::new(locator)
            .parent()
            .ok_or_else(|| "Unable to resolve parent folder".to_string())?;
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform".to_string())
}

fn desktop_lyrics_supported() -> bool {
    cfg!(target_os = "windows") || cfg!(target_os = "linux")
}

fn set_desktop_lyrics_visibility(
    app: &AppHandle,
    state: &tauri::State<'_, AppState>,
    visible: bool,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("desktop-lyrics") {
        if visible {
            window.show().map_err(|err| err.to_string())?;
            window.set_focus().map_err(|err| err.to_string())?;
        } else {
            window.hide().map_err(|err| err.to_string())?;
        }
    }

    let mut snapshot = state
        .playback_snapshot
        .lock()
        .map_err(|err| err.to_string())?;
    snapshot.lyrics_window_visible = visible;
    Ok(())
}

fn emit_transport(app: &AppHandle, action: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .emit("transport:command", action.to_string())
            .map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn create_desktop_window(app: &AppHandle) -> Result<(), String> {
    if !desktop_lyrics_supported() || app.get_webview_window("desktop-lyrics").is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "desktop-lyrics", WebviewUrl::App("index.html".into()))
        .title("AlsoMusicPlayer Lyrics")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .resizable(true)
        .inner_size(720.0, 160.0)
        .build()
        .map_err(|err| err.to_string())?;

    Ok(())
}

fn create_tray(app: &AppHandle) -> Result<(), String> {
    let settings = app
        .state::<AppState>()
        .ui_settings
        .lock()
        .map_err(|err| err.to_string())?
        .clone();
    let labels = tray_labels(&settings);

    let show = MenuItem::with_id(app, "show", labels.show, true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let toggle = MenuItem::with_id(app, "toggle", labels.toggle, true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let next = MenuItem::with_id(app, "next", labels.next, true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let previous = MenuItem::with_id(app, "previous", labels.previous, true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let lyrics = MenuItem::with_id(app, "lyrics", labels.lyrics, true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let separator = PredefinedMenuItem::separator(app).map_err(|err| err.to_string())?;
    let quit = MenuItem::with_id(app, "quit", labels.quit, true, None::<&str>)
        .map_err(|err| err.to_string())?;

    let menu = Menu::with_items(
        app,
        &[&show, &toggle, &previous, &next, &lyrics, &separator, &quit],
    )
    .map_err(|err| err.to_string())?;

    TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "toggle" => {
                let _ = emit_transport(app, "toggle");
            }
            "next" => {
                let _ = emit_transport(app, "next");
            }
            "previous" => {
                let _ = emit_transport(app, "previous");
            }
            "lyrics" => {
                let _ = emit_transport(app, "toggle-desktop-lyrics");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)
        .map_err(|err| err.to_string())?;

    Ok(())
}

fn refresh_tray_menu(app: &AppHandle, settings: &UiSettings) -> Result<(), String> {
    let labels = tray_labels(settings);
    let show = MenuItem::with_id(app, "show", labels.show, true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let toggle = MenuItem::with_id(app, "toggle", labels.toggle, true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let next = MenuItem::with_id(app, "next", labels.next, true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let previous = MenuItem::with_id(app, "previous", labels.previous, true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let lyrics = MenuItem::with_id(app, "lyrics", labels.lyrics, true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let separator = PredefinedMenuItem::separator(app).map_err(|err| err.to_string())?;
    let quit = MenuItem::with_id(app, "quit", labels.quit, true, None::<&str>)
        .map_err(|err| err.to_string())?;

    let menu = Menu::with_items(
        app,
        &[&show, &toggle, &previous, &next, &lyrics, &separator, &quit],
    )
    .map_err(|err| err.to_string())?;

    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu)).map_err(|err| err.to_string())?;
    }

    Ok(())
}

fn tray_labels(settings: &UiSettings) -> TrayLabels {
    match effective_language(settings) {
        "zh-CN" => TrayLabels {
            show: "显示播放器".to_string(),
            toggle: "播放 / 暂停".to_string(),
            next: "下一首".to_string(),
            previous: "上一首".to_string(),
            lyrics: "切换桌面歌词".to_string(),
            quit: "退出".to_string(),
        },
        _ => TrayLabels {
            show: "Show Player".to_string(),
            toggle: "Play / Pause".to_string(),
            next: "Next Track".to_string(),
            previous: "Previous Track".to_string(),
            lyrics: "Toggle Desktop Lyrics".to_string(),
            quit: "Quit".to_string(),
        },
    }
}

fn normalize_ui_settings(settings: UiSettings) -> UiSettings {
    let language_preference = match settings.language_preference.as_str() {
        "en-US" | "zh-CN" | "system" => settings.language_preference,
        _ => "system".to_string(),
    };

    let resolved_language = match settings.resolved_language.as_str() {
        "zh-CN" => "zh-CN".to_string(),
        "en-US" => "en-US".to_string(),
        _ if language_preference == "zh-CN" => "zh-CN".to_string(),
        _ => "en-US".to_string(),
    };

    UiSettings {
        language_preference,
        resolved_language,
    }
}

fn effective_language(settings: &UiSettings) -> &'static str {
    match settings.language_preference.as_str() {
        "zh-CN" => "zh-CN",
        "en-US" => "en-US",
        _ if settings.resolved_language == "zh-CN" => "zh-CN",
        _ => "en-US",
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
            fs::create_dir_all(&app_data_dir).map_err(|err| err.to_string())?;

            let database_path = AppDatabase::database_path(&app_data_dir);
            let database = AppDatabase::open(&database_path)?;
            let playback_snapshot = database
                .load_session::<PlaybackSnapshot>("playback_session")?
                .unwrap_or_default();
            let desktop_snapshot = database
                .load_session::<DesktopLyricsSnapshot>("desktop_lyrics_snapshot")?
                .unwrap_or_default();
            let ui_settings = database
                .load_session::<UiSettings>("ui_settings")?
                .unwrap_or_default();

            app.manage(AppState {
                app_data_dir: app_data_dir.clone(),
                db: Mutex::new(database),
                desktop_snapshot: Mutex::new(desktop_snapshot),
                playback_snapshot: Mutex::new(playback_snapshot),
                ui_settings: Mutex::new(ui_settings),
            });

            create_desktop_window(app.handle())?;
            create_tray(app.handle())?;

            if let Some(main_window) = app.get_webview_window("main") {
                let window = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                });
            }

            let app_handle = app.handle().clone();
            app.listen("desktopLyrics:request-state", move |_| {
                if let Some(window) = app_handle.get_webview_window("desktop-lyrics") {
                    let snapshot = {
                        let state = app_handle.state::<AppState>();
                        state
                            .desktop_snapshot
                            .lock()
                            .map(|snapshot| snapshot.clone())
                            .ok()
                    };

                    if let Some(snapshot) = snapshot {
                        let _ = window.emit("desktopLyrics:state", snapshot);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library_bootstrap,
            library_pick_folders,
            library_pick_files,
            library_scan_paths,
            library_refresh,
            library_remove_track,
            library_reveal_track,
            library_add_direct_url,
            resolver_search_netease,
            resolver_add_track,
            resolve_playback_source,
            playlist_create,
            playlist_rename,
            playlist_delete,
            playlist_tracks,
            playlist_add_tracks,
            playlist_remove_tracks,
            track_override_get,
            track_override_save,
            lyrics_get,
            lyrics_search_online,
            session_load,
            session_save,
            playback_broadcast,
            desktop_lyrics_toggle,
            desktop_lyrics_set_visible,
            desktop_lyrics_push,
            player_transport,
            shortcuts_load,
            shortcuts_save,
            settings_save
        ])
        .run(tauri::generate_context!())
        .expect("error while running AlsoMusicPlayer");
}
