import { useState } from 'react';
import { usePlayer } from '../stores/playerStore';
import SearchBar from '../components/SearchBar';
import SongTable from '../components/SongTable';
import type { Track } from '../../../core/src/index.js';

const MOCK_TRACKS: Track[] = [];

export default function LibraryPage() {
  const { setQueue, playIndex } = usePlayer();
  const [tracks] = useState<Track[]>(MOCK_TRACKS);
  const [filtered, setFiltered] = useState<Track[]>(MOCK_TRACKS);

  const handleSearch = (q: string) => {
    const lower = q.toLowerCase();
    setFiltered(MOCK_TRACKS.filter(t =>
      (t.title||'').toLowerCase().includes(lower) ||
      (t.artist||'').toLowerCase().includes(lower) ||
      (t.album||'').toLowerCase().includes(lower)
    ));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold">📚 音乐库</h1>
        <SearchBar onSearch={handleSearch} />
        <button className="px-4 py-2 rounded-lg bg-accent-dim text-accent border border-accent/30 hover:bg-accent hover:text-bg-darkest transition-colors text-sm">＋ 导入音乐</button>
      </div>
      <div className="text-sm text-text-muted">共 {filtered.length} 首歌曲</div>
      <SongTable tracks={filtered} onDoubleClick={(t) => {
        setQueue(filtered, filtered.indexOf(t));
        playIndex(filtered.indexOf(t));
      }} />
    </div>
  );
}
