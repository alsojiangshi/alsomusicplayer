/** 配置管理 */

import type { StorageProvider } from './database/storage.js';
import type { AppConfig, PlaybackMode } from './types.js';

const DEFAULT_CONFIG: AppConfig = {
  audio: {
    volume: 80,
    muted: false,
    playbackMode: 'sequential' as PlaybackMode,
  },
  lyrics: {
    autoSearch: true,
    providers: ['lrclib', 'netease'],
    localPreferred: true,
  },
  s3: {
    endpoint: '',
    accessKey: '',
    secretKey: '',
    bucket: '',
    prefix: '',
    region: 'us-east-1',
    useSsl: true,
  },
  openlist: {
    serverUrl: '',
    username: '',
    password: '',
  },
  library: {
    musicDirs: [],
    dbPath: '',
  },
  search: {
    enabledSources: ['netease'],
    defaultSource: 'netease',
    sources: {
      netease: {
        label: '网易云音乐',
        searchUrl: 'https://music.163.com/api/search/get?type=1&limit=20&offset=0',
        searchHeaders: {
          'User-Agent': 'Mozilla/5.0',
          Referer: 'https://music.163.com/',
        },
        resultPath: 'result.songs',
        mapping: {
          id: 'id',
          name: 'name',
          artist: 'artists[0].name',
          album: 'al.name',
          duration: 'dt',
        },
        playbackUrlTemplate: 'https://music.163.com/song/media/outer/url?id={id}.mp3',
      },
    },
  },
};

let _config: AppConfig = cloneConfig(DEFAULT_CONFIG);
let _configPath = '';

export function getConfig(): AppConfig {
  return _config;
}

export function setConfig(path: string, value: any): void {
  const keys = path.split('.');
  let target: any = _config;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (!(keys[i] in target)) {
      target[keys[i]] = {};
    }
    target = target[keys[i]];
  }
  target[keys[keys.length - 1]] = value;
}

export function getConfigValue<T>(path: string, defaultValue?: T): T {
  const keys = path.split('.');
  let value: any = _config;
  for (const key of keys) {
    if (value == null || typeof value !== 'object') {
      return defaultValue as T;
    }
    value = value[key];
  }
  return (value !== undefined ? value : defaultValue) as T;
}

export async function loadConfig(configPath: string, storage?: StorageProvider): Promise<void> {
  _configPath = configPath;
  _config = cloneConfig(DEFAULT_CONFIG);
  try {
    if (storage) {
      if (await storage.fileExists(configPath)) {
        const text = await storage.readTextFile(configPath);
        _config = deepMerge(_config, JSON.parse(text));
      }
    } else {
      const file = Bun.file(configPath);
      if (await file.exists()) {
        const data = await file.json();
        _config = deepMerge(_config, data);
      }
    }
  } catch {
    _config = cloneConfig(DEFAULT_CONFIG);
  }
}

export async function saveConfig(storage?: StorageProvider): Promise<void> {
  if (!_configPath) {
    return;
  }
  const json = JSON.stringify(_config, null, 2);
  if (storage) {
    await storage.writeTextFile(_configPath, json);
  } else {
    await Bun.write(_configPath, json);
  }
}

function deepMerge(base: any, override: any): any {
  const result = cloneValue(base);
  for (const key of Object.keys(override)) {
    if (
      key in result &&
      typeof result[key] === 'object' &&
      typeof override[key] === 'object' &&
      result[key] !== null &&
      override[key] !== null &&
      !Array.isArray(result[key]) &&
      !Array.isArray(override[key])
    ) {
      result[key] = deepMerge(result[key], override[key]);
    } else {
      result[key] = cloneValue(override[key]);
    }
  }
  return result;
}

function cloneConfig(config: AppConfig): AppConfig {
  return cloneValue(config);
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getDataDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  const base = process.platform === 'win32'
    ? `${process.env.APPDATA || home}/music-player`
    : `${process.env.XDG_DATA_HOME || `${home}/.local/share`}/music-player`;
  return base;
}
