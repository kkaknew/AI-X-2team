import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import type { DailyNotification, PushClient } from '../data/PushClient.ts';
import { SqliteReminderRepository } from '../data/ReminderRepository.ts';
import { pendingMigrations } from '../data/schema.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import {
  NotificationPermissionError,
  parseReminderTime,
  ReminderService,
  WATERING_REMINDER_ID,
} from '../logic/ReminderService.ts';

/**
 * #15 [13] 물주기 리마인더
 * 완료 조건: 사용자가 설정한 시각에 푸시 알림이 온다.
 *
 * 실제 알림이 오는지는 휴대폰에서 확인한다. 여기서는
 * "설정한 시각 그대로 매일 알림이 예약되는가"와 "설정이 DB에 남는가"를 확인한다.
 */

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) db.exec(m.sql);
  return db;
}

/** Node 내장 SQLite를 expo-sqlite와 같은 모양(SqlDatabase)으로 감싼다 */
function asSqlDatabase(db: DatabaseSync): SqlDatabase {
  return {
    async getFirstAsync<T>(sql: string, params: SqlValue[]) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, params: SqlValue[]) {
      return db.prepare(sql).all(...params) as T[];
    },
    async runAsync(sql: string, params: SqlValue[]) {
      return db.prepare(sql).run(...params);
    },
  };
}

/** 휴대폰 알림 대신 예약 목록만 들고 있는 가짜 */
class FakePush implements PushClient {
  granted: boolean;
  /** 권한을 물었을 때 사용자가 허용할지 */
  willGrant = true;
  asked = 0;
  scheduled = new Map<string, DailyNotification>();

  constructor(granted = false) {
    this.granted = granted;
  }
  async hasPermission() {
    return this.granted;
  }
  async requestPermission() {
    if (!this.granted) {
      this.asked += 1;
      this.granted = this.willGrant;
    }
    return this.granted;
  }
  async scheduleDaily(n: DailyNotification) {
    this.scheduled.set(n.id, n);
  }
  async scheduleOnce() {}
  async cancel(id: string) {
    this.scheduled.delete(id);
  }
}

function setup(push = new FakePush()) {
  const db = freshDb();
  const repo = new SqliteReminderRepository(asSqlDatabase(db));
  const service = new ReminderService({ push, repo });
  const rows = () =>
    db
      .prepare('SELECT user_id, type_id, remind_at, enabled FROM reminders')
      .all()
      .map((r) => ({ ...r }));
  return { db, push, repo, service, rows };
}

describe('완료 조건: 사용자가 설정한 시각에 푸시 알림이 온다', () => {
  test('21:30으로 켜면 매일 21시 30분 알림이 예약되고 DB에 저장된다', async () => {
    const { push, service, rows } = setup();
    const saved = await service.update('21:30', true);

    assert.deepEqual(saved, { time: '21:30', enabled: true });
    const n = push.scheduled.get(WATERING_REMINDER_ID);
    assert.ok(n, '알림이 예약된다');
    assert.equal(n.hour, 21);
    assert.equal(n.minute, 30);
    assert.ok(n.title.length > 0 && n.body.length > 0);
    assert.deepEqual(rows(), [{ user_id: 1, type_id: null, remind_at: '21:30', enabled: 1 }]);
  });

  test('시각을 바꾸면 알림도 새 시각으로 바뀐다 (알림이 두 개 생기지 않는다)', async () => {
    const { push, service, rows } = setup();
    await service.update('21:30', true);
    await service.update('8:05', true);

    assert.equal(push.scheduled.size, 1);
    const n = push.scheduled.get(WATERING_REMINDER_ID);
    assert.equal(n?.hour, 8);
    assert.equal(n?.minute, 5);
    assert.deepEqual(rows(), [{ user_id: 1, type_id: null, remind_at: '08:05', enabled: 1 }]);
  });

  test('끄면 예약된 알림이 취소되고 시각은 기억한다', async () => {
    const { push, service } = setup();
    await service.update('21:30', true);
    await service.update('21:30', false);

    assert.equal(push.scheduled.size, 0);
    assert.deepEqual(await service.getSetting(), { time: '21:30', enabled: false });
  });
});

describe('권한과 입력 확인', () => {
  test('켤 때 권한이 없으면 묻고, 허용하면 예약한다', async () => {
    const { push, service } = setup(new FakePush(false));
    await service.update('21:00', true);
    assert.equal(push.asked, 1);
    assert.equal(push.scheduled.size, 1);
  });

  test('권한을 거절하면 에러가 나고, 켜진 것으로 저장하지 않는다', async () => {
    const push = new FakePush(false);
    push.willGrant = false;
    const { service, rows } = setup(push);
    await assert.rejects(service.update('21:00', true), NotificationPermissionError);
    assert.equal(push.scheduled.size, 0);
    assert.deepEqual(rows(), []);
  });

  test('끌 때는 권한을 묻지 않는다', async () => {
    const { push, service } = setup(new FakePush(false));
    await service.update('21:00', false);
    assert.equal(push.asked, 0);
  });

  test('시각 형식이 틀리면 에러가 나고 아무것도 바뀌지 않는다', async () => {
    const { push, service, rows } = setup();
    for (const bad of ['25:00', '9시', '21:60', '']) {
      await assert.rejects(service.update(bad, true), /시:분/);
    }
    assert.equal(push.scheduled.size, 0);
    assert.deepEqual(rows(), []);
  });

  test('parseReminderTime', () => {
    assert.deepEqual(parseReminderTime('07:00'), { hour: 7, minute: 0 });
    assert.deepEqual(parseReminderTime(' 9:05 '), { hour: 9, minute: 5 });
    assert.deepEqual(parseReminderTime('23:59'), { hour: 23, minute: 59 });
    assert.equal(parseReminderTime('24:00'), null);
    assert.equal(parseReminderTime('12:5'), null);
  });
});

describe('앱을 다시 켰을 때 (restore)', () => {
  test('저장된 설정이 켜져 있고 권한이 있으면 다시 예약한다', async () => {
    const { db, repo } = setup();
    await repo.saveWateringReminder({ time: '22:15', enabled: true });

    // 앱을 새로 켠 상황: 예약 목록이 비어 있는 새 PushClient
    const push = new FakePush(true);
    const service = new ReminderService({ push, repo: new SqliteReminderRepository(asSqlDatabase(db)) });
    await service.restore();
    const n = push.scheduled.get(WATERING_REMINDER_ID);
    assert.equal(n?.hour, 22);
    assert.equal(n?.minute, 15);
  });

  test('권한이 없으면 앱을 켜자마자 묻지 않고, 예약도 하지 않는다', async () => {
    const { repo } = setup();
    await repo.saveWateringReminder({ time: '22:15', enabled: true });
    const push = new FakePush(false);
    await new ReminderService({ push, repo }).restore();
    assert.equal(push.asked, 0);
    assert.equal(push.scheduled.size, 0);
  });

  test('꺼져 있거나 저장한 적 없으면 예약하지 않는다', async () => {
    const { push, service, repo } = setup(new FakePush(true));
    await service.restore();
    assert.equal(push.scheduled.size, 0);
    await repo.saveWateringReminder({ time: '22:15', enabled: false });
    await service.restore();
    assert.equal(push.scheduled.size, 0);
  });

  test('저장한 적 없으면 기본값은 21:00, 꺼짐', async () => {
    const { service } = setup();
    assert.deepEqual(await service.getSetting(), { time: '21:00', enabled: false });
  });
});
