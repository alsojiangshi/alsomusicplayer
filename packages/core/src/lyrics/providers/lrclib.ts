/** LRCLIB.net 歌词提供者 */

import type { LyricsData } from '../../types.js';
import type { LyricsProvider } from './base.js';

export class LRCLibProvider implements LyricsProvider {
  readonly name = 'lrclib';
  private base = 'https://lrclib.net/api';

  async search(title: string, artist: string, album = '', duration = 0): Promise<LyricsData | null> {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (album) params.set('album_name', album);
    if (duration > 0) params.set('duration', String(Math.round(duration)));

    try {
      // 1. 精确查询
      let resp = await fetch(`${this.base}/get?${params}`);
      if (resp.ok) {
        const data: any = await resp.json();
        return this.parse(data);
      }

      // 2. 搜索
      params.delete('album_name');
      params.delete('duration');
      resp = await fetch(`${this.base}/search?${params}`);
      if (resp.ok) {
        const results: any[] = await resp.json();
        if (Array.isArray(results) && results.length > 0) {
          return this.parse(results[0]);
        }
      }
    } catch { /* offline */ }
    return null;
  }

  private parse(data: any): LyricsData | null {
    if (!data) return null;
    const plain = data.plainLyrics || '';
    const synced = data.syncedLyrics || '';
    if (!plain && !synced) return null;
    return {
      source: `lrclib (id=${data.id})`,
      plainText: plain || null,
      syncedText: synced || null,
      language: 'original',
    };
  }
}
