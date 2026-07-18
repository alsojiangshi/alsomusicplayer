import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  formatDuration,
  LRCParser,
  resolveUiLanguage,
  type AutoLyricsScope,
  type LyricsData,
  type LyricLine,
  type OnlineSourceSetting,
  type PlaybackState,
  type Playlist,
  type ResolverSearchResult,
  type StartupDiagnostics,
  type Track,
  type UiLanguagePreference,
  type UiSettings,
} from '@core';
import DesktopLyricsWindow from './DesktopLyricsWindow';
import {
  buildStrings,
  I18nProvider,
  type I18nStrings,
  useI18n,
} from './i18n';
import { playbackService } from './playback/PlaybackService';
import ResizeHandle from './ResizeHandle';
import {
  DEFAULT_SHORTCUTS,
  duplicateShortcuts,
  isTextEditingTarget,
  shortcutAction,
  shortcutFromKeyboardEvent,
} from './shortcuts';
import { useAppStore, type ViewId } from './store';
import { useResizable, useViewportWidth, type ResizableValue } from './useResizable';
import {
  attachDragDrop,
  commands,
  currentWindowLabel,
  listenEvent,
  toWebAssetSource,
  type DirectUrlInput,
  type ScanProgressEvent,
  type ShortcutSettings,
} from './tauri';

const SIDEBAR_DEFAULT = 268;
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 360;
const QUEUE_DEFAULT = 300;
const QUEUE_MIN = 260;
const QUEUE_MAX = 420;
const MAIN_MIN = 620;
const LAYOUT_HANDLE_SIZE = 12;
const QUEUE_DRAWER_BREAKPOINT = 1700;
const APP_ICON_URL = new URL('../../src-tauri/icons/icon.png', import.meta.url).href;

type QueueSource = 'library' | 'playlist';

interface TrackColumnSizing {
  title: ResizableValue;
  artist: ResizableValue;
  album: ResizableValue;
  labels: ReturnType<typeof resizableLayoutCopy>;
}

interface LyricsSearchState {
  status: 'idle' | 'searching' | 'success' | 'not-found' | 'error';
  message: string;
}

const TrackColumnSizingContext = createContext<TrackColumnSizing | null>(null);

export default function App() {
  if (currentWindowLabel() === 'desktop-lyrics') {
    return <DesktopLyricsWindow />;
  }

  return <MainApp />;
}

