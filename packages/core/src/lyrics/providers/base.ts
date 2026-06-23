/** 歌词提供者抽象接口 */

import type { LyricsData } from '../../types.js';

export interface LyricsProvider {
  readonly name: string;
  search(title: string, artist: string, album?: string, duration?: number): Promise<LyricsData | null>;
}
