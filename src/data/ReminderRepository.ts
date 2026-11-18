import type { SqlDatabase } from './SqliteTreeRepository';

/**
 * 데이터 계층: 알림 설정 저장 (reminders 테이블). (#15 [13] 물주기 리마인더)
 * 물주기 리마인더는 특정 활동이 아니라 "오늘 물 주기"라 type_id가 NULL인 행 하나로 둔다.
 * 사용자는 아직 1명(id 1)이다.
 */

export interface ReminderSetting {
  /** "HH:MM" (24시간, 휴대폰 시간대) */
  time: string;
  enabled: boolean;
}

export interface ReminderRepository {
  /** 물주기 리마인더 설정. 한 번도 저장한 적 없으면 null */
  getWateringReminder(): Promise<ReminderSetting | null>;
  saveWateringReminder(setting: ReminderSetting): Promise<void>;
}

const USER_ID = 1;

export class SqliteReminderRepository implements ReminderRepository {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
  }

  async getWateringReminder(): Promise<ReminderSetting | null> {
    const row = await this.db.getFirstAsync<{ remind_at: string; enabled: number }>(
      'SELECT remind_at, enabled FROM reminders WHERE user_id = ? AND type_id IS NULL ORDER BY id LIMIT 1',
      [USER_ID],
    );
    return row ? { time: row.remind_at, enabled: row.enabled === 1 } : null;
  }

  async saveWateringReminder({ time, enabled }: ReminderSetting): Promise<void> {
    const row = await this.db.getFirstAsync<{ id: number }>(
      'SELECT id FROM reminders WHERE user_id = ? AND type_id IS NULL ORDER BY id LIMIT 1',
      [USER_ID],
    );
    if (row) {
      await this.db.runAsync('UPDATE reminders SET remind_at = ?, enabled = ? WHERE id = ?', [
        time,
        enabled ? 1 : 0,
        row.id,
      ]);
    } else {
      await this.db.runAsync(
        'INSERT INTO reminders (user_id, type_id, remind_at, enabled) VALUES (?, NULL, ?, ?)',
        [USER_ID, time, enabled ? 1 : 0],
      );
    }
  }
}