function MainApp() {
  const {
    ready,
    bootstrapping,
    view,
    search,
    tracks,
    playlists,
    roots,
    playback,
    activePlaylistId,
    playlistTracks,
    lyricsByTrackId,
    statusMessage,
    statusTone,
    scanProgress,
    addSourceOpen,
    editTrackId,
    addToPlaylistTrackId,
    desktopLyricsSupported,
    shortcuts,
    uiSettings,
    startup,
    startupError,
    dragImportActive,
    bootstrap,
    refreshBootstrap,
    setView,
    setSearch,
    setStatus,
    setScanProgress,
    setScanSummary,
    setDragImportActive,
    openAddSource,
    closeAddSource,
    openEditTrack,
    closeEditTrack,
    openAddToPlaylist,
    closeAddToPlaylist,
    setActivePlaylist,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    loadLyrics,
    setShortcutSettings,
    saveUiSettings,
    setUiSettings,
  } = useAppStore();

  const runtimeLanguages = useMemo(() => {
    if (typeof navigator === 'undefined') {
      return [] as string[];
    }
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
      return [...navigator.languages];
    }
    return navigator.language ? [navigator.language] : [];
  }, []);
  const strings = useMemo(
    () => buildStrings(uiSettings.resolvedLanguage),
    [uiSettings.resolvedLanguage],
  );
  const resizeCopy = useMemo(() => resizableLayoutCopy(strings.language), [strings.language]);
  const viewportWidth = useViewportWidth();
  const queueInline = viewportWidth > QUEUE_DRAWER_BREAKPOINT;
  const sidebarInline = viewportWidth > 900;
  const sidebarMaxForViewport = sidebarInline
    ? Math.min(
        SIDEBAR_MAX,
        viewportWidth
          - MAIN_MIN
          - LAYOUT_HANDLE_SIZE
          - (queueInline ? QUEUE_MIN + LAYOUT_HANDLE_SIZE : 0),
      )
    : Math.min(SIDEBAR_MAX, viewportWidth - 32);
  const sidebarSizing = useResizable({
    defaultValue: SIDEBAR_DEFAULT,
    min: SIDEBAR_MIN,
    max: sidebarMaxForViewport,
    storageKey: 'alsoMusicPlayer.layout.sidebarWidth',
  });
  const queueMaxForViewport = queueInline
    ? Math.min(
        QUEUE_MAX,
        viewportWidth
          - MAIN_MIN
          - sidebarSizing.value
          - LAYOUT_HANDLE_SIZE * 2,
      )
    : Math.min(QUEUE_MAX, viewportWidth - 32);
  const queueSizing = useResizable({
    defaultValue: QUEUE_DEFAULT,
    min: QUEUE_MIN,
    max: queueMaxForViewport,
    storageKey: 'alsoMusicPlayer.layout.queueWidth',
  });
  const titleColumnSizing = useResizable({
    defaultValue: 260,
    min: 140,
    max: 520,
    storageKey: 'alsoMusicPlayer.layout.titleColumnWidth',
  });
  const artistColumnSizing = useResizable({
    defaultValue: 160,
    min: 100,
    max: 320,
    storageKey: 'alsoMusicPlayer.layout.artistColumnWidth',
  });
  const albumColumnSizing = useResizable({
    defaultValue: 180,
    min: 100,
    max: 360,
    storageKey: 'alsoMusicPlayer.layout.albumColumnWidth',
  });
  const layoutStyle = {
    '--sidebar-width': `${sidebarSizing.value}px`,
    '--queue-width': `${queueSizing.value}px`,
    '--title-column-width': `${titleColumnSizing.value}px`,
    '--artist-column-width': `${artistColumnSizing.value}px`,
    '--album-column-width': `${albumColumnSizing.value}px`,
  } as CSSProperties;

  const currentTrack = useMemo(
    () => tracks.find(track => track.id === playback.currentTrackId) ?? null,
    [tracks, playback.currentTrackId],
  );
  const currentLyrics = currentTrack ? lyricsByTrackId[currentTrack.id] ?? null : null;
  const filteredTracks = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return tracks;
    }
    return tracks.filter(track =>
      [track.title, track.artist, track.album, track.composer, track.sourceLocator]
        .join('\n')
        .toLowerCase()
        .includes(keyword),
    );
  }, [search, tracks]);
  const activePlaylistTracks = activePlaylistId ? playlistTracks[activePlaylistId] ?? [] : [];
  const currentQueueTracks = useMemo(
    () =>
      playback.queue
        .map(trackId => tracks.find(track => track.id === trackId) ?? null)
        .filter((track): track is Track => Boolean(track)),
    [playback.queue, tracks],
  );
  const lastDesktopPayload = useRef('');
  const [showSlowBootHint, setShowSlowBootHint] = useState(false);
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const [queueSource, setQueueSource] = useState<QueueSource>('library');
  const [queuePlaylistId, setQueuePlaylistId] = useState<number | null>(null);
  const [queueSourceLoading, setQueueSourceLoading] = useState(false);
  const [shortcutConfigPath, setShortcutConfigPath] = useState('');
  const [settingsConfigPath, setSettingsConfigPath] = useState('');
  const [lyricsFilePath, setLyricsFilePath] = useState<string | null>(null);
  const [lyricsSearch, setLyricsSearch] = useState<LyricsSearchState>({
    status: 'idle',
    message: '',
  });
  const autoLyricsRunRef = useRef('');

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!bootstrapping || ready) {
      setShowSlowBootHint(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowSlowBootHint(true);
    }, 6000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [bootstrapping, ready]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarDrawerOpen(false);
        setQueueDrawerOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    if (!shortcuts) {
      return;
    }

    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isTextEditingTarget(event.target)) {
        return;
      }
      const shortcut = shortcutFromKeyboardEvent(event);
      const action = shortcut ? shortcutAction(shortcuts, shortcut) : null;
      if (!action) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void playbackService.handleTransport(action).catch(error => {
        setStatus(formatError(error, strings.common.unknownError), 'error');
      });
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [setStatus, shortcuts, strings.common.unknownError]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    let disposed = false;
    let lastError = '';
    const synchronizeShortcutConfig = async () => {
      try {
        const [nextSettings, path] = await Promise.all([
          commands.loadShortcuts(),
          commands.shortcutConfigPath(),
        ]);
        if (disposed) return;
        setShortcutConfigPath(path);
        if (JSON.stringify(nextSettings) !== JSON.stringify(useAppStore.getState().shortcuts)) {
          setShortcutSettings(nextSettings);
        }
        lastError = '';
      } catch (error) {
        const message = formatError(error, strings.common.unknownError);
        if (!disposed && message !== lastError) {
          lastError = message;
          setStatus(message, 'error');
        }
      }
    };

    void synchronizeShortcutConfig();
    const interval = window.setInterval(synchronizeShortcutConfig, 500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [ready, setShortcutSettings, setStatus, strings.common.unknownError]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    let disposed = false;
    let lastError = '';
    const synchronizeSettingsConfig = async () => {
      try {
        const [nextSettings, path] = await Promise.all([
          commands.loadSettings(),
          commands.settingsConfigPath(),
        ]);
        if (disposed) return;
        setSettingsConfigPath(path);
        if (JSON.stringify(nextSettings) !== JSON.stringify(useAppStore.getState().uiSettings)) {
          setUiSettings(nextSettings);
        }
        lastError = '';
      } catch (error) {
        const message = formatError(error, strings.common.unknownError);
        if (!disposed && message !== lastError) {
          lastError = message;
          setStatus(message, 'error');
        }
      }
    };

    void synchronizeSettingsConfig();
    const interval = window.setInterval(synchronizeSettingsConfig, 750);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [ready, setStatus, setUiSettings, strings.common.unknownError]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const resolvedLanguage = resolveUiLanguage(uiSettings.languagePreference, runtimeLanguages);
    if (resolvedLanguage === uiSettings.resolvedLanguage) {
      return;
    }

    void saveUiSettings({
      ...uiSettings,
      resolvedLanguage,
    }).catch(error => {
      setStatus(formatError(error, strings.common.unknownError), 'error');
    });
  }, [
    ready,
    runtimeLanguages,
    saveUiSettings,
    setStatus,
    strings.common.unknownError,
    uiSettings,
  ]);

  useEffect(() => {
    playbackService.setCatalog(tracks);
    if (ready && useAppStore.getState().restoredSession) {
      void playbackService.hydrate(useAppStore.getState().restoredSession!, tracks);
    }
  }, [ready, tracks]);

  useEffect(() => {
    if (currentTrack) {
      void loadLyrics(currentTrack.id);
    }
  }, [currentTrack?.id, loadLyrics]);

  useEffect(() => {
    setLyricsSearch({ status: 'idle', message: '' });
  }, [currentTrack?.id]);

  useEffect(() => {
    if (!currentTrack) {
      setLyricsFilePath(null);
      return;
    }

    let disposed = false;
    const refreshLyricsFile = async () => {
      try {
        const path = await commands.lyricsFilePath(currentTrack.id);
        if (!disposed) setLyricsFilePath(path);
      } catch {
        if (!disposed) setLyricsFilePath(null);
      }
    };
    void refreshLyricsFile();

    if (view !== 'lyrics' && !playback.lyricsWindowVisible) {
      return () => {
        disposed = true;
      };
    }

    const interval = window.setInterval(() => {
      void loadLyrics(currentTrack.id);
      void refreshLyricsFile();
    }, 1000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [currentTrack?.id, loadLyrics, playback.lyricsWindowVisible, view]);

  useEffect(() => {
    const scope = uiSettings.autoLyricsScope;
    if (scope === 'off') {
      autoLyricsRunRef.current = '';
      return;
    }
    const enabledLyricsSources = uiSettings.onlineSources.filter(
      source => source.enabled && source.resourceType === 'lyrics',
    );
    const runKey = JSON.stringify({
      scope,
      currentTrackId: scope === 'playing' ? currentTrack?.id ?? null : null,
      playlistIds: uiSettings.autoLyricsPlaylistIds,
      tracks: scope === 'library'
        ? tracks.map(track => [track.id, track.fingerprint])
        : undefined,
      playlists: scope === 'playlists'
        ? playlists.map(playlist => [playlist.id, playlist.songCount])
        : undefined,
      sources: enabledLyricsSources,
    });
    if (autoLyricsRunRef.current === runKey) {
      return;
    }
    autoLyricsRunRef.current = runKey;

    let disposed = false;
    void (async () => {
      if (enabledLyricsSources.length === 0) {
        setStatus(strings.status.autoLyricsNoSources, 'error');
        return;
      }

      let targets: Track[] = [];
      if (scope === 'playing') {
        targets = currentTrack ? [currentTrack] : [];
      } else if (scope === 'library') {
        targets = tracks;
      } else {
        const playlistTracks = await Promise.all(
          uiSettings.autoLyricsPlaylistIds.map(id => commands.playlistTracks(id).catch(() => [])),
        );
        const unique = new Map<number, Track>();
        playlistTracks.flat().forEach(track => unique.set(track.id, track));
        targets = Array.from(unique.values());
      }

      let found = 0;
      let failures = 0;
      let consecutiveFailures = 0;
      for (let index = 0; index < targets.length && !disposed; index += 1) {
        const track = targets[index];
        setStatus(strings.status.autoLyricsProgress(index + 1, targets.length, track.title));
        try {
          const existing = await commands.getLyrics(track.id);
          if (!existing) {
            const result = await commands.searchLyricsOnline(track.id);
            if (result) {
              found += 1;
              if (track.id === useAppStore.getState().playback.currentTrackId) {
                await loadLyrics(track.id);
              }
            }
            await new Promise(resolve => window.setTimeout(resolve, 250));
          }
          consecutiveFailures = 0;
        } catch {
          failures += 1;
          consecutiveFailures += 1;
          if (consecutiveFailures >= 3) {
            break;
          }
        }
      }
      if (!disposed && targets.length > 0) {
        setStatus(
          failures > 0
            ? strings.status.autoLyricsCompleteWithErrors(found, failures)
            : strings.status.autoLyricsComplete(found),
          failures > 0 ? 'error' : 'info',
        );
      }
    })().catch(error => {
      if (!disposed) {
        setStatus(formatError(error, strings.common.unknownError), 'error');
      }
    });

    return () => {
      disposed = true;
    };
  }, [
    currentTrack?.id,
    loadLyrics,
    playlists,
    setStatus,
    strings.common.unknownError,
    strings.status,
    tracks,
    uiSettings.autoLyricsPlaylistIds,
    uiSettings.autoLyricsScope,
    uiSettings.onlineSources,
  ]);

  useEffect(() => {
    let unlistenLibrary = () => {};
    let unlistenScan = () => {};
    let unlistenDone = () => {};
    let unlistenTransport = () => {};
    let unlistenLyricsVisibility = () => {};
    let unlistenLyricsLock = () => {};
    let stopDrag = () => {};

    void (async () => {
      unlistenLibrary = await listenEvent('library:changed', () => {
        void refreshBootstrap();
      });
      unlistenScan = await listenEvent<ScanProgressEvent>('scan:progress', payload => {
        setScanProgress(payload);
        setStatus(strings.status.scanProgress(payload.current, payload.total, payload.path));
      });
      unlistenDone = await listenEvent<{ added: number; updated: number; missing: number; errors: string[] }>(
        'scan:done',
        payload => {
          setScanProgress(null);
          setScanSummary(payload);
          setStatus(
            strings.status.libraryScanFinished(payload.added, payload.updated),
            payload.errors.length > 0 ? 'error' : 'info',
          );
        },
      );
      unlistenTransport = await listenEvent<string>('transport:command', payload => {
        void playbackService.handleTransport(payload).catch(error => {
          setStatus(formatError(error, strings.common.unknownError), 'error');
        });
      });
      unlistenLyricsVisibility = await listenEvent<boolean>('desktopLyrics:visibility', visible => {
        useAppStore.getState().applyPlaybackPatch({ lyricsWindowVisible: visible });
      });
      unlistenLyricsLock = await listenEvent<boolean>('desktopLyrics:lock', locked => {
        useAppStore.getState().applyPlaybackPatch({ desktopLyricsLocked: locked });
      });
      stopDrag = await attachDragDrop(
        paths => {
          if (paths.length > 0) {
            void handleScan(paths, false);
          }
        },
        setDragImportActive,
      );
    })();

    return () => {
      unlistenLibrary();
      unlistenScan();
      unlistenDone();
      unlistenTransport();
      unlistenLyricsVisibility();
      unlistenLyricsLock();
      stopDrag();
    };
  }, [
    refreshBootstrap,
    setDragImportActive,
    setScanProgress,
    setScanSummary,
    setStatus,
    strings.common.unknownError,
    strings.status,
  ]);

  useEffect(() => {
    if (!desktopLyricsSupported || !currentTrack || !currentLyrics) {
      return;
    }

    const payload = buildDesktopLyricsPayload(
      currentTrack,
      currentLyrics,
      playback.positionMs,
      playback.audioState,
    );
    const serialized = JSON.stringify(payload);
    if (serialized === lastDesktopPayload.current) {
      return;
    }
    lastDesktopPayload.current = serialized;
    void commands.pushDesktopLyrics(payload).catch(error => {
      setStatus(formatError(error, strings.common.unknownError), 'error');
    });
  }, [
    currentTrack,
    currentLyrics,
    playback.positionMs,
    playback.audioState,
    desktopLyricsSupported,
    setStatus,
    strings.common.unknownError,
  ]);

  const handleScan = async (paths: string[], rememberRoot: boolean) => {
    try {
      setStatus(strings.status.scanningLibrary);
      const summary = await commands.scanPaths(paths, rememberRoot);
      setScanSummary(summary);
      await refreshBootstrap();
      setStatus(
        strings.status.scanComplete(summary.added, summary.updated),
        summary.errors.length > 0 ? 'error' : 'info',
      );
    } catch (error) {
      setStatus(formatError(error, strings.common.unknownError), 'error');
    }
  };

  const handleRefreshLibrary = async () => {
    try {
      setStatus(strings.status.refreshingLibrary);
      const summary = await commands.refreshLibrary();
      setScanSummary(summary);
      await refreshBootstrap();
      setStatus(strings.status.refreshComplete(summary.added, summary.updated));
    } catch (error) {
      setStatus(formatError(error, strings.common.unknownError), 'error');
    }
  };

  const handleRemoveTrack = async (trackId: number) => {
    try {
      await commands.removeTrack(trackId);
      await refreshBootstrap();
      setStatus(strings.status.removedTrack);
    } catch (error) {
      setStatus(formatError(error, strings.common.unknownError), 'error');
    }
  };

  const handleSaveShortcuts = async (nextSettings: ShortcutSettings) => {
    try {
      await commands.saveShortcuts(nextSettings);
      setShortcutSettings(nextSettings);
      setStatus(strings.status.shortcutSettingsSaved);
    } catch (error) {
      setStatus(formatError(error, strings.common.unknownError), 'error');
    }
  };

  const handleSearchLyricsOnline = async () => {
    if (!currentTrack || lyricsSearch.status === 'searching') {
      return;
    }

    const trackId = currentTrack.id;
    const searching = strings.lyrics.searching;
    setLyricsSearch({ status: 'searching', message: searching });
    setStatus(searching);

    try {
      const result = await loadLyrics(trackId, true);
      if (useAppStore.getState().playback.currentTrackId !== trackId) {
        return;
      }
      if (!result) {
        setLyricsSearch({ status: 'not-found', message: strings.lyrics.searchNotFound });
        setStatus(strings.lyrics.searchNotFound, 'error');
        return;
      }

      const path = await commands.lyricsFilePath(trackId).catch(() => null);
      setLyricsFilePath(path);
      setLyricsSearch({ status: 'success', message: strings.lyrics.searchSuccess });
      setStatus(strings.lyrics.searchSuccess);
    } catch (error) {
      const detail = formatError(error, strings.common.unknownError);
      const message = strings.lyrics.searchFailed(detail);
      setLyricsSearch({ status: 'error', message });
      setStatus(message, 'error');
    }
  };

  const handleSaveUiSettings = async (preference: UiLanguagePreference) => {
    const nextSettings: UiSettings = {
      ...uiSettings,
      languagePreference: preference,
      resolvedLanguage: resolveUiLanguage(preference, runtimeLanguages),
    };

    try {
      await saveUiSettings(nextSettings);
    } catch (error) {
      setStatus(formatError(error, strings.common.unknownError), 'error');
    }
  };

  const handleSaveOnlineSettings = async (nextSettings: UiSettings) => {
    try {
      await saveUiSettings(nextSettings);
      setStatus(strings.status.onlineSettingsSaved);
    } catch (error) {
      setStatus(formatError(error, strings.common.unknownError), 'error');
    }
  };

  const handleQueueSourceChange = (source: QueueSource) => {
    setQueueSource(source);
    if (source === 'playlist' && queuePlaylistId === null && playlists.length > 0) {
      setQueuePlaylistId(playlists[0].id);
    }
  };

  const handleLoadQueueSource = async () => {
    if (queueSource === 'playlist' && queuePlaylistId === null) {
      return;
    }

    setQueueSourceLoading(true);
    try {
      const sourceTracks = queueSource === 'library'
        ? tracks
        : await commands.playlistTracks(queuePlaylistId!);
      await playbackService.replaceQueue(sourceTracks.map(track => track.id));
      setStatus(strings.queue.sourceLoaded(sourceTracks.length));
    } catch (error) {
      setStatus(formatError(error, strings.common.unknownError), 'error');
    } finally {
      setQueueSourceLoading(false);
    }
  };

  const handleResetLayout = () => {
    sidebarSizing.reset();
    queueSizing.reset();
    titleColumnSizing.reset();
    artistColumnSizing.reset();
    albumColumnSizing.reset();
    setStatus(resizeCopy.resetDone);
  };

  if (bootstrapping && !ready) {
    return (
      <I18nProvider value={strings}>
        <LoadingScreen showSlowHint={showSlowBootHint} />
      </I18nProvider>
    );
  }

  if (!ready) {
    return (
      <I18nProvider value={strings}>
        <StartupFailureScreen
          message={startupError ?? strings.common.unknownError}
          startup={startup}
          onRetry={() => void bootstrap()}
        />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider value={strings}>
      <TrackColumnSizingContext.Provider
        value={{
          title: titleColumnSizing,
          artist: artistColumnSizing,
          album: albumColumnSizing,
          labels: resizeCopy,
        }}
      >
      <div className="app-shell" style={layoutStyle}>
        <Sidebar
          currentView={view}
          open={sidebarDrawerOpen}
          onClose={() => setSidebarDrawerOpen(false)}
          onViewChange={nextView => {
            setSidebarDrawerOpen(false);
            setQueueDrawerOpen(false);
            setView(nextView);
          }}
          onOpenImport={() => {
            setSidebarDrawerOpen(false);
            openAddSource();
          }}
          playlists={playlists}
          activePlaylistId={activePlaylistId}
          onOpenPlaylist={playlistId => {
            setSidebarDrawerOpen(false);
            setQueueDrawerOpen(false);
            setView('playlists');
            void setActivePlaylist(playlistId);
          }}
        />

        <ResizeHandle
          className="layout-resize-handle sidebar-resize-handle"
          label={resizeCopy.sidebarHandle}
          value={sidebarSizing.value}
          min={sidebarSizing.min}
          max={sidebarSizing.max}
          onChange={sidebarSizing.setValue}
          onCommit={sidebarSizing.commitValue}
          onReset={sidebarSizing.reset}
        />

        <div className="main-layout">
          <header className="top-bar">
            <div className="top-bar-row">
              <button
                className="icon-button nav-drawer-trigger"
                onClick={() => {
                  setQueueDrawerOpen(false);
                  setSidebarDrawerOpen(true);
                }}
                title={strings.nav.items.library.label}
                aria-label={strings.nav.items.library.label}
              >
                ☰
              </button>
              <div className="top-bar-copy">
                <h1 className="page-title" title={strings.page.title(view)}>{strings.page.title(view)}</h1>
                <p
                  className="page-subtitle"
                  title={strings.page.subtitle(view, tracks.length, playlists.length, roots.length)}
                >
                  {strings.page.subtitle(view, tracks.length, playlists.length, roots.length)}
                </p>
              </div>

              <div className="top-bar-actions">
                <input
                  className="search-input"
                  placeholder={strings.page.searchPlaceholder}
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                />
                <button className="primary-button" onClick={openAddSource}>
                  {strings.common.addMusic}
                </button>
                <button
                  className="icon-button queue-drawer-trigger"
                  onClick={() => {
                    setSidebarDrawerOpen(false);
                    setQueueDrawerOpen(true);
                  }}
                  title={strings.nav.items.queue.label}
                  aria-label={strings.nav.items.queue.label}
                >
                  ≡
                </button>
              </div>
            </div>

            {statusMessage && (
              <DismissibleStatusBanner
                key={`${statusTone}:${statusMessage}`}
                message={statusMessage}
                tone={statusTone}
                dismissLabel={strings.common.cancel}
                onDismiss={() => setStatus(null)}
              />
            )}
            {scanProgress && (
              <div
                className="status-banner"
                style={{ marginTop: 12 }}
                title={strings.status.scanProgress(scanProgress.current, scanProgress.total, scanProgress.path)}
              >
                {strings.status.scanProgress(scanProgress.current, scanProgress.total, scanProgress.path)}
              </div>
            )}
            {dragImportActive && (
              <div className="status-banner" style={{ marginTop: 12 }}>
                {strings.page.dragImportHint}
              </div>
            )}
          </header>

          <main className="page-body">
            {view === 'library' && (
              <LibraryView
                tracks={filteredTracks}
                currentTrackId={playback.currentTrackId}
                onPlay={(_track, index) => void playbackService.setQueue(filteredTracks.map(item => item.id), index, true)}
                onEdit={openEditTrack}
                onAddToPlaylist={openAddToPlaylist}
                onReveal={trackId => void commands.revealTrack(trackId).catch(error => setStatus(formatError(error, strings.common.unknownError), 'error'))}
                onRemove={trackId => void handleRemoveTrack(trackId)}
              />
            )}

            {view === 'playlists' && (
              <PlaylistsView
                playlists={playlists}
                activePlaylistId={activePlaylistId}
                tracks={activePlaylistTracks}
                currentTrackId={playback.currentTrackId}
                onSelect={playlistId => void setActivePlaylist(playlistId)}
                onCreate={createPlaylist}
                onRename={renamePlaylist}
                onDelete={deletePlaylist}
                onPlay={(trackId, playlistTrackIds) => void playbackService.playTrack(trackId, playlistTrackIds)}
                onRemoveTrack={trackId => activePlaylistId && void removeTrackFromPlaylist(activePlaylistId, trackId)}
              />
            )}

            {view === 'queue' && (
              <QueueView
                tracks={currentQueueTracks}
                playlists={playlists}
                currentTrackId={playback.currentTrackId}
                source={queueSource}
                playlistId={queuePlaylistId}
                sourceLoading={queueSourceLoading}
                onPlay={trackId => void playbackService.playTrack(trackId, playback.queue)}
                onSourceChange={handleQueueSourceChange}
                onPlaylistChange={setQueuePlaylistId}
                onLoadSource={() => void handleLoadQueueSource()}
                onMove={(fromIndex, toIndex) => playbackService.moveQueueItem(fromIndex, toIndex)}
                onRemove={index => void playbackService.removeQueueItem(index)}
              />
            )}

            {view === 'lyrics' && (
              <LyricsView
                track={currentTrack}
                lyrics={currentLyrics}
                lyricsFilePath={lyricsFilePath}
                searchState={lyricsSearch}
                positionMs={playback.positionMs}
                onSearchOnline={() => void handleSearchLyricsOnline()}
                onRevealLyricsFile={() => currentTrack && void commands.revealLyricsFile(currentTrack.id)
                  .catch(error => setStatus(formatError(error, strings.common.unknownError), 'error'))}
              />
            )}

            {view === 'settings' && (
              <SettingsView
                uiSettings={uiSettings}
                playlists={playlists}
                roots={roots}
                shortcuts={shortcuts}
                shortcutConfigPath={shortcutConfigPath}
                settingsConfigPath={settingsConfigPath}
                desktopLyricsSupported={desktopLyricsSupported}
                desktopLyricsVisible={playback.lyricsWindowVisible}
                onAddFolders={async () => {
                  const paths = await commands.pickFolders();
                  if (paths.length > 0) {
                    await handleScan(paths, true);
                  }
                }}
                onAddFiles={async () => {
                  const paths = await commands.pickFiles();
                  if (paths.length > 0) {
                    await handleScan(paths, false);
                  }
                }}
                onRefreshLibrary={handleRefreshLibrary}
                onToggleDesktopLyrics={() => void playbackService.toggleDesktopLyrics()}
                onSaveShortcuts={handleSaveShortcuts}
                onRevealShortcutConfig={() => void commands.revealShortcutConfig()
                  .catch(error => setStatus(formatError(error, strings.common.unknownError), 'error'))}
                onRevealSettingsConfig={() => void commands.revealSettingsConfig()
                  .catch(error => setStatus(formatError(error, strings.common.unknownError), 'error'))}
                onSaveUiSettings={handleSaveUiSettings}
                onSaveOnlineSettings={handleSaveOnlineSettings}
                onResetLayout={handleResetLayout}
              />
            )}
          </main>

          <PlayerBar
            track={currentTrack}
            playback={playback}
            onToggle={() => void playbackService.toggle()}
            onNext={() => void playbackService.next()}
            onPrevious={() => void playbackService.previous()}
            onSeek={value => playbackService.seek(value)}
            onVolume={value => playbackService.setVolume(value)}
            onMute={() => playbackService.toggleMute()}
            onCycleMode={() => playbackService.cycleMode()}
            onOpenLyrics={() => setView('lyrics')}
            onToggleDesktopLyrics={desktopLyricsSupported ? () => void playbackService.toggleDesktopLyrics() : undefined}
            onToggleDesktopLyricsLock={desktopLyricsSupported
              ? () => void playbackService.toggleDesktopLyricsLock()
              : undefined}
          />
        </div>

        <ResizeHandle
          className="layout-resize-handle queue-resize-handle"
          label={resizeCopy.queueHandle}
          value={queueSizing.value}
          min={queueSizing.min}
          max={queueSizing.max}
          direction={-1}
          onChange={queueSizing.setValue}
          onCommit={queueSizing.commitValue}
          onReset={queueSizing.reset}
        />

        <QueuePanel
          open={queueDrawerOpen}
          tracks={currentQueueTracks}
          playlists={playlists}
          currentTrackId={playback.currentTrackId}
          source={queueSource}
          playlistId={queuePlaylistId}
          sourceLoading={queueSourceLoading}
          onClose={() => setQueueDrawerOpen(false)}
          onPlay={trackId => void playbackService.playTrack(trackId, playback.queue)}
          onSourceChange={handleQueueSourceChange}
          onPlaylistChange={setQueuePlaylistId}
          onLoadSource={() => void handleLoadQueueSource()}
          onMove={(fromIndex, toIndex) => playbackService.moveQueueItem(fromIndex, toIndex)}
          onRemove={index => void playbackService.removeQueueItem(index)}
        />

        {(sidebarDrawerOpen || queueDrawerOpen) && (
          <button
            className="drawer-backdrop"
            onClick={() => {
              setSidebarDrawerOpen(false);
              setQueueDrawerOpen(false);
            }}
            aria-label={strings.common.cancel}
          />
        )}

        {addSourceOpen && (
          <AddSourceModal
            onClose={closeAddSource}
            onComplete={async message => {
              closeAddSource();
              await refreshBootstrap();
              setStatus(message);
            }}
          />
        )}

        {editTrackId !== null && (
          <EditTrackModal
            track={tracks.find(track => track.id === editTrackId) ?? null}
            onClose={closeEditTrack}
            onSaved={async () => {
              closeEditTrack();
              await refreshBootstrap();
              if (currentTrack) {
                await loadLyrics(currentTrack.id);
              }
              setStatus(strings.status.trackOverridesSaved);
            }}
          />
        )}

        {addToPlaylistTrackId !== null && (
          <AddToPlaylistModal
            track={tracks.find(track => track.id === addToPlaylistTrackId) ?? null}
            playlists={playlists}
            onClose={closeAddToPlaylist}
            onChoose={async playlistId => {
              await addTrackToPlaylist(playlistId, addToPlaylistTrackId);
              closeAddToPlaylist();
              setStatus(strings.status.trackAddedToPlaylist);
            }}
          />
        )}
      </div>
      </TrackColumnSizingContext.Provider>
    </I18nProvider>
  );
}

function LoadingScreen(props: { showSlowHint: boolean }) {
  const t = useI18n();
  const copy = startupScreenCopy(t.language);
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      <div
        className="content-card"
        style={{ width: 'min(420px, calc(100% - 32px))', textAlign: 'center' }}
      >
        <div className="brand-badge" style={{ margin: '0 auto 18px' }}>
          <img className="brand-icon-image" src={APP_ICON_URL} alt="" />
        </div>
        <h1 className="page-title" style={{ fontSize: 28 }}>{t.common.appName}</h1>
        <p className="page-subtitle">{t.loading.tagline}</p>
        {props.showSlowHint && (
          <div className="status-banner" style={{ marginTop: 18, textAlign: 'left' }}>
            {copy.loadingSlowHint}
          </div>
        )}
      </div>
    </div>
  );
}

function DismissibleStatusBanner(props: {
  message: string;
  tone: 'info' | 'error';
  dismissLabel: string;
  onDismiss: () => void;
}) {
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDismissing(true),
      props.tone === 'error' ? 8000 : 5000,
    );
    return () => window.clearTimeout(timer);
  }, [props.tone]);

  return (
    <button
      type="button"
      className={`status-banner dismissible-status ${props.tone === 'error' ? 'error' : ''} ${dismissing ? 'is-dismissing' : ''}`}
      onClick={() => setDismissing(true)}
      onAnimationEnd={() => {
        if (dismissing) {
          props.onDismiss();
        }
      }}
      style={{ marginTop: 16 }}
      title={`${props.message} · ${props.dismissLabel}`}
      aria-label={`${props.message} · ${props.dismissLabel}`}
      aria-live={props.tone === 'error' ? 'assertive' : 'polite'}
    >
      {props.message}
    </button>
  );
}

