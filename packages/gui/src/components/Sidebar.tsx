import { useEffect } from 'react';
import { usePlayer } from '../stores/playerStore';

const NAV_ITEMS = ['📚 音乐库', '📋 播放列表', '🎤 歌词', '⚙️ 设置'];

interface Props {
  currentPage: number;
  onNavigate: (index: number) => void;
  onImport: () => void;
  onOpenPlaylist: (playlistId: number) => void;
}

export default function Sidebar({
  currentPage,
  onNavigate,
  onImport,
  onOpenPlaylist,
}: Props) {
  const { playlists, loadPlaylists } = usePlayer();

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  return (
    <nav className="flex w-52 flex-col gap-1 border-r border-border bg-bg-darkest p-3">
      <div className="mb-4 px-3 py-2 text-lg font-bold text-accent">🎵 AlsoMusicPlayer</div>

      {NAV_ITEMS.map((label, index) => (
        <button
          key={label}
          onClick={() => onNavigate(index)}
          className={`rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
            index === currentPage
              ? 'bg-accent-dim text-accent'
              : 'text-text-secondary hover:bg-bg-light hover:text-text-primary'
          }`}
        >
          {label}
        </button>
      ))}

      {playlists.length > 0 && (
        <div className="mt-3">
          <div className="px-3 py-1 text-xs uppercase tracking-wide text-text-muted">歌单</div>
          {playlists.map(playlist => (
            <button
              key={playlist.id}
              onClick={() => onOpenPlaylist(playlist.id)}
              className="w-full truncate rounded-lg px-3 py-1.5 text-left text-xs text-text-muted transition-colors hover:bg-bg-light hover:text-text-secondary"
            >
              {playlist.name}
              <span className="ml-1 text-text-muted">({playlist.songCount})</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-auto pt-4">
        <button
          onClick={onImport}
          className="w-full rounded-lg border border-accent/30 bg-accent-dim px-3 py-2 text-sm text-accent transition-colors hover:bg-accent hover:text-bg-darkest"
        >
          ＋ 导入音乐
        </button>
      </div>
    </nav>
  );
}
