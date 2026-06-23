/** 本地文件导入器 */

import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve as pathResolve } from 'node:path';
import type { LibraryManager } from '../library/manager.js';
import { extractMetadata, isSupportedAudio, scanDirectory } from '../utils/metadata.js';
import { BaseImporter } from './base.js';

export class LocalImporter extends BaseImporter {
  constructor(library: LibraryManager) { super(library); }

  async import(params: {
    paths: string[];
    onProgress?: (pct: number, msg: string) => void;
  }): Promise<number> {
    const { paths, onProgress } = params;

    const allFiles: string[] = [];
    for (const p of paths) {
      const abs = isAbsolute(p) ? p : pathResolve(p);
      if (!existsSync(abs)) continue;
      const st = statSync(abs);
      if (st.isDirectory()) {
        allFiles.push(...scanDirectory(abs, true));
      } else if (st.isFile() && isSupportedAudio(abs)) {
        allFiles.push(abs);
      }
    }

    const total = allFiles.length;
    let imported = 0;

    for (let i = 0; i < total; i++) {
      const file = allFiles[i];
      this.report(i + 1, total, file.split('/').pop()!, onProgress);
      const meta = await extractMetadata(file);
      if (meta.title) {
        const id = this.library.addSong(meta);
        if (id) imported++;
      }
    }

    if (onProgress) onProgress(100, `完成！成功导入 ${imported} 首歌曲`);
    return imported;
  }
}
