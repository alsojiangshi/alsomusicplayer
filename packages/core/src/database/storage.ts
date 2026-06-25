/** 存储抽象层 — 解耦文件 I/O，支持 Bun（CLI）和 Tauri（GUI）双环境 */

export interface StorageProvider {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, data: string): Promise<void>;
  getDataDir(): Promise<string>;
  listFilesRecursively?(path: string): Promise<string[]>;
  deleteFile?(path: string): Promise<void>;
}
