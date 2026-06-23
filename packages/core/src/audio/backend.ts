/** AudioBackend — 音频引擎抽象接口 */

import { PlaybackState } from '../types.js';

export interface AudioBackend {
  readonly state: PlaybackState;
  readonly volume: number;

  load(source: string): Promise<void>;
  play(): void;
  pause(): void;
  stop(): void;
  seek(positionMs: number): void;
  setVolume(vol: number): void;
  getPosition(): number;
  getDuration(): number;
  getProgress(): number;
  playPause(): void;
  volumeUp(step?: number): void;
  volumeDown(step?: number): void;
  toggleMute(): boolean;

  on(event: 'trackEnd' | 'stateChange' | 'error', cb: (...args: any[]) => void): void;
}

export { PlaybackState };
