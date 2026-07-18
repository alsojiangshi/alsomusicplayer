mod db;

use db::{
    AppDatabase, DesktopLyricsSnapshot, LibraryBootstrap, LyricsData, OnlineSourceSetting,
    PlaybackSnapshot, Playlist, ScanSummary, ScannedTrack, StartupDiagnostics, Track,
    TrackOverrideInput, UiSettings,
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
use sha2::{Digest, Sha256};
use std::{
    collections::{hash_map::DefaultHasher, HashSet},
    fs,
    hash::{Hash, Hasher},
    io::Read,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::Duration,
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
const PORTABLE_MARKER_FILE: &str = "portable.json";
const DEFAULT_PORTABLE_DATA_DIR: &str = "data";

struct AppState {
    app_data_dir: PathBuf,
    startup_diagnostics: StartupDiagnostics,
    db: Mutex<AppDatabase>,
    desktop_snapshot: Mutex<DesktopLyricsSnapshot>,
    playback_snapshot: Mutex<PlaybackSnapshot>,
    ui_settings: Mutex<UiSettings>,
}

struct StoragePaths {
    app_data_dir: PathBuf,
    database_path: PathBuf,
    startup_diagnostics: StartupDiagnostics,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct PortableConfig {
    data_dir: String,
}

impl Default for PortableConfig {
    fn default() -> Self {
        Self {
            data_dir: DEFAULT_PORTABLE_DATA_DIR.to_string(),
        }
    }
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
    resolver_id: String,
    title: String,
    artist: String,
    album: String,
    duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct ShortcutSettings {
    toggle_play_pause: String,
    next_track: String,
    previous_track: String,
    toggle_desktop_lyrics: String,
    toggle_desktop_lyrics_lock: String,
}

impl Default for ShortcutSettings {
    fn default() -> Self {
        Self {
            toggle_play_pause: "Space".to_string(),
            next_track: "Ctrl+Right".to_string(),
            previous_track: "Ctrl+Left".to_string(),
            toggle_desktop_lyrics: "Ctrl+L".to_string(),
            toggle_desktop_lyrics_lock: String::new(),
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
fn library_bootstrap(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryBootstrap, String> {
    let bootstrap = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.bootstrap(desktop_lyrics_supported(), &state.startup_diagnostics)?
    };
    allow_track_assets(&app, &bootstrap.tracks);
    Ok(bootstrap)
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
async fn resolver_search_netease(
    state: tauri::State<'_, AppState>,
    query: String,
) -> Result<Vec<ResolverSearchResult>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|err| err.to_string())?;
    let mut sources = enabled_online_sources(&state, "music")?;
    sources.sort_by_key(|source| source.priority);
    let mut failures = Vec::new();
    for source in sources {
        if source.provider_type != "netease" {
            continue;
        }
        match search_netease_source(&client, &source, query).await {
            Ok(songs) if !songs.is_empty() => {
                return Ok(songs
                    .into_iter()
                    .map(|item| ResolverSearchResult {
                        id: item
                            .get("id")
                            .and_then(Value::as_i64)
                            .unwrap_or_default()
                            .to_string(),
                        resolver_id: source.id.clone(),
                        title: value_text(&item, "name").to_string(),
                        artist: item
                            .get("artists")
                            .and_then(Value::as_array)
                            .and_then(|artists| artists.first())
                            .map(|artist| value_text(artist, "name"))
                            .unwrap_or("Unknown Artist")
                            .to_string(),
                        album: item
                            .get("album")
                            .map(|album| value_text(album, "name"))
                            .unwrap_or("")
                            .to_string(),
                        duration: item
                            .get("duration")
                            .and_then(Value::as_f64)
                            .unwrap_or_default()
                            / 1000.0,
                    })
                    .collect());
            }
            Ok(_) => {}
            Err(error) => failures.push(format!("{}: {error}", source.label)),
        }
    }
    if failures.is_empty() {
        Ok(Vec::new())
    } else {
        Err(failures.join("; "))
    }
}

async fn search_netease_source(
    client: &reqwest::Client,
    source: &OnlineSourceSetting,
    query: &str,
) -> Result<Vec<Value>, String> {
    let mut url = Url::parse(&format!("{}/api/search/get", source.base_url))
        .map_err(|err| err.to_string())?;
    url.query_pairs_mut()
        .append_pair("type", "1")
        .append_pair("limit", "20")
        .append_pair("offset", "0")
        .append_pair("s", query);
    let payload = client
        .get(url)
        .header("User-Agent", "Mozilla/5.0")
        .header("Referer", format!("{}/", source.base_url))
        .send()
        .await
        .map_err(|err| err.to_string())?
        .error_for_status()
        .map_err(|err| err.to_string())?
        .json::<Value>()
        .await
        .map_err(|err| err.to_string())?;
    Ok(payload
        .get("result")
        .and_then(|result| result.get("songs"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

#[tauri::command]
fn resolver_add_track(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    input: ResolverTrackInput,
) -> Result<Track, String> {
    let resolver_id = if input.resolver_id.trim().is_empty() {
        "netease-music-default".to_string()
    } else {
        input.resolver_id.trim().to_string()
    };
    let locator = format!("{resolver_id}:{}", input.id);
    let scanned = ScannedTrack {
        source_kind: "resolver".to_string(),
        source_locator: locator.clone(),
        resolver_id: Some(resolver_id),
        availability: "unresolved".to_string(),
        fingerprint: format!("sha256:{}", sha256_text(&locator)),
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
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    track_id: i64,
) -> Result<String, String> {
    let track = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.get_track(track_id)?
    };

    match track.source_kind.as_str() {
        "local_file" => {
            if !Path::new(&track.source_locator).is_file() {
                return Err("Local audio file no longer exists".to_string());
            }
            app.asset_protocol_scope()
                .allow_file(&track.source_locator)
                .map_err(|err| format!("Cannot authorize local audio file: {err}"))?;
            Ok(track.source_locator)
        }
        "direct_url" => Ok(track.source_locator),
        "resolver" => {
            let resolver_id = track
                .resolver_id
                .as_deref()
                .ok_or_else(|| "Resolver source is missing".to_string())?;
            let configured_source = {
                let settings = state.ui_settings.lock().map_err(|err| err.to_string())?;
                settings
                    .online_sources
                    .iter()
                    .find(|source| source.id == resolver_id)
                    .cloned()
            };
            let source = configured_source.or_else(|| {
                (resolver_id == "netease").then(|| OnlineSourceSetting {
                    id: "netease".to_string(),
                    label: "NetEase Music".to_string(),
                    resource_type: "music".to_string(),
                    provider_type: "netease".to_string(),
                    base_url: "https://music.163.com".to_string(),
                    enabled: true,
                    priority: 10,
                })
            });
            let source =
                source.ok_or_else(|| "Configured resolver source no longer exists".to_string())?;
            if source.provider_type == "netease" {
                let song_id = track
                    .source_locator
                    .rsplit(':')
                    .next()
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| "Invalid resolver locator".to_string())?;
                Ok(format!(
                    "{}/song/media/outer/url?id={song_id}.mp3",
                    source.base_url
                ))
            } else {
                Err("Unsupported resolver".to_string())
            }
        }
        _ => Err("Unsupported source kind".to_string()),
    }
}

fn allow_track_assets(app: &AppHandle, tracks: &[Track]) {
    let scope = app.asset_protocol_scope();
    for track in tracks {
        if track.source_kind == "local_file" {
            let _ = scope.allow_file(&track.source_locator);
        }
        if let Some(artwork_ref) = track.artwork_ref.as_deref() {
            if !is_remote_locator(artwork_ref) {
                let _ = scope.allow_file(artwork_ref);
            }
        }
    }
}

fn is_remote_locator(locator: &str) -> bool {
    locator.starts_with("http://") || locator.starts_with("https://")
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
    let mut input = input;
    if let Some(content) = input
        .lyric_text
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        let mut track = {
            let db = state.db.lock().map_err(|err| err.to_string())?;
            db.get_track(input.track_id)?
        };
        ensure_track_fingerprint(&state, &mut track)?;
        let path = write_lyrics_file(
            &state.app_data_dir,
            &track,
            input.lyric_ref.as_deref(),
            content,
        )?;
        input.lyric_ref = Some(lyrics_storage_reference(&state.app_data_dir, &path));
        input.lyric_text = None;
    }

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
    load_track_lyrics(&state, track_id)
}

fn load_track_lyrics(
    state: &tauri::State<'_, AppState>,
    track_id: i64,
) -> Result<Option<LyricsData>, String> {
    let (mut track, override_data) = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        let override_data = db.get_track_override(track_id)?;
        (db.get_track(track_id)?, override_data)
    };
    ensure_track_fingerprint(state, &mut track)?;

    if let Some(mut override_data) = override_data {
        if let Some(text) = override_data
            .lyric_text
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            let path = write_lyrics_file(
                &state.app_data_dir,
                &track,
                override_data.lyric_ref.as_deref(),
                text,
            )?;
            let source = lyrics_storage_reference(&state.app_data_dir, &path);
            let data = lyrics_from_text(&source, text.to_string());
            override_data.lyric_ref = Some(source);
            override_data.lyric_text = None;
            let db = state.db.lock().map_err(|err| err.to_string())?;
            db.save_track_override(&override_data)?;
            return Ok(Some(data));
        }
        if let Some(reference) = override_data.lyric_ref.clone() {
            let path = resolve_lyrics_reference(&state.app_data_dir, &reference);
            if path.is_file() {
                let active_path = migrate_managed_lyrics_file(&state.app_data_dir, &track, path)?;
                let content = fs::read_to_string(&active_path).map_err(|err| err.to_string())?;
                let source = lyrics_storage_reference(&state.app_data_dir, &active_path);
                if source != reference {
                    override_data.lyric_ref = Some(source.clone());
                    let db = state.db.lock().map_err(|err| err.to_string())?;
                    db.save_track_override(&override_data)?;
                }
                return Ok(Some(lyrics_from_text(&source, content)));
            }
        }
    }

    if let Some(data) = read_local_lyrics(&track, &state.app_data_dir) {
        return Ok(Some(data));
    }

    let managed_path = managed_lyrics_path(&state.app_data_dir, &track);
    if managed_path.is_file() {
        let content = fs::read_to_string(&managed_path).map_err(|err| err.to_string())?;
        let source = lyrics_storage_reference(&state.app_data_dir, &managed_path);
        let data = lyrics_from_text(&source, content);
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.save_lyrics_cache(track_id, &data)?;
        return Ok(Some(data));
    }

    let cached = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.cached_lyrics(track_id)?
    };
    let Some(cached) = cached else {
        return Ok(None);
    };

    let cached_path = resolve_lyrics_reference(&state.app_data_dir, &cached.source);
    if cached_path.is_file() {
        let active_path = migrate_managed_lyrics_file(&state.app_data_dir, &track, cached_path)?;
        let content = fs::read_to_string(&active_path).map_err(|err| err.to_string())?;
        let source = lyrics_storage_reference(&state.app_data_dir, &active_path);
        let data = lyrics_from_text(&source, content);
        if source != cached.source {
            let db = state.db.lock().map_err(|err| err.to_string())?;
            db.save_lyrics_cache(track_id, &data)?;
        }
        return Ok(Some(data));
    }

    let content = cached
        .synced_text
        .as_deref()
        .or(cached.plain_text.as_deref())
        .unwrap_or("");
    if content.trim().is_empty() {
        return Ok(Some(cached));
    }

    let path = write_online_lyrics_file(&state.app_data_dir, &track, content)?;
    let source = lyrics_storage_reference(&state.app_data_dir, &path);
    let data = lyrics_from_text(&source, content.to_string());
    {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.save_lyrics_cache(track_id, &data)?;
    }
    Ok(Some(data))
}

#[tauri::command]
fn lyrics_file_path(
    state: tauri::State<'_, AppState>,
    track_id: i64,
) -> Result<Option<String>, String> {
    let data = load_track_lyrics(&state, track_id)?;
    Ok(data.and_then(|lyrics| {
        let path = resolve_lyrics_reference(&state.app_data_dir, &lyrics.source);
        path.is_file().then(|| path.to_string_lossy().to_string())
    }))
}

#[tauri::command]
fn lyrics_reveal_file(state: tauri::State<'_, AppState>, track_id: i64) -> Result<(), String> {
    let path = lyrics_file_path(state, track_id)?
        .ok_or_else(|| "This track does not have a local lyrics file".to_string())?;
    reveal_in_folder("local_file", &path)
}

#[tauri::command]
async fn lyrics_search_online(
    state: tauri::State<'_, AppState>,
    track_id: i64,
) -> Result<Option<LyricsData>, String> {
    let mut track = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.get_track(track_id)?
    };
    ensure_track_fingerprint(&state, &mut track)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|err| err.to_string())?;
    let mut sources = enabled_online_sources(&state, "lyrics")?;
    if sources.is_empty() {
        return Err("No enabled lyrics sources are configured".to_string());
    }

    sources.sort_by_key(|source| source.priority);
    let mut failures = Vec::new();
    let mut content = None;
    for source in sources {
        match search_lyrics_source(&client, &source, &track).await {
            Ok(Some(result)) => {
                content = Some(result);
                break;
            }
            Ok(None) => {}
            Err(error) => failures.push(format!("{}: {error}", source.label)),
        }
    }
    let Some(content) = content else {
        if failures.is_empty() {
            return Ok(None);
        }
        return Err(failures.join("; "));
    };
    let path = write_online_lyrics_file(&state.app_data_dir, &track, &content)?;
    let source = lyrics_storage_reference(&state.app_data_dir, &path);
    let data = lyrics_from_text(&source, content);

    {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.save_lyrics_cache(track_id, &data)?;
    }

    Ok(Some(data))
}

fn enabled_online_sources(
    state: &tauri::State<'_, AppState>,
    resource_type: &str,
) -> Result<Vec<OnlineSourceSetting>, String> {
    let settings = state.ui_settings.lock().map_err(|err| err.to_string())?;
    Ok(settings
        .online_sources
        .iter()
        .filter(|source| source.enabled && source.resource_type == resource_type)
        .cloned()
        .collect())
}

async fn search_lyrics_source(
    client: &reqwest::Client,
    source: &OnlineSourceSetting,
    track: &Track,
) -> Result<Option<String>, String> {
    match source.provider_type.as_str() {
        "lrclib" => search_lrclib_source(client, source, track).await,
        "netease" => search_netease_lyrics_source(client, source, track).await,
        _ => Err(format!(
            "Unsupported provider type {}",
            source.provider_type
        )),
    }
}

async fn search_lrclib_source(
    client: &reqwest::Client,
    source: &OnlineSourceSetting,
    track: &Track,
) -> Result<Option<String>, String> {
    let mut url =
        Url::parse(&format!("{}/search", source.base_url)).map_err(|err| err.to_string())?;
    url.query_pairs_mut()
        .append_pair("track_name", &track.title)
        .append_pair("artist_name", &track.artist);
    let result = client
        .get(url)
        .send()
        .await
        .map_err(|err| err.to_string())?
        .error_for_status()
        .map_err(|err| err.to_string())?
        .json::<Value>()
        .await
        .map_err(|err| err.to_string())?;
    let item = result.as_array().and_then(|rows| {
        select_best_lyrics_result(
            rows,
            &track.title,
            &track.artist,
            &track.album,
            track.duration,
        )
    });
    Ok(item.and_then(|item| {
        item.get("syncedLyrics")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .or_else(|| item.get("plainLyrics").and_then(Value::as_str))
            .map(ToString::to_string)
    }))
}

async fn search_netease_lyrics_source(
    client: &reqwest::Client,
    source: &OnlineSourceSetting,
    track: &Track,
) -> Result<Option<String>, String> {
    let songs =
        search_netease_source(client, source, &format!("{} {}", track.title, track.artist)).await?;
    let song = songs.into_iter().max_by_key(|item| {
        metadata_match_score(&track.title, value_text(item, "name"), 90, 35)
            + item
                .get("artists")
                .and_then(Value::as_array)
                .and_then(|artists| artists.first())
                .map(|artist| {
                    metadata_match_score(&track.artist, value_text(artist, "name"), 70, 25)
                })
                .unwrap_or_default()
    });
    let Some(song_id) = song
        .as_ref()
        .and_then(|song| song.get("id"))
        .and_then(Value::as_i64)
    else {
        return Ok(None);
    };
    let mut url = Url::parse(&format!("{}/api/song/lyric", source.base_url))
        .map_err(|err| err.to_string())?;
    url.query_pairs_mut()
        .append_pair("id", &song_id.to_string())
        .append_pair("lv", "1")
        .append_pair("kv", "1")
        .append_pair("tv", "1");
    let payload = client
        .get(url)
        .header("User-Agent", "Mozilla/5.0")
        .header("Referer", format!("{}/", source.base_url))
        .send()
        .await
        .map_err(|err| err.to_string())?
        .error_for_status()
        .map_err(|err| err.to_string())?
        .json::<Value>()
        .await
        .map_err(|err| err.to_string())?;
    Ok(payload
        .get("lrc")
        .and_then(|lrc| lrc.get("lyric"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(ToString::to_string))
}

fn select_best_lyrics_result(
    rows: &[Value],
    title: &str,
    artist: &str,
    album: &str,
    duration: f64,
) -> Option<Value> {
    rows.iter()
        .filter(|item| {
            has_lyrics_text(item, "syncedLyrics") || has_lyrics_text(item, "plainLyrics")
        })
        .max_by_key(|item| lyrics_result_score(item, title, artist, album, duration))
        .cloned()
}

fn lyrics_result_score(item: &Value, title: &str, artist: &str, album: &str, duration: f64) -> i64 {
    let mut score = 0;
    if has_lyrics_text(item, "syncedLyrics") {
        score += 120;
    }

    score += metadata_match_score(title, value_text(item, "trackName"), 90, 35);
    score += metadata_match_score(artist, value_text(item, "artistName"), 70, 25);
    score += metadata_match_score(album, value_text(item, "albumName"), 20, 8);

    if duration > 0.0 {
        if let Some(candidate_duration) = item.get("duration").and_then(Value::as_f64) {
            let difference = (candidate_duration - duration).abs();
            score += if difference <= 2.0 {
                90
            } else if difference <= 5.0 {
                65
            } else if difference <= 10.0 {
                35
            } else if difference <= 20.0 {
                10
            } else {
                -(difference.min(120.0) as i64)
            };
        }
    }

    score
}

fn metadata_match_score(expected: &str, actual: &str, exact: i64, partial: i64) -> i64 {
    let expected = normalize_metadata(expected);
    let actual = normalize_metadata(actual);
    if expected.is_empty() || actual.is_empty() {
        return 0;
    }
    if expected == actual {
        exact
    } else if expected.contains(&actual) || actual.contains(&expected) {
        partial
    } else {
        0
    }
}

fn normalize_metadata(value: &str) -> String {
    value
        .chars()
        .flat_map(char::to_lowercase)
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn has_lyrics_text(item: &Value, key: &str) -> bool {
    !value_text(item, key).trim().is_empty()
}

fn value_text<'a>(item: &'a Value, key: &str) -> &'a str {
    item.get(key).and_then(Value::as_str).unwrap_or("")
}

fn write_online_lyrics_file(
    app_data_dir: &Path,
    track: &Track,
    content: &str,
) -> Result<PathBuf, String> {
    write_lyrics_file(app_data_dir, track, None, content)
}

fn write_lyrics_file(
    app_data_dir: &Path,
    track: &Track,
    preferred_path: Option<&str>,
    content: &str,
) -> Result<PathBuf, String> {
    let preferred_path = preferred_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .map(|path| {
            if path.is_absolute() {
                path
            } else {
                app_data_dir.join(path)
            }
        });
    let path = match preferred_path {
        Some(path) => migrate_managed_lyrics_file(app_data_dir, track, path)?,
        None => managed_lyrics_path(app_data_dir, track),
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    fs::write(&path, content).map_err(|err| err.to_string())?;
    Ok(path)
}

fn managed_lyrics_path(app_data_dir: &Path, track: &Track) -> PathBuf {
    let key = track
        .fingerprint
        .strip_prefix("sha256:")
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| {
            sha256_text(&format!(
                "{}\0{}\0{}",
                track.source_kind, track.source_locator, track.fingerprint
            ))
        });
    app_data_dir.join("lyrics").join(format!("{key}.lrc"))
}

fn migrate_managed_lyrics_file(
    app_data_dir: &Path,
    track: &Track,
    source_path: PathBuf,
) -> Result<PathBuf, String> {
    let lyrics_dir = app_data_dir.join("lyrics");
    let managed_path = managed_lyrics_path(app_data_dir, track);
    if source_path == managed_path || !source_path.starts_with(&lyrics_dir) {
        return Ok(source_path);
    }
    if managed_path.is_file() || !source_path.is_file() {
        return Ok(managed_path);
    }
    fs::create_dir_all(&lyrics_dir).map_err(|err| err.to_string())?;
    fs::rename(&source_path, &managed_path).map_err(|err| {
        format!(
            "Cannot migrate lyrics file {} to {}: {err}",
            source_path.display(),
            managed_path.display()
        )
    })?;
    Ok(managed_path)
}

fn ensure_track_fingerprint(
    state: &tauri::State<'_, AppState>,
    track: &mut Track,
) -> Result<(), String> {
    if track.fingerprint.starts_with("sha256:") {
        return Ok(());
    }
    let digest = if track.source_kind == "local_file" && Path::new(&track.source_locator).is_file()
    {
        sha256_file(Path::new(&track.source_locator))?
    } else {
        sha256_text(&format!("{}\0{}", track.source_kind, track.source_locator))
    };
    track.fingerprint = format!("sha256:{digest}");
    let db = state.db.lock().map_err(|err| err.to_string())?;
    db.update_track_fingerprint(track.id, &track.fingerprint)
}

fn lyrics_storage_reference(app_data_dir: &Path, path: &Path) -> String {
    path.strip_prefix(app_data_dir)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string()
}

fn resolve_lyrics_reference(app_data_dir: &Path, reference: &str) -> PathBuf {
    let path = PathBuf::from(reference);
    if path.is_absolute() {
        path
    } else {
        app_data_dir.join(path)
    }
}

#[tauri::command]
fn session_load(state: tauri::State<'_, AppState>) -> Result<PlaybackSnapshot, String> {
    let db = state.db.lock().map_err(|err| err.to_string())?;
    Ok(db
        .load_session_resilient::<PlaybackSnapshot>("playback_session")?
        .value
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
    let visible = if let Some(window) = app.get_webview_window("desktop-lyrics") {
        !window.is_visible().map_err(|err| err.to_string())?
    } else {
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
fn desktop_lyrics_lock_toggle(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let locked = {
        let snapshot = state
            .playback_snapshot
            .lock()
            .map_err(|err| err.to_string())?;
        !snapshot.desktop_lyrics_locked
    };
    set_desktop_lyrics_lock_state(&app, &state, locked)?;
    Ok(locked)
}

#[tauri::command]
fn desktop_lyrics_lock_get(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    state
        .playback_snapshot
        .lock()
        .map(|snapshot| snapshot.desktop_lyrics_locked)
        .map_err(|err| err.to_string())
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
fn desktop_lyrics_get(state: tauri::State<'_, AppState>) -> Result<DesktopLyricsSnapshot, String> {
    state
        .desktop_snapshot
        .lock()
        .map(|snapshot| snapshot.clone())
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn player_transport(app: AppHandle, action: String) -> Result<(), String> {
    emit_transport(&app, &action)
}

#[tauri::command]
fn shortcuts_load(state: tauri::State<'_, AppState>) -> Result<ShortcutSettings, String> {
    load_shortcuts_settings(&state)
}

#[tauri::command]
fn shortcuts_save(
    state: tauri::State<'_, AppState>,
    settings: ShortcutSettings,
) -> Result<ShortcutCapabilities, String> {
    write_shortcuts_config(&state.app_data_dir, &settings)?;
    {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.save_session("shortcut_settings", &settings)?;
    }
    Ok(ShortcutCapabilities {
        global_supported: false,
        desktop_supported: desktop_lyrics_supported(),
    })
}

#[tauri::command]
fn shortcuts_config_path(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let _ = load_shortcuts_settings(&state)?;
    Ok(shortcuts_file_path(&state.app_data_dir)
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
fn shortcuts_reveal_config(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let _ = load_shortcuts_settings(&state)?;
    let path = shortcuts_file_path(&state.app_data_dir);
    reveal_in_folder("local_file", &path.to_string_lossy())
}

fn load_shortcuts_settings(state: &tauri::State<'_, AppState>) -> Result<ShortcutSettings, String> {
    let path = shortcuts_file_path(&state.app_data_dir);
    if path.is_file() {
        let content = fs::read_to_string(&path).map_err(|err| err.to_string())?;
        return serde_json::from_str(&content)
            .map_err(|err| format!("Invalid shortcut config {}: {err}", path.display()));
    }

    let settings = {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.load_session_resilient::<ShortcutSettings>("shortcut_settings")?
            .value
            .unwrap_or_default()
    };
    write_shortcuts_config(&state.app_data_dir, &settings)?;
    Ok(settings)
}

fn write_shortcuts_config(app_data_dir: &Path, settings: &ShortcutSettings) -> Result<(), String> {
    let path = shortcuts_file_path(app_data_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let content = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    fs::write(path, format!("{content}\n")).map_err(|err| err.to_string())
}

fn shortcuts_file_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("config").join("shortcuts.json")
}

#[tauri::command]
fn settings_save(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    settings: UiSettings,
) -> Result<UiSettings, String> {
    validate_online_sources(&settings.online_sources)?;
    let normalized = normalize_ui_settings(settings);
    write_ui_settings_config(&state.app_data_dir, &normalized)?;

    apply_ui_settings(&app, &state, normalized)
}

#[tauri::command]
fn settings_load(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<UiSettings, String> {
    let settings = match read_ui_settings_config(&state.app_data_dir)? {
        Some(settings) => settings,
        None => {
            let current = state
                .ui_settings
                .lock()
                .map_err(|err| err.to_string())?
                .clone();
            write_ui_settings_config(&state.app_data_dir, &current)?;
            current
        }
    };
    validate_online_sources(&settings.online_sources)?;
    let normalized = normalize_ui_settings(settings);
    apply_ui_settings(&app, &state, normalized)
}

#[tauri::command]
fn settings_config_path(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let current = state
        .ui_settings
        .lock()
        .map_err(|err| err.to_string())?
        .clone();
    if !ui_settings_file_path(&state.app_data_dir).is_file() {
        write_ui_settings_config(&state.app_data_dir, &current)?;
    }
    Ok(ui_settings_file_path(&state.app_data_dir)
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
fn settings_reveal_config(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let path = ui_settings_file_path(&state.app_data_dir);
    if !path.is_file() {
        let current = state
            .ui_settings
            .lock()
            .map_err(|err| err.to_string())?
            .clone();
        write_ui_settings_config(&state.app_data_dir, &current)?;
    }
    reveal_in_folder("local_file", &path.to_string_lossy())
}

fn apply_ui_settings(
    app: &AppHandle,
    state: &tauri::State<'_, AppState>,
    normalized: UiSettings,
) -> Result<UiSettings, String> {
    let changed = {
        let current = state.ui_settings.lock().map_err(|err| err.to_string())?;
        *current != normalized
    };
    if !changed {
        return Ok(normalized);
    }

    {
        let mut current = state.ui_settings.lock().map_err(|err| err.to_string())?;
        *current = normalized.clone();
    }

    {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.save_session("ui_settings", &normalized)?;
    }

    refresh_tray_menu(app, &normalized)?;
    Ok(normalized)
}

fn read_ui_settings_config(app_data_dir: &Path) -> Result<Option<UiSettings>, String> {
    let path = ui_settings_file_path(app_data_dir);
    if !path.is_file() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|err| format!("Invalid settings config {}: {err}", path.display()))
}

fn write_ui_settings_config(app_data_dir: &Path, settings: &UiSettings) -> Result<(), String> {
    let path = ui_settings_file_path(app_data_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let content = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    fs::write(path, format!("{content}\n")).map_err(|err| err.to_string())
}

fn ui_settings_file_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("config").join("settings.json")
}

fn validate_online_sources(sources: &[OnlineSourceSetting]) -> Result<(), String> {
    let mut ids = HashSet::new();
    for source in sources {
        if source.id.trim().is_empty() || !ids.insert(source.id.trim().to_string()) {
            return Err("Every online source must have a unique non-empty id".to_string());
        }
        if source.label.trim().is_empty() {
            return Err(format!("Online source {} needs a name", source.id));
        }
        let url = Url::parse(source.base_url.trim())
            .map_err(|err| format!("Invalid URL for {}: {err}", source.label))?;
        if !matches!(url.scheme(), "http" | "https") {
            return Err(format!("{} must use an HTTP or HTTPS URL", source.label));
        }
        if !matches!(source.resource_type.as_str(), "lyrics" | "music") {
            return Err(format!("Unsupported resource type for {}", source.label));
        }
        if !matches!(source.provider_type.as_str(), "lrclib" | "netease") {
            return Err(format!("Unsupported API protocol for {}", source.label));
        }
        if source.resource_type == "music" && source.provider_type != "netease" {
            return Err(format!(
                "{} cannot use LRCLIB for music search",
                source.label
            ));
        }
    }
    Ok(())
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

    let fingerprint = format!("sha256:{}", sha256_file(Path::new(path))?);

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

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|err| err.to_string())?;
    let mut hasher = Sha256::new();
    // Keep the block buffer on the heap. A 1 MiB stack array overflows the
    // Windows/Tauri command thread stack and terminates the process with
    // 0xc00000fd before the scanner can return a normal file error.
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|err| err.to_string())?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn sha256_text(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn read_local_lyrics(track: &Track, app_data_dir: &Path) -> Option<LyricsData> {
    if track.source_kind != "local_file" {
        return None;
    }

    let lyric_path = track.lyric_ref.clone().or_else(|| {
        find_local_lrc(&track.source_locator).map(|path| path.to_string_lossy().to_string())
    })?;

    let path = resolve_lyrics_reference(app_data_dir, &lyric_path);
    let source = lyrics_storage_reference(app_data_dir, &path);
    let content = fs::read_to_string(&path).ok()?;
    Some(lyrics_from_text(&source, content))
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
        .next_back()
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
        } else {
            window.hide().map_err(|err| err.to_string())?;
        }
    }

    let mut snapshot = state
        .playback_snapshot
        .lock()
        .map_err(|err| err.to_string())?;
    snapshot.lyrics_window_visible = visible;
    app.emit("desktopLyrics:visibility", visible)
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn set_desktop_lyrics_lock_state(
    app: &AppHandle,
    state: &tauri::State<'_, AppState>,
    locked: bool,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("desktop-lyrics") {
        window.set_shadow(!locked).map_err(|err| err.to_string())?;
        window
            .set_ignore_cursor_events(locked)
            .map_err(|err| err.to_string())?;
    }

    let snapshot = {
        let mut snapshot = state
            .playback_snapshot
            .lock()
            .map_err(|err| err.to_string())?;
        snapshot.desktop_lyrics_locked = locked;
        snapshot.clone()
    };
    {
        let db = state.db.lock().map_err(|err| err.to_string())?;
        db.save_session("playback_session", &snapshot)?;
    }
    app.emit("desktopLyrics:lock", locked)
        .map_err(|err| err.to_string())?;
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

    WebviewWindowBuilder::new(
        app,
        "desktop-lyrics",
        WebviewUrl::App("index.html?window=desktop-lyrics".into()),
    )
    .title("AlsoMusicPlayer Lyrics")
    .transparent(true)
    .decorations(false)
    .shadow(false)
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
        .icon(
            app.default_window_icon()
                .cloned()
                .ok_or_else(|| "application icon is unavailable".to_string())?,
        )
        .tooltip("AlsoMusicPlayer")
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

    let auto_lyrics_scope = match settings.auto_lyrics_scope.as_str() {
        "playing" | "library" | "playlists" => settings.auto_lyrics_scope,
        _ => "off".to_string(),
    };
    let mut auto_lyrics_playlist_ids = settings
        .auto_lyrics_playlist_ids
        .into_iter()
        .filter(|id| *id > 0)
        .collect::<Vec<_>>();
    auto_lyrics_playlist_ids.sort_unstable();
    auto_lyrics_playlist_ids.dedup();
    let online_sources = settings
        .online_sources
        .into_iter()
        .enumerate()
        .filter_map(|(index, source)| normalize_online_source(source, index))
        .collect();

    UiSettings {
        language_preference,
        resolved_language,
        auto_lyrics_scope,
        auto_lyrics_playlist_ids,
        online_sources,
    }
}

fn normalize_online_source(
    mut source: OnlineSourceSetting,
    index: usize,
) -> Option<OnlineSourceSetting> {
    source.label = source.label.trim().to_string();
    source.base_url = source.base_url.trim().trim_end_matches('/').to_string();
    if source.label.is_empty() || source.base_url.is_empty() {
        return None;
    }
    Url::parse(&source.base_url)
        .ok()
        .filter(|url| matches!(url.scheme(), "http" | "https"))?;
    if !matches!(source.resource_type.as_str(), "lyrics" | "music") {
        source.resource_type = "lyrics".to_string();
    }
    if !matches!(source.provider_type.as_str(), "lrclib" | "netease") {
        return None;
    }
    if source.id.trim().is_empty() {
        source.id = format!(
            "custom-{}",
            &sha256_text(&format!("{}\0{}\0{index}", source.label, source.base_url))[..12]
        );
    }
    source.priority = source.priority.max(0);
    Some(source)
}

fn effective_language(settings: &UiSettings) -> &'static str {
    match settings.language_preference.as_str() {
        "zh-CN" => "zh-CN",
        "en-US" => "en-US",
        _ if settings.resolved_language == "zh-CN" => "zh-CN",
        _ => "en-US",
    }
}

fn resolve_storage_paths(app: &AppHandle) -> Result<StoragePaths, String> {
    let system_app_data_dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    let system_database_path = AppDatabase::database_path(&system_app_data_dir);

    let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
    else {
        return Ok(StoragePaths {
            app_data_dir: system_app_data_dir.clone(),
            database_path: system_database_path.clone(),
            startup_diagnostics: StartupDiagnostics {
                storage_mode: "system".to_string(),
                app_data_dir: system_app_data_dir.to_string_lossy().to_string(),
                database_path: system_database_path.to_string_lossy().to_string(),
                portable_root: None,
                portable_marker_path: None,
                recovered_session_keys: Vec::new(),
                warnings: Vec::new(),
            },
        });
    };

    let marker_path = exe_dir.join(PORTABLE_MARKER_FILE);
    if !marker_path.exists() {
        return Ok(StoragePaths {
            app_data_dir: system_app_data_dir.clone(),
            database_path: system_database_path.clone(),
            startup_diagnostics: StartupDiagnostics {
                storage_mode: "system".to_string(),
                app_data_dir: system_app_data_dir.to_string_lossy().to_string(),
                database_path: system_database_path.to_string_lossy().to_string(),
                portable_root: None,
                portable_marker_path: None,
                recovered_session_keys: Vec::new(),
                warnings: Vec::new(),
            },
        });
    }

    let mut warnings = Vec::new();
    let config = match fs::read_to_string(&marker_path) {
        Ok(raw) => match serde_json::from_str::<PortableConfig>(&raw) {
            Ok(parsed) => parsed,
            Err(err) => {
                warnings.push(format!(
                    "Portable marker parse failed, falling back to '{DEFAULT_PORTABLE_DATA_DIR}': {err}"
                ));
                PortableConfig::default()
            }
        },
        Err(err) => {
            warnings.push(format!(
                "Portable marker could not be read, falling back to '{DEFAULT_PORTABLE_DATA_DIR}': {err}"
            ));
            PortableConfig::default()
        }
    };

    let app_data_dir = resolve_portable_data_dir(&exe_dir, &config.data_dir);
    let database_path = AppDatabase::database_path(&app_data_dir);

    Ok(StoragePaths {
        app_data_dir: app_data_dir.clone(),
        database_path: database_path.clone(),
        startup_diagnostics: StartupDiagnostics {
            storage_mode: "portable".to_string(),
            app_data_dir: app_data_dir.to_string_lossy().to_string(),
            database_path: database_path.to_string_lossy().to_string(),
            portable_root: Some(exe_dir.to_string_lossy().to_string()),
            portable_marker_path: Some(marker_path.to_string_lossy().to_string()),
            recovered_session_keys: Vec::new(),
            warnings,
        },
    })
}

fn resolve_portable_data_dir(exe_dir: &Path, configured_data_dir: &str) -> PathBuf {
    let trimmed = configured_data_dir.trim();
    if trimmed.is_empty() {
        return exe_dir.join(DEFAULT_PORTABLE_DATA_DIR);
    }

    let configured_path = PathBuf::from(trimmed);
    if configured_path.is_absolute() {
        configured_path
    } else {
        exe_dir.join(configured_path)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let storage_paths = resolve_storage_paths(app.handle())?;
            let app_data_dir = storage_paths.app_data_dir;
            let database_path = storage_paths.database_path;
            let mut startup_diagnostics = storage_paths.startup_diagnostics;
            fs::create_dir_all(&app_data_dir).map_err(|err| err.to_string())?;

            let database = AppDatabase::open(&database_path)?;
            let playback_session =
                database.load_session_resilient::<PlaybackSnapshot>("playback_session")?;
            let desktop_lyrics_session = database
                .load_session_resilient::<DesktopLyricsSnapshot>("desktop_lyrics_snapshot")?;
            let ui_settings_session =
                database.load_session_resilient::<UiSettings>("ui_settings")?;

            let mut recovered_session_keys = Vec::new();
            if playback_session.recovered {
                recovered_session_keys.push("playback_session".to_string());
            }
            if desktop_lyrics_session.recovered {
                recovered_session_keys.push("desktop_lyrics_snapshot".to_string());
            }
            if ui_settings_session.recovered {
                recovered_session_keys.push("ui_settings".to_string());
            }

            recovered_session_keys.sort();
            recovered_session_keys.dedup();
            for key in &recovered_session_keys {
                startup_diagnostics
                    .warnings
                    .push(format!("Reset invalid startup session data for {key}."));
            }
            startup_diagnostics.recovered_session_keys = recovered_session_keys;

            let stored_ui_settings =
                normalize_ui_settings(ui_settings_session.value.unwrap_or_default());
            let ui_settings = match read_ui_settings_config(&app_data_dir) {
                Ok(Some(settings)) => match validate_online_sources(&settings.online_sources) {
                    Ok(()) => {
                        let normalized = normalize_ui_settings(settings);
                        write_ui_settings_config(&app_data_dir, &normalized)?;
                        normalized
                    }
                    Err(error) => {
                        startup_diagnostics.warnings.push(format!(
                            "Ignored invalid settings config {}: {error}",
                            ui_settings_file_path(&app_data_dir).display()
                        ));
                        stored_ui_settings
                    }
                },
                Ok(None) => {
                    write_ui_settings_config(&app_data_dir, &stored_ui_settings)?;
                    stored_ui_settings
                }
                Err(error) => {
                    startup_diagnostics.warnings.push(error);
                    stored_ui_settings
                }
            };
            database.save_session("ui_settings", &ui_settings)?;

            app.manage(AppState {
                app_data_dir: app_data_dir.clone(),
                startup_diagnostics,
                db: Mutex::new(database),
                desktop_snapshot: Mutex::new(desktop_lyrics_session.value.unwrap_or_default()),
                playback_snapshot: Mutex::new(playback_session.value.unwrap_or_default()),
                ui_settings: Mutex::new(ui_settings),
            });

            create_desktop_window(app.handle())?;
            {
                let state = app.state::<AppState>();
                let locked = state
                    .playback_snapshot
                    .lock()
                    .map_err(|err| err.to_string())?
                    .desktop_lyrics_locked;
                set_desktop_lyrics_lock_state(app.handle(), &state, locked)?;
            }
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
            lyrics_file_path,
            lyrics_reveal_file,
            session_load,
            session_save,
            playback_broadcast,
            desktop_lyrics_toggle,
            desktop_lyrics_set_visible,
            desktop_lyrics_lock_toggle,
            desktop_lyrics_lock_get,
            desktop_lyrics_push,
            desktop_lyrics_get,
            player_transport,
            shortcuts_load,
            shortcuts_save,
            shortcuts_config_path,
            shortcuts_reveal_config,
            settings_save,
            settings_load,
            settings_config_path,
            settings_reveal_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running AlsoMusicPlayer");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_app_data_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("also-music-player-{name}-{timestamp}"))
    }

    fn test_track(digest: &str) -> Track {
        Track {
            id: 42,
            title: "A title that can change".to_string(),
            artist: "Artist".to_string(),
            album: "Album".to_string(),
            composer: String::new(),
            duration: 123.0,
            source_kind: "local_file".to_string(),
            source_locator: "music/original.flac".to_string(),
            resolver_id: None,
            availability: "available".to_string(),
            fingerprint: format!("sha256:{digest}"),
            format: "FLAC".to_string(),
            bitrate: 0,
            sample_rate: 0,
            channels: 0,
            artwork_ref: None,
            lyric_ref: None,
            has_overrides: false,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn resolve_portable_data_dir_defaults_to_exe_relative_data() {
        let exe_dir = Path::new("portable-root");
        let resolved = resolve_portable_data_dir(exe_dir, "");

        assert_eq!(resolved, exe_dir.join(DEFAULT_PORTABLE_DATA_DIR));
    }

    #[test]
    fn resolve_portable_data_dir_keeps_absolute_override() {
        let exe_dir = Path::new("portable-root");
        let absolute = std::env::temp_dir().join("amp-portable-override");
        let configured = absolute.to_string_lossy().to_string();
        let resolved = resolve_portable_data_dir(exe_dir, &configured);

        assert_eq!(resolved, absolute);
    }

    #[test]
    fn managed_lyrics_references_are_relative_to_app_data() {
        let app_data_dir = Path::new("portable-root").join("data");
        let lyrics_path = app_data_dir.join("lyrics").join("42-example.lrc");
        let reference = lyrics_storage_reference(&app_data_dir, &lyrics_path);

        assert_eq!(
            reference,
            Path::new("lyrics").join("42-example.lrc").to_string_lossy()
        );
        assert_eq!(
            resolve_lyrics_reference(&app_data_dir, &reference),
            lyrics_path
        );
    }

    #[test]
    fn external_lyrics_references_remain_absolute() {
        let app_data_dir = Path::new("portable-root").join("data");
        let lyrics_path = std::env::temp_dir().join("also-music-player-external.lrc");
        let reference = lyrics_storage_reference(&app_data_dir, &lyrics_path);

        assert_eq!(reference, lyrics_path.to_string_lossy());
        assert_eq!(
            resolve_lyrics_reference(&app_data_dir, &reference),
            lyrics_path
        );
    }

    #[test]
    fn sha256_text_matches_the_standard_digest() {
        assert_eq!(
            sha256_text("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn sha256_file_streams_safely_on_a_small_scanner_stack() {
        let app_data_dir = temp_app_data_dir("hash-stack");
        fs::create_dir_all(&app_data_dir).expect("create hash test directory");
        let path = app_data_dir.join("sample.bin");
        let content = vec![0x2a_u8; 192 * 1024];
        fs::write(&path, &content).expect("write hash test file");
        let expected = format!("{:x}", Sha256::digest(&content));

        let worker_path = path.clone();
        let actual = std::thread::Builder::new()
            .name("small-stack-hash-test".to_string())
            .stack_size(256 * 1024)
            .spawn(move || sha256_file(&worker_path).expect("hash file"))
            .expect("spawn small-stack worker")
            .join()
            .expect("small-stack worker completes");

        assert_eq!(actual, expected);
        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn managed_lyrics_filename_uses_only_the_track_fingerprint() {
        let track = test_track(&"a".repeat(64));
        let app_data_dir = Path::new("portable-root").join("data");

        assert_eq!(
            managed_lyrics_path(&app_data_dir, &track),
            app_data_dir
                .join("lyrics")
                .join(format!("{}.lrc", "a".repeat(64)))
        );
    }

    #[test]
    fn legacy_managed_lyrics_are_moved_to_the_hash_filename() {
        let app_data_dir = temp_app_data_dir("lyrics-migration");
        let track = test_track(&"b".repeat(64));
        let lyrics_dir = app_data_dir.join("lyrics");
        let legacy_path = lyrics_dir.join("42-old-title.lrc");
        fs::create_dir_all(&lyrics_dir).expect("create lyrics directory");
        fs::write(&legacy_path, "[00:01.00]line").expect("write legacy lyrics");

        let migrated = migrate_managed_lyrics_file(&app_data_dir, &track, legacy_path.clone())
            .expect("migrate lyrics");

        assert_eq!(migrated, managed_lyrics_path(&app_data_dir, &track));
        assert!(!legacy_path.exists());
        assert_eq!(
            fs::read_to_string(&migrated).expect("read migrated lyrics"),
            "[00:01.00]line"
        );

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn player_settings_config_round_trips_auto_scope_and_source_priority() {
        let app_data_dir = temp_app_data_dir("settings");
        let mut settings = UiSettings {
            auto_lyrics_scope: "library".to_string(),
            ..UiSettings::default()
        };
        settings.online_sources[0].priority = 3;

        write_ui_settings_config(&app_data_dir, &settings).expect("write settings config");
        let loaded = read_ui_settings_config(&app_data_dir)
            .expect("read settings config")
            .expect("settings config exists");

        assert_eq!(loaded, settings);
        assert_eq!(
            ui_settings_file_path(&app_data_dir),
            app_data_dir.join("config").join("settings.json")
        );

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn online_source_validation_rejects_incompatible_music_protocol() {
        let source = OnlineSourceSetting {
            id: "bad-music-source".to_string(),
            label: "Bad music source".to_string(),
            resource_type: "music".to_string(),
            provider_type: "lrclib".to_string(),
            base_url: "https://example.test/api".to_string(),
            enabled: true,
            priority: 10,
        };

        assert!(validate_online_sources(&[source]).is_err());
    }

    #[test]
    fn legacy_shortcut_config_defaults_desktop_lyrics_lock_to_unbound() {
        let shortcuts: ShortcutSettings = serde_json::from_value(json!({
            "togglePlayPause": "Space",
            "nextTrack": "Ctrl+Right",
            "previousTrack": "Ctrl+Left",
            "toggleDesktopLyrics": "Ctrl+L"
        }))
        .expect("deserialize legacy shortcuts");

        assert!(shortcuts.toggle_desktop_lyrics_lock.is_empty());
        assert!(ShortcutSettings::default()
            .toggle_desktop_lyrics_lock
            .is_empty());
    }

    #[test]
    fn lyrics_search_prefers_timed_duration_match_over_first_plain_result() {
        let rows = vec![
            json!({
                "trackName": "ナイショの話 -2017-",
                "artistName": "ClariS",
                "albumName": "ClariS 10th Anniversary BEST",
                "duration": 259.0,
                "plainLyrics": "plain only",
                "syncedLyrics": null
            }),
            json!({
                "trackName": "ナイショの話",
                "artistName": "ClariS",
                "albumName": "ClariS 10th Anniversary BEST",
                "duration": 259.4,
                "plainLyrics": "timed",
                "syncedLyrics": "[00:12.00]timed"
            }),
        ];

        let selected = select_best_lyrics_result(
            &rows,
            "ナイショの話 -2017-",
            "ClariS",
            "ClariS 10th Anniversary BEST",
            259.0,
        )
        .expect("a lyrics result should be selected");

        assert_eq!(value_text(&selected, "syncedLyrics"), "[00:12.00]timed");
    }
}
