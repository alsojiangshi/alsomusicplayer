import type {
  AutoLyricsScope,
  OnlineSourceSetting,
  ResolvedUiLanguage,
  UiLanguagePreference,
  UiSettings,
} from './types.ts';

export function resolveUiLanguage(
  preference: UiLanguagePreference,
  runtimeLanguages: readonly string[] = [],
): ResolvedUiLanguage {
  if (preference === 'zh-CN') {
    return 'zh-CN';
  }

  if (preference === 'en-US') {
    return 'en-US';
  }

  const normalized = runtimeLanguages
    .map(candidate => candidate.trim().toLowerCase())
    .find(candidate => candidate.length > 0);

  if (normalized?.startsWith('zh')) {
    return 'zh-CN';
  }

  return 'en-US';
}

export function normalizeUiSettings(
  input?: Partial<UiSettings> | null,
  runtimeLanguages: readonly string[] = [],
): UiSettings {
  const languagePreference = normalizePreference(input?.languagePreference);
  return {
    languagePreference,
    resolvedLanguage: normalizeResolvedLanguage(
      input?.resolvedLanguage,
      resolveUiLanguage(languagePreference, runtimeLanguages),
    ),
    autoLyricsScope: normalizeAutoLyricsScope(input?.autoLyricsScope),
    autoLyricsPlaylistIds: Array.from(new Set(
      (input?.autoLyricsPlaylistIds ?? []).filter(id => Number.isInteger(id) && id > 0),
    )).sort((left, right) => left - right),
    onlineSources: normalizeOnlineSources(input?.onlineSources),
  };
}

const DEFAULT_ONLINE_SOURCES: OnlineSourceSetting[] = [
  {
    id: 'lrclib-default',
    label: 'LRCLIB',
    resourceType: 'lyrics',
    providerType: 'lrclib',
    baseUrl: 'https://lrclib.net/api',
    enabled: true,
    priority: 10,
  },
  {
    id: 'netease-lyrics-default',
    label: 'NetEase Lyrics',
    resourceType: 'lyrics',
    providerType: 'netease',
    baseUrl: 'https://music.163.com',
    enabled: false,
    priority: 20,
  },
  {
    id: 'netease-music-default',
    label: 'NetEase Music',
    resourceType: 'music',
    providerType: 'netease',
    baseUrl: 'https://music.163.com',
    enabled: true,
    priority: 10,
  },
];

function normalizeAutoLyricsScope(value: AutoLyricsScope | undefined): AutoLyricsScope {
  return value === 'playing' || value === 'library' || value === 'playlists' ? value : 'off';
}

function normalizeOnlineSources(value: OnlineSourceSetting[] | undefined): OnlineSourceSetting[] {
  const sources = value ?? DEFAULT_ONLINE_SOURCES;
  return sources
    .filter(source => source && source.label?.trim() && source.baseUrl?.trim())
    .map((source, index) => ({
      id: source.id?.trim() || `custom-${index + 1}`,
      label: source.label.trim(),
      resourceType: source.resourceType === 'music' ? 'music' : 'lyrics',
      providerType: source.providerType === 'netease' ? 'netease' : 'lrclib',
      baseUrl: source.baseUrl.trim().replace(/\/+$/, ''),
      enabled: source.enabled !== false,
      priority: Number.isFinite(source.priority) ? Math.max(0, Math.round(source.priority)) : index * 10 + 10,
    }));
}

function normalizePreference(value: UiSettings['languagePreference'] | undefined): UiLanguagePreference {
  if (value === 'en-US' || value === 'zh-CN' || value === 'system') {
    return value;
  }
  return 'system';
}

function normalizeResolvedLanguage(
  value: UiSettings['resolvedLanguage'] | undefined,
  fallback: ResolvedUiLanguage,
): ResolvedUiLanguage {
  if (value === 'en-US' || value === 'zh-CN') {
    return value;
  }
  return fallback;
}
