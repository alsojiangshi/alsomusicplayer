/** 共享类型定义 */

export enum PlaybackState {
  Stopped = 'stopped',
  Playing = 'playing',
  Paused = 'paused',
}

export enum PlaybackMode {
  Sequential = 'sequential',
  Shuffle = 'shuffle',
  RepeatOne = 'repeat_one',
  RepeatAll = 'repeat_all',
}

export interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;      // seconds
  filePath: string;
  fileHash: string;
  format: string;
  bitrate: number;
  sampleRate: number;
  channels: number;
  fileSize: number;
  coverArt: Uint8Array | null;
  source: 'local' | 's3' | 'openlist';
  sourceConfig: string;
  dateAdded: string;
}

export interface Playlist {
  id: number;
  name: string;
  songCount: number;
  createdAt: string;
}

export interface LyricsData {
  source: string;
  plainText: string | null;
  syncedText: string | null;
  language: string;
}

export interface S3Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  prefix: string;
  region: string;
  useSsl: boolean;
}

export interface OpenListConfig {
  serverUrl: string;
  username: string;
  password: string;
}

export interface AppConfig {
  audio: {
    volume: number;
    muted: boolean;
    playbackMode: PlaybackMode;
  };
  lyrics: {
    autoSearch: boolean;
    providers: string[];
    localPreferred: boolean;
  };
  s3: S3Config;
  openlist: OpenListConfig;
  library: {
    musicDirs: string[];
    /** 自定义数据库路径，为空则使用默认 dataDir */
    dbPath: string;
  };
  search: {
    enabledSources: string[];
    defaultSource: string;
    sources: Record<string, SearchSourceConfig>;
  };
}

/** 搜索源配置 — 描述一个第三方音乐搜索 API 的参数 */
export interface SearchSourceConfig {
  label: string;
  /** 搜索 URL 模板，{query} 会被替换为搜索词 */
  searchUrl: string;
  /** HTTP 请求头 */
  searchHeaders?: Record<string, string>;
  /** 结果数组中每项的 JSON 路径映射 */
  mapping: {
    id: string;
    name: string;
    artist: string;
    album?: string;
    duration?: string;
  };
  /** 搜索结果 JSON 中歌曲数组的路径，如 "result.songs" */
  resultPath: string;
  /** 播放 URL 模板，{id} 会被替换为歌曲 ID */
  playbackUrlTemplate: string;
}
