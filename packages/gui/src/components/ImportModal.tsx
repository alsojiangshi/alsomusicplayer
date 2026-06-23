import { useState, useRef } from 'react';
import type { Track } from '@core';

type Tab = 'local' | 'url' | 'search';

interface Props { open: boolean; onClose: () => void; onImported: (tracks: Track[]) => void; }

const AUDIO_EXT = /\.(mp3|flac|wav|ogg|m4a|aac|opus|wma)$/i;
const TABS: { key: Tab; label: string }[] = [
  { key: 'local', label: '📁 本地文件' },
  { key: 'url', label: '🔗 直链URL' },
  { key: 'search', label: '🔍 网络搜索' },
];

export default function ImportModal({ open, onClose, onImported }: Props) {
  const [tab, setTab] = useState<Tab>('local');
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-bg-card border border-border rounded-2xl p-6 w-[560px] shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">导入音乐</h2>
          <div className="flex bg-bg-darkest rounded-lg p-0.5 gap-0.5">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                  tab === key ? 'bg-accent-dim text-accent' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'local' && <LocalTab onClose={onClose} onImported={onImported} />}
        {tab === 'url' && <UrlTab onClose={onClose} onImported={onImported} />}
        {tab === 'search' && <SearchTab onClose={onClose} onImported={onImported} />}
      </div>
    </div>
  );
}

// ── 本地文件 ────────────────────────────────────────────

function LocalTab({ onClose, onImported }: { onClose: () => void; onImported: (t: Track[]) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filterAudio = (list: File[]) => list.filter(f => AUDIO_EXT.test(f.name));

  const handleImport = async () => {
    setImporting(true);
    const tracks: Track[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setProgress(`(${i + 1}/${files.length}) ${f.name}`);
      try {
        const dur = await getAudioDuration(f);
        tracks.push(makeTrack(f.name.replace(/\.[^.]+$/, ''), 'Unknown Artist', dur, URL.createObjectURL(f), f.name.split('.').pop()!, f.size, i));
      } catch { /* skip */ }
    }
    onImported(tracks);
    setProgress(`✅ ${tracks.length} 首`);
    setTimeout(() => onClose(), 1000);
  };

  return (
    <div className="space-y-3">
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          dragOver ? 'border-accent bg-accent-dim/30 scale-[1.01]' : 'border-border hover:border-accent'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); setFiles(filterAudio(Array.from(e.dataTransfer.files))); }}
      >
        <p className="text-3xl mb-1">{dragOver ? '📥' : '📂'}</p>
        <p className="text-sm text-text-secondary">{dragOver ? '松开放入' : '点击选择 或拖拽音频文件'}</p>
        <input ref={inputRef} type="file" multiple accept=".mp3,.flac,.wav,.ogg,.m4a,.aac,.opus,.wma" onChange={e => setFiles(filterAudio(Array.from(e.target.files || [])))} className="hidden" />
      </div>
      {files.length > 0 && <div className="bg-bg-darkest rounded-lg p-2 max-h-28 overflow-y-auto text-xs">{files.map((f, i) => <div key={i} className="text-text-secondary truncate">{f.name}</div>)}</div>}
      {progress && <div className="text-sm text-accent">{progress}</div>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-bg-medium border border-border text-sm">取消</button>
        <button onClick={handleImport} disabled={files.length === 0 || importing} className="px-3 py-1.5 rounded-lg bg-accent-dim text-accent border border-accent/30 hover:bg-accent hover:text-bg-darkest text-sm disabled:opacity-50">{importing ? '导入中...' : `导入 (${files.length})`}</button>
      </div>
    </div>
  );
}

// ── 直链URL ─────────────────────────────────────────────

