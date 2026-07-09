import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  formatDuration,
  LRCParser,
  resolveUiLanguage,
  type LyricsData,
  type PlaybackState,
  type Playlist,
  type ResolverSearchResult,
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
import { useAppStore, type ViewId } from './store';
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

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

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
    let unlistenLibrary = () => {};
    let unlistenScan = () => {};
    let unlistenDone = () => {};
    let unlistenTransport = () => {};
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
        void playbackService.handleTransport(payload);
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
      stopDrag();
    };
  }, [
    refreshBootstrap,
    setDragImportActive,
    setScanProgress,
    setScanSummary,
    setStatus,
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
    void commands.pushDesktopLyrics(payload);
  }, [
    currentTrack,
    currentLyrics,
    playback.positionMs,
    playback.audioState,
    desktopLyricsSupported,
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

  const handleSaveUiSettings = async (preference: UiLanguagePreference) => {
    const nextSettings: UiSettings = {
      languagePreference: preference,
      resolvedLanguage: resolveUiLanguage(preference, runtimeLanguages),
    };

    try {
      await saveUiSettings(nextSettings);
    } catch (error) {
      setStatus(formatError(error, strings.common.unknownError), 'error');
    }
  };

  if (bootstrapping && !ready) {
    return (
      <I18nProvider value={strings}>
        <LoadingScreen />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider value={strings}>
      <div className="app-shell">
        <Sidebar
          currentView={view}
          onViewChange={setView}
          onOpenImport={openAddSource}
          playlists={playlists}
          activePlaylistId={activePlaylistId}
          onOpenPlaylist={playlistId => {
            setView('playlists');
            void setActivePlaylist(playlistId);
          }}
        />

        <div className="main-layout">
          <header className="top-bar">
            <div className="top-bar-row">
              <div>
                <h1 className="page-title">{strings.page.title(view)}</h1>
                <p className="page-subtitle">
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
              </div>
            </div>

            {statusMessage && (
              <div className={`status-banner ${statusTone === 'error' ? 'error' : ''}`} style={{ marginTop: 16 }}>
                {statusMessage}
              </div>
            )}
            {scanProgress && (
              <div className="status-banner" style={{ marginTop: 12 }}>
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
                currentTrackId={playback.currentTrackId}
                onPlay={trackId => void playbackService.playTrack(trackId, playback.queue)}
              />
            )}

            {view === 'lyrics' && (
              <LyricsView
                track={currentTrack}
                lyrics={currentLyrics}
                positionMs={playback.positionMs}
                onSearchOnline={() => currentTrack && void loadLyrics(currentTrack.id, true)}
              />
            )}

            {view === 'settings' && (
              <SettingsView
                uiSettings={uiSettings}
                roots={roots}
                shortcuts={shortcuts}
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
                onSaveUiSettings={handleSaveUiSettings}
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
          />
        </div>

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
    </I18nProvider>
  );
}

function LoadingScreen() {
  const t = useI18n();
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      <div className="content-card" style={{ width: 420, textAlign: 'center' }}>
        <div className="brand-badge" style={{ margin: '0 auto 18px' }}>AMP</div>
        <h1 className="page-title" style={{ fontSize: 28 }}>{t.common.appName}</h1>
        <p className="page-subtitle">{t.loading.tagline}</p>
      </div>
    </div>
  );
}

function Sidebar(props: {
  currentView: ViewId;
  playlists: Playlist[];
  activePlaylistId: number | null;
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
    <aside className="sidebar">
      <div className="sidebar-card">
        <div className="brand">
          <div className="brand-badge">AMP</div>
          <div>
            <div className="brand-eyebrow">{t.nav.brandEyebrow}</div>
            <h2 className="brand-title">{t.common.appName}</h2>
            <p className="brand-subtitle">{t.nav.brandSubtitle}</p>
          </div>
        </div>
      </div>

      <div className="sidebar-card nav-list">
        {items.map(item => (
          <button
            key={item.id}
            className={`nav-button ${props.currentView === item.id ? 'active' : ''}`}
            onClick={() => props.onViewChange(item.id)}
          >
            <span>{item.label}</span>
            <span className="tiny muted">{item.hint}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-card">
        <p className="sidebar-section-title">{t.nav.quickPlaylists}</p>
        <div className="playlist-nav">
          {props.playlists.length === 0 && (
            <div className="muted tiny">{t.nav.quickPlaylistsEmpty}</div>
          )}
          {props.playlists.map(playlist => (
            <button
              key={playlist.id}
              className={`playlist-link ${props.activePlaylistId === playlist.id ? 'active' : ''}`}
              onClick={() => props.onOpenPlaylist(playlist.id)}
            >
              {playlist.name} <span className="muted tiny">({playlist.songCount})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <button className="primary-button" style={{ width: '100%' }} onClick={props.onOpenImport}>
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
              <div className="row-actions">
                {track.sourceKind === 'local_file' && (
                  <button className="ghost-button" onClick={() => props.onReveal(track.id)}>
                    {t.library.reveal}
                  </button>
                )}
                <button className="ghost-button" onClick={() => props.onAddToPlaylist(track.id)}>
                  {t.library.playlist}
                </button>
                <button className="soft-button" onClick={() => props.onEdit(track.id)}>
                  {t.library.edit}
                </button>
                <button className="danger-button" onClick={() => props.onRemove(track.id)}>
                  {t.library.remove}
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
              >
                {playlist.name} <span className="muted tiny">({playlist.songCount})</span>
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
                <div>
                  <h3 style={{ margin: 0 }}>
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
                    style={{ width: 240 }}
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
                    <button className="danger-button" onClick={() => props.onRemoveTrack(track.id)}>
                      {t.playlists.removeTrack}
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

function QueueView(props: {
  tracks: Track[];
  currentTrackId: number | null;
  onPlay: (trackId: number) => void;
}) {
  const t = useI18n();
  return (
    <div className="content-card">
      {props.tracks.length === 0 ? (
        <div className="empty-state">{t.queue.empty}</div>
      ) : (
        <TrackTable
          tracks={props.tracks}
          currentTrackId={props.currentTrackId}
          onPlay={track => props.onPlay(track.id)}
        />
      )}
    </div>
  );
}

function LyricsView(props: {
  track: Track | null;
  lyrics: LyricsData | null;
  positionMs: number;
  onSearchOnline: () => void;
}) {
  const t = useI18n();
  const lines = useMemo(() => {
    if (!props.lyrics) {
      return [];
    }
    const source = props.lyrics.syncedText || props.lyrics.plainText || '';
    return LRCParser.parse(source);
  }, [props.lyrics]);

  const activeLineIndex = useMemo(() => {
    const seconds = props.positionMs / 1000;
    let index = -1;
    for (let position = 0; position < lines.length; position += 1) {
      if (lines[position].time <= seconds) {
        index = position;
      }
    }
    return index;
  }, [lines, props.positionMs]);

  return (
    <div className="content-card">
      {!props.track ? (
        <div className="empty-state">{t.lyrics.emptyTrack}</div>
      ) : (
        <>
          <div className="top-bar-row" style={{ marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0 }}>{props.track.title}</h3>
              <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
                {joinParts([props.track.artist, props.track.album])}
              </p>
            </div>
            <button className="soft-button" onClick={props.onSearchOnline}>
              {t.lyrics.searchOnline}
            </button>
          </div>

          {lines.length === 0 ? (
            <div className="empty-state">{t.lyrics.emptyLyrics}</div>
          ) : (
            <div className="lyrics-scroll">
              {lines.map((line, index) => (
                <div
                  key={`${line.time}-${index}`}
                  className={`lyric-line ${index === activeLineIndex ? 'active' : ''}`}
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
  roots: Array<{ id: number; path: string; addedAt?: string; lastScannedAt?: string | null }>;
  shortcuts: ShortcutSettings | null;
  desktopLyricsSupported: boolean;
  desktopLyricsVisible: boolean;
  onAddFolders: () => Promise<void>;
  onAddFiles: () => Promise<void>;
  onRefreshLibrary: () => Promise<void>;
  onToggleDesktopLyrics: () => void;
  onSaveShortcuts: (settings: ShortcutSettings) => Promise<void>;
  onSaveUiSettings: (preference: UiLanguagePreference) => Promise<void>;
}) {
  const t = useI18n();
  const [draft, setDraft] = useState<ShortcutSettings>(
    props.shortcuts ?? {
      togglePlayPause: 'Space',
      nextTrack: 'Ctrl+Right',
      previousTrack: 'Ctrl+Left',
      toggleDesktopLyrics: 'Ctrl+L',
    },
  );

  useEffect(() => {
    if (props.shortcuts) {
      setDraft(props.shortcuts);
    }
  }, [props.shortcuts]);

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
              <div key={root.id} className="surface" style={{ padding: 14, borderRadius: 16 }}>
                <div>{root.path}</div>
                <div className="muted tiny" style={{ marginTop: 4 }}>
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
        <div className="form-grid" style={{ marginTop: 18 }}>
          <label className="form-label">
            {t.settings.togglePlayPause}
            <input
              className="text-input"
              value={draft.togglePlayPause}
              onChange={event => setDraft({ ...draft, togglePlayPause: event.target.value })}
            />
          </label>
          <label className="form-label">
            {t.settings.nextTrack}
            <input
              className="text-input"
              value={draft.nextTrack}
              onChange={event => setDraft({ ...draft, nextTrack: event.target.value })}
            />
          </label>
          <label className="form-label">
            {t.settings.previousTrack}
            <input
              className="text-input"
              value={draft.previousTrack}
              onChange={event => setDraft({ ...draft, previousTrack: event.target.value })}
            />
          </label>
          <label className="form-label">
            {t.settings.toggleDesktopLyrics}
            <input
              className="text-input"
              value={draft.toggleDesktopLyrics}
              onChange={event => setDraft({ ...draft, toggleDesktopLyrics: event.target.value })}
            />
          </label>
        </div>
        <div className="row-actions" style={{ marginTop: 18 }}>
          <button className="primary-button" onClick={() => void props.onSaveShortcuts(draft)}>
            {t.settings.saveShortcuts}
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
}) {
  const t = useI18n();

  return (
    <footer className="player-bar">
      <div className="content-card player-bar-shell">
        <div className="row-actions">
          <div className="cover-frame">
            {props.track?.artworkRef ? (
              <img src={toWebAssetSource(props.track.artworkRef)} alt="" />
            ) : (
              '♪'
            )}
          </div>
          <div>
            <div className="track-title">{props.track?.title ?? t.player.nothingPlaying}</div>
            <div className="track-subtitle">
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
            >
              {t.playbackModeShortLabel(props.playback.mode)}
            </button>
            <button className="icon-button" onClick={props.onPrevious}>{"<<"}</button>
            <button className="transport-primary" onClick={props.onToggle}>
              {props.playback.audioState === 'playing' ? '||' : '>'}
            </button>
            <button className="icon-button" onClick={props.onNext}>{">>"}</button>
            <button className="icon-button" onClick={props.onOpenLyrics}>
              LRC
            </button>
            {props.onToggleDesktopLyrics && (
              <button className="icon-button" onClick={props.onToggleDesktopLyrics}>
                {t.player.desktopLyrics}
              </button>
            )}
          </div>
          <div className="slider-row">
            <span>{formatDuration(props.playback.positionMs / 1000)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(props.playback.durationMs, 1)}
              value={Math.min(props.playback.positionMs, props.playback.durationMs || 1)}
              onChange={event => props.onSeek(Number(event.target.value))}
            />
            <span>{formatDuration(props.playback.durationMs / 1000)}</span>
          </div>
        </div>

        <div className="stack">
          <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="icon-button" onClick={props.onMute}>
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
          <div className="muted tiny" style={{ textAlign: 'right' }}>
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

function TrackTable(props: {
  tracks: Track[];
  currentTrackId: number | null;
  onPlay: (track: Track, index: number) => void;
  renderActions?: (track: Track) => ReactNode;
}) {
  const t = useI18n();

  return (
    <table className="track-table">
      <thead>
        <tr>
          <th style={{ width: 60 }}>#</th>
          <th>{t.table.track}</th>
          <th>{t.table.source}</th>
          <th>{t.table.status}</th>
          <th>{t.table.time}</th>
          <th>{t.table.format}</th>
          <th style={{ width: 280 }}>{t.table.actions}</th>
        </tr>
      </thead>
      <tbody>
        {props.tracks.map((track, index) => (
          <tr
            key={track.id}
            className={track.id === props.currentTrackId ? 'is-active' : ''}
            onDoubleClick={() => props.onPlay(track, index)}
          >
            <td>{index + 1}</td>
            <td className="title-cell">
              <div className="track-title">{track.title}</div>
              <div className="track-subtitle">
                {joinParts([track.artist, track.album, track.composer])}
              </div>
            </td>
            <td>{t.sourceKindLabel(track.sourceKind)}</td>
            <td>
              <span className={`pill ${track.availability}`}>
                {t.availabilityLabel(track.availability)}
              </span>
            </td>
            <td>{formatDuration(track.duration)}</td>
            <td>{track.format || t.common.notAvailable}</td>
            <td>
              <div className="row-actions">{props.renderActions?.(track)}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
  const raw = lyrics.syncedText || lyrics.plainText || '';
  const lines = LRCParser.parse(raw);
  const seconds = positionMs / 1000;
  let activeIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time <= seconds) {
      activeIndex = index;
    }
  }
  return {
    title: track.title,
    artist: track.artist,
    currentLine: lines[activeIndex]?.text || track.title,
    nextLine: lines[activeIndex + 1]?.text || track.artist,
    isPlaying: playbackState === 'playing',
  };
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
