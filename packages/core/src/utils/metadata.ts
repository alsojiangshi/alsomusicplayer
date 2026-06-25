/** 音频元数据提取 - 基于 music-metadata */

import { readFileSync } from 'node:fs';
import type { Track } from '../types.js';
import { computeFileHash } from './hash.js';

const SUPPORTED_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.ogg', '.oga', '.m4a', '.mp4',
  '.aac', '.wma', '.opus', '.aiff', '.aif',
]);

const FORMAT_MAP: Record<string, string> = {
  '.mp3': 'MP3', '.flac': 'FLAC', '.wav': 'WAV', '.ogg': 'OGG',
  '.oga': 'OGG', '.m4a': 'M4A', '.mp4': 'M4A', '.aac': 'AAC',
  '.wma': 'WMA', '.opus': 'OPUS', '.aiff': 'AIFF', '.aif': 'AIFF',
};

export function isSupportedAudio(filePath: string): boolean {
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
  return SUPPORTED_EXTENSIONS.has(ext);
}

export async function extractMetadata(filePath: string): Promise<Partial<Track>> {
  try {
    const { parseFile } = (await import('music-metadata') as unknown) as {
      parseFile: (path: string) => Promise<{
        common: {
          title?: string;
          artist?: string;
          album?: string;
        };
        format: {
          duration?: number;
          bitrate?: number;
          sampleRate?: number;
          numberOfChannels?: number;
        };
      }>;
    };
    const meta = await parseFile(filePath);
    const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
    const info = meta.format;

    return {
      title: meta.common.title || filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Unknown',
      artist: meta.common.artist || 'Unknown Artist',
      album: meta.common.album || 'Unknown Album',
      duration: info.duration ?? 0,
      filePath,
      fileHash: computeFileHash(filePath),
      format: FORMAT_MAP[ext] || ext.slice(1).toUpperCase(),
      bitrate: info.bitrate ?? 0,
      sampleRate: info.sampleRate ?? 0,
      channels: info.numberOfChannels ?? 2,
      fileSize: readFileSync(filePath).length,
      source: 'local',
    };
  } catch {
    const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
    return {
      title: filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Unknown',
      filePath,
      fileHash: computeFileHash(filePath),
      format: FORMAT_MAP[ext] || ext.slice(1).toUpperCase(),
      source: 'local',
    };
  }
}

export function scanDirectory(dirPath: string, recursive = true): string[] {
  const results: string[] = [];
  try {
    const { readdirSync, statSync } = require('node:fs');
    const path = require('node:path');
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      const full = path.join(dirPath, entry);
      const st = statSync(full);
      if (st.isDirectory() && recursive) {
        results.push(...scanDirectory(full, recursive));
      } else if (st.isFile() && isSupportedAudio(full)) {
        results.push(full);
      }
    }
  } catch { /* skip */ }
  return results;
}
