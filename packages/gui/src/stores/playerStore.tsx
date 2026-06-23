import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react';
import type { Track, Playlist } from '@core';
import { PlaybackMode, PlaybackState } from '@core';
import type { LibraryManager, Database } from '@core';
import { proxyFetch } from '../utils/proxyFetch';

interface PlayerCtx {
  currentTrack: Track | null;
  state: PlaybackState;
  volume: number;
  mode: PlaybackMode;
  duration: number;
  position: number;
  queue: Track[];
  allTracks: Track[];
  libraryManager: LibraryManager | null;
  playlists: Playlist[];
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (ms: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  cycleMode: () => void;
  setQueue: (tracks: Track[], startIdx?: number) => void;
  playIndex: (idx: number) => void;
  addTracks: (tracks: Track[]) => void;
  deleteTrack: (id: number) => void;
  initLibrary: (library: LibraryManager, db: Database) => void;
  // 播放列表
  loadPlaylists: () => void;
  createPlaylist: (name: string) => number;
  deletePlaylist: (id: number) => void;
  renamePlaylist: (id: number, name: string) => void;
  addToPlaylist: (playlistId: number, songIds: number[]) => void;
  removeFromPlaylist: (playlistId: number, songIds: number[]) => void;
}

const Ctx = createContext<PlayerCtx>(null!);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef(new Audio());
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const modeRef = useRef<PlaybackMode>(PlaybackMode.Sequential);
  const libraryRef = useRef<LibraryManager | null>(null);
  const dbRef = useRef<Database | null>(null);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [state, setState] = useState<PlaybackState>(PlaybackState.Stopped);
  const [volume, setVol] = useState(80);
  const [mode, setMode] = useState<PlaybackMode>(PlaybackMode.Sequential);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [downloading, setDownloading] = useState(false);

  const initLibrary = useCallback((library: LibraryManager, db: Database) => {
    libraryRef.current = library;
    dbRef.current = db;
  }, []);

  const audio = audioRef.current;
  audio.volume = volume / 100;

  audio.ontimeupdate = () => setPosition(Math.floor(audio.currentTime * 1000));
  audio.onloadedmetadata = () => setDuration(Math.floor(audio.duration * 1000));
  audio.onplay = () => setState(PlaybackState.Playing);
  audio.onpause = () => setState(PlaybackState.Paused);
  audio.onended = () => { setState(PlaybackState.Stopped); next(); };

  const loadAndPlay = useCallback(async (track: Track) => {
    let src = track.filePath;

    // 远程 URL → 通过 Tauri HTTP 代理下载为 blob URL（绕过 CORS）
    if (/^https?:\/\//.test(src)) {
      try {
        setDownloading(true);
        const resp = await proxyFetch(src);
        const blob = await resp.blob();
        src = URL.createObjectURL(blob);
      } catch {
        // 下载失败，回退到原始 URL
      }
      setDownloading(false);
    }

    audio.src = src;
    audio.play().catch(() => {});
    setCurrentTrack(track);
  }, [audio]);

  const togglePlay = () => { audio.paused ? audio.play() : audio.pause(); };
  const seek = (ms: number) => { audio.currentTime = ms / 1000; };

  const next = useCallback(() => {
    const q = queueRef.current;
    if (!q.length) return;
    let idx = indexRef.current;
    if (modeRef.current === PlaybackMode.RepeatOne) { /* replay */ }
    else if (modeRef.current === PlaybackMode.Shuffle) {
      idx = Math.floor(Math.random() * q.length);
    } else if (idx >= q.length - 1) {
      if (modeRef.current === PlaybackMode.RepeatAll) idx = 0;
      else { audio.pause(); return; }
    } else { idx++; }
    indexRef.current = idx;
    loadAndPlay(q[idx]);
  }, [loadAndPlay, audio]);

  const prev = useCallback(() => {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const idx = Math.max(0, indexRef.current - 1);
    indexRef.current = idx;
    if (queueRef.current[idx]) loadAndPlay(queueRef.current[idx]);
  }, [audio, loadAndPlay]);

