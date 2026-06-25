/** OpenList REST API 导入器 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LibraryManager } from '../library/manager.js';
import { extractMetadata, isSupportedAudio } from '../utils/metadata.js';
import type { OpenListConfig, Track } from '../types.js';
import { BaseImporter } from './base.js';
import { getDataDir } from '../config.js';

export class OpenListImporter extends BaseImporter {
  constructor(library: LibraryManager) { super(library); }

  async import(params: {
    config: OpenListConfig;
    remotePath?: string;
    maxFiles?: number;
    onProgress?: (pct: number, msg: string) => void;
  }): Promise<number> {
    const { config, remotePath = '/', maxFiles = 500, onProgress } = params;

    if (onProgress) onProgress(0, '登录 OpenList...');

    // 登录
    const baseUrl = config.serverUrl.replace(/\/$/, '');
    let token = '';
    try {
      const loginResp = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: config.username, password: config.password }),
      });
      const loginData: any = await loginResp.json();
      if (loginData?.code === 200) token = loginData?.data?.token ?? '';
    } catch { return 0; }

    if (!token && onProgress) { onProgress(100, '登录失败'); return 0; }

    // 递归列出文件
    if (onProgress) onProgress(5, '扫描文件...');
    const allFiles: { name: string; path: string; size: number }[] = [];

    const listDir = async (path: string) => {
      if (allFiles.length >= maxFiles) return;
      try {
        const resp = await fetch(`${baseUrl}/api/fs/list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({ path, page: 1, per_page: 200, refresh: false }),
        });
        const data: any = await resp.json();
        const content = data?.data?.content ?? [];
        for (const item of content) {
          if (allFiles.length >= maxFiles) return;
          if (item.is_dir) await listDir(item.path);
          else if (isSupportedAudio(item.name)) {
            allFiles.push({ name: item.name, path: item.path, size: item.size });
          }
        }
      } catch { /* skip */ }
    };

    await listDir(remotePath);
    if (onProgress) onProgress(10, `发现 ${allFiles.length} 个文件`);

    const cacheDir = join(getDataDir(), 'cache', 'openlist');
    mkdirSync(cacheDir, { recursive: true });

    let imported = 0;
    for (let i = 0; i < allFiles.length; i++) {
      const f = allFiles[i];
      this.report(i + 1, allFiles.length, f.name, onProgress);

      try {
        const localPath = join(cacheDir, f.name);
        if (!existsSync(localPath)) {
          const dlResp = await fetch(`${baseUrl}/d${encodeURI(f.path)}`, {
            headers: { Authorization: token },
            redirect: 'follow',
          });
          if (dlResp.ok) {
            const buf = await dlResp.arrayBuffer();
            writeFileSync(localPath, new Uint8Array(buf));
          }
        }

        if (existsSync(localPath)) {
          const meta = await extractMetadata(localPath);
          if (meta.title && meta.filePath) {
            meta.filePath = `openlist://${baseUrl}${f.path}`;
            meta.source = 'openlist';
            meta.fileSize = f.size;
            meta.sourceConfig = JSON.stringify({ serverUrl: baseUrl, remotePath });
            const id = this.library.addSong(meta as Partial<Track> & { filePath: string });
            if (id) imported++;
          }
        }
      } catch { /* skip */ }
    }

    if (onProgress) onProgress(100, `完成！成功导入 ${imported}/${allFiles.length}`);
    return imported;
  }
}
