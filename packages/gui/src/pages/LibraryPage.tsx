import { useState, useCallback } from 'react';
import { usePlayer } from '../stores/playerStore';
import SearchBar from '../components/SearchBar';
import SongTable from '../components/SongTable';
import type { Track } from '@core';

const AUDIO_EXT = /\.(mp3|flac|wav|ogg|m4a|aac|opus|wma)$/i;

function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.addEventListener('loadedmetadata', () => { resolve(audio.duration || 0); URL.revokeObjectURL(url); });
    audio.addEventListener('error', () => { resolve(0); URL.revokeObjectURL(url); });
  });
}

export default function LibraryPage() {
  const { allTracks, setQueue, playIndex, addTracks } = usePlayer();
  const [query, setQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState('');

  const filtered = query
    ? allTracks.filter(t =>
        (t.title || '').toLowerCase().includes(query.toLowerCase()) ||
        (t.artist || '').toLowerCase().includes(query.toLowerCase()) ||
        (t.album || '').toLowerCase().includes(query.toLowerCase())
      )
    : allTracks;

  const handlePlay = (track: Track) => {
    setQueue(filtered, filtered.indexOf(track));
    playIndex(filtered.indexOf(track));
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); };
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => AUDIO_EXT.test(f.name));
    if (files.length === 0) return;

    setImporting(`正在导入 ${files.length} 个文件...`);
    const tracks: Track[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const duration = await getAudioDuration(f);
        tracks.push({
          id: Date.now() + i,
          title: f.name.replace(/\.[^.]+$/, ''),
          artist: 'Unknown Artist', album: 'Unknown Album',
          duration,
          filePath: URL.createObjectURL(f),
          fileHash: '',
          format: f.name.split('.').pop()?.toUpperCase() || '?',
          bitrate: 0, sampleRate: 0, channels: 2, fileSize: f.size,
          coverArt: null,
          source: 'local' as const, sourceConfig: '',
          dateAdded: new Date().toISOString(),
        });
      } catch { /* skip */ }
    }
    addTracks(tracks);
    setImporting(`✅ 已导入 ${tracks.length} 首歌曲`);
    setTimeout(() => setImporting(''), 2000);
  }, [addTracks]);

  return (
    <div
      className="space-y-5 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-10 border-2 border-dashed border-accent bg-accent-dim/20 rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-4xl mb-2">📥</p>
            <p className="text-lg text-accent font-bold">松开放入此处</p>
          </div>
        </div>
      )}

      {importing && (
        <div className="absolute top-2 right-2 z-20 bg-accent-dim text-accent px-4 py-2 rounded-lg text-sm">{importing}</div>
      )}

      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold">📚 音乐库</h1>
        <SearchBar onSearch={setQuery} />
      </div>
      <div className="text-sm text-text-muted">共 {filtered.length} 首歌曲</div>
      {filtered.length === 0 ? (
        <div className="text-center text-text-muted py-20">
          <p className="text-4xl mb-3">📁</p>
          <p className="text-lg mb-2">音乐库为空</p>
          <p className="text-sm">拖拽音频文件到此处 或 点击左侧「＋ 导入音乐」</p>
        </div>
      ) : (
        <SongTable tracks={filtered} onDoubleClick={handlePlay} />
      )}
    </div>
  );
}
