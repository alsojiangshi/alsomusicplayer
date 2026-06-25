import { useMemo, useRef, useState } from 'react';
import { getConfig, type Track } from '@core';
import { usePlayer } from '../stores/playerStore';
import { isSupportedLocalAudioName } from '../utils/libraryImport';
import { proxyFetch } from '../utils/proxyFetch';

type Tab = 'local' | 'url' | 'search';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface SearchResultItem {
  id: number;
  name: string;
  artist: string;
  album: string;
  duration: number;
}

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'local', label: '本地文件' },
  { key: 'url', label: '音频直链' },
  { key: 'search', label: '在线搜索' },
];

export default function ImportModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('local');

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[560px] space-y-4 rounded-2xl border border-border bg-bg-card p-6 shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">导入音乐</h2>
          <div className="flex gap-0.5 rounded-lg bg-bg-darkest p-0.5">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  tab === key
                    ? 'bg-accent-dim text-accent'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'local' && <LocalTab onClose={onClose} />}
        {tab === 'url' && <UrlTab onClose={onClose} />}
        {tab === 'search' && <SearchTab onClose={onClose} />}
      </div>
    </div>
  );
}

function LocalTab({ onClose }: { onClose: () => void }) {
  const { importLocalItems } = usePlayer();
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    if (files.length === 0 || importing) {
      return;
    }

    setImporting(true);
    setProgress(`正在导入 ${files.length} 个文件...`);

    const result = await importLocalItems(files);
    setProgress(formatImportSummary(result));
    setImporting(false);
    setFiles([]);

    window.setTimeout(() => {
      setProgress('');
      onClose();
    }, 1200);
  };

  return (
    <div className="space-y-3">
      <div
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
          dragOver
            ? 'scale-[1.01] border-accent bg-accent-dim/30'
            : 'border-border hover:border-accent'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={event => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={event => {
          event.preventDefault();
          setDragOver(false);
          setFiles(
            Array.from(event.dataTransfer.files).filter(file =>
              isSupportedLocalAudioName(file.name),
            ),
          );
        }}
      >
        <p className="mb-1 text-3xl">{dragOver ? '📥' : '🎵'}</p>
        <p className="text-sm text-text-secondary">
          {dragOver ? '松手即可导入' : '点击选择或拖拽音频文件到这里'}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".mp3,.flac,.wav,.ogg,.oga,.m4a,.mp4,.aac,.opus,.wma,.aiff,.aif"
          onChange={event => {
            setFiles(
              Array.from(event.target.files || []).filter(file =>
                isSupportedLocalAudioName(file.name),
              ),
            );
          }}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <div className="max-h-28 overflow-y-auto rounded-lg bg-bg-darkest p-2 text-xs">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="truncate text-text-secondary">
              {file.name}
            </div>
          ))}
        </div>
      )}

      {progress && <div className="text-sm text-accent">{progress}</div>}

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-border bg-bg-medium px-3 py-1.5 text-sm"
        >
          取消
        </button>
        <button
          onClick={handleImport}
          disabled={files.length === 0 || importing}
          className="rounded-lg border border-accent/30 bg-accent-dim px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent hover:text-bg-darkest disabled:opacity-50"
        >
          {importing ? '导入中...' : `导入 (${files.length})`}
        </button>
      </div>
    </div>
  );
}

function UrlTab({ onClose }: { onClose: () => void }) {
  const { addTracks } = usePlayer();
  const [urls, setUrls] = useState('');
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');

  const handleImport = async () => {
    const lines = urls.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      return;
    }

    setImporting(true);
    const tracks: Track[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const url = lines[index];
      setMessage(`正在检查 ${index + 1}/${lines.length} ...`);

      try {
        const name = url.split('/').pop()?.split('?')[0] || `Track ${index + 1}`;
        const ext = name.split('.').pop() || 'mp3';
        let duration = 0;

        try {
          duration = await getUrlDuration(url);
        } catch {
          duration = 0;
        }

        tracks.push(makeTrack(
          name.replace(/\.[^.]+$/, ''),
          'Remote',
          duration,
          url,
          ext,
          0,
          index,
          'url',
        ));
      } catch {
        // Skip malformed URL.
      }
    }

    addTracks(tracks);
    setMessage(`已导入 ${tracks.length} 个远程音频`);
    setImporting(false);

    window.setTimeout(() => {
      setMessage('');
      onClose();
    }, 1000);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        粘贴音频直链，每行一个。适合临时播放线上 MP3、FLAC 等资源。
      </p>
      <textarea
        value={urls}
        onChange={event => setUrls(event.target.value)}
        placeholder={`https://example.com/music/song1.mp3\nhttps://example.com/music/song2.flac`}
        className="h-28 w-full resize-none rounded-lg border border-border bg-bg-darkest p-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
      />

      {message && <div className="text-sm text-accent">{message}</div>}

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-border bg-bg-medium px-3 py-1.5 text-sm"
        >
          取消
        </button>
        <button
          onClick={handleImport}
          disabled={!urls.trim() || importing}
          className="rounded-lg border border-accent/30 bg-accent-dim px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent hover:text-bg-darkest disabled:opacity-50"
        >
          导入
        </button>
      </div>
    </div>
  );
}

