import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview, type DragDropEvent } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type {
  DesktopLyricsSnapshot,
  LibraryBootstrap,
  LyricsData,
  PlaybackSnapshot,
  Playlist,
  UiSettings,
  ResolverSearchResult,
  Track,
  TrackOverrideInput,
} from '@core';

export interface ScanSummary {
  added: number;
  updated: number;
  missing: number;
  errors: string[];
}

export interface ShortcutSettings {
  togglePlayPause: string;
  nextTrack: string;
  previousTrack: string;
  toggleDesktopLyrics: string;
}

export interface ShortcutCapabilities {
  globalSupported: boolean;
  desktopSupported: boolean;
}

export interface DirectUrlInput {
  url: string;
  title?: string;
  artist?: string;
  album?: string;
  composer?: string;
  duration?: number;
}

export interface ResolverTrackInput {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
}

export interface ScanProgressEvent {
  current: number;
  total: number;
  path: string;
}

export type TransportAction =
  | 'toggle'
  | 'next'
  | 'previous'
  | 'toggle-desktop-lyrics';

export const commands = {
  bootstrap: () => invoke<LibraryBootstrap>('library_bootstrap'),
  pickFolders: () => invoke<string[]>('library_pick_folders'),
  pickFiles: () => invoke<string[]>('library_pick_files'),
  scanPaths: (paths: string[], rememberRoot = false) =>
    invoke<ScanSummary>('library_scan_paths', { paths, rememberRoot }),
  refreshLibrary: () => invoke<ScanSummary>('library_refresh'),
  removeTrack: (trackId: number) => invoke<void>('library_remove_track', { trackId }),
  revealTrack: (trackId: number) => invoke<void>('library_reveal_track', { trackId }),
  addDirectUrl: (input: DirectUrlInput) => invoke<Track>('library_add_direct_url', { input }),
  searchNetease: (query: string) =>
    invoke<ResolverSearchResult[]>('resolver_search_netease', { query }),
  addResolverTrack: (input: ResolverTrackInput) =>
    invoke<Track>('resolver_add_track', { input }),
  resolvePlaybackSource: (trackId: number) =>
    invoke<string>('resolve_playback_source', { trackId }),
  createPlaylist: (name: string) => invoke<Playlist>('playlist_create', { name }),
  renamePlaylist: (playlistId: number, name: string) =>
    invoke<void>('playlist_rename', { playlistId, name }),
  deletePlaylist: (playlistId: number) => invoke<void>('playlist_delete', { playlistId }),
  playlistTracks: (playlistId: number) =>
    invoke<Track[]>('playlist_tracks', { playlistId }),
  addTracksToPlaylist: (playlistId: number, trackIds: number[]) =>
    invoke<void>('playlist_add_tracks', { playlistId, trackIds }),
  removeTracksFromPlaylist: (playlistId: number, trackIds: number[]) =>
    invoke<void>('playlist_remove_tracks', { playlistId, trackIds }),
  getOverride: (trackId: number) =>
    invoke<TrackOverrideInput | null>('track_override_get', { trackId }),
  saveOverride: (input: TrackOverrideInput) =>
    invoke<Track>('track_override_save', { input }),
  getLyrics: (trackId: number) => invoke<LyricsData | null>('lyrics_get', { trackId }),
  searchLyricsOnline: (trackId: number) =>
    invoke<LyricsData | null>('lyrics_search_online', { trackId }),
  loadSession: () => invoke<PlaybackSnapshot>('session_load'),
  saveSession: (snapshot: PlaybackSnapshot) => invoke<void>('session_save', { snapshot }),
  broadcastPlayback: (snapshot: PlaybackSnapshot) =>
    invoke<void>('playback_broadcast', { snapshot }),
  toggleDesktopLyrics: () => invoke<boolean>('desktop_lyrics_toggle'),
  setDesktopLyricsVisible: (visible: boolean) =>
    invoke<void>('desktop_lyrics_set_visible', { visible }),
  pushDesktopLyrics: (snapshot: DesktopLyricsSnapshot) =>
    invoke<void>('desktop_lyrics_push', { snapshot }),
  transport: (action: TransportAction) => invoke<void>('player_transport', { action }),
  loadShortcuts: () => invoke<ShortcutSettings>('shortcuts_load'),
  saveShortcuts: (settings: ShortcutSettings) =>
    invoke<ShortcutCapabilities>('shortcuts_save', { settings }),
  saveSettings: (settings: UiSettings) => invoke<UiSettings>('settings_save', { settings }),
};

export function toWebAssetSource(locator: string): string {
  if (/^https?:\/\//i.test(locator)) {
    return locator;
  }
  return convertFileSrc(locator);
}

export function getPlayableSource(locator: string): string {
  return toWebAssetSource(locator);
}

export function currentWindowLabel(): string {
  return getCurrentWindow().label;
}

export async function listenEvent<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  return listen<T>(event, ({ payload }) => {
    handler(payload);
  });
}

export async function attachDragDrop(
  onDrop: (paths: string[]) => void,
  onDragState?: (dragging: boolean) => void,
): Promise<() => void> {
  try {
    const webview = getCurrentWebview();
    return await webview.onDragDropEvent((event: { payload: DragDropEvent }) => {
      const payload = event.payload as
        | { type: 'enter' | 'leave' | 'over' }
        | { type: 'drop'; paths: string[] };

      if (payload.type === 'enter' || payload.type === 'over') {
        onDragState?.(true);
        return;
      }

      if (payload.type === 'leave') {
        onDragState?.(false);
        return;
      }

      if (payload.type === 'drop') {
        onDragState?.(false);
        onDrop(payload.paths || []);
      }
    });
  } catch {
    return () => {};
  }
}
