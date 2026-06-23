import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import ImportModal from './components/ImportModal';
import { PlayerProvider, usePlayer } from './stores/playerStore';
import LibraryPage from './pages/LibraryPage';
import PlaylistPage from './pages/PlaylistPage';
import LyricsPage from './pages/LyricsPage';
import SettingsPage from './pages/SettingsPage';
import { TauriStorageProvider } from './stores/tauriStorage';
import { proxyFetch } from './utils/proxyFetch';
import { loadConfig, setHttpClient } from '@core';
import { Database } from '@core';
import { LibraryManager } from '@core';

const PAGES = [LibraryPage, PlaylistPage, LyricsPage, SettingsPage];

function AppInner() {
  const [page, setPage] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const { addTracks, initLibrary } = usePlayer();
  const Page = PAGES[page];

  useEffect(() => {
    (async () => {
      try {
        // 1. 创建存储适配器
        const storage = new TauriStorageProvider();
        const dataDir = await storage.getDataDir();

        // 2. 加载配置
        const configPath = `${dataDir}/config.json`;
        await loadConfig(configPath, storage);

        // 3. 初始化数据库
        const db = new Database(`${dataDir}/music.db`, storage);
        await db.init();

        // 4. 创建音乐库管理器
        const library = new LibraryManager(db);
        initLibrary(library, db);

        // 5. 注入 HTTP 代理（绕过 CORS）
        setHttpClient(proxyFetch as typeof fetch);

        // 6. 加载已有歌曲
        const songs = library.getAllSongs();
        if (songs.length > 0) {
          addTracks(songs);
        }

        setReady(true);
      } catch (e: any) {
        console.error('App init failed:', e);
        setInitError(e?.message || '初始化失败');
        // 即使初始化失败也显示 UI（开发模式/浏览器模式）
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0d1117', color: '#e6edf3',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
          <div style={{ fontSize: 18 }}>MusicPlayer 启动中...</div>
          {initError && <div style={{ color: '#ff6b6b', marginTop: 8, fontSize: 14 }}>{initError}</div>}
        </div>
      </div>
    );
  }

  return (
    <>
      <Layout currentPage={page} onNavigate={setPage} onImport={() => setImportOpen(true)}>
        <Page />
      </Layout>
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={addTracks} />
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
