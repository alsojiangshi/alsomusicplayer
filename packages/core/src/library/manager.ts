/** 音乐库管理器 — CRUD + 搜索 */

import type { Database } from '../database/db.js';
import type { Track } from '../types.js';

export class LibraryManager {
  constructor(private db: Database) {}

  addSong(track: Partial<Track> & { filePath: string }): number | null {
    const existing = this.db.queryOne<{ id: number }>(
      'SELECT id FROM songs WHERE file_path = ?', [track.filePath]
    );
    if (existing) return null;

    if (track.fileHash) {
      const dup = this.db.queryOne<{ id: number }>(
        'SELECT id FROM songs WHERE file_hash = ?', [track.fileHash]
      );
      if (dup) return null;
    }

    return this.db.insert(
      `INSERT INTO songs (title, artist, album, duration, file_path, file_hash,
        format, bitrate, sample_rate, channels, file_size, cover_art, source, source_config)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        track.title || 'Unknown', track.artist || 'Unknown Artist',
        track.album || 'Unknown Album', track.duration || 0,
        track.filePath, track.fileHash || '',
        track.format || '', track.bitrate || 0, track.sampleRate || 0,
        track.channels || 2, track.fileSize || 0,
        track.coverArt || null, track.source || 'local',
        track.sourceConfig || '',
      ]
    );
  }

  getSong(id: number): Track | null {
    return this.db.queryOne<Track>('SELECT * FROM songs WHERE id = ?', [id]);
  }

  getAllSongs(): Track[] {
    return this.db.query<Track>('SELECT * FROM songs ORDER BY date_added DESC');
  }

  search(query?: string, source?: string, limit = 1000): Track[] {
    let sql = 'SELECT * FROM songs WHERE 1=1';
    const params: any[] = [];
    if (query) { sql += ' AND (title LIKE ? OR artist LIKE ? OR album LIKE ?)'; params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
    if (source && source !== 'all') { sql += ' AND source = ?'; params.push(source); }
    sql += ' ORDER BY date_added DESC LIMIT ?';
    params.push(limit);
    return this.db.query<Track>(sql, params);
  }

  deleteSong(id: number): void {
    this.db.run('DELETE FROM songs WHERE id = ?', [id]);
  }

  getStats() {
    const total = this.db.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM songs');
    const dur = this.db.queryOne<{ total: number }>('SELECT SUM(duration) as total FROM songs');
    return { totalSongs: total?.cnt ?? 0, totalDuration: dur?.total ?? 0 };
  }

  // Playlist operations
  createPlaylist(name: string): number {
    return this.db.insert('INSERT INTO playlists (name) VALUES (?)', [name]);
  }

  deletePlaylist(id: number): void {
    this.db.run('DELETE FROM playlists WHERE id = ?', [id]);
  }

  getAllPlaylists() {
    return this.db.query<{ id: number; name: string; songCount: number; created_at: string }>(
      `SELECT p.*, COUNT(pi.id) as songCount FROM playlists p
       LEFT JOIN playlist_items pi ON p.id = pi.playlist_id
       GROUP BY p.id ORDER BY p.created_at DESC`
    );
  }

  getPlaylistSongs(playlistId: number): Track[] {
    return this.db.query<Track>(
      `SELECT s.* FROM songs s JOIN playlist_items pi ON s.id = pi.song_id
       WHERE pi.playlist_id = ? ORDER BY pi.position ASC`, [playlistId]
    );
  }

  addSongsToPlaylist(playlistId: number, songIds: number[]): number {
    const row = this.db.queryOne<{ maxPos: number }>(
      'SELECT MAX(position) as maxPos FROM playlist_items WHERE playlist_id = ?',
      [playlistId]
    );
    let pos = row?.maxPos ?? 0;
    let count = 0;
    for (const sid of songIds) {
      try {
        pos++;
        this.db.run(
          'INSERT OR IGNORE INTO playlist_items (playlist_id, song_id, position) VALUES (?,?,?)',
          [playlistId, sid, pos]
        );
        count++;
      } catch { /* skip duplicate */ }
    }
    return count;
  }

  removeSongsFromPlaylist(playlistId: number, songIds: number[]): void {
    for (const songId of songIds) {
      this.db.run(
        'DELETE FROM playlist_items WHERE playlist_id = ? AND song_id = ?',
        [playlistId, songId]
      );
    }
  }

  renamePlaylist(playlistId: number, name: string): void {
    this.db.run('UPDATE playlists SET name = ? WHERE id = ?', [name, playlistId]);
  }

  // Favorites
  toggleFavorite(songId: number): boolean {
    const exists = this.db.queryOne('SELECT * FROM favorites WHERE song_id = ?', [songId]);
    if (exists) { this.db.run('DELETE FROM favorites WHERE song_id = ?', [songId]); return false; }
    else { this.db.run('INSERT INTO favorites (song_id) VALUES (?)', [songId]); return true; }
  }

  getFavorites(): Track[] {
    return this.db.query<Track>(
      'SELECT s.* FROM songs s JOIN favorites f ON s.id = f.song_id ORDER BY f.added_at DESC'
    );
  }

  // History
  addHistory(songId: number): void {
    this.db.run('INSERT INTO play_history (song_id) VALUES (?)', [songId]);
  }

  getHistory(limit = 50): Track[] {
    return this.db.query<Track>(
      `SELECT DISTINCT s.* FROM songs s JOIN play_history h ON s.id = h.song_id
       ORDER BY h.played_at DESC LIMIT ?`, [limit]
    );
  }

  // Lyrics cache
  cacheLyrics(songId: number, data: { source: string; plainText: string | null; syncedText: string | null; language: string }) {
    this.db.run(
      `INSERT OR REPLACE INTO lyrics_cache (song_id, plain_text, synced_text, source, language)
       VALUES (?,?,?,?,?)`,
      [songId, data.plainText, data.syncedText, data.source, data.language]
    );
  }

  getCachedLyrics(songId: number) {
    return this.db.queryOne<{ source: string; plain_text: string | null; synced_text: string | null; language: string }>(
      'SELECT * FROM lyrics_cache WHERE song_id = ?', [songId]
    );
  }
}
