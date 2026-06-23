import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react';
import type { Track } from '@music-player/core';
import { PlaybackMode, PlaybackState } from '@music-player/core';

interface PlayerCtx {
  currentTrack: Track | null;
  state: PlaybackState;
  volume: number;
  mode: PlaybackMode;
  duration: number;
  position: number;
  queue: Track[];
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (ms: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  cycleMode: () => void;
  setQueue: (tracks: Track[], startIdx?: number) => void;
  playIndex: (idx: number) => void;
}

const Ctx = createContext<PlayerCtx>(null!);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef(new Audio());
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const modeRef = useRef<PlaybackMode>(PlaybackMode.Sequential);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [state, setState] = useState<PlaybackState>(PlaybackState.Stopped);
  const [volume, setVol] = useState(80);
  const [mode, setMode] = useState<PlaybackMode>(PlaybackMode.Sequential);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  const audio = audioRef.current;
  audio.volume = volume / 100;

  audio.ontimeupdate = () => setPosition(Math.floor(audio.currentTime * 1000));
  audio.onloadedmetadata = () => setDuration(Math.floor(audio.duration * 1000));
  audio.onplay = () => setState(PlaybackState.Playing);
  audio.onpause = () => setState(PlaybackState.Paused);
  audio.onended = () => { setState(PlaybackState.Stopped); next(); };

  const loadAndPlay = useCallback((track: Track) => {
    audio.src = track.filePath;
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

  return (
    <Ctx.Provider value={{ currentTrack, state, volume, mode, duration, position, queue: queueRef.current, togglePlay, next, prev, seek, setVolume: (v) => { setVol(v); audio.volume = v / 100; }, toggleMute: () => { audio.muted = !audio.muted; }, cycleMode, setQueue, playIndex }}>
      {children}
    </Ctx.Provider>
  );
}

export const usePlayer = () => useContext(Ctx);
