import { useState, useEffect, useRef } from 'react';
import { usePlayer } from '../stores/playerStore';
import SongTable from '../components/SongTable';
import type { Track } from '@core';

export default function PlaylistPage() {
  const {
    libraryManager, playlists,
    loadPlaylists, createPlaylist, deletePlaylist, renamePlaylist,
    addToPlaylist, removeFromPlaylist,
    setQueue, playIndex,
  } = usePlayer();

  const [activeId, setActiveId] = useState<number | null>(null);
  const [songs, setSongs] = useState<Track[]>([]);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameText, setRenameText] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadPlaylists(); }, [loadPlaylists]);

  useEffect(() => {
    if (activeId && libraryManager) {
      setSongs(libraryManager.getPlaylistSongs(activeId));
    } else {
      setSongs([]);
    }
  }, [activeId, libraryManager, playlists]);

  useEffect(() => {
    if (renaming !== null) renameInputRef.current?.focus();
  }, [renaming]);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    const id = createPlaylist(name);
    setNewName('');
    setActiveId(id);
  };

  const handleDelete = (id: number) => {
    deletePlaylist(id);
    if (activeId === id) setActiveId(null);
  };

  const handleRename = (id: number) => {
    const name = renameText.trim();
    if (!name) { setRenaming(null); return; }
    renamePlaylist(id, name);
    setRenaming(null);
  };

  const handleRemove = (track: Track) => {
    if (!activeId) return;
    removeFromPlaylist(activeId, [track.id]);
    setSongs(prev => prev.filter(s => s.id !== track.id));
  };

  const handlePlayAll = () => {
    if (songs.length) {
      setQueue(songs, 0);
      playIndex(0);
    }
  };

  const handlePlaySong = (_track: Track, idx: number) => {
    setQueue(songs, idx);
    playIndex(idx);
  };

  return (
    <div className="flex gap-4 h-full">
      {/* 左侧：播放列表 */}
      <div className="w-56 flex-shrink-0 space-y-2">
        <h1 className="text-lg font-bold">📋 播放列表</h1>

        <div className="flex gap-1">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="新建播放列表..."
            className="flex-1 bg-bg-darkest border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent outline-none"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="px-2 py-1.5 rounded-lg bg-accent-dim text-accent border border-accent/30 hover:bg-accent hover:text-bg-darkest text-xs disabled:opacity-50"
          >＋</button>
        </div>

        <div className="space-y-0.5">
          {playlists.length === 0 ? (
            <div className="text-xs text-text-muted py-4 text-center">暂无播放列表</div>
          ) : (
            playlists.map(pl => (
              <div key={pl.id}>
                {renaming === pl.id ? (
                  <div className="flex gap-1 px-2 py-1">
                    <input
                      ref={renameInputRef}
                      value={renameText}
                      onChange={e => setRenameText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(pl.id);
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      onBlur={() => handleRename(pl.id)}
                      className="flex-1 bg-bg-darkest border border-accent rounded px-1.5 py-0.5 text-xs text-text-primary outline-none"
                    />
                  </div>
                ) : (
                  <div
                    onClick={() => setActiveId(pl.id)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors group ${
                      activeId === pl.id ? 'bg-accent-dim text-accent' : 'text-text-secondary hover:bg-bg-medium'
                    }`}
                  >
                    <span className="truncate flex-1">{pl.name}</span>
                    <span className="text-text-muted mr-1">{pl.songCount}</span>
                    <div className="hidden group-hover:flex gap-0.5">
                      <button
                        onClick={e => { e.stopPropagation(); setRenaming(pl.id); setRenameText(pl.name); }}
                        className="px-1 rounded hover:bg-bg-light text-xs"
                        title="重命名"
                      >✎</button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(pl.id); }}
                        className="px-1 rounded hover:bg-red-900/50 text-xs"
                        title="删除"
                      >✕</button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧：歌曲列表 */}
      <div className="flex-1 min-w-0 space-y-2">
        {activeId && songs.length > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {playlists.find(p => p.id === activeId)?.name || ''}
              </h2>
              <button
                onClick={handlePlayAll}
                className="px-3 py-1.5 rounded-lg bg-accent-dim text-accent border border-accent/30 hover:bg-accent hover:text-bg-darkest text-sm"
              >
                ▶ 播放全部
              </button>
            </div>
            <SongTable
              tracks={songs}
              onPlay={handlePlaySong}
              onRemoveFromPlaylist={activeId ? handleRemove : undefined}
            />
          </>
        ) : activeId ? (
          <div className="text-center text-text-muted py-20">
            <p>播放列表为空</p>
            <p className="text-xs mt-1">从音乐库中添加歌曲</p>
          </div>
        ) : (
          <div className="text-center text-text-muted py-20">
            <p>选择左侧播放列表查看歌曲</p>
          </div>
        )}
      </div>
    </div>
  );
}