function StartupFailureScreen(props: {
  message: string;
  startup: StartupDiagnostics | null;
  onRetry: () => void;
}) {
  const t = useI18n();
  const copy = startupScreenCopy(t.language);

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <div className="content-card" style={{ width: 'min(720px, 100%)' }}>
        <div className="brand-badge" style={{ marginBottom: 18 }}>
          <img className="brand-icon-image" src={APP_ICON_URL} alt="" />
        </div>
        <div className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          {copy.failureEyebrow}
        </div>
        <h1 className="page-title" style={{ fontSize: 30, marginTop: 10 }}>{copy.failureTitle}</h1>
        <p className="page-subtitle" style={{ marginTop: 12, lineHeight: 1.6 }}>
          {copy.failureBody}
        </p>

        <div className="status-banner error" style={{ marginTop: 20, whiteSpace: 'pre-wrap' }}>
          {props.message}
        </div>

        {props.startup && (
          <div className="stack" style={{ marginTop: 18 }}>
            <div className="content-card" style={{ padding: 16 }}>
              <div className="tiny muted">{copy.appDataDir}</div>
              <div style={{ marginTop: 6, wordBreak: 'break-word' }}>{props.startup.appDataDir}</div>
            </div>
            <div className="content-card" style={{ padding: 16 }}>
              <div className="tiny muted">{copy.databasePath}</div>
              <div style={{ marginTop: 6, wordBreak: 'break-word' }}>{props.startup.databasePath}</div>
            </div>
          </div>
        )}

        <div className="row-actions" style={{ marginTop: 20, justifyContent: 'space-between' }}>
          <div className="tiny muted">{copy.failureHint}</div>
          <button className="primary-button" onClick={props.onRetry}>
            {copy.retry}
          </button>
        </div>
      </div>
    </div>
  );
}

