/** 播放列表引擎 — 队列管理 + 4 种播放模式 */

import type { AudioBackend } from '../audio/backend.js';
import { PlaybackMode, PlaybackState, type Track } from '../types.js';

export class PlaylistEngine {
  private queue: Track[] = [];
  private original: Track[] = [];
  private index = -1;
  private mode: PlaybackMode = PlaybackMode.Sequential;
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  constructor(private audio: AudioBackend) {
    audio.on('trackEnd', () => this.next());
  }

  get currentIndex() { return this.index; }
  get currentTrack(): Track | null { return this.queue[this.index] ?? null; }
  get queueSize() { return this.queue.length; }
  get currentMode() { return this.mode; }
  get allTracks(): Track[] { return [...this.queue]; }

  on(event: 'currentChanged' | 'queueChanged', cb: (idx: number) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }

  private emit(event: string, arg?: any) {
    this.listeners.get(event)?.forEach(cb => cb(arg));
  }

  setQueue(tracks: Track[], startIdx = 0) {
    this.queue = [...tracks];
    this.original = [...tracks];
    if (this.mode === PlaybackMode.Shuffle) this.shuffleQueue();
    this.index = this.queue.length ? Math.max(0, Math.min(startIdx, this.queue.length - 1)) : -1;
    this.emit('queueChanged');
  }

  addToQueue(tracks: Track[]) {
    this.queue.push(...tracks);
    this.original.push(...tracks);
    this.emit('queueChanged');
  }

  clearQueue() {
    this.audio.stop();
    this.queue = [];
    this.original = [];
    this.index = -1;
    this.emit('queueChanged');
  }

  playIndex(idx: number): boolean {
    if (idx < 0 || idx >= this.queue.length) return false;
    this.index = idx;
    const track = this.queue[idx];
    this.audio.load(track.filePath).then(() => this.audio.play());
    this.emit('currentChanged', idx);
    return true;
  }

  playCurrent(): boolean { return this.playIndex(this.index); }

  next(): boolean {
    if (!this.queue.length) return false;
    if (this.mode === PlaybackMode.Shuffle) return this.playRandom();
    if (this.mode === PlaybackMode.RepeatOne) return this.playCurrent();
    if (this.index >= this.queue.length - 1) {
      if (this.mode === PlaybackMode.RepeatAll) return this.playIndex(0);
      this.audio.stop();
      return false;
    }
    return this.playIndex(this.index + 1);
  }

  previous(): boolean {
    if (!this.queue.length) return false;
    if (this.audio.getPosition() > 3000) return this.playCurrent();
    return this.playIndex(Math.max(0, this.index - 1));
  }

  private playRandom(): boolean {
    if (!this.queue.length) return false;
    if (this.queue.length === 1) return this.playIndex(0);
    const others = Array.from({ length: this.queue.length }, (_, i) => i).filter(i => i !== this.index);
    const idx = others[Math.floor(Math.random() * others.length)];
    return this.playIndex(idx);
  }

  setMode(mode: PlaybackMode) {
    if (mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;
    if (mode === PlaybackMode.Shuffle && prev !== PlaybackMode.Shuffle) {
      this.original = [...this.queue];
      this.shuffleQueue();
    } else if (mode !== PlaybackMode.Shuffle && prev === PlaybackMode.Shuffle) {
      const current = this.currentTrack;
      this.queue = [...this.original];
      if (current) this.index = this.queue.indexOf(current);
    }
  }

  cycleMode(): PlaybackMode {
    const modes = [PlaybackMode.Sequential, PlaybackMode.Shuffle, PlaybackMode.RepeatOne, PlaybackMode.RepeatAll];
    this.setMode(modes[(modes.indexOf(this.mode) + 1) % modes.length]);
    return this.mode;
  }

  private shuffleQueue() {
    const current = this.currentTrack;
    const others = this.queue.filter(t => t !== current);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    this.queue = current ? [current, ...others] : others;
    this.index = 0;
  }
}
