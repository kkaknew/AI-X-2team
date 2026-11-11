import type { GrowthStage, TreeRepository, TreeState, TreeStatus, WateringUpdate } from './TreeRepository';

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
      `SELECT id, stage_id, water_total, status, last_watered_at
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
      'UPDATE trees SET stage_id = ?, water_total = ?, last_watered_at = ? WHERE id = ?',
      [update.stageId, update.waterTotal, update.lastWateredAt, treeId],
    );
  }
}
