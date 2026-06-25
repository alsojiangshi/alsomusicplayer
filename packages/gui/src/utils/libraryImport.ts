import type { StorageProvider, Track } from '@core';
import { computeHashFromBlob, safeFilename } from '@core';
import { parseBlob } from 'music-metadata';

const AUDIO_EXT = /\.(mp3|flac|wav|ogg|oga|m4a|mp4|aac|opus|wma|aiff|aif)$/i;

const MIME_BY_EXT: Record<string, string> = {
  '.aac': 'audio/aac',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'audio/mp4',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wma': 'audio/x-ms-wma',
};

export type LocalImportSource = File | { path: string };

export interface LocalImportResult {
  tracks: Track[];
  skipped: number;
  failed: number;
}

export function isSupportedLocalAudioName(name: string): boolean {
  return AUDIO_EXT.test(name);
}

export function getLocalSourceName(source: LocalImportSource): string {
  if (source instanceof File) {
    return source.name;
  }

  const parts = source.path.split(/[\\/]/);
  return parts[parts.length - 1] || source.path;
}

export async function importLocalSources(params: {
  sources: LocalImportSource[];
  storage: StorageProvider;
  existingTracks: Track[];
}): Promise<LocalImportResult> {
  const { sources, storage, existingTracks } = params;
  const normalizedSources = await expandLocalSources(sources, storage);
  const existingHashes = new Set(existingTracks.map(track => track.fileHash).filter(Boolean));
  const existingPaths = new Set(existingTracks.map(track => track.filePath));
  const dataDir = await storage.getDataDir();

  const tracks: Track[] = [];
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < normalizedSources.length; index += 1) {
    const source = normalizedSources[index];
    const name = getLocalSourceName(source);

    if (!isSupportedLocalAudioName(name)) {
      skipped += 1;
      continue;
    }

    try {
      const bytes = await readSourceBytes(source, storage);
      const fileHash = await computeHashFromBlob(bytes);

      if (fileHash && existingHashes.has(fileHash)) {
        skipped += 1;
        continue;
      }

      const blob = new File([toArrayBuffer(bytes)], name, {
        type: getMimeType(name),
      });
      const metadata = await readMetadata(blob, name);
      const filePath = buildLibraryFilePath(dataDir, name, fileHash || `${Date.now()}-${index}`);

      if (!existingPaths.has(filePath) && !(await storage.fileExists(filePath))) {
        await storage.writeFile(filePath, bytes);
      }

      tracks.push({
        id: 0,
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        duration: metadata.duration,
        filePath,
        fileHash,
        format: metadata.format,
        bitrate: metadata.bitrate,
        sampleRate: metadata.sampleRate,
        channels: metadata.channels,
        fileSize: bytes.byteLength,
        coverArt: metadata.coverArt,
        source: 'local',
        sourceConfig:
          source instanceof File ? '' : JSON.stringify({ originalPath: source.path }),
        dateAdded: new Date().toISOString(),
      });

      if (fileHash) {
        existingHashes.add(fileHash);
      }
      existingPaths.add(filePath);
    } catch {
      failed += 1;
    }
  }

  return { tracks, skipped, failed };
}

async function expandLocalSources(
  sources: LocalImportSource[],
  storage: StorageProvider,
): Promise<LocalImportSource[]> {
  const expanded: LocalImportSource[] = [];
  const seenFiles = new Set<string>();
  const seenPaths = new Set<string>();

  const pushPath = (path: string) => {
    const key = path.replace(/\\/g, '/').toLowerCase();
    if (seenPaths.has(key)) {
      return;
    }
    seenPaths.add(key);
    expanded.push({ path });
  };

  for (const source of sources) {
    if (source instanceof File) {
      const key = `${source.name}:${source.size}:${source.lastModified}`;
      if (seenFiles.has(key)) {
        continue;
      }
      seenFiles.add(key);
      expanded.push(source);
      continue;
    }

    if (isSupportedLocalAudioName(getLocalSourceName(source))) {
      pushPath(source.path);
      continue;
    }

    if (!storage.listFilesRecursively) {
      continue;
    }

    try {
      const paths = await storage.listFilesRecursively(source.path);
      for (const path of paths) {
        if (isSupportedLocalAudioName(getLocalSourceName({ path }))) {
          pushPath(path);
        }
      }
    } catch {
      // Ignore unreadable folders and let the summary reflect imported items only.
    }
  }

  return expanded;
}

async function readSourceBytes(
  source: LocalImportSource,
  storage: StorageProvider,
): Promise<Uint8Array> {
  if (source instanceof File) {
    return new Uint8Array(await source.arrayBuffer());
  }

  return storage.readFile(source.path);
}

function buildLibraryFilePath(dataDir: string, originalName: string, hashSeed: string): string {
  const ext = getExtension(originalName);
  const base = safeFilename(stripExtension(originalName)) || 'track';
  const prefix = safeFilename(hashSeed).slice(0, 16) || 'track';
  return `${dataDir}/library/${prefix}-${base}${ext}`;
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function getExtension(name: string): string {
  const match = name.match(/(\.[^.]+)$/);
  return match?.[1]?.toLowerCase() || '';
}

function getMimeType(name: string): string {
  return MIME_BY_EXT[getExtension(name)] || 'application/octet-stream';
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function readMetadata(
  file: File,
  fallbackName: string,
): Promise<{
  title: string;
  artist: string;
  album: string;
  duration: number;
  format: string;
  bitrate: number;
  sampleRate: number;
  channels: number;
  coverArt: Uint8Array | null;
}> {
  const fallback = {
    title: stripExtension(fallbackName),
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    duration: 0,
    format: getExtension(fallbackName).replace('.', '').toUpperCase() || 'UNKNOWN',
    bitrate: 0,
    sampleRate: 0,
    channels: 2,
    coverArt: null,
  };

  try {
    const metadata = await parseBlob(file, { duration: true });
    const picture = metadata.common.picture?.[0];

    return {
      title: metadata.common.title || fallback.title,
      artist: metadata.common.artist || fallback.artist,
      album: metadata.common.album || fallback.album,
      duration: metadata.format.duration ?? fallback.duration,
      format: fallback.format,
      bitrate: metadata.format.bitrate ?? fallback.bitrate,
      sampleRate: metadata.format.sampleRate ?? fallback.sampleRate,
      channels: metadata.format.numberOfChannels ?? fallback.channels,
      coverArt: picture?.data ? new Uint8Array(picture.data) : null,
    };
  } catch {
    return fallback;
  }
}