  const cycleMode = () => {
    const modes = [PlaybackMode.Sequential, PlaybackMode.Shuffle, PlaybackMode.RepeatOne, PlaybackMode.RepeatAll];
    const next = modes[(modes.indexOf(modeRef.current) + 1) % 4];
    modeRef.current = next;
    setMode(next);
  };

  const setQueue = useCallback((tracks: Track[], startIdx = 0) => {
    queueRef.current = tracks;
    indexRef.current = Math.min(startIdx, tracks.length - 1);
    if (tracks.length) loadAndPlay(tracks[indexRef.current]);
  }, [loadAndPlay]);

  const playIndex = (idx: number) => {
    if (idx >= 0 && idx < queueRef.current.length) {
      indexRef.current = idx;
      loadAndPlay(queueRef.current[idx]);
    }
  };

  const addTracks = useCallback((tracks: Track[]) => {
    setAllTracks(prev => {
      const existing = new Set(prev.map(t => t.filePath));
      const fresh = tracks.filter(t => !existing.has(t.filePath));
      // 持久化到数据库
      const lib = libraryRef.current;
      const db = dbRef.current;
      if (lib && db) {
        for (const track of fresh) {
          const id = lib.addSong(track);
          if (id !== null) track.id = id; // 更新为 DB 分配的 ID（跳过重复）
        }
        db.save().catch(() => {});
      }
      return [...prev, ...fresh];
    });
  }, []);

  const deleteTrack = useCallback((id: number) => {
    const lib = libraryRef.current;
    const db = dbRef.current;
    if (lib && db) {
      lib.deleteSong(id);
      db.save().catch(() => {});
    }
    setAllTracks(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── 播放列表操作 ──────────────────────────────────────

  const loadPlaylists = useCallback(() => {
    const lib = libraryRef.current;
    if (!lib) return;
    const lists = lib.getAllPlaylists();
    setPlaylists(lists.map(l => ({
      id: l.id,
      name: l.name,
      songCount: l.songCount,
      createdAt: l.created_at,
    })));
  }, []);

  const createPlaylist = useCallback((name: string) => {
    const lib = libraryRef.current;
    const db = dbRef.current;
    if (!lib || !db) return 0;
    const id = lib.createPlaylist(name);
    db.save().catch(() => {});
    loadPlaylists();
    return id;
  }, [loadPlaylists]);

  const deletePlaylist = useCallback((id: number) => {
    const lib = libraryRef.current;
    const db = dbRef.current;
    if (!lib || !db) return;
    lib.deletePlaylist(id);
    db.save().catch(() => {});
    loadPlaylists();
  }, [loadPlaylists]);

  const renamePlaylist = useCallback((id: number, name: string) => {
    const lib = libraryRef.current;
    const db = dbRef.current;
    if (!lib || !db) return;
    lib.renamePlaylist(id, name);
    db.save().catch(() => {});
    loadPlaylists();
  }, [loadPlaylists]);

  const addToPlaylist = useCallback((playlistId: number, songIds: number[]) => {
    const lib = libraryRef.current;
    const db = dbRef.current;
    if (!lib || !db) return;
    lib.addSongsToPlaylist(playlistId, songIds);
    db.save().catch(() => {});
    loadPlaylists();
  }, [loadPlaylists]);

  const removeFromPlaylist = useCallback((playlistId: number, songIds: number[]) => {
    const lib = libraryRef.current;
    const db = dbRef.current;
    if (!lib || !db) return;
    lib.removeSongsFromPlaylist(playlistId, songIds);
    db.save().catch(() => {});
    loadPlaylists();
  }, [loadPlaylists]);

  return (
    <Ctx.Provider value={{
      currentTrack, state, volume, mode, duration, position,
      queue: queueRef.current, allTracks, playlists,
      libraryManager: libraryRef.current,
      togglePlay, next, prev, seek,
      setVolume: (v) => { setVol(v); audio.volume = v / 100; },
      toggleMute: () => { audio.muted = !audio.muted; },
      cycleMode, setQueue, playIndex,
      addTracks, deleteTrack, initLibrary,
      loadPlaylists, createPlaylist, deletePlaylist, renamePlaylist,
      addToPlaylist, removeFromPlaylist,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const usePlayer = () => useContext(Ctx);