function startupScreenCopy(language: I18nStrings['language']) {
  if (language === 'zh-CN') {
    return {
      loadingSlowHint: '初始化时间比预期更长，便携版正在准备应用数据目录、数据库或恢复播放会话。',
      failureEyebrow: '初始化失败',
      failureTitle: 'AlsoMusicPlayer 未能完成初始化',
      failureBody: '便携版已经启动，但初始化应用数据、数据库或会话恢复时出现了问题。先重试一次；如果仍然失败，请把下面的路径和错误信息一起保留。',
      failureHint: '如果这是便携版，请确认压缩包已完整解压后再启动。',
      retry: '重试初始化',
      appDataDir: '应用数据目录',
      databasePath: '数据库路径',
    };
  }

  return {
    loadingSlowHint: 'Startup is taking longer than expected while the portable build prepares app data, the database, or the restored session.',
    failureEyebrow: 'Startup Failure',
    failureTitle: 'AlsoMusicPlayer could not finish initialization',
    failureBody: 'The portable build started, but app-data setup, database initialization, or session recovery failed. Try the initialization again first. If it still fails, keep the paths and error message below.',
    failureHint: 'For portable testing, make sure the full archive was extracted before launching the app.',
    retry: 'Retry Initialization',
    appDataDir: 'App Data Directory',
    databasePath: 'Database Path',
  };
}

function resizableLayoutCopy(language: I18nStrings['language']) {
  if (language === 'zh-CN') {
    return {
      sidebarHandle: '调整左侧导航栏宽度；双击恢复默认宽度',
      queueHandle: '调整右侧播放队列宽度；双击恢复默认宽度',
      titleColumnHandle: '调整歌曲名列宽；双击恢复默认宽度',
      artistColumnHandle: '调整艺术家列宽；双击恢复默认宽度',
      albumColumnHandle: '调整专辑列宽；双击恢复默认宽度',
      resetTitle: '布局尺寸',
      resetDescription: '恢复导航栏、播放队列和歌曲列表列宽的默认设置。',
      resetAction: '恢复默认布局',
      resetDone: '已恢复默认布局。',
    };
  }

  return {
    sidebarHandle: 'Resize navigation sidebar; double-click to restore its default width',
    queueHandle: 'Resize play queue; double-click to restore its default width',
    titleColumnHandle: 'Resize track title column; double-click to restore its default width',
    artistColumnHandle: 'Resize artist column; double-click to restore its default width',
    albumColumnHandle: 'Resize album column; double-click to restore its default width',
    resetTitle: 'Layout sizing',
    resetDescription: 'Restore the default navigation, play queue, and track column widths.',
    resetAction: 'Reset layout',
    resetDone: 'Layout sizing restored to defaults.',
  };
}

