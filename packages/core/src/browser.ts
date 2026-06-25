/** @music-player/core — 浏览器安全导出 */

// 类型与枚举
export { PlaybackState, PlaybackMode } from './types.js';
export type { Track, Playlist, LyricsData, S3Config, OpenListConfig, AppConfig } from './types.js';

// 数据库（需 StorageProvider 参数）
export { Database } from './database/db.js';
export type { StorageProvider } from './database/storage.js';

// 音乐库管理
export { LibraryManager } from './library/manager.js';

// 播放列表引擎
export { PlaylistEngine } from './playlist/engine.js';

// 歌词
export { LyricsManager } from './lyrics/manager.js';
export { LRCParser } from './lyrics/parser.js';
export type { LyricLine } from './lyrics/parser.js';
export { LRCLibProvider } from './lyrics/providers/lrclib.js';
export { NeteaseProvider } from './lyrics/providers/netease.js';

// 配置
export { loadConfig, saveConfig, getConfig, setConfig, getConfigValue } from './config.js';

// 工具
export { formatDuration, formatFileSize, safeFilename } from './utils/format.js';
export { computeHashFromBlob } from './utils/hash-browser.js';
export { setHttpClient, getHttpClient } from './utils/http.js';
export type { AudioBackend } from './audio/backend.js';
