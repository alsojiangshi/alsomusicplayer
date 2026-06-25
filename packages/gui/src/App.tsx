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
import { setAppInitError } from './utils/appInitState';
import { proxyFetch } from './utils/proxyFetch';

function AppInner() {
  const [page, setPage] = useState(0);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [initState, setInitState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [initError, setInitError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const { applyAudioPreferences, hydrateTracks, initLibrary } = usePlayer();

  useEffect(() => {
    let mounted = true;
    let stage = '准备初始化';

    setInitState('loading');
    setInitError(null);
    setAppInitError(null);

    void (async () => {
      try {
        stage = '创建存储桥接';
        const storage = new TauriStorageProvider();

        stage = '获取应用数据目录';
        const dataDir = await storage.getDataDir();

        stage = '加载配置';
        await loadConfig(`${dataDir}/config.json`, storage);

        const config = getConfig();
        const dbPath = config.library.dbPath || `${dataDir}/music.db`;
        const db = new Database(dbPath, storage);

        stage = '初始化音乐库数据库';
        await db.init();

        stage = '加载音乐库';
        const library = new LibraryManager(db);
        initLibrary(library, db, storage);
        setHttpClient(proxyFetch as typeof fetch);

        stage = '应用播放配置';
        applyAudioPreferences(config.audio);
        hydrateTracks(library.getAllSongs());

        if (mounted) {
          setInitState('ready');
        }
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : '初始化失败';
        const message = `${stage}失败: ${detail}`;
        console.error('App init failed:', error);
        setAppInitError(message);
        if (mounted) {
          setInitError(message);
          setInitState('error');
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [applyAudioPreferences, hydrateTracks, initLibrary, retryToken]);

  const handleOpenPlaylist = (playlistId: number) => {
    setSelectedPlaylistId(playlistId);
    setPage(1);
  };

  const handleOpenPlaylistPage = () => {
    setPage(1);
  };

  if (initState === 'loading') {
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
        </div>
      </div>
    );
  }

  if (initState === 'error') {
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
          padding: 24,
        }}
      >
        <div
          style={{
            width: 'min(720px, 100%)',
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 22, margin: 0, marginBottom: 12 }}>应用初始化失败</h1>
          <p style={{ color: '#8b949e', marginTop: 0, marginBottom: 16 }}>
            当前音乐库、导入和数据库功能还没有成功启动，先把下面这条错误修掉会更有效。
          </p>
          <div
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: 12,
              padding: 16,
              color: '#ff7b72',
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {initError || '未知初始化错误'}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
            <button
              onClick={() => setRetryToken(prev => prev + 1)}
              style={{
                borderRadius: 10,
                border: '1px solid rgba(46, 160, 67, 0.4)',
                background: 'rgba(46, 160, 67, 0.15)',
                color: '#3fb950',
                padding: '10px 14px',
                cursor: 'pointer',
              }}
            >
              重试初始化
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                borderRadius: 10,
                border: '1px solid #30363d',
                background: '#21262d',
                color: '#e6edf3',
                padding: '10px 14px',
                cursor: 'pointer',
              }}
            >
              重新加载应用
            </button>
          </div>
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