function Sidebar(props: {
  currentView: ViewId;
  open: boolean;
  playlists: Playlist[];
  activePlaylistId: number | null;
  onClose: () => void;
  onViewChange: (view: ViewId) => void;
  onOpenImport: () => void;
  onOpenPlaylist: (playlistId: number) => void;
}) {
  const t = useI18n();
  const items = [
    { id: 'library', ...t.nav.items.library },
    { id: 'playlists', ...t.nav.items.playlists },
    { id: 'queue', ...t.nav.items.queue },
    { id: 'lyrics', ...t.nav.items.lyrics },
    { id: 'settings', ...t.nav.items.settings },
  ] as const;

  return (
    <aside className={`sidebar ${props.open ? 'is-open' : ''}`} aria-label={t.nav.brandEyebrow}>
      <div className="sidebar-card">
        <div className="brand">
          <div className="brand-badge" aria-hidden="true">
            <img className="brand-icon-image" src={APP_ICON_URL} alt="" />
          </div>
          <div className="brand-copy">
            <div className="brand-eyebrow" title={t.nav.brandEyebrow}>{t.nav.brandEyebrow}</div>
            <h2 className="brand-title" title={t.common.appName}>{t.common.appName}</h2>
            <p className="brand-subtitle" title={t.nav.brandSubtitle}>{t.nav.brandSubtitle}</p>
          </div>
          <button
            className="icon-button sidebar-close"
            onClick={props.onClose}
            title={t.common.cancel}
            aria-label={t.common.cancel}
          >
            ×
          </button>
        </div>
      </div>

      <div className="sidebar-card nav-list">
        {items.map(item => (
          <button
            key={item.id}
            className={`nav-button ${props.currentView === item.id ? 'active' : ''}`}
            onClick={() => props.onViewChange(item.id)}
            title={`${item.label} — ${item.hint}`}
            aria-label={`${item.label} — ${item.hint}`}
          >
            <span className="nav-label">{item.label}</span>
            <span className="nav-hint tiny muted">{item.hint}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-card">
        <p className="sidebar-section-title">{t.nav.quickPlaylists}</p>
        <div className="playlist-nav">
          {props.playlists.length === 0 && (
            <div className="muted tiny single-line" title={t.nav.quickPlaylistsEmpty}>
              {t.nav.quickPlaylistsEmpty}
            </div>
          )}
          {props.playlists.map(playlist => (
            <button
              key={playlist.id}
              className={`playlist-link ${props.activePlaylistId === playlist.id ? 'active' : ''}`}
              onClick={() => props.onOpenPlaylist(playlist.id)}
              title={`${playlist.name} (${playlist.songCount})`}
            >
              <span className="playlist-name">{playlist.name}</span>
              <span className="playlist-count muted tiny">({playlist.songCount})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <button
          className="primary-button"
          style={{ width: '100%' }}
          onClick={props.onOpenImport}
          title={t.nav.importSources}
        >
          {t.nav.importSources}
        </button>
      </div>
    </aside>
  );
}

function LibraryView(props: {
  tracks: Track[];
  currentTrackId: number | null;
  onPlay: (track: Track, index: number) => void;
  onEdit: (trackId: number) => void;
  onAddToPlaylist: (trackId: number) => void;
  onReveal: (trackId: number) => void;
  onRemove: (trackId: number) => void;
}) {
  const t = useI18n();

  return (
    <div className="page-grid">
      <div className="content-card">
        {props.tracks.length === 0 ? (
          <div className="empty-state">{t.library.empty}</div>
        ) : (
          <TrackTable
            tracks={props.tracks}
            currentTrackId={props.currentTrackId}
            onPlay={props.onPlay}
            renderActions={track => (
              <div className="row-actions track-actions">
                {track.sourceKind === 'local_file' && (
                  <button
                    className="icon-button"
                    onClick={() => props.onReveal(track.id)}
                    title={t.library.reveal}
                    aria-label={t.library.reveal}
                  >
                    ↗
                  </button>
                )}
                <button
                  className="icon-button"
                  onClick={() => props.onAddToPlaylist(track.id)}
                  title={t.library.playlist}
                  aria-label={t.library.playlist}
                >
                  +
                </button>
                <button
                  className="icon-button"
                  onClick={() => props.onEdit(track.id)}
                  title={t.library.edit}
                  aria-label={t.library.edit}
                >
                  ✎
                </button>
                <button
                  className="icon-button danger-icon-button"
                  onClick={() => props.onRemove(track.id)}
                  title={t.library.remove}
                  aria-label={t.library.remove}
                >
                  ×
                </button>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}

function PlaylistsView(props: {
  playlists: Playlist[];
  activePlaylistId: number | null;
  tracks: Track[];
  currentTrackId: number | null;
  onSelect: (playlistId: number) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (playlistId: number, name: string) => Promise<void>;
  onDelete: (playlistId: number) => Promise<void>;
  onPlay: (trackId: number, playlistTrackIds: number[]) => void;
  onRemoveTrack: (trackId: number) => void;
}) {
  const t = useI18n();
  const [newName, setNewName] = useState('');
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    const playlist = props.playlists.find(item => item.id === props.activePlaylistId);
    setRenameValue(playlist?.name ?? '');
  }, [props.activePlaylistId, props.playlists]);

  return (
    <div className="split-layout">
      <div className="stack">
        <div className="content-card">
          <p className="sidebar-section-title">{t.playlists.createTitle}</p>
          <div className="stack">
            <input
              className="text-input"
              placeholder={t.playlists.createPlaceholder}
              value={newName}
              onChange={event => setNewName(event.target.value)}
            />
            <button
              className="primary-button"
              onClick={async () => {
                await props.onCreate(newName);
                setNewName('');
              }}
            >
              {t.playlists.createAction}
            </button>
          </div>
        </div>

        <div className="content-card">
          <p className="sidebar-section-title">{t.playlists.listTitle}</p>
          <div className="playlist-nav">
            {props.playlists.map(playlist => (
              <button
                key={playlist.id}
                className={`playlist-link ${props.activePlaylistId === playlist.id ? 'active' : ''}`}
                onClick={() => props.onSelect(playlist.id)}
                title={`${playlist.name} (${playlist.songCount})`}
              >
                <span className="playlist-name">{playlist.name}</span>
                <span className="playlist-count muted tiny">({playlist.songCount})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="content-card">
          {props.activePlaylistId === null ? (
            <div className="empty-state">{t.playlists.selectPrompt}</div>
          ) : (
            <>
              <div className="top-bar-row" style={{ marginBottom: 18 }}>
                <div className="top-bar-copy">
                  <h3
                    className="single-line"
                    style={{ margin: 0 }}
                    title={props.playlists.find(playlist => playlist.id === props.activePlaylistId)?.name}
                  >
                    {props.playlists.find(playlist => playlist.id === props.activePlaylistId)?.name}
                  </h3>
                  <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
                    {t.playlists.detailSubtitle}
                  </p>
                </div>
                <div className="row-actions">
                  <input
                    className="text-input"
                    value={renameValue}
                    onChange={event => setRenameValue(event.target.value)}
                    title={renameValue}
                  />
                  <button
                    className="soft-button"
                    onClick={() =>
                      props.activePlaylistId && props.onRename(props.activePlaylistId, renameValue)
                    }
                  >
                    {t.playlists.rename}
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => props.activePlaylistId && props.onDelete(props.activePlaylistId)}
                  >
                    {t.playlists.delete}
                  </button>
                </div>
              </div>

              {props.tracks.length === 0 ? (
                <div className="empty-state">{t.playlists.empty}</div>
              ) : (
                <TrackTable
                  tracks={props.tracks}
                  currentTrackId={props.currentTrackId}
                  onPlay={track => props.onPlay(track.id, props.tracks.map(item => item.id))}
                  renderActions={track => (
                    <button
                      className="icon-button danger-icon-button"
                      onClick={() => props.onRemoveTrack(track.id)}
                      title={t.playlists.removeTrack}
                      aria-label={t.playlists.removeTrack}
                    >
                      ×
                    </button>
                  )}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface QueueEditorProps {
  tracks: Track[];
  playlists: Playlist[];
  currentTrackId: number | null;
  source: QueueSource;
  playlistId: number | null;
  sourceLoading: boolean;
  onPlay: (trackId: number) => void;
  onSourceChange: (source: QueueSource) => void;
  onPlaylistChange: (playlistId: number | null) => void;
  onLoadSource: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onRemove: (index: number) => void;
}

function QueueSourceControls(props: Pick<
  QueueEditorProps,
  | 'playlists'
  | 'source'
  | 'playlistId'
  | 'sourceLoading'
  | 'onSourceChange'
  | 'onPlaylistChange'
  | 'onLoadSource'
>) {
  const t = useI18n();

  return (
    <div className="queue-source-editor">
      <div className="queue-source-label tiny muted">{t.queue.sourceLabel}</div>
      <div className="queue-source-tabs" role="group" aria-label={t.queue.sourceLabel}>
        <button
          type="button"
          className={`queue-source-tab ${props.source === 'library' ? 'is-active' : ''}`}
          aria-pressed={props.source === 'library'}
          onClick={() => props.onSourceChange('library')}
        >
          {t.queue.librarySource}
        </button>
        <button
          type="button"
          className={`queue-source-tab ${props.source === 'playlist' ? 'is-active' : ''}`}
          aria-pressed={props.source === 'playlist'}
          onClick={() => props.onSourceChange('playlist')}
        >
          {t.queue.playlistSource}
        </button>
      </div>
      <div className="queue-source-load-row">
        {props.source === 'playlist' && (
          <select
            className="text-input queue-playlist-select"
            value={props.playlistId ?? ''}
            aria-label={t.queue.selectPlaylist}
            onChange={event => props.onPlaylistChange(
              event.target.value ? Number(event.target.value) : null,
            )}
          >
            <option value="">{t.queue.selectPlaylist}</option>
            {props.playlists.map(playlist => (
              <option key={playlist.id} value={playlist.id}>{playlist.name}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="soft-button queue-load-source"
          disabled={props.sourceLoading || (props.source === 'playlist' && props.playlistId === null)}
          onClick={props.onLoadSource}
        >
          {props.sourceLoading ? t.queue.loadingSource : t.queue.loadSource}
        </button>
      </div>
    </div>
  );
}

function QueueItemActions(props: {
  index: number;
  length: number;
  onMove: (fromIndex: number, toIndex: number) => void;
  onRemove: (index: number) => void;
}) {
  const t = useI18n();

  return (
    <div className="queue-item-actions">
      <button
        type="button"
        className="icon-button queue-action-button"
        disabled={props.index === 0}
        onClick={event => {
          event.stopPropagation();
          props.onMove(props.index, props.index - 1);
        }}
        title={t.queue.moveUp}
        aria-label={t.queue.moveUp}
      >
        ↑
      </button>
      <button
        type="button"
        className="icon-button queue-action-button"
        disabled={props.index >= props.length - 1}
        onClick={event => {
          event.stopPropagation();
          props.onMove(props.index, props.index + 1);
        }}
        title={t.queue.moveDown}
        aria-label={t.queue.moveDown}
      >
        ↓
      </button>
      <button
        type="button"
        className="icon-button danger-icon-button queue-action-button"
        onClick={event => {
          event.stopPropagation();
          props.onRemove(props.index);
        }}
        title={t.queue.remove}
        aria-label={t.queue.remove}
      >
        ×
      </button>
    </div>
  );
}

function QueueView(props: QueueEditorProps) {
  const t = useI18n();
  return (
    <div className="content-card queue-view-card">
      <QueueSourceControls {...props} />
      {props.tracks.length === 0 ? (
        <div className="empty-state">{t.queue.empty}</div>
      ) : (
        <TrackTable
          tracks={props.tracks}
          currentTrackId={props.currentTrackId}
          onPlay={track => props.onPlay(track.id)}
          renderActions={(_track, index) => (
            <QueueItemActions
              index={index}
              length={props.tracks.length}
              onMove={props.onMove}
              onRemove={props.onRemove}
            />
          )}
        />
      )}
    </div>
  );
}

function QueuePanel(props: QueueEditorProps & {
  open: boolean;
  onClose: () => void;
}) {
  const t = useI18n();
  const queueLabel = t.nav.items.queue.label;

  return (
    <aside
      className={`queue-panel ${props.open ? 'is-open' : ''}`}
      aria-label={queueLabel}
    >
      <div className="queue-panel-header">
        <div className="queue-panel-heading">
          <h2 className="single-line" title={queueLabel}>{queueLabel}</h2>
          <span className="tiny muted fixed-control">{t.common.tracks(props.tracks.length)}</span>
        </div>
        <button
          className="icon-button queue-panel-close"
          onClick={props.onClose}
          title={t.common.cancel}
          aria-label={t.common.cancel}
        >
          ×
        </button>
      </div>

      <QueueSourceControls {...props} />

      <div className="queue-list">
        {props.tracks.length === 0 ? (
          <div className="empty-state" title={t.queue.empty}>{t.queue.empty}</div>
        ) : (
          props.tracks.map((track, index) => {
            const subtitle = joinParts([track.artist, track.album]);
            const fullLabel = joinParts([track.title, subtitle]);
            return (
              <div
                key={`${track.id}-${index}`}
                className={`queue-track ${track.id === props.currentTrackId ? 'is-active' : ''}`}
                title={fullLabel}
              >
                <span className="queue-index fixed-control">{index + 1}</span>
                <button
                  type="button"
                  className="queue-track-play"
                  onClick={() => props.onPlay(track.id)}
                  aria-label={fullLabel}
                >
                  <span className="queue-track-copy">
                    <span className="queue-track-title">{track.title}</span>
                    <span className="queue-track-subtitle">{subtitle || t.common.notAvailable}</span>
                  </span>
                  <span className="queue-duration fixed-control">
                    {formatDuration(track.duration)}
                  </span>
                </button>
                <QueueItemActions
                  index={index}
                  length={props.tracks.length}
                  onMove={props.onMove}
                  onRemove={props.onRemove}
                />
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function LyricsView(props: {
  track: Track | null;
  lyrics: LyricsData | null;
  lyricsFilePath: string | null;
  searchState: LyricsSearchState;
  positionMs: number;
  onSearchOnline: () => void;
  onRevealLyricsFile: () => void;
}) {
  const t = useI18n();
  const lyricsScrollRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const synchronized = Boolean(
    props.lyrics?.syncedText && LRCParser.isSynced(props.lyrics.syncedText),
  );
  const lines = useMemo(() => {
    if (!props.lyrics) {
      return [];
    }
    const source = synchronized
      ? props.lyrics.syncedText || ''
      : props.lyrics.plainText || props.lyrics.syncedText || '';
    return LRCParser.parse(source);
  }, [props.lyrics, synchronized]);

  const activeLineIndex = useMemo(() => {
    return synchronized ? findActiveLyricLineIndex(lines, props.positionMs) : -1;
  }, [lines, props.positionMs, synchronized]);

  useEffect(() => {
    lyricsScrollRef.current?.scrollTo({ top: 0 });
  }, [props.track?.id]);

  useEffect(() => {
    const container = lyricsScrollRef.current;
    const activeLine = activeLineRef.current;
    if (!container || !activeLine || activeLineIndex < 0) {
      return;
    }

    container.scrollTo({
      top: Math.max(
        0,
        activeLine.offsetTop - container.clientHeight / 2 + activeLine.clientHeight / 2,
      ),
      behavior: 'smooth',
    });
  }, [activeLineIndex]);

  return (
    <div className="content-card">
      {!props.track ? (
        <div className="empty-state">{t.lyrics.emptyTrack}</div>
      ) : (
        <>
          <div className="top-bar-row" style={{ marginBottom: 16 }}>
            <div className="top-bar-copy">
              <h3 className="single-line" style={{ margin: 0 }} title={props.track.title}>
                {props.track.title}
              </h3>
              <p
                className="page-subtitle"
                style={{ margin: '4px 0 0' }}
                title={joinParts([props.track.artist, props.track.album])}
              >
                {joinParts([props.track.artist, props.track.album])}
              </p>
            </div>
            <button
              className="soft-button lyrics-search-button"
              onClick={props.onSearchOnline}
              disabled={props.searchState.status === 'searching'}
              aria-busy={props.searchState.status === 'searching'}
            >
              {props.searchState.status === 'searching' && (
                <span className="lyrics-search-spinner" aria-hidden="true" />
              )}
              {props.searchState.status === 'searching'
                ? t.lyrics.searchingAction
                : t.lyrics.searchOnline}
            </button>
          </div>

          {props.searchState.status !== 'idle' && (
            <div
              className={`lyrics-search-feedback ${props.searchState.status}`}
              role={props.searchState.status === 'error' || props.searchState.status === 'not-found'
                ? 'alert'
                : 'status'}
              aria-live="polite"
              title={props.searchState.message}
            >
              {props.searchState.status === 'searching' && (
                <span className="lyrics-search-spinner" aria-hidden="true" />
              )}
              <span>{props.searchState.message}</span>
            </div>
          )}

          {lines.length > 0 && !synchronized && (
            <div className="lyrics-timing-hint tiny muted" title={t.lyrics.unsyncedHint}>
              {t.lyrics.unsyncedHint}
            </div>
          )}

          {props.lyricsFilePath && (
            <div className="lyrics-file-row surface">
              <div className="lyrics-file-copy">
                <div className="tiny muted">{t.lyrics.fileLabel}</div>
                <div className="single-line" title={props.lyricsFilePath}>
                  {props.lyricsFilePath}
                </div>
              </div>
              <button className="soft-button" onClick={props.onRevealLyricsFile}>
                {t.lyrics.revealFile}
              </button>
            </div>
          )}

          {lines.length === 0 ? (
            <div className="empty-state">{t.lyrics.emptyLyrics}</div>
          ) : (
            <div className="lyrics-scroll" ref={lyricsScrollRef}>
              {lines.map((line, index) => (
                <div
                  key={`${line.time}-${index}`}
                  ref={index === activeLineIndex ? activeLineRef : undefined}
                  className={`lyric-line ${index === activeLineIndex ? 'active' : ''}`}
                  aria-current={index === activeLineIndex ? 'true' : undefined}
                >
                  {line.text || '...'}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SettingsView(props: {
  uiSettings: UiSettings;
  playlists: Playlist[];
  roots: Array<{ id: number; path: string; addedAt?: string; lastScannedAt?: string | null }>;
  shortcuts: ShortcutSettings | null;
  shortcutConfigPath: string;
  settingsConfigPath: string;
  desktopLyricsSupported: boolean;
  desktopLyricsVisible: boolean;
  onAddFolders: () => Promise<void>;
  onAddFiles: () => Promise<void>;
  onRefreshLibrary: () => Promise<void>;
  onToggleDesktopLyrics: () => void;
  onSaveShortcuts: (settings: ShortcutSettings) => Promise<void>;
  onRevealShortcutConfig: () => void;
  onRevealSettingsConfig: () => void;
  onSaveUiSettings: (preference: UiLanguagePreference) => Promise<void>;
  onSaveOnlineSettings: (settings: UiSettings) => Promise<void>;
  onResetLayout: () => void;
}) {
  const t = useI18n();
  const layoutCopy = resizableLayoutCopy(t.language);
  const [capturing, setCapturing] = useState<keyof ShortcutSettings | null>(null);
  const [draft, setDraft] = useState<ShortcutSettings>(
    props.shortcuts ?? DEFAULT_SHORTCUTS,
  );
  const [onlineDraft, setOnlineDraft] = useState<UiSettings>(props.uiSettings);
  const [onlineSourceTab, setOnlineSourceTab] = useState<OnlineSourceSetting['resourceType']>('lyrics');

  useEffect(() => {
    if (props.shortcuts) {
      setDraft(props.shortcuts);
    }
  }, [props.shortcuts]);

  useEffect(() => {
    setOnlineDraft(props.uiSettings);
  }, [props.uiSettings]);

  const conflicts = useMemo(() => duplicateShortcuts(draft), [draft]);
  const shortcutItems: Array<{
    key: keyof ShortcutSettings;
    label: string;
  }> = [
    { key: 'togglePlayPause', label: t.settings.togglePlayPause },
    { key: 'nextTrack', label: t.settings.nextTrack },
    { key: 'previousTrack', label: t.settings.previousTrack },
    { key: 'toggleDesktopLyrics', label: t.settings.toggleDesktopLyrics },
    { key: 'toggleDesktopLyricsLock', label: t.settings.toggleDesktopLyricsLock },
  ];

  const saveBinding = (key: keyof ShortcutSettings, value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    setCapturing(null);
    void props.onSaveShortcuts(next);
  };

  return (
    <div className="page-grid">
      <div className="content-card">
        <div className="top-bar-row" style={{ marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: 0 }}>{t.settings.languageTitle}</h3>
            <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
              {t.settings.languageDescription}
            </p>
          </div>
        </div>
        <label className="form-label">
          {t.settings.languageLabel}
          <select
            className="text-input"
            value={props.uiSettings.languagePreference}
            onChange={event => void props.onSaveUiSettings(event.target.value as UiLanguagePreference)}
          >
            <option value="system">
              {t.languageOptionLabel('system', props.uiSettings.resolvedLanguage)}
            </option>
            <option value="en-US">
              {t.languageOptionLabel('en-US', props.uiSettings.resolvedLanguage)}
            </option>
            <option value="zh-CN">
              {t.languageOptionLabel('zh-CN', props.uiSettings.resolvedLanguage)}
            </option>
          </select>
        </label>
      </div>

      <div className="content-card">
        <div className="top-bar-row">
          <div className="top-bar-copy">
            <h3 className="single-line" style={{ margin: 0 }} title={layoutCopy.resetTitle}>
              {layoutCopy.resetTitle}
            </h3>
            <p className="page-subtitle" style={{ margin: '4px 0 0' }} title={layoutCopy.resetDescription}>
              {layoutCopy.resetDescription}
            </p>
          </div>
          <button
            className="soft-button"
            onClick={props.onResetLayout}
            title={layoutCopy.resetAction}
          >
            {layoutCopy.resetAction}
          </button>
        </div>
      </div>

      <div className="content-card">
        <div className="top-bar-row" style={{ marginBottom: 18 }}>
          <div className="top-bar-copy">
            <h3 style={{ margin: 0 }}>{t.settings.onlineTitle}</h3>
            <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
              {t.settings.onlineDescription}
            </p>
          </div>
          <button
            className="primary-button"
            onClick={() => void props.onSaveOnlineSettings(onlineDraft)}
          >
            {t.settings.saveOnlineSettings}
          </button>
        </div>

        <label className="form-label">
          {t.settings.autoLyricsScope}
          <select
            className="text-input"
            value={onlineDraft.autoLyricsScope}
            onChange={event => setOnlineDraft({
              ...onlineDraft,
              autoLyricsScope: event.target.value as AutoLyricsScope,
            })}
          >
            <option value="off">{t.settings.autoLyricsOff}</option>
            <option value="playing">{t.settings.autoLyricsPlaying}</option>
            <option value="library">{t.settings.autoLyricsLibrary}</option>
            <option value="playlists">{t.settings.autoLyricsPlaylists}</option>
          </select>
        </label>

        {onlineDraft.autoLyricsScope === 'playlists' && (
          <div className="online-playlist-picker surface">
            <div className="tiny muted">{t.settings.selectAutoLyricsPlaylists}</div>
            {props.playlists.length === 0 ? (
              <div className="muted">{t.playlists.empty}</div>
            ) : props.playlists.map(playlist => (
              <label className="online-playlist-option" key={playlist.id}>
                <input
                  type="checkbox"
                  checked={onlineDraft.autoLyricsPlaylistIds.includes(playlist.id)}
                  onChange={event => {
                    const selected = event.target.checked
                      ? [...onlineDraft.autoLyricsPlaylistIds, playlist.id]
                      : onlineDraft.autoLyricsPlaylistIds.filter(id => id !== playlist.id);
                    setOnlineDraft({ ...onlineDraft, autoLyricsPlaylistIds: selected });
                  }}
                />
                <span className="single-line" title={playlist.name}>{playlist.name}</span>
              </label>
            ))}
          </div>
        )}

        <div className="online-source-heading">
          <div>
            <h4 style={{ margin: 0 }}>{t.settings.onlineSources}</h4>
            <div className="tiny muted" style={{ marginTop: 4 }}>
              {t.settings.onlineSourcesHint}
            </div>
          </div>
        </div>

        <div className="source-type-toolbar">
          <div className="source-type-tabs" role="tablist" aria-label={t.settings.onlineSources}>
            <button
              type="button"
              role="tab"
              aria-selected={onlineSourceTab === 'lyrics'}
              aria-controls="online-source-panel"
              className={`source-type-tab ${onlineSourceTab === 'lyrics' ? 'is-active' : ''}`}
              onClick={() => setOnlineSourceTab('lyrics')}
            >
              {t.settings.resourceLyrics}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={onlineSourceTab === 'music'}
              aria-controls="online-source-panel"
              className={`source-type-tab ${onlineSourceTab === 'music' ? 'is-active' : ''}`}
              onClick={() => setOnlineSourceTab('music')}
            >
              {t.settings.resourceMusic}
            </button>
          </div>
          <button
            type="button"
            className="soft-button source-add-button"
            onClick={() => setOnlineDraft({
              ...onlineDraft,
              onlineSources: [
                ...onlineDraft.onlineSources,
                {
                  id: `custom-${Date.now()}`,
                  label: t.settings.newSource,
                  resourceType: onlineSourceTab,
                  providerType: onlineSourceTab === 'lyrics' ? 'lrclib' : 'netease',
                  baseUrl: 'https://',
                  enabled: true,
                  priority: (onlineDraft.onlineSources.length + 1) * 10,
                },
              ],
            })}
          >
            {t.settings.addSource}
          </button>
        </div>

        <div className="online-source-list" id="online-source-panel" role="tabpanel">
          {onlineDraft.onlineSources.filter(source => source.resourceType === onlineSourceTab).length === 0 && (
            <div className="online-source-empty surface muted">
              {t.settings.noSourcesForType}
            </div>
          )}
          {onlineDraft.onlineSources.map((source, index) => ({ source, index }))
            .filter(item => item.source.resourceType === onlineSourceTab)
            .map(({ source, index }) => {
              const updateSource = (patch: Partial<OnlineSourceSetting>) => {
                const onlineSources = [...onlineDraft.onlineSources];
                onlineSources[index] = { ...source, ...patch };
                setOnlineDraft({ ...onlineDraft, onlineSources });
              };
              return (
                <div className="online-source-row surface" key={source.id}>
                <input
                  className="text-input"
                  value={source.label}
                  aria-label={t.settings.sourceName}
                  placeholder={t.settings.sourceName}
                  onChange={event => updateSource({ label: event.target.value })}
                />
                <select
                  className="text-input"
                  value={source.providerType}
                  aria-label={t.settings.providerType}
                  onChange={event => updateSource({
                    providerType: event.target.value as OnlineSourceSetting['providerType'],
                  })}
                >
                  {source.resourceType === 'lyrics' && <option value="lrclib">LRCLIB API</option>}
                  <option value="netease">NetEase API</option>
                </select>
                <input
                  className="text-input online-source-url"
                  value={source.baseUrl}
                  aria-label={t.settings.sourceBaseUrl}
                  placeholder="https://"
                  onChange={event => updateSource({ baseUrl: event.target.value })}
                />
                <label className="online-source-priority">
                  <span className="tiny muted">{t.settings.sourcePriority}</span>
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    value={source.priority}
                    onChange={event => updateSource({ priority: Number(event.target.value) || 0 })}
                  />
                </label>
                <label className="online-source-enabled">
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    onChange={event => updateSource({ enabled: event.target.checked })}
                  />
                  <span>{t.settings.sourceEnabled}</span>
                </label>
                <button
                  className="soft-button"
                  onClick={() => setOnlineDraft({
                    ...onlineDraft,
                    onlineSources: onlineDraft.onlineSources.filter((_, itemIndex) => itemIndex !== index),
                  })}
                  aria-label={t.settings.removeSource}
                  title={t.settings.removeSource}
                >
                  X
                </button>
                </div>
              );
            })}
        </div>

        <div className="shortcut-config-row surface">
          <div className="shortcut-config-copy">
            <div className="tiny muted">{t.settings.settingsConfigPath}</div>
            <div className="single-line" title={props.settingsConfigPath}>
              {props.settingsConfigPath || t.common.notAvailable}
            </div>
          </div>
          <button
            className="soft-button"
            onClick={props.onRevealSettingsConfig}
            disabled={!props.settingsConfigPath}
            title={t.settings.revealSettingsConfig}
          >
            {t.settings.revealSettingsConfig}
          </button>
        </div>
      </div>

      <div className="content-card">
        <div className="top-bar-row" style={{ marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: 0 }}>{t.settings.rootsTitle}</h3>
            <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
              {t.settings.rootsDescription}
            </p>
          </div>
          <div className="row-actions">
            <button className="soft-button" onClick={() => void props.onAddFiles()}>
              {t.settings.addFiles}
            </button>
            <button className="soft-button" onClick={() => void props.onAddFolders()}>
              {t.settings.addFolders}
            </button>
            <button className="primary-button" onClick={() => void props.onRefreshLibrary()}>
              {t.settings.refreshLibrary}
            </button>
          </div>
        </div>
        <div className="stack">
          {props.roots.length === 0 ? (
            <div className="empty-state">{t.settings.noRoots}</div>
          ) : (
            props.roots.map(root => (
              <div key={root.id} className="surface root-row" style={{ padding: 14, borderRadius: 16 }}>
                <div className="single-line" title={root.path}>{root.path}</div>
                <div
                  className="muted tiny single-line"
                  style={{ marginTop: 4 }}
                  title={t.settings.lastScanned(root.lastScannedAt)}
                >
                  {t.settings.lastScanned(root.lastScannedAt)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="content-card">
        <div className="top-bar-row" style={{ marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: 0 }}>{t.settings.desktopLyricsTitle}</h3>
            <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
              {t.settings.desktopLyricsDescription}
            </p>
          </div>
          <button
            className={props.desktopLyricsVisible ? 'soft-button' : 'primary-button'}
            onClick={props.onToggleDesktopLyrics}
            disabled={!props.desktopLyricsSupported}
          >
            {props.desktopLyricsVisible
              ? t.settings.hideDesktopLyrics
              : t.settings.showDesktopLyrics}
          </button>
        </div>
        <div className="muted">
          {props.desktopLyricsSupported
            ? t.settings.desktopLyricsAvailable
            : t.settings.desktopLyricsUnavailable}
        </div>
      </div>

      <div className="content-card">
        <h3 style={{ marginTop: 0 }}>{t.settings.shortcutsTitle}</h3>
        <p className="page-subtitle">{t.settings.shortcutsDescription}</p>
        <p className="tiny muted" style={{ marginTop: 10 }}>
          {t.settings.shortcutCaptureHint}
        </p>
        <div className="shortcut-bindings" style={{ marginTop: 18 }}>
          {shortcutItems.map(item => {
            const listening = capturing === item.key;
            const conflict = conflicts.has(item.key);
            return (
              <div className={`shortcut-binding-row ${conflict ? 'has-conflict' : ''}`} key={item.key}>
                <div className="shortcut-binding-label">
                  <div className="single-line" title={item.label}>{item.label}</div>
                  {conflict && <div className="tiny shortcut-conflict">{t.settings.shortcutConflict}</div>}
                </div>
                <button
                  className={`shortcut-capture-button ${listening ? 'is-listening' : ''}`}
                  onClick={() => setCapturing(item.key)}
                  onBlur={() => setCapturing(current => current === item.key ? null : current)}
                  onKeyDown={event => {
                    if (!listening) return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.key === 'Escape') {
                      setCapturing(null);
                      return;
                    }
                    if (event.key === 'Backspace' || event.key === 'Delete') {
                      saveBinding(item.key, '');
                      return;
                    }
                    const value = shortcutFromKeyboardEvent(event);
                    if (value) saveBinding(item.key, value);
                  }}
                  aria-pressed={listening}
                >
                  {listening
                    ? t.settings.shortcutListening
                    : draft[item.key] || t.settings.shortcutUnbound}
                </button>
                <button
                  className="soft-button shortcut-reset-button"
                  onClick={() => saveBinding(item.key, DEFAULT_SHORTCUTS[item.key])}
                  disabled={draft[item.key] === DEFAULT_SHORTCUTS[item.key]}
                >
                  {t.settings.shortcutReset}
                </button>
              </div>
            );
          })}
        </div>
        <div className="shortcut-config-row surface">
          <div className="shortcut-config-copy">
            <div className="tiny muted">{t.settings.shortcutConfigPath}</div>
            <div className="single-line" title={props.shortcutConfigPath}>
              {props.shortcutConfigPath || t.common.notAvailable}
            </div>
          </div>
          <button
            className="soft-button"
            onClick={props.onRevealShortcutConfig}
            disabled={!props.shortcutConfigPath}
          >
            {t.settings.revealShortcutConfig}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayerBar(props: {
  track: Track | null;
  playback: {
    audioState: PlaybackState;
    positionMs: number;
    durationMs: number;
    volume: number;
    muted: boolean;
    mode: string;
    desktopLyricsLocked: boolean;
  };
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (value: number) => void;
  onVolume: (value: number) => void;
  onMute: () => void;
  onCycleMode: () => void;
  onOpenLyrics: () => void;
  onToggleDesktopLyrics?: () => void;
  onToggleDesktopLyricsLock?: () => void;
}) {
  const t = useI18n();

  return (
    <footer className="player-bar">
      <div className="content-card player-bar-shell">
        <div className="row-actions player-track">
          <div className="cover-frame">
            <PlayerArtwork track={props.track} />
          </div>
          <div className="player-track-copy">
            <div
              className="track-title"
              title={props.track?.title ?? t.player.nothingPlaying}
            >
              {props.track?.title ?? t.player.nothingPlaying}
            </div>
            <div
              className="track-subtitle"
              title={props.track
                ? joinParts([props.track.artist, props.track.album])
                : t.player.startHint}
            >
              {props.track
                ? joinParts([props.track.artist, props.track.album])
                : t.player.startHint}
            </div>
          </div>
        </div>

        <div className="player-main-controls">
          <div className="transport-row">
            <button
              className="icon-button"
              onClick={props.onCycleMode}
              title={t.player.playbackMode}
              aria-label={t.player.playbackMode}
            >
              {t.playbackModeShortLabel(props.playback.mode)}
            </button>
            <button
              className="icon-button"
              onClick={props.onPrevious}
              title={t.settings.previousTrack}
              aria-label={t.settings.previousTrack}
            >
              {"<<"}
            </button>
            <button
              className="transport-primary"
              onClick={props.onToggle}
              title={t.settings.togglePlayPause}
              aria-label={t.settings.togglePlayPause}
            >
              {props.playback.audioState === 'playing' || props.playback.audioState === 'buffering'
                ? '||'
                : '>'}
            </button>
            <button
              className="icon-button"
              onClick={props.onNext}
              title={t.settings.nextTrack}
              aria-label={t.settings.nextTrack}
            >
              {">>"}
            </button>
            <button
              className="icon-button"
              onClick={props.onOpenLyrics}
              title={t.nav.items.lyrics.label}
              aria-label={t.nav.items.lyrics.label}
            >
              LRC
            </button>
            {props.onToggleDesktopLyrics && (
              <button
                className="icon-button"
                onClick={props.onToggleDesktopLyrics}
                title={t.player.desktopLyrics}
                aria-label={t.player.desktopLyrics}
              >
                L+
              </button>
            )}
            {props.onToggleDesktopLyricsLock && (
              <button
                className={`icon-button ${props.playback.desktopLyricsLocked ? 'is-active' : ''}`}
                onClick={props.onToggleDesktopLyricsLock}
                title={props.playback.desktopLyricsLocked
                  ? t.player.unlockDesktopLyrics
                  : t.player.lockDesktopLyrics}
                aria-label={props.playback.desktopLyricsLocked
                  ? t.player.unlockDesktopLyrics
                  : t.player.lockDesktopLyrics}
                aria-pressed={props.playback.desktopLyricsLocked}
              >
                {props.playback.desktopLyricsLocked ? '🔓' : '🔒'}
              </button>
            )}
          </div>
          <div className="slider-row">
            <span className="duration-label">{formatDuration(props.playback.positionMs / 1000)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(props.playback.durationMs, 1)}
              value={Math.min(props.playback.positionMs, props.playback.durationMs || 1)}
              onChange={event => props.onSeek(Number(event.target.value))}
            />
            <span className="duration-label">{formatDuration(props.playback.durationMs / 1000)}</span>
          </div>
        </div>

        <div className="stack player-volume">
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button
              className="icon-button"
              onClick={props.onMute}
              title={t.player.volumeMode(props.playback.volume, t.playbackModeLabel(props.playback.mode))}
              aria-label={t.player.volumeMode(props.playback.volume, t.playbackModeLabel(props.playback.mode))}
            >
              {props.playback.muted || props.playback.volume === 0 ? 'M' : 'VOL'}
            </button>
            <input
              className="volume-slider"
              type="range"
              min={0}
              max={100}
              value={props.playback.volume}
              onChange={event => props.onVolume(Number(event.target.value))}
            />
          </div>
          <div
            className="muted tiny player-status"
            style={{ textAlign: 'right' }}
            title={t.player.volumeMode(props.playback.volume, t.playbackModeLabel(props.playback.mode))}
          >
            {t.player.volumeMode(
              props.playback.volume,
              t.playbackModeLabel(props.playback.mode),
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

function PlayerArtwork(props: { track: Track | null }) {
  const artworkRef = props.track?.artworkRef ?? null;
  const source = useMemo(
    () => artworkRef ? toWebAssetSource(artworkRef) : null,
    [artworkRef],
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [source]);

  if (!source || failed) {
    return <span className="cover-fallback" aria-hidden="true">♪</span>;
  }

  return <img src={source} alt="" onError={() => setFailed(true)} />;
}

function TrackTable(props: {
  tracks: Track[];
  currentTrackId: number | null;
  onPlay: (track: Track, index: number) => void;
  renderActions?: (track: Track, index: number) => ReactNode;
}) {
  const t = useI18n();
  const hasActions = Boolean(props.renderActions);
  const columnSizing = useContext(TrackColumnSizingContext);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);

  if (!columnSizing) {
    throw new Error('TrackTable must be rendered inside TrackColumnSizingContext.');
  }

  useEffect(() => {
    const element = tableWrapRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => setTableWidth(element.getBoundingClientRect().width);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const showAlbum = tableWidth === 0 || tableWidth > 980;
  const showSourceAndFormat = tableWidth === 0 || tableWidth > 820;
  const showStatus = tableWidth === 0 || tableWidth > 680;
  const showArtist = tableWidth === 0 || tableWidth > 560;
  const actionsWidth = tableWidth > 0 && tableWidth <= 560 ? 160 : 178;
  const fixedColumnsWidth = 48
    + 72
    + (showSourceAndFormat ? 96 + 70 : 0)
    + (showStatus ? 100 : 0)
    + (hasActions ? actionsWidth : 0);
  const fittedColumns = fitTrackColumns(
    {
      title: columnSizing.title.value,
      artist: columnSizing.artist.value,
      album: columnSizing.album.value,
    },
    Math.max(0, tableWidth - fixedColumnsWidth),
    { artist: showArtist, album: showAlbum },
  );
  const tableStyle = {
    '--title-column-width': `${fittedColumns.title}px`,
    '--artist-column-width': `${fittedColumns.artist}px`,
    '--album-column-width': `${fittedColumns.album}px`,
  } as CSSProperties;

  return (
    <div className="track-table-wrap" ref={tableWrapRef}>
      <table className={`track-table ${hasActions ? 'has-actions' : ''}`} style={tableStyle}>
        <thead>
          <tr>
            <th className="index-column">#</th>
            <th className="title-column resizable-column">
              <span className="header-label">{t.table.track}</span>
              <ResizeHandle
                className="column-resize-handle"
                label={columnSizing.labels.titleColumnHandle}
                value={fittedColumns.title}
                min={columnSizing.title.min}
                max={columnSizing.title.max}
                onChange={columnSizing.title.setValue}
                onCommit={columnSizing.title.commitValue}
                onReset={columnSizing.title.reset}
              />
            </th>
            <th className="artist-column resizable-column">
              <span className="header-label">{t.editor.artistLabel}</span>
              <ResizeHandle
                className="column-resize-handle"
                label={columnSizing.labels.artistColumnHandle}
                value={fittedColumns.artist}
                min={columnSizing.artist.min}
                max={columnSizing.artist.max}
                onChange={columnSizing.artist.setValue}
                onCommit={columnSizing.artist.commitValue}
                onReset={columnSizing.artist.reset}
              />
            </th>
            <th className="album-column resizable-column">
              <span className="header-label">{t.editor.albumLabel}</span>
              <ResizeHandle
                className="column-resize-handle"
                label={columnSizing.labels.albumColumnHandle}
                value={fittedColumns.album}
                min={columnSizing.album.min}
                max={columnSizing.album.max}
                onChange={columnSizing.album.setValue}
                onCommit={columnSizing.album.commitValue}
                onReset={columnSizing.album.reset}
              />
            </th>
            <th className="source-column">{t.table.source}</th>
            <th className="status-column">{t.table.status}</th>
            <th className="time-column">{t.table.time}</th>
            <th className="format-column">{t.table.format}</th>
            {hasActions && <th className="actions-column">{t.table.actions}</th>}
          </tr>
        </thead>
        <tbody>
          {props.tracks.map((track, index) => (
            <tr
              key={track.id}
              className={track.id === props.currentTrackId ? 'is-active' : ''}
              onDoubleClick={() => props.onPlay(track, index)}
              title={joinParts([
                track.title,
                track.artist,
                track.album,
                track.composer,
                track.format,
              ])}
            >
              <td className="index-column fixed-control">{index + 1}</td>
              <td className="title-cell">
                <div className="track-title" title={track.title}>{track.title}</div>
              </td>
              <td className="artist-column">
                <div className="cell-text" title={track.artist || t.common.notAvailable}>
                  {track.artist || t.common.notAvailable}
                </div>
              </td>
              <td className="album-column">
                <div className="cell-text" title={track.album || t.common.notAvailable}>
                  {track.album || t.common.notAvailable}
                </div>
              </td>
              <td className="source-column">
                <div className="cell-text" title={t.sourceKindLabel(track.sourceKind)}>
                  {t.sourceKindLabel(track.sourceKind)}
                </div>
              </td>
              <td className="status-column">
                <span
                  className={`pill ${track.availability}`}
                  title={t.availabilityLabel(track.availability)}
                >
                  {t.availabilityLabel(track.availability)}
                </span>
              </td>
              <td className="time-column fixed-control">{formatDuration(track.duration)}</td>
              <td className="format-column">
                <div className="cell-text" title={track.format || t.common.notAvailable}>
                  {track.format || t.common.notAvailable}
                </div>
              </td>
              {hasActions && (
                <td className="actions-column fixed-control">
                  <div className="row-actions">{props.renderActions?.(track, index)}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddSourceModal(props: {
  onClose: () => void;
  onComplete: (message: string) => Promise<void>;
}) {
  const t = useI18n();
  const [tab, setTab] = useState<'local' | 'url' | 'resolver'>('local');
  const [urlDraft, setUrlDraft] = useState<DirectUrlInput>({ url: '' });
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ResolverSearchResult[]>([]);
  const [busy, setBusy] = useState(false);

  const handleAddFolders = async () => {
    setBusy(true);
    try {
      const paths = await commands.pickFolders();
      if (paths.length > 0) {
        const summary = await commands.scanPaths(paths, true);
        await props.onComplete(t.status.importedFolders(summary.added, summary.updated));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAddFiles = async () => {
    setBusy(true);
    try {
      const paths = await commands.pickFiles();
      if (paths.length > 0) {
        const summary = await commands.scanPaths(paths, false);
        await props.onComplete(t.status.importedFiles(summary.added, summary.updated));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAddUrl = async () => {
    if (!urlDraft.url.trim()) {
      return;
    }
    setBusy(true);
    try {
      await commands.addDirectUrl(urlDraft);
      await props.onComplete(t.status.addedDirectUrl);
    } finally {
      setBusy(false);
    }
  };

  const handleSearch = async () => {
    setBusy(true);
    try {
      const results = await commands.searchNetease(query);
      setSearchResults(results);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>{t.import.title}</h2>
            <p className="page-subtitle" style={{ margin: '6px 0 0' }}>
              {t.import.subtitle}
            </p>
          </div>
          <button className="icon-button" onClick={props.onClose}>X</button>
        </div>

        <div className="modal-tabs" style={{ marginBottom: 18 }}>
          {[
            ['local', t.import.localTab],
            ['url', t.import.urlTab],
            ['resolver', t.import.resolverTab],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`modal-tab ${tab === key ? 'active' : ''}`}
              onClick={() => setTab(key as typeof tab)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'local' && (
          <div className="stack">
            <div className="content-card" style={{ padding: 18 }}>
              <h3 style={{ marginTop: 0 }}>{t.import.localTitle}</h3>
              <p className="page-subtitle">{t.import.localDescription}</p>
              <div className="row-actions" style={{ marginTop: 16 }}>
                <button className="primary-button" disabled={busy} onClick={() => void handleAddFolders()}>
                  {t.import.pickFolders}
                </button>
                <button className="soft-button" disabled={busy} onClick={() => void handleAddFiles()}>
                  {t.import.pickFiles}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'url' && (
          <div className="stack">
            <div className="form-grid">
              <label className="form-label">
                {t.import.streamUrl}
                <input
                  className="text-input"
                  placeholder={t.import.streamUrlPlaceholder}
                  value={urlDraft.url}
                  onChange={event => setUrlDraft({ ...urlDraft, url: event.target.value })}
                />
              </label>
              <label className="form-label">
                {t.import.titleLabel}
                <input
                  className="text-input"
                  value={urlDraft.title ?? ''}
                  onChange={event => setUrlDraft({ ...urlDraft, title: event.target.value })}
                />
              </label>
              <label className="form-label">
                {t.import.artistLabel}
                <input
                  className="text-input"
                  value={urlDraft.artist ?? ''}
                  onChange={event => setUrlDraft({ ...urlDraft, artist: event.target.value })}
                />
              </label>
              <label className="form-label">
                {t.import.albumLabel}
                <input
                  className="text-input"
                  value={urlDraft.album ?? ''}
                  onChange={event => setUrlDraft({ ...urlDraft, album: event.target.value })}
                />
              </label>
            </div>
            <div className="row-actions">
              <button className="primary-button" disabled={busy || !urlDraft.url.trim()} onClick={() => void handleAddUrl()}>
                {t.import.addDirectUrl}
              </button>
            </div>
          </div>
        )}

        {tab === 'resolver' && (
          <div className="stack">
            <div className="row-actions">
              <input
                className="search-input"
                placeholder={t.import.resolverSearchPlaceholder}
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    void handleSearch();
                  }
                }}
              />
              <button className="primary-button" disabled={busy || !query.trim()} onClick={() => void handleSearch()}>
                {t.import.searchAction}
              </button>
            </div>
            <div className="result-list">
              {searchResults.map(result => (
                <div key={`${result.resolverId}-${result.id}`} className="result-row">
                  <div>
                    <div className="track-title">{result.title}</div>
                    <div className="track-subtitle">{joinParts([result.artist, result.album])}</div>
                  </div>
                  <div className="row-actions">
                    <span className="muted tiny">{formatDuration(result.duration)}</span>
                    <button
                      className="primary-button"
                      onClick={async () => {
                        await commands.addResolverTrack(result);
                        await props.onComplete(t.status.addedResolverTrack(result.title));
                      }}
                    >
                      {t.import.addResult}
                    </button>
                  </div>
                </div>
              ))}
              {searchResults.length === 0 && (
                <div className="empty-state">{t.import.emptyResults}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditTrackModal(props: {
  track: Track | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useI18n();
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({
    title: '',
    artist: '',
    album: '',
    composer: '',
    duration: '',
    artworkRef: '',
    lyricRef: '',
    lyricText: '',
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      if (!props.track) {
        return;
      }
      const override = await commands.getOverride(props.track.id);
      const lyrics = await commands.getLyrics(props.track.id);
      if (cancelled) {
        return;
      }
      setDraft({
        title: override?.title ?? props.track.title,
        artist: override?.artist ?? props.track.artist,
        album: override?.album ?? props.track.album,
        composer: override?.composer ?? props.track.composer,
        duration: String(override?.duration ?? props.track.duration ?? 0),
        artworkRef: override?.artworkRef ?? props.track.artworkRef ?? '',
        lyricRef: override?.lyricRef ?? props.track.lyricRef ?? '',
        lyricText: override?.lyricText ?? lyrics?.syncedText ?? lyrics?.plainText ?? '',
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [props.track?.id]);

  if (!props.track) {
    return null;
  }

  const track = props.track;

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>{t.editor.title}</h2>
            <p className="page-subtitle" style={{ margin: '6px 0 0' }}>
              {t.editor.subtitle}
            </p>
          </div>
          <button className="icon-button" onClick={props.onClose}>X</button>
        </div>

        {loading ? (
          <div className="empty-state">{t.editor.loading}</div>
        ) : (
          <>
            <div className="form-grid">
              <label className="form-label">
                {t.editor.titleLabel}
                <input className="text-input" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <label className="form-label">
                {t.editor.artistLabel}
                <input className="text-input" value={draft.artist} onChange={event => setDraft({ ...draft, artist: event.target.value })} />
              </label>
              <label className="form-label">
                {t.editor.albumLabel}
                <input className="text-input" value={draft.album} onChange={event => setDraft({ ...draft, album: event.target.value })} />
              </label>
              <label className="form-label">
                {t.editor.composerLabel}
                <input className="text-input" value={draft.composer} onChange={event => setDraft({ ...draft, composer: event.target.value })} />
              </label>
              <label className="form-label">
                {t.editor.durationLabel}
                <input className="text-input" value={draft.duration} onChange={event => setDraft({ ...draft, duration: event.target.value })} />
              </label>
              <label className="form-label">
                {t.editor.artworkRefLabel}
                <input className="text-input" value={draft.artworkRef} onChange={event => setDraft({ ...draft, artworkRef: event.target.value })} />
              </label>
              <label className="form-label">
                {t.editor.lyricRefLabel}
                <input className="text-input" value={draft.lyricRef} onChange={event => setDraft({ ...draft, lyricRef: event.target.value })} />
              </label>
            </div>
            <label className="form-label" style={{ marginTop: 16 }}>
              {t.editor.lyricTextLabel}
              <textarea
                className="text-area"
                rows={10}
                value={draft.lyricText}
                onChange={event => setDraft({ ...draft, lyricText: event.target.value })}
              />
            </label>
            <div className="row-actions" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="soft-button" onClick={props.onClose}>
                {t.common.cancel}
              </button>
              <button
                className="primary-button"
                onClick={async () => {
                  await useAppStore.getState().saveOverride({
                    trackId: track.id,
                    title: draft.title,
                    artist: draft.artist,
                    album: draft.album,
                    composer: draft.composer,
                    duration: Number(draft.duration) || 0,
                    artworkRef: draft.artworkRef || null,
                    lyricRef: draft.lyricRef || null,
                    lyricText: draft.lyricText || null,
                  });
                  await props.onSaved();
                }}
              >
                {t.editor.save}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AddToPlaylistModal(props: {
  track: Track | null;
  playlists: Playlist[];
  onClose: () => void;
  onChoose: (playlistId: number) => Promise<void>;
}) {
  const t = useI18n();

  if (!props.track) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>{t.addToPlaylist.title}</h2>
            <p className="page-subtitle" style={{ margin: '6px 0 0' }}>
              {joinParts([props.track.title, props.track.artist])}
            </p>
          </div>
          <button className="icon-button" onClick={props.onClose}>X</button>
        </div>

        <div className="result-list">
          {props.playlists.length === 0 && (
            <div className="empty-state">{t.addToPlaylist.empty}</div>
          )}
          {props.playlists.map(playlist => (
            <div key={playlist.id} className="result-row">
              <div>
                <div className="track-title">{playlist.name}</div>
                <div className="track-subtitle">{t.common.tracks(playlist.songCount)}</div>
              </div>
              <button className="primary-button" onClick={() => void props.onChoose(playlist.id)}>
                {t.addToPlaylist.addAction}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildDesktopLyricsPayload(
  track: Track,
  lyrics: LyricsData,
  positionMs: number,
  playbackState: PlaybackState,
) {
  const synchronized = Boolean(
    lyrics.syncedText && LRCParser.isSynced(lyrics.syncedText),
  );
  const raw = synchronized
    ? lyrics.syncedText || ''
    : lyrics.plainText || lyrics.syncedText || '';
  const lines = LRCParser.parse(raw);
  const activeIndex = synchronized
    ? findActiveLyricLineIndex(lines, positionMs)
    : -1;
  return {
    title: track.title,
    artist: track.artist,
    currentLine: lines[activeIndex]?.text || lines[0]?.text || track.title,
    nextLine: lines[activeIndex + 1]?.text || lines[1]?.text || track.artist,
    isPlaying: playbackState === 'playing' || playbackState === 'buffering',
  };
}

function findActiveLyricLineIndex(lines: LyricLine[], positionMs: number): number {
  const seconds = positionMs / 1000;
  let activeIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time <= seconds) {
      activeIndex = index;
    } else {
      break;
    }
  }
  return activeIndex;
}

function fitTrackColumns(
  preferred: { title: number; artist: number; album: number },
  availableWidth: number,
  visible: { artist: boolean; album: boolean },
) {
  const columns = [
    { key: 'title' as const, min: 140, preferred: preferred.title, visible: true },
    { key: 'artist' as const, min: 100, preferred: preferred.artist, visible: visible.artist },
    { key: 'album' as const, min: 100, preferred: preferred.album, visible: visible.album },
  ];
  const visibleColumns = columns.filter(column => column.visible);
  const minimumWidth = visibleColumns.reduce((total, column) => total + column.min, 0);
  const desiredExtra = visibleColumns.reduce(
    (total, column) => total + Math.max(0, column.preferred - column.min),
    0,
  );
  const availableExtra = Math.max(0, availableWidth - minimumWidth);
  const extraRatio = desiredExtra > 0 ? Math.min(1, availableExtra / desiredExtra) : 0;
  const result = {
    title: preferred.title,
    artist: preferred.artist,
    album: preferred.album,
  };

  for (const column of visibleColumns) {
    result[column.key] = Math.round(
      column.min + Math.max(0, column.preferred - column.min) * extraRatio,
    );
  }

  return result;
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(' · ');
}

function formatError(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}
