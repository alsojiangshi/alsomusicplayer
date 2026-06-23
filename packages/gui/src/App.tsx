import { useState } from 'react';
import Layout from './components/Layout';
import ImportModal from './components/ImportModal';
import { PlayerProvider, usePlayer } from './stores/playerStore';
import LibraryPage from './pages/LibraryPage';
import PlaylistPage from './pages/PlaylistPage';
import LyricsPage from './pages/LyricsPage';
import SettingsPage from './pages/SettingsPage';

const PAGES = [LibraryPage, PlaylistPage, LyricsPage, SettingsPage];

function AppInner() {
  const [page, setPage] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const { addTracks } = usePlayer();
  const Page = PAGES[page];

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
