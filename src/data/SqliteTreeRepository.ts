import type {
  CompletedTree,
  GrowthStage,
  TreeRepository,
  TreeState,
  TreeStatus,
  WateringUpdate,
} from './TreeRepository';

/**
 * 데이터 계층: TreeRepository의 SQLite 구현. (#7)
 *
 * expo-sqlite를 직접 import하지 않고, 필요한 메서드만 적은 SqlDatabase를 받는다.
 * 앱에서는 openAppDatabase()가 돌려주는 expo-sqlite DB를 그대로 넘기고,
 * 테스트에서는 Node 내장 SQLite를 같은 모양으로 감싸서 넘긴다.
 */
export type SqlValue = string | number | null;

export interface SqlDatabase {
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  runAsync(sql: string, params: SqlValue[]): Promise<unknown>;
}

interface TreeRow {
  id: number;
  stage_id: number;
  water_total: number;
  status: TreeStatus;
  last_watered_at: string | null;
  planted_at: string;
}

interface StageRow {
  id: number;
  name: string;
  water_required: number;
}

export class SqliteTreeRepository implements TreeRepository {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
  }

  async getActiveTree(): Promise<TreeState | null> {
    const row = await this.db.getFirstAsync<TreeRow>(
      `SELECT id, stage_id, water_total, status, last_watered_at, planted_at
         FROM trees
        WHERE status != 'completed'
        ORDER BY id DESC
        LIMIT 1`,
      [],
    );
    if (!row) return null;
    return {
      id: row.id,
      stageId: row.stage_id,
      waterTotal: row.water_total,
      status: row.status,
      lastWateredAt: row.last_watered_at,
      plantedAt: toIso(row.planted_at),
    };
  }

  async getStages(): Promise<GrowthStage[]> {
    const rows = await this.db.getAllAsync<StageRow>(
      'SELECT id, name, water_required FROM growth_stages ORDER BY water_required, id',
      [],
    );
    return rows.map((r) => ({ id: r.id, name: r.name, waterRequired: r.water_required }));
  }

  async saveWatering(treeId: number, update: WateringUpdate): Promise<void> {
    await this.db.runAsync(
      'UPDATE trees SET stage_id = ?, water_total = ?, last_watered_at = ?, status = COALESCE(?, status) WHERE id = ?',
      [update.stageId, update.waterTotal, update.lastWateredAt, update.status ?? null, treeId],
    );
  }

  async setStatus(treeId: number, status: TreeStatus): Promise<void> {
    await this.db.runAsync('UPDATE trees SET status = ? WHERE id = ?', [status, treeId]);
  }

  async completeTree(treeId: number, fallbackAt: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE trees
          SET status = 'completed', completed_at = COALESCE(last_watered_at, ?)
        WHERE id = ? AND status != 'completed'`,
      [fallbackAt, treeId],
    );
  }

  async plantTree(plantedAt: string): Promise<TreeState> {
    // 같은 사용자의 나무로 심는다. 첫 단계(필요한 물이 가장 적은 단계)부터 시작
    await this.db.runAsync(
      `INSERT INTO trees (user_id, stage_id, water_total, status, planted_at)
       VALUES (
         COALESCE((SELECT user_id FROM trees ORDER BY id DESC LIMIT 1), (SELECT id FROM users ORDER BY id LIMIT 1)),
         (SELECT id FROM growth_stages ORDER BY water_required, id LIMIT 1),
         0, 'growing', ?
       )`,
      [plantedAt],
    );
    const tree = await this.getActiveTree();
    if (!tree) throw new Error('새 씨앗을 심지 못했습니다');
    return tree;
  }

  async listCompletedTrees(): Promise<CompletedTree[]> {
    const rows = await this.db.getAllAsync<{
      id: number;
      planted_at: string;
      completed_at: string;
      water_total: number;
    }>(
      `SELECT id, planted_at, completed_at, water_total
         FROM trees
        WHERE status = 'completed' AND completed_at IS NOT NULL
        ORDER BY completed_at DESC, id DESC`,
      [],
    );
    return rows.map((r) => ({
      id: r.id,
      plantedAt: r.planted_at,
      completedAt: r.completed_at,
      waterTotal: r.water_total,
    }));
  }
}

/**
 * SQLite의 datetime('now') 값("2026-11-18 02:30:00", UTC)을 ISO 문자열로 바꾼다. (#17)
 * 그대로 new Date()에 넣으면 기기 현지 시각으로 읽혀 9시간 어긋나기 때문이다. 이미 ISO면 그대로 둔다.
 */
export function toIso(sqliteTime: string): string {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(sqliteTime)
    ? `${sqliteTime.replace(' ', 'T')}Z`
    : sqliteTime;
}
