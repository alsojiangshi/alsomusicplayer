/** 歌词管理器 — 编排搜索、缓存、导入 */

import type { LibraryManager } from '../library/manager.js';
import type { LyricsData } from '../types.js';
import { getConfigValue } from '../config.js';
import type { LyricsProvider } from './providers/base.js';
import { LRCParser } from './parser.js';

export class LyricsManager {
  readonly parser = LRCParser;
  private providers: Record<string, LyricsProvider> = {};

  constructor(private library: LibraryManager) {}

  /** 注册歌词提供者（CLI/GUI 分别在初始化时调用） */
  registerProvider(name: string, provider: LyricsProvider): void {
    this.providers[name] = provider;
  }

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
    const provider = this.providers.local;
    if (!provider || !('importContent' in provider)) return false;
    const data = (provider as any).importContent(content);
    if (!data) return false;
    this.library.cacheLyrics(songId, data);
    return true;
  }

  findLocalFile(audioFilePath: string): string | null {
    const provider = this.providers.local;
    if (!provider || !('findLocalLrc' in provider)) return null;
    return (provider as any).findLocalLrc(audioFilePath);
  }
}
