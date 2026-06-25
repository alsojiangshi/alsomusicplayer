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

export interface LocalImportError {
  source: string;
  stage: 'expand' | 'read' | 'hash' | 'copy' | 'unknown';
  message: string;
}

export interface LocalImportResult {
  tracks: Track[];
  skipped: number;
  failed: number;
  errors: LocalImportError[];
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
  const expansion = await expandLocalSources(sources, storage);
  const normalizedSources = expansion.sources;
  const existingHashes = new Set(existingTracks.map(track => track.fileHash).filter(Boolean));
  const existingPaths = new Set(existingTracks.map(track => track.filePath));
  const dataDir = await storage.getDataDir();

  const tracks: Track[] = [];
  let skipped = 0;
  let failed = 0;
  const errors = [...expansion.errors];

  if (normalizedSources.length === 0 && sources.length > 0 && errors.length === 0) {
    errors.push({
      source: sources.map(getLocalSourceDisplayName).join(', '),
      stage: 'expand',
      message: '没有发现可导入的音频文件',
    });
  }

  for (let index = 0; index < normalizedSources.length; index += 1) {
    const source = normalizedSources[index];
    const name = getLocalSourceName(source);
    const displayName = getLocalSourceDisplayName(source);

    if (!isSupportedLocalAudioName(name)) {
      skipped += 1;
      continue;
    }

    try {
      const bytes = await readSourceBytes(source, storage);
      let fileHash = '';

      try {
        fileHash = await computeHashFromBlob(bytes);
      } catch (error: unknown) {
        errors.push({
          source: displayName,
          stage: 'hash',
          message: `计算文件哈希失败，已继续导入: ${formatImportError(error)}`,
        });
      }

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
        try {
          await storage.writeFile(filePath, bytes);
        } catch (error: unknown) {
          failed += 1;
          errors.push({
            source: displayName,
            stage: 'copy',
            message: `写入应用音乐库失败: ${formatImportError(error)}`,
          });
          continue;
        }
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
    } catch (error: unknown) {
      failed += 1;
      errors.push({
        source: displayName,
        stage: 'unknown',
        message: formatImportError(error),
      });
    }
  }

  return { tracks, skipped, failed, errors };
}

async function expandLocalSources(
  sources: LocalImportSource[],
  storage: StorageProvider,
): Promise<{
  sources: LocalImportSource[];
  errors: LocalImportError[];
}> {
  const expanded: LocalImportSource[] = [];
  const seenFiles = new Set<string>();
  const seenPaths = new Set<string>();
  const errors: LocalImportError[] = [];

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
    } catch (error: unknown) {
      errors.push({
        source: source.path,
        stage: 'expand',
        message: `读取目录失败: ${formatImportError(error)}`,
      });
    }
  }

  return { sources: expanded, errors };
}

async function readSourceBytes(
  source: LocalImportSource,
  storage: StorageProvider,
): Promise<Uint8Array> {
  if (source instanceof File) {
    try {
      return new Uint8Array(await source.arrayBuffer());
    } catch (error: unknown) {
      throw new Error(`读取文件内容失败: ${formatImportError(error)}`);
    }
  }

  try {
    return await storage.readFile(source.path);
  } catch (error: unknown) {
    throw new Error(`读取文件内容失败: ${formatImportError(error)}`);
  }
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

function getLocalSourceDisplayName(source: LocalImportSource): string {
  if (source instanceof File) {
    return source.name;
  }

  return source.path;
}

function formatImportError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return '未知错误';
  }
}
