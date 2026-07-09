export type SourceKind = 'local_file' | 'direct_url' | 'resolver';

export type TrackAvailability = 'available' | 'missing' | 'unresolved';

export type UiLanguagePreference = 'system' | 'en-US' | 'zh-CN';

export type ResolvedUiLanguage = 'en-US' | 'zh-CN';

export interface UiSettings {
  languagePreference: UiLanguagePreference;
  resolvedLanguage: ResolvedUiLanguage;
}

export const PlaybackState = {
  Stopped: 'stopped',
  Playing: 'playing',
  Paused: 'paused',
  Buffering: 'buffering',
} as const;

export type PlaybackState = (typeof PlaybackState)[keyof typeof PlaybackState];

export const PlaybackMode = {
  Sequential: 'sequential',
  Shuffle: 'shuffle',
  RepeatOne: 'repeat_one',
  RepeatAll: 'repeat_all',
} as const;

export type PlaybackMode = (typeof PlaybackMode)[keyof typeof PlaybackMode];

export interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  composer: string;
  duration: number;
  sourceKind: SourceKind;
  sourceLocator: string;
  resolverId: string | null;
  availability: TrackAvailability;
  fingerprint: string;
  format: string;
  bitrate: number;
  sampleRate: number;
  channels: number;
  artworkRef: string | null;
  lyricRef: string | null;
  hasOverrides: boolean;
  createdAt: string;
  updatedAt: string;
  fileSize?: number;
  filePath?: string;
  fileHash?: string;
  coverArt?: Uint8Array | null;
  source?: 'local' | 'url' | 's3' | 'openlist';
  sourceConfig?: string;
  dateAdded?: string;
}

export interface Playlist {
  id: number;
  name: string;
  songCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryRoot {
  id: number;
  path: string;
  addedAt: string;
  lastScannedAt: string | null;
}

export interface QueueEntry {
  trackId: number;
  order: number;
}

export interface PlaybackSnapshot {
  currentTrackId: number | null;
  queue: number[];
  currentIndex: number;
  audioState: PlaybackState;
  volume: number;
  muted: boolean;
  mode: PlaybackMode;
  positionMs: number;
  durationMs: number;
  lyricsWindowVisible: boolean;
}

export interface DesktopLyricsSnapshot {
  title: string;
  artist: string;
  currentLine: string;
  nextLine: string;
  isPlaying: boolean;
}

export interface TrackOverrideInput {
  trackId: number;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  composer?: string | null;
  duration?: number | null;
  artworkRef?: string | null;
  lyricRef?: string | null;
  lyricText?: string | null;
}

export interface LyricsData {
  source: string;
  plainText: string | null;
  syncedText: string | null;
  language: string;
}

export interface ResolverSearchResult {
  id: string;
  resolverId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
}

export interface LibraryBootstrap {
  tracks: Track[];
  playlists: Playlist[];
  roots: LibraryRoot[];
  session: PlaybackSnapshot;
  desktopLyricsSupported: boolean;
  uiSettings: UiSettings;
}

export interface TrackDraft {
  title?: string;
  artist?: string;
  album?: string;
  composer?: string;
  duration?: number;
}