function SearchTab({ onClose }: { onClose: () => void }) {
  const { addTracks } = usePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [selectedSource, setSelectedSource] = useState('');

  const searchConfig = getConfig().search;
  const enabledSources = searchConfig?.enabledSources || ['netease'];
  const currentSource = selectedSource || enabledSources[0];
  const sourceConfig = searchConfig?.sources?.[currentSource];

  const sourceLabel = useMemo(
    () => sourceConfig?.label || currentSource,
    [currentSource, sourceConfig],
  );

  const handleSearch = async () => {
    if (!query.trim() || !sourceConfig) {
      return;
    }

    setSearching(true);
    setMessage(`正在搜索 ${sourceLabel} ...`);

    try {
      const url = sourceConfig.searchUrl.includes('{query}')
        ? sourceConfig.searchUrl.replace('{query}', encodeURIComponent(query))
        : `${sourceConfig.searchUrl}${sourceConfig.searchUrl.includes('?') ? '&' : '?'}s=${encodeURIComponent(query)}`;

      const response = await proxyFetch(url, {
        method: 'GET',
        headers: sourceConfig.searchHeaders as Record<string, string>,
      });
      const data = await response.json();
      const items: any[] = resolvePath(data, sourceConfig.resultPath) || [];

      const nextResults: SearchResultItem[] = items.map((item: any) => ({
        id: resolvePath(item, sourceConfig.mapping.id),
        name: resolvePath(item, sourceConfig.mapping.name) || 'Unknown',
        artist: resolvePath(item, sourceConfig.mapping.artist) || 'Unknown Artist',
        album: resolvePath(item, sourceConfig.mapping.album || '') || '',
        duration:
          typeof resolvePath(item, sourceConfig.mapping.duration || '') === 'number'
            ? resolvePath(item, sourceConfig.mapping.duration || '') / 1000
            : 0,
      }));

      setResults(nextResults);
      setMessage(nextResults.length > 0 ? `找到 ${nextResults.length} 首结果` : '没有找到结果');
    } catch {
      setMessage('搜索失败，请检查网络或搜索源配置');
    }

    setSearching(false);
  };

  const handleAdd = (song: SearchResultItem) => {
    const playbackUrl = (sourceConfig?.playbackUrlTemplate || '{id}')
      .replace('{id}', String(song.id));

    addTracks([
      makeTrack(song.name, song.artist, song.duration, playbackUrl, 'mp3', 0, song.id, 'url'),
    ]);
    setAdded(prev => new Set(prev).add(song.id));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              void handleSearch();
            }
          }}
          placeholder="搜索歌曲名、歌手..."
          className="flex-1 rounded-lg border border-border bg-bg-darkest px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
        />
        <button
          onClick={() => void handleSearch()}
          disabled={searching || !sourceConfig}
          className="rounded-lg border border-accent/30 bg-accent-dim px-4 py-2 text-sm text-accent transition-colors hover:bg-accent hover:text-bg-darkest disabled:opacity-50"
        >
          {searching ? '...' : '搜索'}
        </button>
      </div>

      {enabledSources.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {enabledSources.map(key => {
            const source = searchConfig?.sources?.[key];
            return (
              <button
                key={key}
                onClick={() => setSelectedSource(key)}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  currentSource === key
                    ? 'bg-accent-dim text-accent'
                    : 'bg-bg-medium text-text-muted hover:text-text-secondary'
                }`}
              >
                {source?.label || key}
              </button>
            );
          })}
        </div>
      )}

      {message && <div className="text-sm text-accent">{message}</div>}

      <div className="max-h-64 space-y-1 overflow-y-auto">
        {results.map(song => (
          <div
            key={song.id}
            className="flex items-center gap-3 rounded-lg bg-bg-darkest px-3 py-2 transition-colors hover:bg-bg-light"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{song.name}</div>
              <div className="truncate text-xs text-text-muted">
                {song.artist}
                {song.album ? ` · ${song.album}` : ''}
              </div>
            </div>
            <div className="text-xs text-text-muted">{formatDuration(song.duration)}</div>
            <button
              onClick={() => handleAdd(song)}
              disabled={added.has(song.id)}
              className="rounded bg-accent-dim px-2 py-1 text-xs text-accent transition-colors hover:bg-accent hover:text-bg-darkest disabled:opacity-40"
            >
              {added.has(song.id) ? '已添加' : '添加'}
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border border-border bg-bg-medium px-3 py-1.5 text-sm"
        >
          关闭
        </button>
      </div>
    </div>
  );
}

function makeTrack(
  title: string,
  artist: string,
  duration: number,
  filePath: string,
  format: string,
  size: number,
  seed: number,
  source: Track['source'] = 'local',
): Track {
  return {
    id: Date.now() + seed,
    title,
    artist,
    album: 'Unknown Album',
    duration,
    filePath,
    fileHash: '',
    format: format.toUpperCase(),
    bitrate: 0,
    sampleRate: 0,
    channels: 2,
    fileSize: size,
    coverArt: null,
    source,
    sourceConfig: '',
    dateAdded: new Date().toISOString(),
  };
}

function resolvePath(obj: any, path: string): any {
  if (!obj || !path) {
    return undefined;
  }

  return path.split('.').reduce((value, key) => {
    if (value == null) {
      return undefined;
    }

    const match = key.match(/^(\w+)\[(\d+)\]$/);
    if (match) {
      return value[match[1]]?.[Number.parseInt(match[2], 10)];
    }

    return value[key];
  }, obj);
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainSeconds).padStart(2, '0')}`;
}

function formatImportSummary(summary: {
  added: number;
  skipped: number;
  failed: number;
}): string {
  const parts = [`已导入 ${summary.added} 首`];
  if (summary.skipped > 0) {
    parts.push(`跳过 ${summary.skipped} 首重复或不支持的文件`);
  }
  if (summary.failed > 0) {
    parts.push(`失败 ${summary.failed} 首`);
  }
  return parts.join('，');
}

function getUrlDuration(url: string): Promise<number> {
  return new Promise(resolve => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = url;
    audio.onloadedmetadata = () => resolve(audio.duration || 0);
    audio.onerror = () => resolve(0);
  });
}
