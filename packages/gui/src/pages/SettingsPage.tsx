import { useState, useEffect } from 'react';
import { getConfig, setConfig, saveConfig } from '@core';
import type { AppConfig } from '@core';
import { TauriStorageProvider } from '../stores/tauriStorage';

export default function SettingsPage() {
  const [cfg, setCfg] = useState<AppConfig>(() => getConfig());
  const [saved, setSaved] = useState(false);

  // 从 config 模块重新加载（以防其他地方修改了配置）
  useEffect(() => { setCfg(getConfig()); }, []);

  const update = <K extends keyof AppConfig>(section: K, key: string, value: any) => {
    const path = `${section}.${key}`;
    setConfig(path, value);
    setCfg({ ...getConfig() });
  };

  const persist = async () => {
    try {
      const storage = new TauriStorageProvider();
      await saveConfig(storage);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Save config failed:', e);
    }
  };

  const toggleSearchSource = (name: string) => {
    const sources = [...cfg.search.enabledSources];
    const idx = sources.indexOf(name);
    if (idx >= 0) sources.splice(idx, 1);
    else sources.push(name);
    update('search', 'enabledSources', sources);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">⚙️ 设置</h1>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-400">✅ 已保存</span>}
          <button
            onClick={persist}
            className="px-3 py-1.5 rounded-lg bg-accent-dim text-accent border border-accent/30 hover:bg-accent hover:text-bg-darkest text-sm"
          >
            💾 保存设置
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* 音频 */}
        <section className="bg-bg-darkest border border-border rounded-xl p-5">
          <h2 className="font-bold mb-3">🔊 音频</h2>
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-3">
              <span className="w-20 text-text-secondary">默认音量</span>
              <input
                type="range"
                min={0} max={100}
                value={cfg.audio.volume}
                onChange={e => update('audio', 'volume', Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-8 text-right text-text-muted">{cfg.audio.volume}</span>
            </label>
          </div>
        </section>

        {/* 搜索 */}
        <section className="bg-bg-darkest border border-border rounded-xl p-5">
          <h2 className="font-bold mb-3">🔍 网络搜索</h2>
          <div className="space-y-3 text-sm">
            <div className="text-text-secondary mb-2">搜索源</div>
            {[
              { key: 'netease', label: '网易云音乐' },
            ].map(src => (
              <label key={src.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.search.enabledSources.includes(src.key)}
                  onChange={() => toggleSearchSource(src.key)}
                />
                {src.label}
              </label>
            ))}
          </div>
        </section>

        {/* 歌词 */}
        <section className="bg-bg-darkest border border-border rounded-xl p-5">
          <h2 className="font-bold mb-3">🎤 歌词</h2>
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.lyrics.autoSearch}
                onChange={e => update('lyrics', 'autoSearch', e.target.checked)}
              />
              自动搜索歌词
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.lyrics.localPreferred}
                onChange={e => update('lyrics', 'localPreferred', e.target.checked)}
              />
              优先本地歌词
            </label>
            <div className="text-text-secondary mt-2">搜索提供者</div>
            {[
              { key: 'lrclib', label: 'LRCLIB.net' },
              { key: 'netease', label: '网易云音乐' },
            ].map(p => (
              <label key={p.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.lyrics.providers.includes(p.key)}
                  onChange={() => {
                    const providers = [...cfg.lyrics.providers];
                    const idx = providers.indexOf(p.key);
                    if (idx >= 0) providers.splice(idx, 1);
                    else providers.push(p.key);
                    update('lyrics', 'providers', providers);
                  }}
                />
                {p.label}
              </label>
            ))}
          </div>
        </section>

        {/* S3 */}
        <section className="bg-bg-darkest border border-border rounded-xl p-5">
          <h2 className="font-bold mb-3">☁️ S3 / MinIO</h2>
          <div className="space-y-2 text-sm">
            <input
              placeholder="Endpoint (e.g. https://s3.amazonaws.com)"
              value={cfg.s3.endpoint}
              onChange={e => update('s3', 'endpoint', e.target.value)}
              className="w-full bg-bg-medium border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted"
            />
            <div className="flex gap-2">
              <input
                placeholder="Access Key"
                value={cfg.s3.accessKey}
                onChange={e => update('s3', 'accessKey', e.target.value)}
                className="flex-1 bg-bg-medium border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted"
              />
              <input
                placeholder="Secret Key"
                type="password"
                value={cfg.s3.secretKey}
                onChange={e => update('s3', 'secretKey', e.target.value)}
                className="flex-1 bg-bg-medium border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted"
              />
            </div>
            <div className="flex gap-2">
              <input
                placeholder="Bucket"
                value={cfg.s3.bucket}
                onChange={e => update('s3', 'bucket', e.target.value)}
                className="flex-1 bg-bg-medium border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted"
              />
              <input
                placeholder="Region"
                value={cfg.s3.region}
                onChange={e => update('s3', 'region', e.target.value)}
                className="w-32 bg-bg-medium border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted"
              />
            </div>
            <input
              placeholder="Prefix (optional)"
              value={cfg.s3.prefix}
              onChange={e => update('s3', 'prefix', e.target.value)}
              className="w-full bg-bg-medium border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted"
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.s3.useSsl}
                onChange={e => update('s3', 'useSsl', e.target.checked)}
              />
              使用 SSL
            </label>
          </div>
        </section>

        {/* OpenList */}
        <section className="bg-bg-darkest border border-border rounded-xl p-5">
          <h2 className="font-bold mb-3">📡 OpenList</h2>
          <div className="space-y-2 text-sm">
            <input
              placeholder="服务器地址"
              value={cfg.openlist.serverUrl}
              onChange={e => update('openlist', 'serverUrl', e.target.value)}
              className="w-full bg-bg-medium border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted"
            />
            <input
              placeholder="用户名"
              value={cfg.openlist.username}
              onChange={e => update('openlist', 'username', e.target.value)}
              className="w-full bg-bg-medium border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted"
            />
            <input
              placeholder="密码"
              type="password"
              value={cfg.openlist.password}
              onChange={e => update('openlist', 'password', e.target.value)}
              className="w-full bg-bg-medium border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
