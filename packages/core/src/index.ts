/** @music-player/core — barrel export */

export { Database } from './database/db.js';
export { loadConfig, saveConfig, getConfig, getConfigValue, setConfig, getDataDir } from './config.js';
export { LibraryManager } from './library/manager.js';
export { PlaylistEngine } from './playlist/engine.js';
export { LyricsManager } from './lyrics/manager.js';
export { LRCParser } from './lyrics/parser.js';
export type { LyricLine } from './lyrics/parser.js';
export { LocalImporter } from './importers/local.js';
export { S3Importer } from './importers/s3.js';
export { OpenListImporter } from './importers/openlist.js';
export { TypedEmitter } from './audio/events.js';
export type { AudioBackend } from './audio/backend.js';
export { PlaybackState, PlaybackMode } from './types.js';
export type { Track, Playlist, LyricsData, S3Config, OpenListConfig, AppConfig } from './types.js';
export { formatDuration, formatFileSize, safeFilename } from './utils/format.js';
export { computeFileHash } from './utils/hash.js';
export { extractMetadata, isSupportedAudio, scanDirectory } from './utils/metadata.js';
