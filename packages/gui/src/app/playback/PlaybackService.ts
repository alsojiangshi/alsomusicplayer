import { reconcilePlaybackSnapshot, type PlaybackMode, type PlaybackState, type PlaybackSnapshot, type Track } from '@core';
import { commands, getPlayableSource, toWebAssetSource, type TransportAction } from '../tauri';
import { useAppStore } from '../store';

class PlaybackService {
  private audio = new Audio();
  private initialized = false;
  private hydrated = false;
  private syncTimer: number | null = null;
  private trackIndex = new Map<number, Track>();
  private pendingSeekMs: number | null = null;
  private lastMediaMetadataKey = '';

  constructor() {
    this.audio.preload = 'auto';
  }

  initialize() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.initializeMediaSession();
    this.audio.addEventListener('timeupdate', () => {
      useAppStore.getState().applyPlaybackPatch({
        positionMs: Math.floor(this.audio.currentTime * 1000),
        ...(!this.audio.paused && !this.audio.ended
          ? { audioState: 'playing' as PlaybackState }
          : {}),
      });
      this.syncPlayback();
    });
    this.audio.addEventListener('loadedmetadata', () => {
      const durationMs = Math.floor((this.audio.duration || 0) * 1000);
      if (this.pendingSeekMs !== null) {
        const bounded = durationMs > 0
          ? Math.max(0, Math.min(this.pendingSeekMs, durationMs))
          : Math.max(0, this.pendingSeekMs);
        this.audio.currentTime = bounded / 1000;
        this.pendingSeekMs = null;
      }
      useAppStore.getState().applyPlaybackPatch({
        durationMs,
        positionMs: Math.floor(this.audio.currentTime * 1000),
      });
      this.syncPlayback();
    });
    const markPlaying = () => {
      if (!this.audio.paused && !this.audio.ended) {
        useAppStore.getState().applyPlaybackPatch({
          audioState: 'playing' as PlaybackState,
        });
        this.syncPlayback();
      }
    };
    this.audio.addEventListener('play', markPlaying);
    this.audio.addEventListener('playing', markPlaying);
    this.audio.addEventListener('canplay', markPlaying);
    this.audio.addEventListener('pause', () => {
      useAppStore.getState().applyPlaybackPatch({
        audioState:
          this.audio.currentTime > 0 ? ('paused' as PlaybackState) : ('stopped' as PlaybackState),
      });
      this.syncPlayback();
    });
    this.audio.addEventListener('waiting', () => {
      if (!this.audio.paused) {
        useAppStore.getState().applyPlaybackPatch({
          audioState: 'buffering' as PlaybackState,
        });
        this.syncPlayback();
      }
    });
    this.audio.addEventListener('ended', () => {
      void this.next();
    });
    this.audio.addEventListener('error', () => {
      this.reportPlaybackFailure(this.audio.error?.message);
    });
  }

  setCatalog(tracks: Track[]) {
    this.trackIndex = new Map(tracks.map(track => [track.id, track]));
    this.reconcileWithCatalog();
    this.syncMediaSession();
  }

  async hydrate(session: PlaybackSnapshot, tracks: Track[]) {
    this.initialize();
    this.setCatalog(tracks);
    if (this.hydrated) {
      return;
    }

    this.hydrated = true;
    useAppStore.getState().resetQueueFromSession(session);
    this.audio.volume = session.volume / 100;
    this.audio.muted = session.muted;
    if (session.currentTrackId !== null && this.trackIndex.has(session.currentTrackId)) {
      await this.loadTrack(session.currentTrackId, false, session.positionMs);
      return;
    }
    this.syncPlayback();
  }

  async setQueue(trackIds: number[], startIndex = 0, autoplay = true) {
    this.initialize();
    const boundedIndex = trackIds.length === 0 ? -1 : Math.max(0, Math.min(startIndex, trackIds.length - 1));
    const nextTrackId = boundedIndex >= 0 ? trackIds[boundedIndex] ?? null : null;
    useAppStore.getState().applyPlaybackPatch({
      queue: trackIds,
      currentIndex: boundedIndex,
      currentTrackId: nextTrackId,
      positionMs: 0,
      durationMs: 0,
      audioState: nextTrackId === null ? ('stopped' as PlaybackState) : stateForAutoplay(autoplay),
    });

    if (nextTrackId !== null) {
      await this.loadTrack(nextTrackId, autoplay);
    } else {
      this.resetAudioElement();
    }
    this.syncPlayback();
  }

  async playTrack(trackId: number, queue?: number[]) {
    const state = useAppStore.getState().playback;
    const nextQueue = queue ?? (state.queue.length > 0 ? state.queue : [trackId]);
    const index = nextQueue.indexOf(trackId);
    await this.setQueue(nextQueue, index >= 0 ? index : 0, true);
  }

  async replaceQueue(trackIds: number[]) {
    this.initialize();
    const nextQueue = Array.from(new Set(trackIds)).filter(trackId => this.trackIndex.has(trackId));
    const playback = useAppStore.getState().playback;
    const currentIndex = playback.currentTrackId === null
      ? -1
      : nextQueue.indexOf(playback.currentTrackId);

    if (currentIndex >= 0) {
      useAppStore.getState().applyPlaybackPatch({
        queue: nextQueue,
        currentIndex,
      });
      this.syncPlayback();
      return;
    }

    const keepPlaying = !this.audio.paused && !this.audio.ended;
    await this.setQueue(nextQueue, 0, keepPlaying);
  }

  moveQueueItem(fromIndex: number, toIndex: number) {
    const playback = useAppStore.getState().playback;
    if (
      fromIndex < 0
      || fromIndex >= playback.queue.length
      || toIndex < 0
      || toIndex >= playback.queue.length
      || fromIndex === toIndex
    ) {
      return;
    }

    const queue = [...playback.queue];
    const [trackId] = queue.splice(fromIndex, 1);
    queue.splice(toIndex, 0, trackId);
    useAppStore.getState().applyPlaybackPatch({
      queue,
      currentIndex: playback.currentTrackId === null
        ? -1
        : queue.indexOf(playback.currentTrackId),
    });
    this.syncPlayback();
  }

  async removeQueueItem(index: number) {
    const playback = useAppStore.getState().playback;
    if (index < 0 || index >= playback.queue.length) {
      return;
    }

    const removedTrackId = playback.queue[index];
    const queue = playback.queue.filter((_, itemIndex) => itemIndex !== index);
    if (removedTrackId !== playback.currentTrackId) {
      useAppStore.getState().applyPlaybackPatch({
        queue,
        currentIndex: playback.currentTrackId === null
          ? -1
          : queue.indexOf(playback.currentTrackId),
      });
      this.syncPlayback();
      return;
    }

    const nextIndex = queue.length === 0 ? -1 : Math.min(index, queue.length - 1);
    const keepPlaying = !this.audio.paused && !this.audio.ended;
    await this.setQueue(queue, nextIndex, keepPlaying);
  }

  async toggle() {
    this.initialize();
    if (!this.audio.src && useAppStore.getState().playback.currentTrackId) {
      await this.loadTrack(useAppStore.getState().playback.currentTrackId!, true);
      return;
    }

    if (this.audio.paused) {
      await this.startPlayback();
    } else {
      this.audio.pause();
    }
  }

  async next() {
    const playback = useAppStore.getState().playback;
    if (playback.queue.length === 0) {
      return;
    }

    const mode = playback.mode;
    if (mode === 'repeat_one') {
      if (playback.currentTrackId !== null) {
        await this.loadTrack(playback.currentTrackId, true);
      }
      return;
    }

    let nextIndex = playback.currentIndex + 1;
    if (mode === 'shuffle') {
      nextIndex = Math.floor(Math.random() * playback.queue.length);
    } else if (nextIndex >= playback.queue.length) {
      if (mode === 'repeat_all') {
        nextIndex = 0;
      } else {
        this.audio.pause();
        useAppStore.getState().applyPlaybackPatch({
          audioState: 'stopped' as PlaybackState,
          positionMs: 0,
          durationMs: 0,
        });
        this.syncPlayback();
        return;
      }
    }

    await this.setQueue(playback.queue, nextIndex, true);
  }

  async previous() {
    const playback = useAppStore.getState().playback;
    if (playback.queue.length === 0) {
      return;
    }

    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      useAppStore.getState().applyPlaybackPatch({ positionMs: 0 });
      this.syncPlayback();
      return;
    }

    const previousIndex = Math.max(0, playback.currentIndex - 1);
    await this.setQueue(playback.queue, previousIndex, true);
  }

  seek(positionMs: number) {
    this.audio.currentTime = Math.max(positionMs, 0) / 1000;
    useAppStore.getState().applyPlaybackPatch({
      positionMs: Math.floor(this.audio.currentTime * 1000),
    });
    this.syncPlayback();
  }

  setVolume(volume: number) {
    this.audio.volume = Math.max(0, Math.min(volume, 100)) / 100;
    useAppStore.getState().applyPlaybackPatch({ volume });
    this.syncPlayback();
  }

  toggleMute() {
    const nextMuted = !useAppStore.getState().playback.muted;
    this.audio.muted = nextMuted;
    useAppStore.getState().applyPlaybackPatch({ muted: nextMuted });
    this.syncPlayback();
  }

  cycleMode() {
    const current = useAppStore.getState().playback.mode;
    const modes: PlaybackMode[] = ['sequential', 'shuffle', 'repeat_one', 'repeat_all'];
    const next = modes[(modes.indexOf(current) + 1) % modes.length];
    useAppStore.getState().applyPlaybackPatch({ mode: next });
    this.syncPlayback();
  }

  async toggleDesktopLyrics() {
    const visible = await commands.toggleDesktopLyrics();
    useAppStore.getState().applyPlaybackPatch({ lyricsWindowVisible: visible });
    this.syncPlayback();
  }

  async toggleDesktopLyricsLock() {
    const locked = await commands.toggleDesktopLyricsLock();
    useAppStore.getState().applyPlaybackPatch({ desktopLyricsLocked: locked });
    this.syncPlayback();
  }

  async handleTransport(action: TransportAction | string) {
    switch (action) {
      case 'toggle':
        await this.toggle();
        break;
      case 'next':
        await this.next();
        break;
      case 'previous':
        await this.previous();
        break;
      case 'toggle-desktop-lyrics':
        await this.toggleDesktopLyrics();
        break;
      case 'toggle-desktop-lyrics-lock':
        await this.toggleDesktopLyricsLock();
        break;
      default:
        break;
    }
  }

  private async loadTrack(trackId: number, autoplay: boolean, initialPositionMs = 0) {
    try {
      const source = await commands.resolvePlaybackSource(trackId);
      this.pendingSeekMs = initialPositionMs > 0 ? initialPositionMs : null;
      this.audio.src = getPlayableSource(source);
      this.audio.currentTime = 0;
      useAppStore.getState().applyPlaybackPatch({
        currentTrackId: trackId,
        positionMs: initialPositionMs,
        durationMs: 0,
        audioState: stateForAutoplay(autoplay),
      });
      this.syncMediaSession();

      if (autoplay) {
        await this.startPlayback();
      }
    } catch (error) {
      this.reportPlaybackFailure(error);
    }
  }

  private async startPlayback() {
    try {
      await this.audio.play();
      if (!this.audio.paused && !this.audio.ended) {
        useAppStore.getState().applyPlaybackPatch({
          audioState: 'playing' as PlaybackState,
        });
        this.syncPlayback();
      }
    } catch (error) {
      this.reportPlaybackFailure(error);
    }
  }

  private reportPlaybackFailure(error?: unknown) {
    const store = useAppStore.getState();
    const detail = playbackErrorDetail(error);
    const isChinese = store.uiSettings.resolvedLanguage === 'zh-CN';
    const message = isChinese
      ? `无法播放此曲目${detail ? `：${detail}` : '。'}`
      : `Unable to play this track${detail ? `: ${detail}` : '.'}`;

    store.applyPlaybackPatch({
      audioState: 'stopped' as PlaybackState,
      durationMs: 0,
    });
    store.setStatus(message, 'error');
    this.syncPlayback();
  }

  private syncPlayback() {
    if (this.syncTimer) {
      window.clearTimeout(this.syncTimer);
    }

    this.syncTimer = window.setTimeout(() => {
      const playback = useAppStore.getState().playback;
      const snapshot: PlaybackSnapshot = {
        currentTrackId: playback.currentTrackId,
        queue: playback.queue,
        currentIndex: playback.currentIndex,
        audioState: playback.audioState,
        volume: playback.volume,
        muted: playback.muted,
        mode: playback.mode,
        positionMs: playback.positionMs,
        durationMs: playback.durationMs,
        lyricsWindowVisible: playback.lyricsWindowVisible,
        desktopLyricsLocked: playback.desktopLyricsLocked,
      };
      void commands.saveSession(snapshot);
      void commands.broadcastPlayback(snapshot);
      this.syncMediaSession();
    }, 120);
  }

  private reconcileWithCatalog() {
    const state = useAppStore.getState();
    const current = state.playback;
    const reconciled = reconcilePlaybackSnapshot(current, this.trackIndex.keys());

    if (!playbackSnapshotChanged(current, reconciled)) {
      return;
    }

    const removedCurrentTrack = current.currentTrackId !== null && reconciled.currentTrackId === null;
    if (removedCurrentTrack) {
      this.resetAudioElement();
    }

    state.applyPlaybackPatch(reconciled);
    this.syncPlayback();
  }

  private resetAudioElement() {
    this.pendingSeekMs = null;
    try {
      this.audio.currentTime = 0;
    } catch {
      // Ignore state reset failures on an unloaded element.
    }
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  private initializeMediaSession() {
    const mediaSession = getMediaSession();
    if (!mediaSession) {
      return;
    }

    const handlers: Array<[MediaSessionAction, (() => void) | null]> = [
      ['play', () => { void this.toggle(); }],
      ['pause', () => { this.audio.pause(); }],
      ['previoustrack', () => { void this.previous(); }],
      ['nexttrack', () => { void this.next(); }],
    ];

    for (const [action, handler] of handlers) {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // Some WebView builds do not expose every action type.
      }
    }
  }

  private syncMediaSession() {
    const mediaSession = getMediaSession();
    if (!mediaSession) {
      return;
    }

    const playback = useAppStore.getState().playback;
    const currentTrack = playback.currentTrackId === null
      ? null
      : this.trackIndex.get(playback.currentTrackId) ?? null;

    if (!currentTrack) {
      if (this.lastMediaMetadataKey) {
        mediaSession.metadata = null;
        this.lastMediaMetadataKey = '';
      }
      mediaSession.playbackState = 'none';
      return;
    }

    const metadataKey = [
      currentTrack.id,
      currentTrack.title,
      currentTrack.artist,
      currentTrack.album,
      currentTrack.artworkRef ?? '',
    ].join('::');

    if (metadataKey !== this.lastMediaMetadataKey) {
      mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        artwork: buildMediaSessionArtwork(currentTrack),
      });
      this.lastMediaMetadataKey = metadataKey;
    }

    mediaSession.playbackState = toMediaSessionPlaybackState(playback.audioState);
    if (playback.durationMs > 0) {
      try {
        mediaSession.setPositionState({
          duration: playback.durationMs / 1000,
          position: Math.min(playback.positionMs, playback.durationMs) / 1000,
          playbackRate: this.audio.playbackRate || 1,
        });
      } catch {
        // Older WebView builds may reject position state updates.
      }
    }
  }
}

