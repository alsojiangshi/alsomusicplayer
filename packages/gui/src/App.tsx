import { useEffect, useState } from 'react';
import { Database, LibraryManager, getConfig, loadConfig, setHttpClient } from '@core';
import ImportModal from './components/ImportModal';
import Layout from './components/Layout';
import LibraryPage from './pages/LibraryPage';
import LyricsPage from './pages/LyricsPage';
import PlaylistPage from './pages/PlaylistPage';
import SettingsPage from './pages/SettingsPage';
import { PlayerProvider, usePlayer } from './stores/playerStore';
import { TauriStorageProvider } from './stores/tauriStorage';
import { proxyFetch } from './utils/proxyFetch';

function AppInner() {
  const [page, setPage] = useState(0);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const { applyAudioPreferences, hydrateTracks, initLibrary } = usePlayer();

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const storage = new TauriStorageProvider();
        const dataDir = await storage.getDataDir();

        await loadConfig(`${dataDir}/config.json`, storage);

        const config = getConfig();
        const dbPath = config.library.dbPath || `${dataDir}/music.db`;
        const db = new Database(dbPath, storage);
        await db.init();

        const library = new LibraryManager(db);
        initLibrary(library, db, storage);
        setHttpClient(proxyFetch as typeof fetch);
        applyAudioPreferences(config.audio);
        hydrateTracks(library.getAllSongs());

        if (mounted) {
          setReady(true);
        }
      } catch (error: unknown) {
        console.error('App init failed:', error);
        if (mounted) {
          setInitError(error instanceof Error ? error.message : '初始化失败');
          setReady(true);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [applyAudioPreferences, hydrateTracks, initLibrary]);

  const handleOpenPlaylist = (playlistId: number) => {
    setSelectedPlaylistId(playlistId);
    setPage(1);
  };

  const handleOpenPlaylistPage = () => {
    setPage(1);
  };

  if (!ready) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0d1117',
          color: '#e6edf3',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
          <div style={{ fontSize: 18 }}>AlsoMusicPlayer 启动中...</div>
          {initError && (
            <div style={{ color: '#ff6b6b', marginTop: 8, fontSize: 14 }}>
              {initError}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <Layout
        currentPage={page}
        onNavigate={setPage}
        onImport={() => setImportOpen(true)}
        onShowLyrics={() => setPage(2)}
        onOpenPlaylist={handleOpenPlaylist}
      >
        {page === 0 && <LibraryPage onOpenPlaylistPage={handleOpenPlaylistPage} />}
        {page === 1 && (
          <PlaylistPage
            activePlaylistId={selectedPlaylistId}
            onActivePlaylistChange={setSelectedPlaylistId}
          />
        )}
        {page === 2 && <LyricsPage />}
        {page === 3 && <SettingsPage />}
      </Layout>
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}

export default function App() {
  return (
    <PlayerProvider>
      <AppInner />
    </PlayerProvider>
  );
}
