import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatAvailability, formatDuration, LRCParser, type LyricsData, type PlaybackState, type Playlist, type ResolverSearchResult, type Track } from '@core';
import DesktopLyricsWindow from './DesktopLyricsWindow';
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
  } = useAppStore();

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
        setStatus(`Scanning ${payload.current}/${payload.total}: ${payload.path}`);
      });
      unlistenDone = await listenEvent<{ added: number; updated: number; missing: number; errors: string[] }>(
        'scan:done',
        payload => {
          setScanProgress(null);
          setScanSummary(payload);
          setStatus(
            `Library scan finished. Added ${payload.added}, updated ${payload.updated}.`,
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
  }, [refreshBootstrap, setScanProgress, setScanSummary, setStatus, setDragImportActive]);

  useEffect(() => {
    if (!desktopLyricsSupported || !currentTrack || !currentLyrics) {
      return;
    }

    const payload = buildDesktopLyricsPayload(currentTrack, currentLyrics, playback.positionMs, playback.audioState);
    const serialized = JSON.stringify(payload);
    if (serialized === lastDesktopPayload.current) {
      return;
    }
    lastDesktopPayload.current = serialized;
    void commands.pushDesktopLyrics(payload);
  }, [currentTrack, currentLyrics, playback.positionMs, playback.audioState, desktopLyricsSupported]);

  const handleScan = async (paths: string[], rememberRoot: boolean) => {
    try {
      setStatus('Scanning library...');
      const summary = await commands.scanPaths(paths, rememberRoot);
      setScanSummary(summary);
      await refreshBootstrap();
      setStatus(
        `Scan complete. Added ${summary.added}, updated ${summary.updated}.`,
        summary.errors.length > 0 ? 'error' : 'info',
      );
    } catch (error) {
      setStatus(formatError(error), 'error');
    }
  };

  const handleRefreshLibrary = async () => {
    try {
      setStatus('Refreshing remembered folders...');
      const summary = await commands.refreshLibrary();
      setScanSummary(summary);
      await refreshBootstrap();
      setStatus(`Refresh complete. Added ${summary.added}, updated ${summary.updated}.`);
    } catch (error) {
      setStatus(formatError(error), 'error');
    }
  };

  const handleRemoveTrack = async (trackId: number) => {
    try {
      await commands.removeTrack(trackId);
      await refreshBootstrap();
      setStatus('Removed track from library.');
    } catch (error) {
      setStatus(formatError(error), 'error');
    }
  };

  const handleSaveShortcuts = async (nextSettings: ShortcutSettings) => {
    try {
      await commands.saveShortcuts(nextSettings);
      setShortcutSettings(nextSettings);
      setStatus('Shortcut settings saved.');
    } catch (error) {
      setStatus(formatError(error), 'error');
    }
  };

  if (bootstrapping && !ready) {
    return <LoadingScreen />;
  }

  return (
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
              <h1 className="page-title">{pageTitle(view)}</h1>
              <p className="page-subtitle">
                {pageSubtitle(view, tracks.length, playlists.length, roots.length)}
              </p>
            </div>

            <div className="top-bar-actions">
              <input
                className="search-input"
                placeholder="Search tracks, artists, albums, composers..."
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
              <button className="primary-button" onClick={openAddSource}>
                Add Music
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
              {scanProgress.current}/{scanProgress.total} · {scanProgress.path}
            </div>
          )}
          {dragImportActive && (
            <div className="status-banner" style={{ marginTop: 12 }}>
              Drop local files or folders to import them into the indexed library.
            </div>
          )}
        </header>

        <main className="page-body">
          {view === 'library' && (
            <LibraryView
              tracks={filteredTracks}
              currentTrackId={playback.currentTrackId}
              onPlay={(track, index) => void playbackService.setQueue(filteredTracks.map(item => item.id), index, true)}
              onEdit={openEditTrack}
              onAddToPlaylist={openAddToPlaylist}
              onReveal={trackId => void commands.revealTrack(trackId).catch(error => setStatus(formatError(error), 'error'))}
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
            setStatus('Track overrides saved.');
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
            setStatus('Track added to playlist.');
          }}
        />
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      <div className="content-card" style={{ width: 420, textAlign: 'center' }}>
        <div className="brand-badge" style={{ margin: '0 auto 18px' }}>♪</div>
        <h1 className="page-title" style={{ fontSize: 28 }}>AlsoMusicPlayer</h1>
        <p className="page-subtitle">Rebuilding your desktop music library experience…</p>
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
  const items: Array<{ id: ViewId; label: string; hint: string }> = [
    { id: 'library', label: 'Library', hint: 'Browse your indexed collection' },
    { id: 'playlists', label: 'Playlists', hint: 'Curate listening flows' },
    { id: 'queue', label: 'Queue', hint: 'What is coming next' },
    { id: 'lyrics', label: 'Lyrics', hint: 'Synced reading mode' },
    { id: 'settings', label: 'Settings', hint: 'Library, shortcuts, desktop lyrics' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-card">
        <div className="brand">
          <div className="brand-badge">♫</div>
          <div>
            <div className="brand-eyebrow">Desktop Player</div>
            <h2 className="brand-title">AlsoMusicPlayer</h2>
            <p className="brand-subtitle">Source-aware local player with lyrics, queue, playlists and desktop overlays.</p>
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
        <p className="sidebar-section-title">Quick Playlists</p>
        <div className="playlist-nav">
          {props.playlists.length === 0 && <div className="muted tiny">Create a playlist to organize your library.</div>}
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
          Import Sources
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
  return (
    <div className="page-grid">
      <div className="content-card">
        {props.tracks.length === 0 ? (
          <div className="empty-state">No tracks indexed yet. Add folders, files or links to start building the player.</div>
        ) : (
          <TrackTable
            tracks={props.tracks}
            currentTrackId={props.currentTrackId}
            onPlay={props.onPlay}
            renderActions={track => (
              <div className="row-actions">
                {track.sourceKind === 'local_file' && (
                  <button className="ghost-button" onClick={() => props.onReveal(track.id)}>
                    Reveal
                  </button>
                )}
                <button className="ghost-button" onClick={() => props.onAddToPlaylist(track.id)}>
                  Playlist
                </button>
                <button className="soft-button" onClick={() => props.onEdit(track.id)}>
                  Edit
                </button>
                <button className="danger-button" onClick={() => props.onRemove(track.id)}>
                  Remove
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
          <p className="sidebar-section-title">Create Playlist</p>
          <div className="stack">
            <input
              className="text-input"
              placeholder="Late-night instrumentals"
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
              Create Playlist
            </button>
          </div>
        </div>

        <div className="content-card">
          <p className="sidebar-section-title">Your Playlists</p>
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
            <div className="empty-state">Select a playlist to browse or build it from the library page.</div>
          ) : (
            <>
              <div className="top-bar-row" style={{ marginBottom: 18 }}>
                <div>
                  <h3 style={{ margin: 0 }}>
                    {props.playlists.find(playlist => playlist.id === props.activePlaylistId)?.name}
                  </h3>
                  <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
                    Curate order, remove tracks, and start full-playlist playback.
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
                    Rename
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => props.activePlaylistId && props.onDelete(props.activePlaylistId)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {props.tracks.length === 0 ? (
                <div className="empty-state">This playlist is empty. Add tracks from the library page.</div>
              ) : (
                <TrackTable
                  tracks={props.tracks}
                  currentTrackId={props.currentTrackId}
                  onPlay={(track) => props.onPlay(track.id, props.tracks.map(item => item.id))}
                  renderActions={track => (
                    <button className="danger-button" onClick={() => props.onRemoveTrack(track.id)}>
                      Remove
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
  return (
    <div className="content-card">
      {props.tracks.length === 0 ? (
        <div className="empty-state">Queue is empty. Double-click a track in the library to start playback.</div>
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
        <div className="empty-state">Start playing a track to load synced lyrics and desktop lyric state.</div>
      ) : (
        <>
          <div className="top-bar-row" style={{ marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0 }}>{props.track.title}</h3>
              <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
                {props.track.artist} · {props.track.album}
              </p>
            </div>
            <button className="soft-button" onClick={props.onSearchOnline}>
              Search Online
            </button>
          </div>

          {lines.length === 0 ? (
            <div className="empty-state">No lyrics available yet. Try the online search or add custom lyrics in the editor.</div>
          ) : (
            <div className="lyrics-scroll">
              {lines.map((line, index) => (
                <div key={`${line.time}-${index}`} className={`lyric-line ${index === activeLineIndex ? 'active' : ''}`}>
                  {line.text || '…'}
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
  roots: { id: number; path: string; addedAt?: string | undefined; lastScannedAt?: string | null | undefined }[];
  shortcuts: ShortcutSettings | null;
  desktopLyricsSupported: boolean;
  desktopLyricsVisible: boolean;
  onAddFolders: () => Promise<void>;
  onAddFiles: () => Promise<void>;
  onRefreshLibrary: () => Promise<void>;
  onToggleDesktopLyrics: () => void;
  onSaveShortcuts: (settings: ShortcutSettings) => Promise<void>;
}) {
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
            <h3 style={{ margin: 0 }}>Indexed Library Roots</h3>
            <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
              Folders are remembered and rescanned. Individual files are indexed without being copied.
            </p>
          </div>
          <div className="row-actions">
            <button className="soft-button" onClick={() => void props.onAddFiles()}>
              Add Files
            </button>
            <button className="soft-button" onClick={() => void props.onAddFolders()}>
              Add Folders
            </button>
            <button className="primary-button" onClick={() => void props.onRefreshLibrary()}>
              Refresh Library
            </button>
          </div>
        </div>
        <div className="stack">
          {props.roots.length === 0 ? (
            <div className="empty-state">No remembered folders yet. Add a library root to enable one-click refresh.</div>
          ) : (
            props.roots.map(root => (
              <div key={root.id} className="surface" style={{ padding: 14, borderRadius: 16 }}>
                <div>{root.path}</div>
                <div className="muted tiny" style={{ marginTop: 4 }}>
                  Last scanned {root.lastScannedAt ?? 'not yet'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="content-card">
        <div className="top-bar-row" style={{ marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: 0 }}>Desktop Lyrics</h3>
            <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
              Windows is fully targeted. Linux is supported when the window manager allows transparent always-on-top overlays.
            </p>
          </div>
          <button
            className={props.desktopLyricsVisible ? 'soft-button' : 'primary-button'}
            onClick={props.onToggleDesktopLyrics}
            disabled={!props.desktopLyricsSupported}
          >
            {props.desktopLyricsVisible ? 'Hide Desktop Lyrics' : 'Show Desktop Lyrics'}
          </button>
        </div>
        <div className="muted">
          {props.desktopLyricsSupported
            ? 'Desktop lyrics window is available on this platform.'
            : 'Desktop lyrics window is not available on this platform build.'}
        </div>
      </div>

      <div className="content-card">
        <h3 style={{ marginTop: 0 }}>Shortcut Preferences</h3>
        <p className="page-subtitle">Local keyboard mappings are configurable today. Global registration is scaffolded but host-level activation is still conservative.</p>
        <div className="form-grid" style={{ marginTop: 18 }}>
          <label className="form-label">
            Toggle Play / Pause
            <input
              className="text-input"
              value={draft.togglePlayPause}
              onChange={event => setDraft({ ...draft, togglePlayPause: event.target.value })}
            />
          </label>
          <label className="form-label">
            Next Track
            <input
              className="text-input"
              value={draft.nextTrack}
              onChange={event => setDraft({ ...draft, nextTrack: event.target.value })}
            />
          </label>
          <label className="form-label">
            Previous Track
            <input
              className="text-input"
              value={draft.previousTrack}
              onChange={event => setDraft({ ...draft, previousTrack: event.target.value })}
            />
          </label>
          <label className="form-label">
            Toggle Desktop Lyrics
            <input
              className="text-input"
              value={draft.toggleDesktopLyrics}
              onChange={event => setDraft({ ...draft, toggleDesktopLyrics: event.target.value })}
            />
          </label>
        </div>
        <div className="row-actions" style={{ marginTop: 18 }}>
          <button className="primary-button" onClick={() => void props.onSaveShortcuts(draft)}>
            Save Shortcut Preferences
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
  return (
    <footer className="player-bar">
      <div className="content-card player-bar-shell">
        <div className="row-actions">
          <div className="cover-frame">{props.track?.artworkRef ? <img src={toWebAssetSource(props.track.artworkRef)} alt="" /> : '♪'}</div>
          <div>
            <div className="track-title">{props.track?.title ?? 'Nothing playing'}</div>
            <div className="track-subtitle">{props.track ? `${props.track.artist} · ${props.track.album}` : 'Start from the library, playlists or queue.'}</div>
          </div>
        </div>

        <div className="player-main-controls">
          <div className="transport-row">
            <button className="icon-button" onClick={props.onCycleMode} title="Playback mode">
              {modeGlyph(props.playback.mode)}
            </button>
            <button className="icon-button" onClick={props.onPrevious}>
              ◀
            </button>
            <button className="transport-primary" onClick={props.onToggle}>
              {props.playback.audioState === 'playing' ? '❚❚' : '▶'}
            </button>
            <button className="icon-button" onClick={props.onNext}>
              ▶
            </button>
            <button className="icon-button" onClick={props.onOpenLyrics}>
              LRC
            </button>
            {props.onToggleDesktopLyrics && (
              <button className="icon-button" onClick={props.onToggleDesktopLyrics}>
                Desk
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
              {props.playback.muted || props.playback.volume === 0 ? '🔇' : '🔊'}
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
            Volume {props.playback.volume}% · Mode {props.playback.mode.replace('_', ' ')}
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
  return (
    <table className="track-table">
      <thead>
        <tr>
          <th style={{ width: 60 }}>#</th>
          <th>Track</th>
          <th>Source</th>
          <th>Status</th>
          <th>Time</th>
          <th>Format</th>
          <th style={{ width: 280 }}>Actions</th>
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
                {track.artist}
                {track.album ? ` · ${track.album}` : ''}
                {track.composer ? ` · ${track.composer}` : ''}
              </div>
            </td>
            <td>{track.sourceKind}</td>
            <td>
              <span className={`pill ${track.availability}`}>
                {formatAvailability(track.availability)}
              </span>
            </td>
            <td>{formatDuration(track.duration)}</td>
            <td>{track.format || 'N/A'}</td>
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
        await props.onComplete(`Imported folders. Added ${summary.added}, updated ${summary.updated}.`);
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
        await props.onComplete(`Imported files. Added ${summary.added}, updated ${summary.updated}.`);
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
      await props.onComplete('Added direct URL source.');
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
            <h2 style={{ margin: 0 }}>Import Sources</h2>
            <p className="page-subtitle" style={{ margin: '6px 0 0' }}>
              Index local folders, add raw stream URLs, or bridge a resolver-backed public source.
            </p>
          </div>
          <button className="icon-button" onClick={props.onClose}>
            ✕
          </button>
        </div>

        <div className="modal-tabs" style={{ marginBottom: 18 }}>
          {[
            ['local', 'Local Files'],
            ['url', 'Direct URL'],
            ['resolver', 'Resolver Search'],
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
              <h3 style={{ marginTop: 0 }}>Index Local Library Roots</h3>
              <p className="page-subtitle">Folders are remembered for refresh. Files are indexed in place without being copied into app storage.</p>
              <div className="row-actions" style={{ marginTop: 16 }}>
                <button className="primary-button" disabled={busy} onClick={() => void handleAddFolders()}>
                  Pick Folders
                </button>
                <button className="soft-button" disabled={busy} onClick={() => void handleAddFiles()}>
                  Pick Files
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'url' && (
          <div className="stack">
            <div className="form-grid">
              <label className="form-label">
                Stream URL
                <input
                  className="text-input"
                  placeholder="https://example.com/audio/song.mp3"
                  value={urlDraft.url}
                  onChange={event => setUrlDraft({ ...urlDraft, url: event.target.value })}
                />
              </label>
              <label className="form-label">
                Title
                <input
                  className="text-input"
                  value={urlDraft.title ?? ''}
                  onChange={event => setUrlDraft({ ...urlDraft, title: event.target.value })}
                />
              </label>
              <label className="form-label">
                Artist
                <input
                  className="text-input"
                  value={urlDraft.artist ?? ''}
                  onChange={event => setUrlDraft({ ...urlDraft, artist: event.target.value })}
                />
              </label>
              <label className="form-label">
                Album
                <input
                  className="text-input"
                  value={urlDraft.album ?? ''}
                  onChange={event => setUrlDraft({ ...urlDraft, album: event.target.value })}
                />
              </label>
            </div>
            <div className="row-actions">
              <button className="primary-button" disabled={busy || !urlDraft.url.trim()} onClick={() => void handleAddUrl()}>
                Add Direct URL
              </button>
            </div>
          </div>
        )}

        {tab === 'resolver' && (
          <div className="stack">
            <div className="row-actions">
              <input
                className="search-input"
                placeholder="Search Netease tracks..."
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    void handleSearch();
                  }
                }}
              />
              <button className="primary-button" disabled={busy || !query.trim()} onClick={() => void handleSearch()}>
                Search
              </button>
            </div>
            <div className="result-list">
              {searchResults.map(result => (
                <div key={`${result.resolverId}-${result.id}`} className="result-row">
                  <div>
                    <div className="track-title">{result.title}</div>
                    <div className="track-subtitle">
                      {result.artist}
                      {result.album ? ` · ${result.album}` : ''}
                    </div>
                  </div>
                  <div className="row-actions">
                    <span className="muted tiny">{formatDuration(result.duration)}</span>
                    <button
                      className="primary-button"
                      onClick={async () => {
                        await commands.addResolverTrack(result);
                        await props.onComplete(`Added resolver track ${result.title}.`);
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))}
              {searchResults.length === 0 && <div className="empty-state">Search a public source to add resolver-backed tracks.</div>}
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
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{
    title: string;
    artist: string;
    album: string;
    composer: string;
    duration: string;
    artworkRef: string;
    lyricRef: string;
    lyricText: string;
  }>({
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

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>Track Editor</h2>
            <p className="page-subtitle" style={{ margin: '6px 0 0' }}>
              Overrides are stored in the app database and layered on top of scanned metadata.
            </p>
          </div>
          <button className="icon-button" onClick={props.onClose}>
            ✕
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading track metadata…</div>
        ) : (
          <>
            <div className="form-grid">
              <label className="form-label">
                Title
                <input className="text-input" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <label className="form-label">
                Artist
                <input className="text-input" value={draft.artist} onChange={event => setDraft({ ...draft, artist: event.target.value })} />
              </label>
              <label className="form-label">
                Album
                <input className="text-input" value={draft.album} onChange={event => setDraft({ ...draft, album: event.target.value })} />
              </label>
              <label className="form-label">
                Composer
                <input className="text-input" value={draft.composer} onChange={event => setDraft({ ...draft, composer: event.target.value })} />
              </label>
              <label className="form-label">
                Duration Seconds
                <input className="text-input" value={draft.duration} onChange={event => setDraft({ ...draft, duration: event.target.value })} />
              </label>
              <label className="form-label">
                Artwork Ref
                <input className="text-input" value={draft.artworkRef} onChange={event => setDraft({ ...draft, artworkRef: event.target.value })} />
              </label>
              <label className="form-label">
                Lyrics Ref
                <input className="text-input" value={draft.lyricRef} onChange={event => setDraft({ ...draft, lyricRef: event.target.value })} />
              </label>
            </div>
            <label className="form-label" style={{ marginTop: 16 }}>
              Lyrics Text
              <textarea
                className="text-area"
                rows={10}
                value={draft.lyricText}
                onChange={event => setDraft({ ...draft, lyricText: event.target.value })}
              />
            </label>
            <div className="row-actions" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="soft-button" onClick={props.onClose}>
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={async () => {
                  await useAppStore.getState().saveOverride({
                    trackId: props.track!.id,
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
                Save Overrides
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
  if (!props.track) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>Add to Playlist</h2>
            <p className="page-subtitle" style={{ margin: '6px 0 0' }}>
              {props.track.title} · {props.track.artist}
            </p>
          </div>
          <button className="icon-button" onClick={props.onClose}>
            ✕
          </button>
        </div>

        <div className="result-list">
          {props.playlists.length === 0 && <div className="empty-state">Create a playlist first from the Playlists view.</div>}
          {props.playlists.map(playlist => (
            <div key={playlist.id} className="result-row">
              <div>
                <div className="track-title">{playlist.name}</div>
                <div className="track-subtitle">{playlist.songCount} tracks</div>
              </div>
              <button className="primary-button" onClick={() => void props.onChoose(playlist.id)}>
                Add
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function pageTitle(view: ViewId): string {
  switch (view) {
    case 'playlists':
      return 'Playlists';
    case 'queue':
      return 'Queue';
    case 'lyrics':
      return 'Lyrics';
    case 'settings':
      return 'Settings';
    default:
      return 'Library';
  }
}

function pageSubtitle(view: ViewId, trackCount: number, playlistCount: number, rootCount: number): string {
  switch (view) {
    case 'playlists':
      return `${playlistCount} playlists ready for curated listening.`;
    case 'queue':
      return 'Review and jump through the current playback queue.';
    case 'lyrics':
      return 'Follow synced lyrics, or search online when local files do not have them.';
    case 'settings':
      return `${rootCount} remembered library roots and source-aware playback preferences.`;
    default:
      return `${trackCount} tracks indexed across local files, direct URLs and resolver sources.`;
  }
}

function modeGlyph(mode: string): string {
  switch (mode) {
    case 'shuffle':
      return '⤮';
    case 'repeat_one':
      return '1↺';
    case 'repeat_all':
      return '↺';
    default:
      return '→';
  }
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

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}
