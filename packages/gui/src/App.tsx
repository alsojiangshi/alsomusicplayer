import { useState } from 'react';
import Layout from './components/Layout';
import { PlayerProvider } from './stores/playerStore';
import LibraryPage from './pages/LibraryPage';
import PlaylistPage from './pages/PlaylistPage';
import LyricsPage from './pages/LyricsPage';
import SettingsPage from './pages/SettingsPage';

const PAGES = [LibraryPage, PlaylistPage, LyricsPage, SettingsPage];

export default function App() {
  const [page, setPage] = useState(0);
  const Page = PAGES[page];
  return (
    <PlayerProvider>
      <Layout currentPage={page} onNavigate={setPage}>
        <Page />
      </Layout>
    </PlayerProvider>
  );
}
