import type {
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
  };
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
