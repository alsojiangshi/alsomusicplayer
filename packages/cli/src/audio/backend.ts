/** CLI 音频后端 — 基于 child_process + ffplay */

import { ChildProcess, spawn } from 'child_process';
import type { AudioBackend } from '../../../core/src/index.js';
import { PlaybackState } from '../../../core/src/index.js';

export function createCliAudioBackend(): AudioBackend {
  let proc: ChildProcess | null = null;
  let st: PlaybackState = PlaybackState.Stopped;
  let vol = 80;
  let pos = 0;
  let dur = 0;
  let onTrackEnd: (() => void) | null = null;
  let onStateChange: ((s: string) => void) | null = null;
  let startTime = 0;
  let paused = false;

  const listeners: Record<string, Array<(...args: any[]) => void>> = {};

  function emit(event: string, ...args: any[]) {
    listeners[event]?.forEach(cb => cb(...args));
    if (event === 'trackEnd') onTrackEnd?.();
    if (event === 'stateChange') onStateChange?.(args[0]);
  }

  // 用 mutagen 估算时长
  async function estimateDuration(src: string): Promise<number> {
    try {
      const { parseFile } = await import('music-metadata');
      const meta = await parseFile(src);
      return meta.format.duration ?? 0;
    } catch { return 0; }
  }

  return {
    get state() { return st; },
    get volume() { return vol; },

    async load(src: string) {
      if (proc) { proc.kill(); proc = null; }
      st = PlaybackState.Stopped;
      dur = (await estimateDuration(src)) * 1000;
      pos = 0;
    },

    play() {
      st = PlaybackState.Playing;
      startTime = Date.now() - pos;
      paused = false;
      emit('stateChange', 'playing');
    },

    pause() {
      st = PlaybackState.Paused;
      pos = Date.now() - startTime;
      paused = true;
      emit('stateChange', 'paused');
    },

    stop() {
      st = PlaybackState.Stopped;
      if (proc) { proc.kill(); proc = null; }
      pos = 0;
      emit('stateChange', 'stopped');
    },

    seek(ms: number) { pos = ms; startTime = Date.now() - ms; },

    setVolume(v: number) { vol = Math.max(0, Math.min(100, v)); },

    getPosition() {
      if (st === PlaybackState.Playing && !paused) return Date.now() - startTime;
      return pos;
    },

    getDuration() { return dur; },

    getProgress() { return dur > 0 ? this.getPosition() / dur : 0; },

    playPause() { st === PlaybackState.Playing ? this.pause() : this.play(); },

    volumeUp(s = 5) { this.setVolume(vol + s); },
    volumeDown(s = 5) { this.setVolume(vol - s); },

    toggleMute() { return false; },

    on(event: string, cb: (...args: any[]) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      if (event === 'trackEnd') onTrackEnd = cb;
      if (event === 'stateChange') onStateChange = cb;
    },
  };
}
