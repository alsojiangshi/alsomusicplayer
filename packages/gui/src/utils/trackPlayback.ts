import type { StorageProvider, Track } from '@core';
import { proxyFetch } from './proxyFetch';

const objectUrlCache = new Map<string, string>();

const MIME_BY_EXT: Record<string, string> = {
  aac: 'audio/aac',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  wma: 'audio/x-ms-wma',
};

export async function resolveTrackPlaybackSource(
  track: Track,
  storage: StorageProvider | null,
): Promise<string> {
  if (/^(blob:|data:)/i.test(track.filePath)) {
    return track.filePath;
  }

  if (/^https?:\/\//i.test(track.filePath)) {
    const cached = objectUrlCache.get(track.filePath);
    if (cached) {
      return cached;
    }

    const response = await proxyFetch(track.filePath);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    objectUrlCache.set(track.filePath, blobUrl);
    return blobUrl;
  }

  if (!storage) {
    return track.filePath;
  }

  const cached = objectUrlCache.get(track.filePath);
  if (cached) {
    return cached;
  }

  const bytes = await storage.readFile(track.filePath);
  const blobUrl = URL.createObjectURL(
    new Blob([toArrayBuffer(bytes)], {
      type: getMimeType(track),
    }),
  );
  objectUrlCache.set(track.filePath, blobUrl);
  return blobUrl;
}

export function releaseTrackPlaybackSource(path: string): void {
  const cached = objectUrlCache.get(path);
  if (!cached) {
    return;
  }

  URL.revokeObjectURL(cached);
  objectUrlCache.delete(path);
}

function getMimeType(track: Track): string {
  const ext = track.filePath.split('.').pop()?.toLowerCase() || track.format.toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
