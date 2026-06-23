/** 导入器抽象接口 */

import type { LibraryManager } from '../library/manager.js';

export interface Importer {
  import(params: any): Promise<number>;
}

export abstract class BaseImporter implements Importer {
  constructor(protected library: LibraryManager) {}
  abstract import(params: any): Promise<number>;

  protected report(current: number, total: number, name: string, cb?: (pct: number, msg: string) => void) {
    if (cb) cb(total > 0 ? Math.round((current / total) * 100) : 0, `(${current}/${total}) ${name}`);
  }
}
