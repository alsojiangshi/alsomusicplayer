import { useEffect, useRef, useState } from 'react';
import type { Track } from '@core';
import SongTable from '../components/SongTable';
import { usePlayer } from '../stores/playerStore';

interface Props {
  activePlaylistId: number | null;
  onActivePlaylistChange: (playlistId: number | null) => void;
}

export default function PlaylistPage({
  activePlaylistId,
  onActivePlaylistChange,
}: Props) {
  const {
    libraryManager,
    playlists,
    loadPlaylists,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    removeFromPlaylist,
    setQueue,
  } = usePlayer();

  const [activeId, setActiveId] = useState<number | null>(activePlaylistId);
  const [songs, setSongs] = useState<Track[]>([]);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameText, setRenameText] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  useEffect(() => {
    setActiveId(activePlaylistId);
  }, [activePlaylistId]);

  useEffect(() => {
    if (activeId && libraryManager) {
      setSongs(libraryManager.getPlaylistSongs(activeId));
    } else {
      setSongs([]);
    }
  }, [activeId, libraryManager, playlists]);

  useEffect(() => {
    if (renaming !== null) {
      renameInputRef.current?.focus();
    }
  }, [renaming]);

  const handleSelectPlaylist = (playlistId: number | null) => {
    setActiveId(playlistId);
    onActivePlaylistChange(playlistId);
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) {
      return;
    }

    const id = createPlaylist(name);
    setNewName('');
    handleSelectPlaylist(id);
  };

  const handleRename = (playlistId: number) => {
    const name = renameText.trim();
    if (!name) {
      setRenaming(null);
      return;
    }

    renamePlaylist(playlistId, name);
    setRenaming(null);
  };

  const handleDelete = (playlistId: number) => {
    deletePlaylist(playlistId);
    if (activeId === playlistId) {
      handleSelectPlaylist(null);
    }
  };

  const handleRemove = (track: Track) => {
    if (!activeId) {
      return;
    }

    removeFromPlaylist(activeId, [track.id]);
    setSongs(prev => prev.filter(song => song.id !== track.id));
  };

  return (
    <div className="flex h-full gap-4">
      <div className="w-56 flex-shrink-0 space-y-2">
        <h1 className="text-lg font-bold">📋 播放列表</h1>

        <div className="flex gap-1">
          <input
            value={newName}
            onChange={event => setNewName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                handleCreate();
              }
            }}
            placeholder="新建播放列表..."
            className="flex-1 rounded-lg border border-border bg-bg-darkest px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="rounded-lg border border-accent/30 bg-accent-dim px-2 py-1.5 text-xs text-accent transition-colors hover:bg-accent hover:text-bg-darkest disabled:opacity-50"
          >
            添加
          </button>
        </div>

        <div className="space-y-0.5">
          {playlists.length === 0 ? (
            <div className="py-4 text-center text-xs text-text-muted">还没有播放列表</div>
          ) : (
            playlists.map(playlist => (
              <div key={playlist.id}>
                {renaming === playlist.id ? (
                  <div className="flex gap-1 px-2 py-1">
                    <input
                      ref={renameInputRef}
                      value={renameText}
                      onChange={event => setRenameText(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          handleRename(playlist.id);
                        }
                        if (event.key === 'Escape') {
                          setRenaming(null);
                        }
                      }}
                      onBlur={() => handleRename(playlist.id)}
                      className="flex-1 rounded border border-accent bg-bg-darkest px-1.5 py-0.5 text-xs text-text-primary outline-none"
                    />
                  </div>
                ) : (
                  <div
                    onClick={() => handleSelectPlaylist(playlist.id)}
                    className={`group flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors ${
                      activeId === playlist.id
                        ? 'bg-accent-dim text-accent'
                        : 'text-text-secondary hover:bg-bg-medium'
                    }`}
                  >
                    <span className="flex-1 truncate">{playlist.name}</span>
                    <span className="mr-1 text-text-muted">{playlist.songCount}</span>
                    <div className="hidden gap-0.5 group-hover:flex">
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          setRenaming(playlist.id);
                          setRenameText(playlist.name);
                        }}
                        className="rounded px-1 text-xs hover:bg-bg-light"
                        title="重命名"
                      >
                        编辑
                      </button>
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          handleDelete(playlist.id);
                        }}
                        className="rounded px-1 text-xs hover:bg-red-900/50"
                        title="删除"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {activeId && songs.length > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {playlists.find(playlist => playlist.id === activeId)?.name || ''}
              </h2>
              <button
                onClick={() => setQueue(songs, 0)}
                className="rounded-lg border border-accent/30 bg-accent-dim px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent hover:text-bg-darkest"
              >
                播放全部
              </button>
            </div>
            <SongTable tracks={songs} onPlay={(_track, index) => setQueue(songs, index)} onRemoveFromPlaylist={handleRemove} />
          </>
        ) : activeId ? (
          <div className="py-20 text-center text-text-muted">
            <p>这个播放列表还是空的。</p>
            <p className="mt-1 text-xs">回到音乐库，把喜欢的歌加进来吧。</p>
          </div>
        ) : (
          <div className="py-20 text-center text-text-muted">
            <p>从左侧选择一个播放列表来查看歌曲。</p>
          </div>
        )}
      </div>
    </div>
  );
}
