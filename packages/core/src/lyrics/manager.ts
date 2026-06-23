/** 歌词管理器 — 编排搜索、缓存、导入 */

import type { LibraryManager } from '../library/manager.js';
import type { LyricsData } from '../types.js';
import { getConfigValue } from '../config.js';
import type { LyricsProvider } from './providers/base.js';
import { LocalLyricsProvider } from './providers/local.js';
import { LRCLibProvider } from './providers/lrclib.js';
import { NeteaseProvider } from './providers/netease.js';
import { LRCParser } from './parser.js';

export class LyricsManager {
  readonly parser = LRCParser;
  private providers: Record<string, LyricsProvider> = {
    lrclib: new LRCLibProvider(),
    netease: new NeteaseProvider(),
    local: new LocalLyricsProvider(),
  };

  constructor(private library: LibraryManager) {}

  getCached(songId: number): LyricsData | null {
    const row = this.library.getCachedLyrics(songId);
    if (!row) return null;
    return {
      source: row.source,
      plainText: row.plain_text,
      syncedText: row.synced_text,
      language: row.language,
    };
  }

  async searchOnline(
    title: string, artist: string, album = '', duration = 0
  ): Promise<LyricsData | null> {
    const providerNames = getConfigValue<string[]>('lyrics.providers', ['lrclib', 'netease']);
    for (const name of providerNames) {
      const provider = this.providers[name];
      if (!provider) continue;
      const result = await provider.search(title, artist, album, duration);
      if (result) return result;
    }
    return null;
  }

  importLocalContent(songId: number, content: string): boolean {
    if (!content.trim()) return false;
    const provider = this.providers.local as LocalLyricsProvider;
    const data = provider.importContent(content);
    if (!data) return false;
    this.library.cacheLyrics(songId, data);
    return true;
  }

  findLocalFile(audioFilePath: string): string | null {
    return (this.providers.local as LocalLyricsProvider).findLocalLrc(audioFilePath);
  }
}
