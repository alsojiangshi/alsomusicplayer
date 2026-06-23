/** Tauri 环境 StorageProvider — 桥接 core 接口到 Tauri 命令 */

import { invoke } from '@tauri-apps/api/core';
import type { StorageProvider } from '@core';

export class TauriStorageProvider implements StorageProvider {
  private dataDir: string | null = null;

  async readFile(path: string): Promise<Uint8Array> {
    const data: number[] = await invoke('read_file', { path });
    return new Uint8Array(data);
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    await invoke('write_file', { path, data: Array.from(data) });
  }

  async fileExists(path: string): Promise<boolean> {
    return await invoke('file_exists', { path });
  }

  async readTextFile(path: string): Promise<string> {
    return await invoke('read_text_file', { path });
  }

  async writeTextFile(path: string, data: string): Promise<void> {
    await invoke('write_text_file', { path, data });
  }

  async getDataDir(): Promise<string> {
    if (!this.dataDir) {
      this.dataDir = await invoke('get_data_dir');
    }
    return this.dataDir;
  }
}
