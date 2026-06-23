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
  };
}
