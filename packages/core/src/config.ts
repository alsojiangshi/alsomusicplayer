/** 配置管理 */

import type { AppConfig, PlaybackMode } from './types.js';

const DEFAULT_CONFIG: AppConfig = {
  audio: { volume: 80, muted: false, playbackMode: 'sequential' as PlaybackMode },
  lyrics: { autoSearch: true, providers: ['lrclib', 'netease'], localPreferred: true },
  s3: { endpoint: '', accessKey: '', secretKey: '', bucket: '', prefix: '', region: 'us-east-1', useSsl: true },
  openlist: { serverUrl: '', username: '', password: '' },
  library: { musicDirs: [] },
};

let _config: AppConfig = { ...DEFAULT_CONFIG };
let _configPath = '';

export function getConfig(): AppConfig {
  return _config;
}

export function setConfig(path: string, value: any): void {
  const keys = path.split('.');
  let target: any = _config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in target)) target[keys[i]] = {};
    target = target[keys[i]];
  }
  target[keys[keys.length - 1]] = value;
}

export function getConfigValue<T>(path: string, defaultValue?: T): T {
  const keys = path.split('.');
  let value: any = _config;
  for (const key of keys) {
    if (value == null || typeof value !== 'object') return defaultValue as T;
    value = value[key];
  }
  return (value !== undefined ? value : defaultValue) as T;
}

export async function loadConfig(configPath: string): Promise<void> {
  _configPath = configPath;
  try {
    const file = Bun.file(configPath);
    if (await file.exists()) {
      const data = await file.json();
      _config = deepMerge(DEFAULT_CONFIG, data);
    }
  } catch {
    _config = { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(): Promise<void> {
  if (!_configPath) return;
  await Bun.write(_configPath, JSON.stringify(_config, null, 2));
}

function deepMerge(base: any, override: any): any {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (key in result && typeof result[key] === 'object' && typeof override[key] === 'object' && !Array.isArray(override[key])) {
      result[key] = deepMerge(result[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

export function getDataDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  const base = process.platform === 'win32'
    ? `${process.env.APPDATA || home}/music-player`
    : `${process.env.XDG_DATA_HOME || `${home}/.local/share`}/music-player`;
  return base;
}
