/** sql.js 数据库封装 — 纯 WASM，零原生依赖 */

import initSqlJs, { type Database as SqlJsDb, type QueryExecResult } from 'sql.js';
import type { StorageProvider } from './storage.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT DEFAULT 'Unknown Artist',
  album TEXT DEFAULT 'Unknown Album',
  duration REAL DEFAULT 0,
  file_path TEXT NOT NULL UNIQUE,
  file_hash TEXT,
  format TEXT,
  bitrate INTEGER,
  sample_rate INTEGER,
  channels INTEGER DEFAULT 2,
  file_size INTEGER,
  cover_art BLOB,
  source TEXT DEFAULT 'local',
  source_config TEXT,
  date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
CREATE INDEX IF NOT EXISTS idx_songs_source ON songs(source);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  UNIQUE(playlist_id, song_id)
);

CREATE TABLE IF NOT EXISTS lyrics_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE,
  plain_text TEXT,
  synced_text TEXT,
  source TEXT,
  language TEXT DEFAULT 'original',
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS favorites (
  song_id INTEGER PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS play_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER REFERENCES songs(id) ON DELETE SET NULL,
  played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

export class Database {
  private db: SqlJsDb | null = null;
  private dbPath: string;
  private storage: StorageProvider | null;

  constructor(dbPath: string, storage?: StorageProvider) {
    this.dbPath = dbPath;
    this.storage = storage ?? null;
  }

  async init(): Promise<void> {
    let SQL: Awaited<ReturnType<typeof initSqlJs>>;
    try {
      SQL = await initSqlJs(
        typeof window === 'undefined'
          ? undefined
          : {
              locateFile: (file: string) => resolveSqlJsAssetPath(file),
            },
      );
    } catch (error: unknown) {
      throw new Error(`加载 sql.js 运行时失败: ${formatDatabaseError(error)}`);
    }

    if (this.storage) {
      // 使用 StorageProvider（浏览器/Tauri 环境）
      try {
        if (await this.storage.fileExists(this.dbPath)) {
          const buf = await this.storage.readFile(this.dbPath);
          this.db = new SQL.Database(buf);
        } else {
          this.db = new SQL.Database();
        }
      } catch (error: unknown) {
        throw new Error(`读取数据库文件失败 (${this.dbPath}): ${formatDatabaseError(error)}`);
      }
    } else {
      // 使用 Bun I/O（CLI 环境）
      try {
        const file = Bun.file(this.dbPath);
        if (await file.exists()) {
          const buf = await file.arrayBuffer();
          this.db = new SQL.Database(new Uint8Array(buf));
        } else {
          this.db = new SQL.Database();
        }
      } catch {
        this.db = new SQL.Database();
      }
    }
    this.db.run(SCHEMA);
    this.db.run('PRAGMA foreign_keys = ON');
  }

  private ensureDb(): SqlJsDb {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  execute(sql: string, params: any[] = []): QueryExecResult[] {
    return this.ensureDb().exec(sql, { bind: params });
  }

  run(sql: string, params: any[] = []): void {
    this.ensureDb().run(sql, params);
  }

  query<T extends Record<string, any>>(sql: string, params: any[] = []): T[] {
    const db = this.ensureDb();
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }

  queryOne<T extends Record<string, any>>(sql: string, params: any[] = []): T | null {
    const rows = this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  insert(sql: string, params: any[] = []): number {
    this.run(sql, params);
    const row = this.queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
    return row?.id ?? 0;
  }

  async save(): Promise<void> {
    const data = this.ensureDb().export();
    if (this.storage) {
      await this.storage.writeFile(this.dbPath, data);
    } else {
      await Bun.write(this.dbPath, data);
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

function resolveSqlJsAssetPath(file: string): string {
  if (typeof window === 'undefined') {
    return file;
  }

  if (file === 'sql-wasm.wasm') {
    return new URL(file, window.location.href).toString();
  }

  return file;
}

function formatDatabaseError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return '未知错误';
  }
}