export const playbackService = new PlaybackService();

function getMediaSession(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return null;
  }
  return navigator.mediaSession;
}

function toMediaSessionPlaybackState(audioState: PlaybackState): MediaSessionPlaybackState {
  switch (audioState) {
    case 'playing':
    case 'buffering':
      return 'playing';
    case 'paused':
      return 'paused';
    default:
      return 'none';
  }
}

function buildMediaSessionArtwork(track: Track): MediaImage[] {
  if (!track.artworkRef) {
    return [];
  }

  const type = detectArtworkMimeType(track.artworkRef);
  return [
    {
      src: toWebAssetSource(track.artworkRef),
      ...(type ? { type } : {}),
    },
  ];
}

function detectArtworkMimeType(locator: string): string | undefined {
  const normalized = locator.split('?')[0].toLowerCase();
  if (normalized.endsWith('.png')) {
    return 'image/png';
  }
  if (normalized.endsWith('.webp')) {
    return 'image/webp';
  }
  if (normalized.endsWith('.gif')) {
    return 'image/gif';
  }
  if (normalized.endsWith('.bmp')) {
    return 'image/bmp';
  }
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  return undefined;
}

function stateForAutoplay(autoplay: boolean): PlaybackState {
  return autoplay ? ('buffering' as PlaybackState) : ('paused' as PlaybackState);
}

function playbackSnapshotChanged(left: PlaybackSnapshot, right: PlaybackSnapshot): boolean {
  return left.currentTrackId !== right.currentTrackId
    || left.currentIndex !== right.currentIndex
    || left.audioState !== right.audioState
    || left.positionMs !== right.positionMs
    || left.durationMs !== right.durationMs
    || left.volume !== right.volume
    || left.muted !== right.muted
    || left.mode !== right.mode
    || left.lyricsWindowVisible !== right.lyricsWindowVisible
    || left.desktopLyricsLocked !== right.desktopLyricsLocked
    || left.queue.length !== right.queue.length
    || left.queue.some((trackId, index) => trackId !== right.queue[index]);
}

function playbackErrorDetail(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '';
}
