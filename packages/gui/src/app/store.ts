import { create } from 'zustand';
import type {
  LibraryBootstrap,
  LibraryRoot,
  LyricsData,
  PlaybackMode,
  PlaybackSnapshot,
  PlaybackState,
  Playlist,
  ResolvedUiLanguage,
  ResolverSearchResult,
  StartupDiagnostics,
  Track,
  TrackOverrideInput,
  UiSettings,
} from '@core';
import { normalizePlaybackSnapshot, normalizeUiSettings, reconcilePlaybackSnapshot } from '@core';
import { DEFAULT_SHORTCUTS } from './shortcuts';
import { commands, type ScanSummary, type ShortcutSettings } from './tauri';

export type ViewId = 'library' | 'playlists' | 'queue' | 'lyrics' | 'settings';

export interface PlaybackViewState {
  audioState: PlaybackState;
  currentTrackId: number | null;
  queue: number[];
  currentIndex: number;
  positionMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  mode: PlaybackMode;
  lyricsWindowVisible: boolean;
  desktopLyricsLocked: boolean;
}

interface AppStore {
  ready: boolean;
  bootstrapping: boolean;
  view: ViewId;
  search: string;
  tracks: Track[];
  playlists: Playlist[];
  roots: LibraryRoot[];
  playlistTracks: Record<number, Track[]>;
  desktopLyricsSupported: boolean;
  shortcuts: ShortcutSettings | null;
  uiSettings: UiSettings;
  startup: StartupDiagnostics | null;
  startupError: string | null;
  statusMessage: string | null;
  statusTone: 'info' | 'error';
  scanSummary: ScanSummary | null;
  scanProgress: { current: number; total: number; path: string } | null;
  addSourceOpen: boolean;
  editTrackId: number | null;
  addToPlaylistTrackId: number | null;
  activePlaylistId: number | null;
  lyricsByTrackId: Record<number, LyricsData | null>;
  playback: PlaybackViewState;
  restoredSession: PlaybackSnapshot | null;
  dragImportActive: boolean;
  bootstrap: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  setView: (view: ViewId) => void;
  setSearch: (search: string) => void;
  setStatus: (message: string | null, tone?: 'info' | 'error') => void;
  setScanProgress: (payload: { current: number; total: number; path: string } | null) => void;
  setScanSummary: (summary: ScanSummary | null) => void;
  setDragImportActive: (value: boolean) => void;
  openAddSource: () => void;
  closeAddSource: () => void;
  openEditTrack: (trackId: number) => void;
  closeEditTrack: () => void;
  openAddToPlaylist: (trackId: number) => void;
  closeAddToPlaylist: () => void;
  setActivePlaylist: (playlistId: number | null) => Promise<void>;
  createPlaylist: (name: string) => Promise<void>;
  renamePlaylist: (playlistId: number, name: string) => Promise<void>;
  deletePlaylist: (playlistId: number) => Promise<void>;
  addTrackToPlaylist: (playlistId: number, trackId: number) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: number, trackId: number) => Promise<void>;
  loadLyrics: (trackId: number, forceOnline?: boolean) => Promise<LyricsData | null>;
  applyPlaybackPatch: (patch: Partial<PlaybackViewState>) => void;
  resetQueueFromSession: (session: PlaybackSnapshot) => void;
  saveOverride: (input: TrackOverrideInput) => Promise<Track>;
  setShortcutSettings: (settings: ShortcutSettings) => void;
  saveUiSettings: (settings: UiSettings) => Promise<void>;
  setUiSettings: (settings: UiSettings) => void;
}

const initialPlayback: PlaybackViewState = {
  audioState: 'stopped' as PlaybackState,
  currentTrackId: null,
  queue: [],
  currentIndex: -1,
  positionMs: 0,
  durationMs: 0,
  volume: 80,
  muted: false,
  mode: 'sequential' as PlaybackMode,
  lyricsWindowVisible: false,
  desktopLyricsLocked: false,
};

