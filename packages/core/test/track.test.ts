import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PlaybackMode,
  fallbackTrackTitle,
  formatDuration,
  hasTrackOverrides,
  mergeTrackRecord,
  normalizePlaybackSnapshot,
  normalizeUiSettings,
  reconcilePlaybackSnapshot,
  resolveUiLanguage,
} from '../src/index.ts';

test('mergeTrackRecord prefers overrides over scanned values', () => {
  const merged = mergeTrackRecord(
    {
      id: 1,
      title: 'Scan Title',
      artist: 'Scan Artist',
      album: 'Scan Album',
      composer: 'Scan Composer',
      duration: 180,
      sourceKind: 'local_file',
      sourceLocator: 'D:/Music/demo.mp3',
      resolverId: null,
      availability: 'available',
      fingerprint: 'abc',
      createdAt: '2026-07-09T00:00:00.000Z',
      updatedAt: '2026-07-09T00:00:00.000Z',
    },
    {
      trackId: 1,
      title: 'Override Title',
      lyricRef: 'override:inline',
    },
  );

  assert.equal(merged.title, 'Override Title');
  assert.equal(merged.artist, 'Scan Artist');
  assert.equal(merged.lyricRef, 'override:inline');
  assert.equal(merged.hasOverrides, true);
});

test('normalizePlaybackSnapshot applies stable defaults', () => {
  const snapshot = normalizePlaybackSnapshot({ mode: PlaybackMode.RepeatAll, volume: 25 });
  assert.deepEqual(snapshot, {
    currentTrackId: null,
    queue: [],
    currentIndex: -1,
    audioState: 'stopped',
    volume: 25,
    muted: false,
    mode: PlaybackMode.RepeatAll,
    positionMs: 0,
    durationMs: 0,
    lyricsWindowVisible: false,
  });
});

test('helpers expose expected fallback behavior', () => {
  assert.equal(formatDuration(3661), '01:01:01');
  assert.equal(fallbackTrackTitle('https://cdn.example.com/demo-track.mp3'), 'demo-track');
  assert.equal(hasTrackOverrides({ trackId: 9, composer: 'Joe' }), true);
  assert.equal(hasTrackOverrides({ trackId: 9 }), false);
});

test('resolveUiLanguage follows system language with zh fallback', () => {
  assert.equal(resolveUiLanguage('system', ['zh-CN', 'en-US']), 'zh-CN');
  assert.equal(resolveUiLanguage('system', ['ja-JP']), 'en-US');
  assert.equal(resolveUiLanguage('en-US', ['zh-CN']), 'en-US');
});

test('normalizeUiSettings applies defaults and preserves explicit language', () => {
  assert.deepEqual(normalizeUiSettings(null, ['zh-CN']), {
    languagePreference: 'system',
    resolvedLanguage: 'zh-CN',
  });
  assert.deepEqual(normalizeUiSettings({ languagePreference: 'en-US' }, ['zh-CN']), {
    languagePreference: 'en-US',
    resolvedLanguage: 'en-US',
  });
});

test('reconcilePlaybackSnapshot stops when current track disappears', () => {
  const reconciled = reconcilePlaybackSnapshot(
    {
      currentTrackId: 2,
      queue: [1, 2, 3],
      currentIndex: 1,
      audioState: 'playing',
      positionMs: 32000,
      durationMs: 180000,
      volume: 90,
      muted: false,
      mode: PlaybackMode.Sequential,
      lyricsWindowVisible: true,
    },
    [1, 3],
  );

  assert.deepEqual(reconciled, {
    currentTrackId: null,
    queue: [1, 3],
    currentIndex: -1,
    audioState: 'stopped',
    positionMs: 0,
    durationMs: 0,
    volume: 90,
    muted: false,
    mode: PlaybackMode.Sequential,
    lyricsWindowVisible: true,
  });
});
