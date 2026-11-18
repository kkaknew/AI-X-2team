import type { ActivityLog, ActivityRepository, NewActivityLog } from './ActivityRepository';
import type { ActivityCode } from './schema';
import type { SqlDatabase } from './SqliteTreeRepository';

/**
 * 데이터 계층: ActivityRepository의 SQLite 구현. (#13)
 *
 * SqliteTreeRepository처럼 expo-sqlite를 직접 import하지 않고 SqlDatabase만 받는다.
 * 앱에서는 openAppDatabase()의 DB를, 테스트에서는 Node 내장 SQLite를 감싸서 넘긴다.
 * 사용자는 아직 1명(id 1)이다.
 */

const USER_ID = 1;

interface LogRow {
  id: number;
  code: ActivityCode;
  started_at: string;
  ended_at: string | null;
  duration_min: number | null;
  distance_m: number | null;
  char_count: number | null;
  verified: number;
  water_given: number;
}

const SELECT_LOG = `
SELECT l.id, t.code, l.started_at, l.ended_at, l.duration_min, l.distance_m, l.char_count,
       l.verified, l.water_given
FROM activity_logs l JOIN activity_types t ON t.id = l.type_id`;

function toLog(row: LogRow): ActivityLog {
  return {
    id: row.id,
    type: row.code,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMin: row.duration_min,
    distanceM: row.distance_m,
    charCount: row.char_count,
    verified: row.verified === 1,
    waterGiven: row.water_given,
  };
}

export class SqliteActivityRepository implements ActivityRepository {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
  }

  async addLog(log: NewActivityLog): Promise<number> {
    const type = await this.db.getFirstAsync<{ id: number }>(
      'SELECT id FROM activity_types WHERE code = ?',
      [log.type],
    );
    if (!type) throw new Error(`활동 종류(${log.type})를 찾을 수 없습니다`);

    // 지금 키우는 나무 (없으면 null로 남긴다)
    const tree = await this.db.getFirstAsync<{ id: number }>(
      "SELECT id FROM trees WHERE user_id = ? AND status != 'completed' ORDER BY id DESC LIMIT 1",
      [USER_ID],
    );

    await this.db.runAsync(
      `INSERT INTO activity_logs
         (user_id, tree_id, type_id, started_at, ended_at, duration_min, distance_m, char_count,
          verified, water_given)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        USER_ID,
        tree?.id ?? null,
        type.id,
        log.startedAt,
        log.endedAt,
        log.durationMin,
        log.distanceM ?? null,
        log.charCount ?? null,
        log.verified ? 1 : 0,
        log.waterGiven,
      ],
    );
    const row = await this.db.getFirstAsync<{ id: number }>('SELECT last_insert_rowid() AS id', []);
    return row?.id ?? 0;
  }

  async findOverlapping(
    type: ActivityCode,
    startedAt: string,
    endedAt: string,
  ): Promise<ActivityLog[]> {
    // 시각은 모두 toISOString() 형식(UTC)이라 문자열 비교로 순서를 비교할 수 있다
    const rows = await this.db.getAllAsync<LogRow>(
      `${SELECT_LOG}
       WHERE l.user_id = ? AND t.code = ? AND l.ended_at IS NOT NULL
         AND l.started_at < ? AND l.ended_at > ?
       ORDER BY l.started_at`,
      [USER_ID, type, endedAt, startedAt],
    );
    return rows.map(toLog);
  }

  async recentLogs(type: ActivityCode, limit: number): Promise<ActivityLog[]> {
    const rows = await this.db.getAllAsync<LogRow>(
      `${SELECT_LOG}
       WHERE l.user_id = ? AND t.code = ?
       ORDER BY l.started_at DESC, l.id DESC
       LIMIT ?`,
      [USER_ID, type, limit],
    );
    return rows.map(toLog);
  }

  async logsBetween(from: string, to: string): Promise<ActivityLog[]> {
    // 시각은 모두 toISOString() 형식(UTC)이라 문자열 비교로 구간을 고를 수 있다
    const rows = await this.db.getAllAsync<LogRow>(
      `${SELECT_LOG}
       WHERE l.user_id = ? AND l.started_at >= ? AND l.started_at < ?
       ORDER BY l.started_at, l.id`,
      [USER_ID, from, to],
    );
    return rows.map(toLog);
  }
}
