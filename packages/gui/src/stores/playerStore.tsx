import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppConfig, LyricsData, Playlist, StorageProvider, Track } from '@core';
import { PlaybackMode, PlaybackState, saveConfig, setConfig } from '@core';
import type { LibraryManager, Database } from '@core';
import {
  importLocalSources,
  type LocalImportError,
  type LocalImportResult,
  type LocalImportSource,
} from '../utils/libraryImport';
import {
  releaseTrackPlaybackSource,
  resolveTrackPlaybackSource,
} from '../utils/trackPlayback';

interface ImportSummary {
  added: number;
  skipped: number;
  failed: number;
  errors: LocalImportError[];
}

interface PlayerCtx {
  currentTrack: Track | null;
  state: PlaybackState;
  volume: number;
  muted: boolean;
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
  addTracks: (tracks: Track[]) => number;
  importLocalItems: (sources: LocalImportSource[]) => Promise<ImportSummary>;
  syncLibraryDirectories: (paths: string[]) => Promise<ImportSummary>;
  hydrateTracks: (tracks: Track[]) => void;
  deleteTrack: (id: number) => void;
  cacheLyrics: (songId: number, data: LyricsData) => void;
  applyAudioPreferences: (audioConfig: AppConfig['audio']) => void;
  initLibrary: (library: LibraryManager, db: Database, storage?: StorageProvider | null) => void;
  loadPlaylists: () => void;
  createPlaylist: (name: string) => number;
  deletePlaylist: (id: number) => void;
  renamePlaylist: (id: number, name: string) => void;
  addToPlaylist: (playlistId: number, songIds: number[]) => void;
  removeFromPlaylist: (playlistId: number, songIds: number[]) => void;
}

