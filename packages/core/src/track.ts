import type {
  PlaybackMode,
  PlaybackSnapshot,
  SourceKind,
  Track,
  TrackAvailability,
  TrackDraft,
  TrackOverrideInput,
} from './types.ts';

export interface ScannedTrackRecord extends TrackDraft {
  id: number;
  sourceKind: SourceKind;
  sourceLocator: string;
  resolverId: string | null;
  availability: TrackAvailability;
  fingerprint: string;
  format?: string;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  artworkRef?: string | null;
  lyricRef?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function mergeTrackRecord(
  scanned: ScannedTrackRecord,
  override: TrackOverrideInput | null,
): Track {
  return {
    id: scanned.id,
    title: override?.title?.trim() || scanned.title?.trim() || fallbackTrackTitle(scanned.sourceLocator),
    artist: override?.artist?.trim() || scanned.artist?.trim() || 'Unknown Artist',
    album: override?.album?.trim() || scanned.album?.trim() || 'Unknown Album',
    composer: override?.composer?.trim() || scanned.composer?.trim() || '',
    duration: override?.duration ?? scanned.duration ?? 0,
    sourceKind: scanned.sourceKind,
    sourceLocator: scanned.sourceLocator,
    resolverId: scanned.resolverId,
    availability: scanned.availability,
    fingerprint: scanned.fingerprint,
    format: scanned.format || '',
    bitrate: scanned.bitrate || 0,
    sampleRate: scanned.sampleRate || 0,
    channels: scanned.channels || 0,
    artworkRef: override?.artworkRef ?? scanned.artworkRef ?? null,
    lyricRef: override?.lyricRef ?? scanned.lyricRef ?? null,
    hasOverrides: hasTrackOverrides(override),
    createdAt: scanned.createdAt,
    updatedAt: scanned.updatedAt,
    filePath: scanned.sourceKind === 'local_file' ? scanned.sourceLocator : undefined,
    dateAdded: scanned.createdAt,
  };
}

export function fallbackTrackTitle(sourceLocator: string): string {
  const normalized = sourceLocator.split(/[\\/]/).pop() || sourceLocator;
  return normalized.replace(/\.[^.]+$/, '') || 'Untitled Track';
}

export function hasTrackOverrides(override: TrackOverrideInput | null | undefined): boolean {
  if (!override) {
    return false;
  }

  return [
    override.title,
    override.artist,
    override.album,
    override.composer,
    override.duration,
    override.artworkRef,
    override.lyricRef,
    override.lyricText,
  ].some(value => value !== undefined && value !== null && value !== '');
}

export function normalizePlaybackSnapshot(
  snapshot?: Partial<PlaybackSnapshot> | null,
): PlaybackSnapshot {
  return {
    currentTrackId: snapshot?.currentTrackId ?? null,
    queue: snapshot?.queue ?? [],
    currentIndex: snapshot?.currentIndex ?? -1,
    audioState: snapshot?.audioState ?? 'stopped',
    volume: snapshot?.volume ?? 80,
    muted: snapshot?.muted ?? false,
    mode: snapshot?.mode ?? ('sequential' as PlaybackMode),
    positionMs: snapshot?.positionMs ?? 0,
    durationMs: snapshot?.durationMs ?? 0,
    lyricsWindowVisible: snapshot?.lyricsWindowVisible ?? false,
    desktopLyricsLocked: snapshot?.desktopLyricsLocked ?? false,
  };
}

export function reconcilePlaybackSnapshot(
  snapshot: Partial<PlaybackSnapshot> | null | undefined,
  trackIds: Iterable<number>,
): PlaybackSnapshot {
  const normalized = normalizePlaybackSnapshot(snapshot);
  const catalog = new Set(trackIds);
  const queue = normalized.queue.filter(trackId => catalog.has(trackId));

  if (normalized.currentTrackId === null || !catalog.has(normalized.currentTrackId)) {
    return {
      ...normalized,
      currentTrackId: null,
      queue,
      currentIndex: -1,
      audioState: 'stopped',
      positionMs: 0,
      durationMs: 0,
    };
  }

  if (!queue.includes(normalized.currentTrackId)) {
    queue.unshift(normalized.currentTrackId);
  }

  return {
    ...normalized,
    queue,
    currentIndex: queue.indexOf(normalized.currentTrackId),
  };
}

export function sortTracksByTitle(tracks: Track[]): Track[] {
  return [...tracks].sort((left, right) => {
    const byArtist = left.artist.localeCompare(right.artist, 'en');
    if (byArtist !== 0) {
      return byArtist;
    }
    return left.title.localeCompare(right.title, 'en');
  });
}
