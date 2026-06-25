import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentWebview, type DragDropEvent } from '@tauri-apps/api/webview';
import type { Track } from '@core';
import SearchBar from '../components/SearchBar';
import SongTable from '../components/SongTable';
import { usePlayer } from '../stores/playerStore';
import { type LocalImportSource } from '../utils/libraryImport';

interface Props {
  onOpenPlaylistPage: () => void;
}

export default function LibraryPage({ onOpenPlaylistPage }: Props) {
  const { allTracks, playlists, importLocalItems, addToPlaylist, deleteTrack, setQueue } = usePlayer();
  const [query, setQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [importDetails, setImportDetails] = useState<string[]>([]);
  const [playlistTarget, setPlaylistTarget] = useState<Track | null>(null);

  const filteredTracks = useMemo(() => {
    if (!query.trim()) {
      return allTracks;
    }

    const keyword = query.toLowerCase();
    return allTracks.filter(track =>
      track.title.toLowerCase().includes(keyword) ||
      track.artist.toLowerCase().includes(keyword) ||
      track.album.toLowerCase().includes(keyword),
    );
  }, [allTracks, query]);

  const showTemporaryMessage = useCallback((message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(''), 2500);
  }, []);

  const handleImport = useCallback(async (sources: LocalImportSource[]) => {
    if (sources.length === 0) {
      showTemporaryMessage('没有检测到可导入的内容');
      setImportDetails([]);
      return;
    }

    setStatusMessage(`正在导入 ${sources.length} 个项目...`);
    setImportDetails([]);

    try {
      const result = await importLocalItems(sources);
      const parts = [`导入 ${result.added} 首`];

      if (result.skipped > 0) {
        parts.push(`跳过 ${result.skipped} 首`);
      }
      if (result.failed > 0) {
        parts.push(`失败 ${result.failed} 首`);
      }

      if (result.added === 0 && result.failed === 0 && result.skipped === 0) {
        showTemporaryMessage('没有发现可导入的音频文件');
      } else {
        showTemporaryMessage(parts.join('，'));
      }

      setImportDetails(result.errors.map(formatImportDetail));
    } catch (error: unknown) {
      const message = formatUnknownError(error);
      showTemporaryMessage('导入失败');
      setImportDetails([message]);
    }
  }, [importLocalItems, showTemporaryMessage]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent(async (event: { payload: DragDropEvent }) => {
        if (disposed) {
          return;
        }

        const payload = event.payload;
        if (payload.type === 'enter' || payload.type === 'over') {
          setDragOver(true);
          return;
        }

        if (payload.type === 'leave') {
          setDragOver(false);
          return;
        }

        if (payload.type === 'drop') {
          setDragOver(false);
          const sources = payload.paths.map(path => ({ path }));

          await handleImport(sources);
        }
      })
      .then(fn => {
        unlisten = fn;
      })
      .catch(() => {
        // Browser preview mode falls back to HTML5 drag and drop below.
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleImport]);

  const handleDeleteTrack = (track: Track) => {
    if (!window.confirm(`确定要从音乐库删除“${track.title}”吗？`)) {
      return;
    }

    deleteTrack(track.id);
    showTemporaryMessage(`已删除 ${track.title}`);
  };

  const handleAddToPlaylist = (playlistId: number) => {
    if (!playlistTarget) {
      return;
    }

    addToPlaylist(playlistId, [playlistTarget.id]);
    showTemporaryMessage(`已将 ${playlistTarget.title} 添加到播放列表`);
    setPlaylistTarget(null);
  };

  return (
    <div
      className="relative space-y-5"
      onDragOver={event => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={event => {
        event.preventDefault();
        setDragOver(false);
        void handleImport(Array.from(event.dataTransfer.files));
      }}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-dim/20">
          <div className="text-center">
            <p className="mb-2 text-4xl">📥</p>
            <p className="text-lg font-bold text-accent">松手即可导入音乐</p>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="absolute right-2 top-2 z-20 rounded-lg bg-accent-dim px-4 py-2 text-sm text-accent">
          {statusMessage}
        </div>
      )}

      {importDetails.length > 0 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-100">
          <div className="mb-2 font-medium text-yellow-200">最近一次导入诊断</div>
          <div className="max-h-36 space-y-1 overflow-y-auto">
            {importDetails.map((detail, index) => (
              <div key={`${detail}-${index}`}>{detail}</div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold">📚 音乐库</h1>
        <SearchBar onSearch={setQuery} />
      </div>

      <div className="flex items-center justify-between text-sm text-text-muted">
        <span>共 {filteredTracks.length} 首歌曲</span>
        {playlists.length === 0 && filteredTracks.length > 0 && (
          <span>先创建播放列表，就能把音乐库里的歌曲整理进歌单。</span>
        )}
      </div>

      {filteredTracks.length === 0 ? (
        <div className="py-20 text-center text-text-muted">
          <p className="mb-3 text-4xl">🎧</p>
          <p className="mb-2 text-lg">音乐库还是空的</p>
          <p className="text-sm">直接把音频文件或文件夹拖进窗口，或者点击左侧“导入音乐”。</p>
        </div>
      ) : (
        <SongTable
          tracks={filteredTracks}
          onPlay={(_track, index) => setQueue(filteredTracks, index)}
          actionHeader="管理"
          renderActions={track => (
            <>
              <button
                onClick={() => {
                  if (playlists.length === 0) {
                    showTemporaryMessage('请先创建一个播放列表');
                    window.setTimeout(() => onOpenPlaylistPage(), 200);
                    return;
                  }
                  setPlaylistTarget(track);
                }}
                className="rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-bg-light hover:text-text-primary"
                title="添加到播放列表"
              >
                加入歌单
              </button>
              <button
                onClick={() => handleDeleteTrack(track)}
                className="rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-red-900/30 hover:text-red-300"
                title="从音乐库删除"
              >
                删除
              </button>
            </>
          )}
        />
      )}

      {playlistTarget && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50">
          <div className="w-[380px] space-y-4 rounded-2xl border border-border bg-bg-card p-5 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold">添加到播放列表</h2>
              <p className="mt-1 text-sm text-text-secondary">{playlistTarget.title}</p>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto">
              {playlists.map(playlist => (
                <button
                  key={playlist.id}
                  onClick={() => handleAddToPlaylist(playlist.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-bg-darkest px-3 py-2 text-left text-sm transition-colors hover:border-accent hover:text-accent"
                >
                  <span className="truncate">{playlist.name}</span>
                  <span className="text-xs text-text-muted">{playlist.songCount} 首</span>
                </button>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setPlaylistTarget(null)}
                className="rounded-lg border border-border bg-bg-medium px-3 py-1.5 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatImportDetail(detail: {
  source: string;
  stage: string;
  message: string;
}): string {
  return `[${detail.stage}] ${detail.source}: ${detail.message}`;
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return '未知错误';
  }
}