const Ctx = createContext<PlayerCtx>(null!);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const modeRef = useRef<PlaybackMode>(PlaybackMode.Sequential);
  const libraryRef = useRef<LibraryManager | null>(null);
  const dbRef = useRef<Database | null>(null);
  const storageRef = useRef<StorageProvider | null>(null);
  const allTracksRef = useRef<Track[]>([]);
  const nextRef = useRef<() => void>(() => {});

  if (!audioRef.current) {
    audioRef.current = new Audio();
  }

  const [libraryManager, setLibraryManager] = useState<LibraryManager | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [state, setState] = useState<PlaybackState>(PlaybackState.Stopped);
  const [volume, setVolumeState] = useState(80);
  const [muted, setMuted] = useState(false);
  const [mode, setMode] = useState<PlaybackMode>(PlaybackMode.Sequential);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  const audio = audioRef.current;

  useEffect(() => {
    allTracksRef.current = allTracks;
  }, [allTracks]);

  useEffect(() => {
    audio.volume = volume / 100;
  }, [audio, volume]);

  useEffect(() => {
    audio.muted = muted;
  }, [audio, muted]);

  const persistAudioPreference = useCallback((
    key: keyof AppConfig['audio'],
    value: AppConfig['audio'][keyof AppConfig['audio']],
  ) => {
    const storage = storageRef.current;
    setConfig(`audio.${key}`, value);
    if (storage) {
      void saveConfig(storage);
    }
  }, []);

  const appendTracks = useCallback((tracks: Track[]): number => {
    if (tracks.length === 0) {
      return 0;
    }

    const existingPaths = new Set(allTracksRef.current.map(track => track.filePath));
    const existingHashes = new Set(
      allTracksRef.current.map(track => track.fileHash).filter(Boolean),
    );
    const fresh = tracks.filter(track => {
      if (existingPaths.has(track.filePath)) {
        return false;
      }
      if (track.fileHash && existingHashes.has(track.fileHash)) {
        return false;
      }
      return true;
    });

    if (fresh.length === 0) {
      return 0;
    }

    let persisted = fresh;
    const library = libraryRef.current;
    const db = dbRef.current;

    if (library && db) {
      const savedTracks: Track[] = [];
      for (const track of fresh) {
        const id = library.addSong(track);
        if (id !== null) {
          savedTracks.push({ ...track, id });
        }
      }

      persisted = savedTracks;
      if (persisted.length > 0) {
        void db.save();
      }
    }

    if (persisted.length === 0) {
      return 0;
    }

    setAllTracks(prev => {
      const nextTracks = [...prev, ...persisted];
      allTracksRef.current = nextTracks;
      return nextTracks;
    });

    return persisted.length;
  }, []);

  const hydrateTracks = useCallback((tracks: Track[]) => {
    allTracksRef.current = tracks;
    setAllTracks(tracks);
  }, []);

  const initLibrary = useCallback((
    library: LibraryManager,
    db: Database,
    storage?: StorageProvider | null,
  ) => {
    libraryRef.current = library;
    dbRef.current = db;
    storageRef.current = storage ?? null;
    setLibraryManager(library);
  }, []);

  const loadAndPlay = useCallback(async (track: Track) => {
    const src = await resolveTrackPlaybackSource(track, storageRef.current);
    audio.src = src;
    await audio.play().catch(() => {});
    setCurrentTrack(track);

    const library = libraryRef.current;
    const db = dbRef.current;
    if (track.id > 0 && library && db) {
      library.addHistory(track.id);
      void db.save();
    }
  }, [audio]);

  const next = useCallback(() => {
    const queue = queueRef.current;
    if (queue.length === 0) {
      return;
    }

    let nextIndex = indexRef.current;

    if (modeRef.current === PlaybackMode.Shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (modeRef.current !== PlaybackMode.RepeatOne) {
      if (nextIndex >= queue.length - 1) {
        if (modeRef.current === PlaybackMode.RepeatAll) {
          nextIndex = 0;
        } else {
          audio.pause();
          return;
        }
      } else {
        nextIndex += 1;
      }
    }

    indexRef.current = nextIndex;
    void loadAndPlay(queue[nextIndex]);
  }, [audio, loadAndPlay]);

  nextRef.current = next;

  useEffect(() => {
    const handleTimeUpdate = () => setPosition(Math.floor(audio.currentTime * 1000));
    const handleLoadedMetadata = () => setDuration(Math.floor(audio.duration * 1000) || 0);
    const handlePlay = () => setState(PlaybackState.Playing);
    const handlePause = () => {
      setState(audio.currentTime === 0 ? PlaybackState.Stopped : PlaybackState.Paused);
    };
    const handleEnded = () => {
      setState(PlaybackState.Stopped);
      nextRef.current();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audio]);

  const togglePlay = useCallback(() => {
    if (audio.paused) {
      void audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [audio]);

  const seek = useCallback((ms: number) => {
    audio.currentTime = ms / 1000;
  }, [audio]);

  const prev = useCallback(() => {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    const prevIndex = Math.max(0, indexRef.current - 1);
    indexRef.current = prevIndex;

    if (queueRef.current[prevIndex]) {
      void loadAndPlay(queueRef.current[prevIndex]);
    }
  }, [audio, loadAndPlay]);

  const cycleMode = useCallback(() => {
    const modes = [
      PlaybackMode.Sequential,
      PlaybackMode.Shuffle,
      PlaybackMode.RepeatOne,
      PlaybackMode.RepeatAll,
    ];
    const nextMode = modes[(modes.indexOf(modeRef.current) + 1) % modes.length];
    modeRef.current = nextMode;
    setMode(nextMode);
    persistAudioPreference('playbackMode', nextMode);
  }, [persistAudioPreference]);

  const setQueue = useCallback((tracks: Track[], startIdx = 0) => {
    queueRef.current = tracks;
    indexRef.current = Math.min(startIdx, tracks.length - 1);

    if (tracks.length > 0 && indexRef.current >= 0) {
      void loadAndPlay(tracks[indexRef.current]);
    }
  }, [loadAndPlay]);

  const playIndex = useCallback((idx: number) => {
    if (idx >= 0 && idx < queueRef.current.length) {
      indexRef.current = idx;
      void loadAndPlay(queueRef.current[idx]);
    }
  }, [loadAndPlay]);

  const addTracks = useCallback((tracks: Track[]) => {
    return appendTracks(tracks);
  }, [appendTracks]);

  const importLocalItems = useCallback(async (
    sources: LocalImportSource[],
  ): Promise<ImportSummary> => {
    const storage = storageRef.current;
    if (!storage) {
      return {
        added: 0,
        skipped: 0,
        failed: sources.length,
        errors: [{
          source: 'local-import',
          stage: 'read',
          message: '存储系统尚未初始化，无法导入本地文件',
        }],
      };
    }

    const result: LocalImportResult = await importLocalSources({
      sources,
      storage,
      existingTracks: allTracksRef.current,
    });
    const added = appendTracks(result.tracks);

    return {
      added,
      skipped: result.skipped,
      failed: result.failed,
      errors: result.errors,
    };
  }, [appendTracks]);

  const syncLibraryDirectories = useCallback(async (
    paths: string[],
  ): Promise<ImportSummary> => {
    const storage = storageRef.current;
    const trimmedPaths = paths.map(path => path.trim()).filter(Boolean);

    if (!storage || trimmedPaths.length === 0) {
      return {
        added: 0,
        skipped: 0,
        failed: trimmedPaths.length,
        errors: [{
          source: 'library-sync',
          stage: 'read',
          message: '存储系统尚未初始化，无法同步媒体目录',
        }],
      };
    }

    const result: LocalImportResult = await importLocalSources({
      sources: trimmedPaths.map(path => ({ path })),
      storage,
      existingTracks: allTracksRef.current,
    });
    const added = appendTracks(result.tracks);

    return {
      added,
      skipped: result.skipped,
      failed: result.failed,
      errors: result.errors,
    };
  }, [appendTracks]);

  const refreshPlaylists = useCallback(() => {
    const library = libraryRef.current;
    if (!library) {
      return;
    }

    const lists = library.getAllPlaylists();
    setPlaylists(lists.map(list => ({
      id: list.id,
      name: list.name,
      songCount: list.songCount,
      createdAt: list.created_at,
    })));
  }, []);

  const deleteTrack = useCallback((id: number) => {
    const library = libraryRef.current;
    const db = dbRef.current;
    const storage = storageRef.current;
    const targetTrack = allTracksRef.current.find(track => track.id === id) ?? null;

    if (library && db) {
      library.deleteSong(id);
      void db.save();
    }

    if (targetTrack) {
      releaseTrackPlaybackSource(targetTrack.filePath);
      void removeManagedLibraryFile(targetTrack, storage);
    }

    const removedIndex = queueRef.current.findIndex(track => track.id === id);
    if (removedIndex >= 0) {
      queueRef.current = queueRef.current.filter(track => track.id !== id);
      if (removedIndex < indexRef.current) {
        indexRef.current -= 1;
      } else if (removedIndex === indexRef.current) {
        indexRef.current = Math.min(indexRef.current, queueRef.current.length - 1);
      }
    }

    if (currentTrack?.id === id) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      setCurrentTrack(null);
      setState(PlaybackState.Stopped);
      setPosition(0);
      setDuration(0);
    }

    setAllTracks(prev => {
      const nextTracks = prev.filter(track => track.id !== id);
      allTracksRef.current = nextTracks;
      return nextTracks;
    });

    refreshPlaylists();
  }, [audio, currentTrack?.id, refreshPlaylists]);

  const cacheLyrics = useCallback((songId: number, data: LyricsData) => {
    const library = libraryRef.current;
    const db = dbRef.current;
    if (!library || !db) {
      return;
    }

    library.cacheLyrics(songId, data);
    void db.save();
  }, []);

  const applyAudioPreferences = useCallback((audioConfig: AppConfig['audio']) => {
    setVolumeState(audioConfig.volume);
    setMuted(audioConfig.muted);
    setMode(audioConfig.playbackMode);
    modeRef.current = audioConfig.playbackMode;
  }, []);

  const loadPlaylists = useCallback(() => {
    refreshPlaylists();
  }, [refreshPlaylists]);

  const createPlaylist = useCallback((name: string) => {
    const library = libraryRef.current;
    const db = dbRef.current;
    if (!library || !db) {
      return 0;
    }

    const id = library.createPlaylist(name);
    void db.save();
    loadPlaylists();
    return id;
  }, [loadPlaylists]);

  const deletePlaylist = useCallback((id: number) => {
    const library = libraryRef.current;
    const db = dbRef.current;
    if (!library || !db) {
      return;
    }

    library.deletePlaylist(id);
    void db.save();
    loadPlaylists();
  }, [loadPlaylists]);

  const renamePlaylist = useCallback((id: number, name: string) => {
    const library = libraryRef.current;
    const db = dbRef.current;
    if (!library || !db) {
      return;
    }

    library.renamePlaylist(id, name);
    void db.save();
    loadPlaylists();
  }, [loadPlaylists]);

  const addToPlaylist = useCallback((playlistId: number, songIds: number[]) => {
    const library = libraryRef.current;
    const db = dbRef.current;
    if (!library || !db) {
      return;
    }

    library.addSongsToPlaylist(playlistId, songIds);
    void db.save();
    loadPlaylists();
  }, [loadPlaylists]);

  const removeFromPlaylist = useCallback((playlistId: number, songIds: number[]) => {
    const library = libraryRef.current;
    const db = dbRef.current;
    if (!library || !db) {
      return;
    }

    library.removeSongsFromPlaylist(playlistId, songIds);
    void db.save();
    loadPlaylists();
  }, [loadPlaylists]);

  return (
    <Ctx.Provider value={{
      currentTrack,
      state,
      volume,
      muted,
      mode,
      duration,
      position,
      queue: queueRef.current,
      allTracks,
      libraryManager,
      playlists,
      togglePlay,
      next,
      prev,
      seek,
      setVolume: (nextVolume) => {
        setVolumeState(nextVolume);
        audio.volume = nextVolume / 100;
        persistAudioPreference('volume', nextVolume);
      },
      toggleMute: () => {
        setMuted(prev => {
          const nextMuted = !prev;
          persistAudioPreference('muted', nextMuted);
          return nextMuted;
        });
      },
      cycleMode,
      setQueue,
      playIndex,
      addTracks,
      importLocalItems,
      syncLibraryDirectories,
      hydrateTracks,
      deleteTrack,
      cacheLyrics,
      applyAudioPreferences,
      initLibrary,
      loadPlaylists,
      createPlaylist,
      deletePlaylist,
      renamePlaylist,
      addToPlaylist,
      removeFromPlaylist,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const usePlayer = () => useContext(Ctx);

async function removeManagedLibraryFile(
  track: Track,
  storage: StorageProvider | null,
): Promise<void> {
  if (!storage?.deleteFile || track.source !== 'local') {
    return;
  }

  try {
    const dataDir = await storage.getDataDir();
    const libraryPrefix = `${normalizePath(dataDir)}/library/`;
    const targetPath = normalizePath(track.filePath);

    if (!targetPath.startsWith(libraryPrefix)) {
      return;
    }

    await storage.deleteFile(track.filePath);
  } catch {
    // Keep the DB deletion even if managed file cleanup fails.
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}
