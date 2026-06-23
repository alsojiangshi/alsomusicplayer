/** 本地歌词文件提供者 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { LyricsData } from '../../types.js';
import type { LyricsProvider } from './base.js';
import { LRCParser } from '../parser.js';

export class LocalLyricsProvider implements LyricsProvider {
  readonly name = 'local';

  async search(): Promise<LyricsData | null> {
    return null; // 本地不通过 search 获取
  }

  findLocalLrc(audioFile: string): string | null {
    const dir = dirname(audioFile);
    const name = audioFile.replace(/\.[^.]+$/, '');
    const lrcPath = `${name}.lrc`;
    if (existsSync(lrcPath)) return lrcPath;
    return null;
  }

  importContent(content: string): LyricsData | null {
    if (!content.trim()) return null;
    const hasTimestamps = LRCParser.isSynced(content);
    return {
      source: 'local_import',
      plainText: hasTimestamps ? null : content,
      syncedText: hasTimestamps ? content : null,
      language: 'original',
    };
  }

  importFile(filePath: string): LyricsData | null {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return this.importContent(content);
    } catch {
      return null;
    }
  }
}