export const useAppStore = create<AppStore>((set, get) => ({
  ready: false,
  bootstrapping: false,
  view: 'library',
  search: '',
  tracks: [],
  playlists: [],
  roots: [],
  playlistTracks: {},
  desktopLyricsSupported: false,
  shortcuts: null,
  uiSettings: normalizeUiSettings(),
  startup: null,
  startupError: null,
  statusMessage: null,
  statusTone: 'info',
  scanSummary: null,
  scanProgress: null,
  addSourceOpen: false,
  editTrackId: null,
  addToPlaylistTrackId: null,
  activePlaylistId: null,
  lyricsByTrackId: {},
  playback: initialPlayback,
  restoredSession: null,
  dragImportActive: false,

  async bootstrap() {
    set({ bootstrapping: true, startupError: null });
    try {
      const [bootstrap, shortcuts] = await Promise.all([
        commands.bootstrap(),
        commands.loadShortcuts().catch(() => DEFAULT_SHORTCUTS),
      ]);
      const session = reconcilePlaybackSnapshot(
        normalizePlaybackSnapshot(bootstrap.session),
        bootstrap.tracks.map(track => track.id),
      );
      const defaultQueue = session.queue.length > 0
        ? session.queue
        : bootstrap.tracks.map(track => track.id);
      const restoredSession: PlaybackSnapshot = {
        ...session,
        queue: defaultQueue,
        currentIndex: session.currentTrackId === null
          ? -1
          : defaultQueue.indexOf(session.currentTrackId),
      };
      const uiSettings = normalizeUiSettings(bootstrap.uiSettings);
      const startupMessage = formatStartupRecoveryMessage(
        bootstrap.startup,
        uiSettings.resolvedLanguage,
      );
      set({
        ready: true,
        bootstrapping: false,
        tracks: bootstrap.tracks,
        playlists: bootstrap.playlists,
        roots: bootstrap.roots,
        desktopLyricsSupported: bootstrap.desktopLyricsSupported,
        restoredSession,
        shortcuts,
        uiSettings,
        startup: bootstrap.startup,
        startupError: null,
        statusMessage: startupMessage,
        statusTone: startupMessage ? 'info' : 'info',
        playback: {
          ...initialPlayback,
          currentTrackId: restoredSession.currentTrackId,
          queue: restoredSession.queue,
          currentIndex: restoredSession.currentIndex,
          audioState: restoredSession.currentTrackId ? ('paused' as PlaybackState) : initialPlayback.audioState,
          volume: restoredSession.volume,
          muted: restoredSession.muted,
          mode: restoredSession.mode,
          positionMs: restoredSession.positionMs,
          durationMs: restoredSession.durationMs,
          lyricsWindowVisible: restoredSession.lyricsWindowVisible,
          desktopLyricsLocked: restoredSession.desktopLyricsLocked,
        },
      });
    } catch (error) {
      set({
        ready: false,
        bootstrapping: false,
        startupError: formatError(error),
        statusMessage: formatError(error),
        statusTone: 'error',
      });
    }
  },

  async refreshBootstrap() {
    const bootstrap = await commands.bootstrap();
    const uiSettings = normalizeUiSettings(bootstrap.uiSettings);
    const startupMessage = formatStartupRecoveryMessage(
      bootstrap.startup,
      uiSettings.resolvedLanguage,
    );
    set(state => ({
      tracks: bootstrap.tracks,
      playlists: bootstrap.playlists,
      roots: bootstrap.roots,
      desktopLyricsSupported: bootstrap.desktopLyricsSupported,
      uiSettings,
      startup: bootstrap.startup,
      startupError: null,
      statusMessage: startupMessage ?? state.statusMessage,
      statusTone: startupMessage ? 'info' : state.statusTone,
      playback: state.playback.queue.length === 0 && state.playback.currentTrackId === null
        ? {
            ...state.playback,
            queue: bootstrap.tracks.map(track => track.id),
            currentIndex: -1,
          }
        : state.playback,
      playlistTracks: Object.fromEntries(
        Object.entries(state.playlistTracks).filter(([playlistId]) =>
          bootstrap.playlists.some(playlist => playlist.id === Number(playlistId)),
        ),
      ),
    }));

    if (get().activePlaylistId) {
      await get().setActivePlaylist(get().activePlaylistId);
    }
  },

  setView(view) {
    set({ view });
  },

  setSearch(search) {
    set({ search });
  },

  setStatus(message, tone = 'info') {
    set({ statusMessage: message, statusTone: tone });
  },

  setScanProgress(payload) {
    set({ scanProgress: payload });
  },

  setScanSummary(summary) {
    set({ scanSummary: summary });
  },

  setDragImportActive(value) {
    set({ dragImportActive: value });
  },

  openAddSource() {
    set({ addSourceOpen: true });
  },

  closeAddSource() {
    set({ addSourceOpen: false });
  },

  openEditTrack(trackId) {
    set({ editTrackId: trackId });
  },

  closeEditTrack() {
    set({ editTrackId: null });
  },

  openAddToPlaylist(trackId) {
    set({ addToPlaylistTrackId: trackId });
  },

  closeAddToPlaylist() {
    set({ addToPlaylistTrackId: null });
  },

  async setActivePlaylist(playlistId) {
    set({ activePlaylistId: playlistId });
    if (!playlistId) {
      return;
    }
    const tracks = await commands.playlistTracks(playlistId);
    set(state => ({
      playlistTracks: {
        ...state.playlistTracks,
        [playlistId]: tracks,
      },
    }));
  },

  async createPlaylist(name) {
    if (!name.trim()) {
      return;
    }
    await commands.createPlaylist(name.trim());
    await get().refreshBootstrap();
  },

  async renamePlaylist(playlistId, name) {
    if (!name.trim()) {
      return;
    }
    await commands.renamePlaylist(playlistId, name.trim());
    await get().refreshBootstrap();
  },

  async deletePlaylist(playlistId) {
    await commands.deletePlaylist(playlistId);
    if (get().activePlaylistId === playlistId) {
      set({ activePlaylistId: null });
    }
    await get().refreshBootstrap();
  },

  async addTrackToPlaylist(playlistId, trackId) {
    await commands.addTracksToPlaylist(playlistId, [trackId]);
    await get().refreshBootstrap();
    await get().setActivePlaylist(playlistId);
  },

  async removeTrackFromPlaylist(playlistId, trackId) {
    await commands.removeTracksFromPlaylist(playlistId, [trackId]);
    await get().refreshBootstrap();
    await get().setActivePlaylist(playlistId);
  },

  async loadLyrics(trackId, forceOnline = false) {
    const data = forceOnline
      ? await commands.searchLyricsOnline(trackId)
      : await commands.getLyrics(trackId);
    set(state => {
      if (JSON.stringify(state.lyricsByTrackId[trackId] ?? null) === JSON.stringify(data)) {
        return state;
      }
      return {
        lyricsByTrackId: {
          ...state.lyricsByTrackId,
          [trackId]: data,
        },
      };
    });
    return data;
  },

  applyPlaybackPatch(patch) {
    set(state => ({
      playback: {
        ...state.playback,
        ...patch,
      },
    }));
  },

  resetQueueFromSession(session) {
    set(state => ({
      playback: {
        ...state.playback,
        currentTrackId: session.currentTrackId,
        queue: session.queue,
        currentIndex: session.currentIndex,
        audioState: session.currentTrackId ? ('paused' as PlaybackState) : ('stopped' as PlaybackState),
        volume: session.volume,
        muted: session.muted,
        mode: session.mode,
        positionMs: session.positionMs,
        durationMs: session.durationMs,
        lyricsWindowVisible: session.lyricsWindowVisible,
        desktopLyricsLocked: session.desktopLyricsLocked,
      },
    }));
  },

  async saveOverride(input) {
    const track = await commands.saveOverride(input);
    await get().refreshBootstrap();
    set(state => ({
      lyricsByTrackId:
        input.lyricText !== undefined
          ? { ...state.lyricsByTrackId, [input.trackId]: null }
          : state.lyricsByTrackId,
    }));
    return track;
  },

  setShortcutSettings(settings) {
    set({ shortcuts: settings });
  },

  async saveUiSettings(settings) {
    const saved = await commands.saveSettings(settings);
    set({ uiSettings: normalizeUiSettings(saved) });
  },

  setUiSettings(settings) {
    set({ uiSettings: normalizeUiSettings(settings) });
  },
}));

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

function formatStartupRecoveryMessage(
  startup: StartupDiagnostics | null | undefined,
  language: ResolvedUiLanguage,
): string | null {
  if (!startup || startup.recoveredSessionKeys.length === 0) {
    return null;
  }

  if (language === 'zh-CN') {
    return `已自动恢复启动数据，重置了 ${startup.recoveredSessionKeys.join('、')}。`;
  }

  return `Recovered startup data: reset ${startup.recoveredSessionKeys.join(', ')}.`;
}
