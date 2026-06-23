/** CLI/TUI 应用主组件 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { LibraryManager, PlaylistEngine, LyricsManager, Database, loadConfig, getDataDir, PlaybackMode } from '../../core/src/index.js';
import type { Track } from '../../core/src/index.js';
import type { AudioBackend } from '../../core/src/index.js';
import Header from './components/Header.js';
import StatusBar from './components/StatusBar.js';
import ControlBar from './components/ControlBar.js';
import SongList from './components/SongList.js';
import NowPlayingScreen from './screens/NowPlayingScreen.js';
import { createCliAudioBackend } from './audio/backend.js';

export default function App() {
  const [screen, setScreen] = useState<'browser' | 'nowPlaying'>('browser');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [state, setState] = useState('stopped');
  const [mode, setMode] = useState(PlaybackMode.Sequential);
  const [volume, setVolume] = useState(80);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [statusMsg, setStatusMsg] = useState('🎵 就绪');
  const [lyricsText, setLyricsText] = useState('');

  const audioRef = useRef<AudioBackend>();
  const playlistRef = useRef<PlaylistEngine>();
  const libraryRef = useRef<LibraryManager>();
  const lyricsRef = useRef<LyricsManager>();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    (async () => {
      const dataDir = getDataDir();
      await Bun.$`mkdir -p ${dataDir}`.quiet();
      await loadConfig(`${dataDir}/config.json`);

      const db = new Database(`${dataDir}/music.db`);
      await db.init();
      const library = new LibraryManager(db);
      libraryRef.current = library;
      const all = library.getAllSongs();
      setTracks(all);

      const audio = createCliAudioBackend();
      audioRef.current = audio;
      audio.on('trackEnd', () => { playlistRef.current?.next(); });
      audio.on('stateChange', (s: string) => setState(s));

      const playlist = new PlaylistEngine(audio);
      playlistRef.current = playlist;
      playlist.on('currentChanged', (idx: number) => {
        const t = playlist.allTracks[idx];
        if (t) {
          setCurrentTrack(t);
          setStatusMsg(`▶ [${idx + 1}/${playlist.queueSize}] ${t.title} — ${t.artist}`);
        }
      });

      const lyrics = new LyricsManager(library);
      lyricsRef.current = lyrics;

      intervalRef.current = setInterval(() => {
        if (audio) {
          setPosition(audio.getPosition());
          setDuration(audio.getDuration());
          setVolume(audio.volume);
        }
      }, 500);
    })();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useInput((input, key) => {
    if (key.escape) process.exit(0);
    const audio = audioRef.current, pl = playlistRef.current;
    if (!audio || !pl) return;

    switch (input) {
      case ' ': audio.playPause(); break;
      case 'n': case '>': pl.next(); break;
      case 'p': case '<': pl.previous(); break;
      case 'm': audio.toggleMute(); break;
      case 's': pl.setMode(pl.currentMode === PlaybackMode.Shuffle ? PlaybackMode.Sequential : PlaybackMode.Shuffle); setMode(pl.currentMode); break;
      case 'r': pl.cycleMode(); setMode(pl.currentMode); break;
      case '1': setScreen('browser'); break;
      case '2': setScreen('nowPlaying'); break;
      case '+': case '=': audio.volumeUp(); break;
      case '-': audio.volumeDown(); break;
    }
  });

  const handlePlay = useCallback((track: Track, idx: number) => {
    const pl = playlistRef.current;
    if (pl) { pl.setQueue(tracks, idx); pl.playCurrent(); }
    setScreen('nowPlaying');
  }, [tracks]);

  const handlePlayAll = () => {
    const pl = playlistRef.current;
    if (pl && tracks.length) { pl.setQueue(tracks, 0); pl.playCurrent(); setScreen('nowPlaying'); }
  };

  return (
    <Box flexDirection="column" height={process.stdout.rows || 40}>
      <Header />
      <StatusBar text={statusMsg} mode={mode} count={tracks.length} />
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {screen === 'browser' ? (
          <SongList tracks={tracks} onPlay={handlePlay} onPlayAll={handlePlayAll} />
        ) : (
          <NowPlayingScreen track={currentTrack} position={position} duration={duration} lyrics={lyricsText} />
        )}
      </Box>
      <ControlBar state={state} volume={volume} mode={mode} position={position} duration={duration} />
      <Box paddingX={1}>
        <Text dimColor>[Space]播放 [n]下一首 [p]上一首 [m]静音 [s]随机 [r]循环 [+/-]音量 [1]浏览 [2]正在播放 [Esc]退出</Text>
      </Box>
    </Box>
  );
}
