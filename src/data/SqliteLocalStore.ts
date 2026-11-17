import type { DiaryEntry, LocalStore } from './LocalStore';
import type { SqlDatabase } from './SqliteTreeRepository';

/**
 * 데이터 계층: LocalStore의 SQLite 구현. (#10)
 * 앱에서는 openLocalDatabase()가 여는 개인 기록 DB를 넘긴다. 앱 DB를 넘기면 안 된다.
 */
interface DiaryRow {
  id: number;
  written_at: string;
  body: string;
  char_count: number;
}

const toEntry = (r: DiaryRow): DiaryEntry => ({
  id: r.id,
  writtenAt: r.written_at,
  body: r.body,
  charCount: r.char_count,
});

export class SqliteLocalStore implements LocalStore {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
  }

  async saveDiary(body: string, charCount: number, writtenAt: Date): Promise<DiaryEntry> {
    const at = writtenAt.toISOString();
    await this.db.runAsync(
      'INSERT INTO diary_entries (written_at, body, char_count) VALUES (?, ?, ?)',
      [at, body, charCount],
    );
    const row = await this.db.getFirstAsync<{ id: number }>('SELECT last_insert_rowid() AS id', []);
    return { id: row?.id ?? 0, writtenAt: at, body, charCount };
  }

  async listDiaries(limit = 50): Promise<DiaryEntry[]> {
    const rows = await this.db.getAllAsync<DiaryRow>(
      'SELECT id, written_at, body, char_count FROM diary_entries ORDER BY written_at DESC, id DESC LIMIT ?',
      [limit],
    );
    return rows.map(toEntry);
  }

  async getDiary(id: number): Promise<DiaryEntry | null> {
    const row = await this.db.getFirstAsync<DiaryRow>(
      'SELECT id, written_at, body, char_count FROM diary_entries WHERE id = ?',
      [id],
    );
    return row ? toEntry(row) : null;
  }
}
