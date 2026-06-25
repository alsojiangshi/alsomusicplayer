import { useEffect, useMemo, useState } from 'react';
import { PlaybackMode, getConfig, saveConfig, setConfig, type AppConfig } from '@core';
import { usePlayer } from '../stores/playerStore';
import { TauriStorageProvider } from '../stores/tauriStorage';

const PLAYBACK_MODE_OPTIONS: Array<{ value: PlaybackMode; label: string }> = [
  { value: PlaybackMode.Sequential, label: '顺序播放' },
  { value: PlaybackMode.Shuffle, label: '随机播放' },
  { value: PlaybackMode.RepeatOne, label: '单曲循环' },
  { value: PlaybackMode.RepeatAll, label: '列表循环' },
];

export default function SettingsPage() {
  const { applyAudioPreferences, syncLibraryDirectories } = usePlayer();
  const [cfg, setCfg] = useState<AppConfig>(() => getConfig());
  const [saved, setSaved] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourcePlayback, setNewSourcePlayback] = useState('');
  const [newMusicDir, setNewMusicDir] = useState('');
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [libraryMessage, setLibraryMessage] = useState('');

  useEffect(() => {
    setCfg(getConfig());
  }, []);

  const storage = useMemo(() => new TauriStorageProvider(), []);

  const refreshConfig = () => {
    setCfg({ ...getConfig() });
  };

  const update = <K extends keyof AppConfig>(section: K, key: string, value: any) => {
    setConfig(`${section}.${key}`, value);
    refreshConfig();
  };

  const updateAudio = <K extends keyof AppConfig['audio']>(
    key: K,
    value: AppConfig['audio'][K],
  ) => {
    setConfig(`audio.${key}`, value);
    const nextAudio = { ...getConfig().audio, [key]: value };
    applyAudioPreferences(nextAudio);
    refreshConfig();
  };

  const persist = async () => {
    try {
      await saveConfig(storage);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Save config failed:', error);
    }
  };

  const toggleSearchSource = (name: string) => {
    const enabled = [...cfg.search.enabledSources];
    const index = enabled.indexOf(name);
    if (index >= 0) {
      enabled.splice(index, 1);
    } else {
      enabled.push(name);
    }
    update('search', 'enabledSources', enabled);
  };

  const addSearchSource = () => {
    const key = newSourceName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key || !newSourceUrl.trim()) {
      return;
    }

    const sources = { ...cfg.search.sources };
    sources[key] = {
      label: newSourceName.trim(),
      searchUrl: newSourceUrl.trim(),
      searchHeaders: { 'User-Agent': 'Mozilla/5.0' },
      resultPath: 'result.songs',
      mapping: {
        id: 'id',
        name: 'name',
        artist: 'ar[0].name',
        album: 'al.name',
        duration: 'dt',
      },
      playbackUrlTemplate: newSourcePlayback.trim() || '{id}',
    };

    update('search', 'sources', sources);
    if (!cfg.search.enabledSources.includes(key)) {
      update('search', 'enabledSources', [...cfg.search.enabledSources, key]);
    }

    setNewSourceName('');
    setNewSourceUrl('');
    setNewSourcePlayback('');
  };

  const removeSearchSource = (name: string) => {
    if (name === 'netease') {
      return;
    }
    const sources = { ...cfg.search.sources };
    delete sources[name];
    update('search', 'sources', sources);
    update(
      'search',
      'enabledSources',
      cfg.search.enabledSources.filter(source => source !== name),
    );
  };

  const addLibraryDirectory = () => {
    const path = newMusicDir.trim();
    if (!path || cfg.library.musicDirs.includes(path)) {
      return;
    }

    update('library', 'musicDirs', [...cfg.library.musicDirs, path]);
    setNewMusicDir('');
  };

  const removeLibraryDirectory = (path: string) => {
    update(
      'library',
      'musicDirs',
      cfg.library.musicDirs.filter(item => item !== path),
    );
  };

  const syncLibrary = async () => {
    if (cfg.library.musicDirs.length === 0 || syncingLibrary) {
      return;
    }

    setSyncingLibrary(true);
    try {
      const result = await syncLibraryDirectories(cfg.library.musicDirs);
      setLibraryMessage(formatImportSummary(result));
    } catch {
      setLibraryMessage('同步失败，请检查目录路径是否可访问');
    } finally {
      setSyncingLibrary(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">⚙️ 设置</h1>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-400">已保存</span>}
          <button
            onClick={persist}
            className="rounded-lg border border-accent/30 bg-accent-dim px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent hover:text-bg-darkest"
          >
            保存设置
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <section className="rounded-xl border border-border bg-bg-darkest p-5">
          <h2 className="mb-3 font-bold">音频</h2>
          <div className="space-y-4 text-sm">
            <label className="flex items-center gap-3">
              <span className="w-24 text-text-secondary">默认音量</span>
              <input
                type="range"
                min={0}
                max={100}
                value={cfg.audio.volume}
                onChange={event => updateAudio('volume', Number(event.target.value))}
                className="flex-1"
              />
              <span className="w-8 text-right text-text-muted">{cfg.audio.volume}</span>
            </label>

            <label className="flex items-center gap-3">
              <span className="w-24 text-text-secondary">播放模式</span>
              <select
                value={cfg.audio.playbackMode}
                onChange={event => updateAudio('playbackMode', event.target.value as PlaybackMode)}
                className="flex-1 rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary outline-none focus:border-accent"
              >
                {PLAYBACK_MODE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={cfg.audio.muted}
                onChange={event => updateAudio('muted', event.target.checked)}
              />
              启动时静音
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-bg-darkest p-5">
          <h2 className="mb-3 font-bold">在线搜索</h2>
          <div className="space-y-3 text-sm">
            <div className="text-text-secondary">已启用搜索源</div>
            {Object.entries(cfg.search.sources).map(([key, source]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg bg-bg-medium px-3 py-1.5"
              >
                <label className="flex flex-1 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cfg.search.enabledSources.includes(key)}
                    onChange={() => toggleSearchSource(key)}
                  />
                  <span>{source.label}</span>
                  <span className="max-w-[160px] truncate text-xs text-text-muted">
                    {source.searchUrl}
                  </span>
                </label>
                {key !== 'netease' && (
                  <button
                    onClick={() => removeSearchSource(key)}
                    className="rounded px-1.5 py-0.5 text-xs text-text-muted transition-colors hover:bg-red-900/30 hover:text-red-400"
                    title="删除搜索源"
                  >
                    删除
                  </button>
                )}
              </div>
            ))}

            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-2 text-text-secondary">添加自定义搜索源</div>
              <div className="space-y-2">
                <input
                  placeholder="名称，例如 MyMusic"
                  value={newSourceName}
                  onChange={event => setNewSourceName(event.target.value)}
                  className="w-full rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
                />
                <input
                  placeholder="搜索 URL 模板，例如 https://api.example.com/search?q={query}"
                  value={newSourceUrl}
                  onChange={event => setNewSourceUrl(event.target.value)}
                  className="w-full rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
                />
                <input
                  placeholder="播放 URL 模板，例如 https://api.example.com/stream/{id}"
                  value={newSourcePlayback}
                  onChange={event => setNewSourcePlayback(event.target.value)}
                  className="w-full rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
                />
                <button
                  onClick={addSearchSource}
                  disabled={!newSourceName.trim() || !newSourceUrl.trim()}
                  className="w-full rounded-lg border border-accent/30 bg-accent-dim px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent hover:text-bg-darkest disabled:opacity-50"
                >
                  添加搜索源
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-bg-darkest p-5">
          <h2 className="mb-3 font-bold">音乐库</h2>
          <div className="space-y-3 text-sm">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">媒体目录</span>
                <button
                  onClick={() => void syncLibrary()}
                  disabled={cfg.library.musicDirs.length === 0 || syncingLibrary}
                  className="rounded-lg border border-accent/30 bg-accent-dim px-3 py-1 text-xs text-accent transition-colors hover:bg-accent hover:text-bg-darkest disabled:opacity-50"
                >
                  {syncingLibrary ? '同步中...' : '同步目录'}
                </button>
              </div>

              {cfg.library.musicDirs.length === 0 ? (
                <div className="rounded-lg bg-bg-medium px-3 py-2 text-xs text-text-muted">
                  还没有添加媒体目录。你可以手动填写常用音乐文件夹路径，再一键同步到库中。
                </div>
              ) : (
                <div className="space-y-1">
                  {cfg.library.musicDirs.map(path => (
                    <div
                      key={path}
                      className="flex items-center gap-2 rounded-lg bg-bg-medium px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                        {path}
                      </span>
                      <button
                        onClick={() => removeLibraryDirectory(path)}
                        className="rounded px-1.5 py-0.5 text-xs text-text-muted transition-colors hover:bg-red-900/30 hover:text-red-400"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  value={newMusicDir}
                  onChange={event => setNewMusicDir(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      addLibraryDirectory();
                    }
                  }}
                  placeholder="例如 D:\\Music 或 /Users/name/Music"
                  className="flex-1 rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
                />
                <button
                  onClick={addLibraryDirectory}
                  disabled={!newMusicDir.trim()}
                  className="rounded-lg border border-accent/30 bg-accent-dim px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent hover:text-bg-darkest disabled:opacity-50"
                >
                  添加目录
                </button>
              </div>

              {libraryMessage && <div className="text-xs text-accent">{libraryMessage}</div>}
            </div>

            <div className="flex items-center gap-2">
              <span className="w-20 text-text-secondary">数据库</span>
              <input
                value={cfg.library.dbPath}
                onChange={event => update('library', 'dbPath', event.target.value)}
                placeholder="留空使用默认位置"
                className="flex-1 rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
              />
            </div>
            <p className="text-xs text-text-muted">
              音乐库数据库默认保存在应用数据目录。修改路径后需要重启应用。
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-bg-darkest p-5">
          <h2 className="mb-3 font-bold">歌词</h2>
          <div className="space-y-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={cfg.lyrics.autoSearch}
                onChange={event => update('lyrics', 'autoSearch', event.target.checked)}
              />
              自动搜索歌词
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={cfg.lyrics.localPreferred}
                onChange={event => update('lyrics', 'localPreferred', event.target.checked)}
              />
              优先使用本地歌词
            </label>
            <div className="mt-2 text-text-secondary">歌词提供方</div>
            {[
              { key: 'lrclib', label: 'LRCLIB.net' },
              { key: 'netease', label: '网易云音乐' },
            ].map(provider => (
              <label key={provider.key} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={cfg.lyrics.providers.includes(provider.key)}
                  onChange={() => {
                    const providers = [...cfg.lyrics.providers];
                    const index = providers.indexOf(provider.key);
                    if (index >= 0) {
                      providers.splice(index, 1);
                    } else {
                      providers.push(provider.key);
                    }
                    update('lyrics', 'providers', providers);
                  }}
                />
                {provider.label}
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-bg-darkest p-5">
          <h2 className="mb-3 font-bold">S3 / MinIO</h2>
          <div className="space-y-2 text-sm">
            <input
              placeholder="Endpoint，例如 https://s3.amazonaws.com"
              value={cfg.s3.endpoint}
              onChange={event => update('s3', 'endpoint', event.target.value)}
              className="w-full rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
            />
            <div className="flex gap-2">
              <input
                placeholder="Access Key"
                value={cfg.s3.accessKey}
                onChange={event => update('s3', 'accessKey', event.target.value)}
                className="flex-1 rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
              />
              <input
                placeholder="Secret Key"
                type="password"
                value={cfg.s3.secretKey}
                onChange={event => update('s3', 'secretKey', event.target.value)}
                className="flex-1 rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
              />
            </div>
            <div className="flex gap-2">
              <input
                placeholder="Bucket"
                value={cfg.s3.bucket}
                onChange={event => update('s3', 'bucket', event.target.value)}
                className="flex-1 rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
              />
              <input
                placeholder="Region"
                value={cfg.s3.region}
                onChange={event => update('s3', 'region', event.target.value)}
                className="w-32 rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
              />
            </div>
            <input
              placeholder="Prefix（可选）"
              value={cfg.s3.prefix}
              onChange={event => update('s3', 'prefix', event.target.value)}
              className="w-full rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
            />
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={cfg.s3.useSsl}
                onChange={event => update('s3', 'useSsl', event.target.checked)}
              />
              使用 SSL
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-bg-darkest p-5">
          <h2 className="mb-3 font-bold">OpenList</h2>
          <div className="space-y-2 text-sm">
            <input
              placeholder="服务器地址"
              value={cfg.openlist.serverUrl}
              onChange={event => update('openlist', 'serverUrl', event.target.value)}
              className="w-full rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
            />
            <input
              placeholder="用户名"
              value={cfg.openlist.username}
              onChange={event => update('openlist', 'username', event.target.value)}
              className="w-full rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
            />
            <input
              placeholder="密码"
              type="password"
              value={cfg.openlist.password}
              onChange={event => update('openlist', 'password', event.target.value)}
              className="w-full rounded border border-border bg-bg-medium px-2 py-1.5 text-text-primary placeholder:text-text-muted"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function formatImportSummary(summary: {
  added: number;
  skipped: number;
  failed: number;
}): string {
  const parts = [`新增 ${summary.added} 首`];
  if (summary.skipped > 0) {
    parts.push(`跳过 ${summary.skipped} 首`);
  }
  if (summary.failed > 0) {
    parts.push(`失败 ${summary.failed} 首`);
  }
  return parts.join('，');
}