function UrlTab({ onClose, onImported }: { onClose: () => void; onImported: (t: Track[]) => void }) {
  const [urls, setUrls] = useState('');
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');

  const handleImport = async () => {
    const lines = urls.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setImporting(true);
    const tracks: Track[] = [];
    for (let i = 0; i < lines.length; i++) {
      const url = lines[i];
      setMsg(`检测中 (${i + 1}/${lines.length})...`);
      try {
        const name = url.split('/').pop()?.split('?')[0] || `Track ${i + 1}`;
        const ext = name.split('.').pop() || 'mp3';
        let dur = 0;
        try { dur = await getUrlDuration(url); } catch { /* cross-origin may block */ }
        tracks.push(makeTrack(name.replace(/\.[^.]+$/, ''), 'Remote', dur, url, ext, 0, i, 's3'));
      } catch { /* skip */ }
    }
    onImported(tracks);
    setMsg(`✅ ${tracks.length} 首`);
    setTimeout(() => onClose(), 1000);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">粘贴音频直链，每行一个。支持跨域 MP3/OGG/FLAC 等格式。</p>
      <textarea
        value={urls}
        onChange={e => setUrls(e.target.value)}
        placeholder={`https://example.com/music/song1.mp3\nhttps://example.com/music/song2.flac`}
        className="w-full h-28 bg-bg-darkest border border-border rounded-lg p-3 text-sm text-text-primary placeholder:text-text-muted resize-none focus:border-accent outline-none"
      />
      {msg && <div className="text-sm text-accent">{msg}</div>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-bg-medium border border-border text-sm">取消</button>
        <button onClick={handleImport} disabled={!urls.trim() || importing} className="px-3 py-1.5 rounded-lg bg-accent-dim text-accent border border-accent/30 hover:bg-accent hover:text-bg-darkest text-sm disabled:opacity-50">导入</button>
      </div>
    </div>
  );
}

// ── 网络搜索（网易云）────────────────────────────────────

function SearchTab({ onClose, onImported }: { onClose: () => void; onImported: (t: Track[]) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NeteaseSong[]>([]);
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState('');
  const [added, setAdded] = useState<Set<number>>(new Set());

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true); setMsg('搜索中...');
    try {
      const resp = await fetch(`https://music.163.com/api/search/get?s=${encodeURIComponent(query)}&type=1&limit=20&offset=0`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/' },
      });
      const data = await resp.json();
      const songs: NeteaseSong[] = (data?.result?.songs || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        artist: (s.artists || []).map((a: any) => a.name).join(' / '),
        album: s.album?.name || '',
        duration: (s.duration || 0) / 1000,
      }));
      setResults(songs);
      setMsg(songs.length ? `找到 ${songs.length} 首` : '无结果');
    } catch { setMsg('搜索失败，请检查网络'); }
    setSearching(false);
  };

  const handleAdd = (song: NeteaseSong) => {
    const track = makeTrack(song.name, song.artist, song.duration, `https://music.163.com/song/media/outer/url?id=${song.id}.mp3`, 'mp3', 0, song.id, 'openlist');
    onImported([track]);
    setAdded(prev => new Set(prev).add(song.id));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="搜索歌曲名、歌手..."
          className="flex-1 bg-bg-darkest border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent outline-none"
        />
        <button onClick={handleSearch} disabled={searching} className="px-4 py-2 rounded-lg bg-accent-dim text-accent border border-accent/30 hover:bg-accent hover:text-bg-darkest text-sm disabled:opacity-50">
          {searching ? '...' : '搜索'}
        </button>
      </div>

      {msg && <div className="text-sm text-accent">{msg}</div>}

      <div className="max-h-64 overflow-y-auto space-y-1">
        {results.map(song => (
          <div key={song.id} className="flex items-center gap-3 bg-bg-darkest rounded-lg px-3 py-2 hover:bg-bg-light transition-colors">
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{song.name}</div>
              <div className="text-xs text-text-muted truncate">{song.artist}{song.album ? ` · ${song.album}` : ''}</div>
            </div>
            <div className="text-xs text-text-muted">{fmtDur(song.duration)}</div>
            <button
              onClick={() => handleAdd(song)}
              disabled={added.has(song.id)}
              className="flex-shrink-0 px-2 py-1 rounded text-xs bg-accent-dim text-accent hover:bg-accent hover:text-bg-darkest disabled:opacity-40 transition-colors"
            >
              {added.has(song.id) ? '✓' : '＋'}
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-bg-medium border border-border text-sm">关闭</button>
      </div>
    </div>
  );
}

// ── 工具函数 ────────────────────────────────────────────

type NeteaseSong = { id: number; name: string; artist: string; album: string; duration: number };

function makeTrack(title: string, artist: string, duration: number, filePath: string, format: string, size: number, seed: number, source: Track['source'] = 'local'): Track {
  return {
    id: Date.now() + seed,
    title, artist, album: 'Unknown Album', duration,
    filePath, fileHash: '',
    format: format.toUpperCase(), bitrate: 0, sampleRate: 0, channels: 2, fileSize: size,
    coverArt: null, source, sourceConfig: '',
    dateAdded: new Date().toISOString(),
  };
}

function getAudioDuration(file: File): Promise<number> {
  return new Promise(r => {
    const a = new Audio(); const u = URL.createObjectURL(file); a.src = u;
    a.onloadedmetadata = () => { r(a.duration || 0); URL.revokeObjectURL(u); };
    a.onerror = () => { r(0); URL.revokeObjectURL(u); };
  });
}

function getUrlDuration(url: string): Promise<number> {
  return new Promise(r => {
    const a = new Audio(); a.crossOrigin = 'anonymous'; a.src = url;
    a.onloadedmetadata = () => r(a.duration || 0);
    a.onerror = () => r(0);
  });
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
