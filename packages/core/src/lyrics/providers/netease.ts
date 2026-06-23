/** 网易云音乐歌词提供者 */

import type { LyricsData } from '../../types.js';
import type { LyricsProvider } from './base.js';
import { LRCParser } from '../parser.js';
import { getHttpClient } from '../../utils/http.js';

export class NeteaseProvider implements LyricsProvider {
  readonly name = 'netease';

  async search(title: string, artist: string): Promise<LyricsData | null> {
    try {
      const songId = await this.searchSong(title, artist);
      if (!songId) return null;
      return this.getLyrics(songId);
    } catch {
      return null;
    }
  }

  private async searchSong(title: string, artist: string): Promise<number | null> {
    const fetch = getHttpClient();
    const resp = await fetch(
      `https://music.163.com/api/search/get?s=${encodeURIComponent(`${title} ${artist}`)}&type=1&limit=10&offset=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/' } }
    );
    if (!resp.ok) return null;
    const data: any = await resp.json();
    const songs = data?.result?.songs ?? [];
    if (!songs.length) return null;

    const titleL = title.toLowerCase(), artistL = artist.toLowerCase();
    for (const s of songs) {
      const sn = (s.name || '').toLowerCase();
      const sa = (s.artists || []).map((a: any) => (a.name || '').toLowerCase());
      if (sn.includes(titleL) || titleL.includes(sn)) {
        if (sa.some((a: string) => a.includes(artistL) || artistL.includes(a))) return s.id;
      }
    }
    return songs[0]?.id ?? null;
  }

  private async getLyrics(songId: number): Promise<LyricsData | null> {
    const fetch = getHttpClient();
    const resp = await fetch(
      `https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=1`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/' } }
    );
    if (!resp.ok) return null;
    const data: any = await resp.json();
    const lrc = data?.lrc?.lyric || '';
    if (!lrc) return null;
    return {
      source: `netease (id=${songId})`,
      plainText: LRCParser.parseToPlain(lrc),
      syncedText: lrc,
      language: 'original',
    };
  }
}
