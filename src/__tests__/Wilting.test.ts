import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import type { DailyNotification, PushClient } from '../data/PushClient.ts';
import { SqliteReminderRepository } from '../data/ReminderRepository.ts';
import { pendingMigrations } from '../data/schema.ts';
import { SqliteTreeRepository, toIso } from '../data/SqliteTreeRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import { ReminderService, WATERING_REMINDER_ID, WILT_WARNING_ID } from '../logic/ReminderService.ts';
import { WateringEngine } from '../logic/WateringEngine.ts';
import { WILT_AFTER_DAYS, WiltingChecker } from '../logic/WiltingChecker.ts';
import { toTreeView } from '../presentation/treeView.ts';

/**
 * #17 [15] 시듦 판정
 * 완료 조건: 마지막 인증 활동 후 기준 기간(3일)이 지나면 나무 상태가 시듦으로 바뀌고 나무 화면에 표시된다.
 * 시들기 하루 전에 경고 알림이 간다.
 */
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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = new Date('2026-11-18T03:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) db.exec(m.sql);
  // 씨앗을 T0에 심은 것으로 맞춘다 (SQLite datetime 형식, UTC)
  db.exec(`UPDATE trees SET planted_at = '2026-11-18 03:00:00' WHERE id = 1`);
  const trees = new SqliteTreeRepository(asSqlDatabase(db));
  const engine = new WateringEngine(trees);
  const checker = new WiltingChecker(trees);
  const status = () => (db.prepare('SELECT status FROM trees WHERE id = 1').get() as { status: string }).status;
  const water = (when: Date) => engine.water({ verified: true, waterReward: 1 }, when);
  return { db, engine, checker, status, water };
}

/** 휴대폰 알림 대신 예약 목록만 들고 있는 가짜 */
class FakePush implements PushClient {
  scheduled = new Map<string, { at: Date; title: string; body: string }>();
  daily = new Map<string, DailyNotification>();
  granted = true;
  asked = 0;
  async hasPermission() {
    return this.granted;
  }
  async requestPermission() {
    this.asked += 1;
    return this.granted;
  }
  async scheduleDaily(n: DailyNotification) {
    this.daily.set(n.id, n);
  }
  async scheduleOnce(id: string, at: Date, title: string, body: string) {
    this.scheduled.set(id, { at, title, body });
  }
  async cancel(id: string) {
    this.scheduled.delete(id);
    this.daily.delete(id);
  }
}

/** 시듦 경고용 ReminderService (DB는 리마인더 설정용으로만 쓴다) */
function reminderService(db: DatabaseSync, push: PushClient, now: () => number) {
  return new ReminderService({ push, repo: new SqliteReminderRepository(asSqlDatabase(db)), now });
}

describe('시듦 판정', () => {
  test(`기본 기준 기간은 ${WILT_AFTER_DAYS}일이다`, () => {
    assert.equal(WILT_AFTER_DAYS, 3);
  });

  test('마지막 물주기 후 3일이 안 지나면 그대로 자란다', async () => {
    const { checker, status, water } = setup();
    await water(at(0));
    const s = await checker.check(at(3 * DAY - 1));
    assert.equal(s?.status, 'growing');
    assert.equal(s?.wiltedNow, false);
    assert.equal(s?.remainingMs, 1);
    assert.equal(status(), 'growing');
  });

  test('마지막 물주기 후 3일이 지나면 시듦으로 바뀌고 DB에 저장된다', async () => {
    const { checker, status, water } = setup();
    await water(at(0));
    const s = await checker.check(at(3 * DAY));
    assert.equal(s?.status, 'wilted');
    assert.equal(s?.wiltedNow, true);
    assert.equal(s?.remainingMs, 0);
    assert.equal(status(), 'wilted');
  });

  test('물을 받으면 시드는 시각이 그만큼 뒤로 밀린다', async () => {
    const { checker, water } = setup();
    await water(at(0));
    await water(at(2 * DAY));
    const s = await checker.check(at(4 * DAY));
    assert.equal(s?.status, 'growing');
    assert.equal(s?.wiltsAt.toISOString(), at(5 * DAY).toISOString());
  });

  test('물을 한 번도 안 받았으면 씨앗을 심은 시각부터 센다', async () => {
    const { checker } = setup();
    assert.equal((await checker.check(at(3 * DAY - HOUR)))?.status, 'growing');
    const s = await checker.check(at(3 * DAY));
    assert.equal(s?.lastActiveAt.toISOString(), T0.toISOString());
    assert.equal(s?.status, 'wilted');
  });

  test('이미 시든 나무는 다시 판정해도 wiltedNow가 false다 (화면을 계속 다시 그리지 않게)', async () => {
    const { checker } = setup();
    await checker.check(at(3 * DAY));
    const again = await checker.check(at(4 * DAY));
    assert.equal(again?.status, 'wilted');
    assert.equal(again?.wiltedNow, false);
  });

  test('완료된 나무만 있고 키우는 나무가 없으면 판정하지 않는다', async () => {
    const { db, checker } = setup();
    db.exec("UPDATE trees SET status = 'completed'");
    assert.equal(await checker.check(at(10 * DAY)), null);
  });

  test('기준 기간을 바꿀 수 있다', async () => {
    const { db } = setup();
    const checker = new WiltingChecker(new SqliteTreeRepository(asSqlDatabase(db)), { wiltAfterDays: 5 });
    assert.equal((await checker.check(at(4 * DAY)))?.status, 'growing');
    assert.equal((await checker.check(at(5 * DAY)))?.status, 'wilted');
  });
});

describe('시든 나무 살리기', () => {
  test('시든 나무가 물을 받으면 다시 자란다', async () => {
    const { checker, status, water } = setup();
    await checker.check(at(3 * DAY));
    assert.equal(status(), 'wilted');
    const r = await water(at(3 * DAY + HOUR));
    assert.equal(r.revived, true);
    assert.equal(status(), 'growing');
  });

  test('살아난 뒤에는 그 시각부터 다시 3일을 센다', async () => {
    const { checker, water } = setup();
    await checker.check(at(3 * DAY));
    await water(at(3 * DAY + HOUR));
    const s = await checker.check(at(5 * DAY));
    assert.equal(s?.status, 'growing');
    assert.equal(s?.wiltsAt.toISOString(), at(6 * DAY + HOUR).toISOString());
  });

  test('시들지 않은 나무에 물을 주면 revived는 false', async () => {
    const { water } = setup();
    assert.equal((await water(at(HOUR))).revived, false);
  });

  test('인증되지 않은 활동(물 0)으로는 살아나지 않는다', async () => {
    const { engine, checker, status } = setup();
    await checker.check(at(3 * DAY));
    const r = await engine.water({ verified: false, waterReward: 1 }, at(3 * DAY + HOUR));
    assert.equal(r.revived, false);
    assert.equal(status(), 'wilted');
  });
});

describe('나무 화면 표시', () => {
  test('시들면 나무 화면에 안내가 나온다', async () => {
    const { engine, checker } = setup();
    await checker.check(at(3 * DAY));
    const progress = await engine.getProgress();
    assert.equal(progress?.status, 'wilted');
    assert.match(toTreeView(progress!).statusNote ?? '', /시들었어요/);
  });

  test('refresh()는 시든 상태를 구독자(나무 화면)에게 바로 알린다', async () => {
    const { engine, checker } = setup();
    const seen: string[] = [];
    engine.subscribe((p) => seen.push(p.status));
    await checker.check(at(3 * DAY));
    await engine.refresh();
    assert.deepEqual(seen, ['wilted']);
  });

  test('살아나면 구독자에게 growing으로 알린다', async () => {
    const { engine, checker, water } = setup();
    await checker.check(at(3 * DAY));
    const seen: string[] = [];
    engine.subscribe((p) => seen.push(p.status));
    await water(at(3 * DAY + HOUR));
    assert.deepEqual(seen, ['growing']);
  });
});

describe('시들기 하루 전 경고 알림', () => {
  test('시들기 하루 전 시각에 알림을 예약한다', async () => {
    const { db, checker, water } = setup();
    await water(at(0));
    const push = new FakePush();
    const reminders = reminderService(db, push, () => at(HOUR).getTime());
    const when = await reminders.syncWiltWarning(await checker.check(at(HOUR)));
    assert.equal(when?.toISOString(), at(2 * DAY).toISOString());
    assert.equal(push.scheduled.get(WILT_WARNING_ID)?.at.toISOString(), at(2 * DAY).toISOString());
    assert.match(push.scheduled.get(WILT_WARNING_ID)!.body, /내일이면 나무가 시들 수 있어요/);
  });

  test('물을 다시 받으면 알림이 새 시각으로 바뀐다 (알림은 1개만)', async () => {
    const { db, checker, water } = setup();
    const push = new FakePush();
    let now = at(0).getTime();
    const reminders = reminderService(db, push, () => now);
    await water(at(0));
    await reminders.syncWiltWarning(await checker.check(at(0)));
    now = at(DAY).getTime();
    await water(at(DAY));
    await reminders.syncWiltWarning(await checker.check(at(DAY)));
    assert.equal(push.scheduled.size, 1);
    assert.equal(push.scheduled.get(WILT_WARNING_ID)?.at.toISOString(), at(3 * DAY).toISOString());
  });

  test('경고 시각이 이미 지났으면 예약하지 않는다', async () => {
    const { db, checker } = setup();
    const push = new FakePush();
    const now = at(2 * DAY + HOUR).getTime();
    const when = await reminderService(db, push, () => now).syncWiltWarning(await checker.check(new Date(now)));
    assert.equal(when, null);
    assert.equal(push.scheduled.size, 0);
  });

  test('이미 시들었으면 경고 알림을 지운다', async () => {
    const { db, checker } = setup();
    const push = new FakePush();
    push.scheduled.set(WILT_WARNING_ID, { at: at(2 * DAY), title: '', body: '' });
    const now = at(3 * DAY).getTime();
    await reminderService(db, push, () => now).syncWiltWarning(await checker.check(new Date(now)));
    assert.equal(push.scheduled.size, 0);
  });

  test('알림 권한이 없으면 예약하지 않고, 권한을 새로 묻지도 않는다', async () => {
    const { db, checker } = setup();
    const push = new FakePush();
    push.granted = false;
    const when = await reminderService(db, push, () => at(0).getTime()).syncWiltWarning(await checker.check(at(0)));
    assert.equal(when, null);
    assert.equal(push.scheduled.size, 0);
    assert.equal(push.asked, 0);
  });

  test('물주기 리마인더(#15) 예약은 건드리지 않는다', async () => {
    const { db, checker } = setup();
    const push = new FakePush();
    const reminders = reminderService(db, push, () => at(0).getTime());
    await reminders.update('21:00', true);
    await reminders.syncWiltWarning(await checker.check(at(0)));
    await reminders.syncWiltWarning(await checker.check(at(3 * DAY)));
    assert.equal(push.daily.has(WATERING_REMINDER_ID), true);
  });

  test('키우는 나무가 없으면 예약하지 않는다', async () => {
    const { db } = setup();
    const push = new FakePush();
    assert.equal(await reminderService(db, push, Date.now).syncWiltWarning(null), null);
  });
});

describe('toIso', () => {
  test("SQLite datetime('now') 값을 UTC ISO로 바꾼다", () => {
    assert.equal(toIso('2026-11-18 03:00:00'), '2026-11-18T03:00:00Z');
    assert.equal(new Date(toIso('2026-11-18 03:00:00')).toISOString(), '2026-11-18T03:00:00.000Z');
  });

  test('이미 ISO 형식이면 그대로 둔다', () => {
    assert.equal(toIso('2026-11-18T03:00:00.000Z'), '2026-11-18T03:00:00.000Z');
  });
});

describe('나무 완성(#16)과 함께', () => {
  test('다 자란 나무가 시든 상태에서 활동하면 새 씨앗이 자라는 상태로 시작한다', async () => {
    const { db, engine, checker, water } = setup();
    await engine.water({ verified: true, waterReward: 100 }, at(0));
    await checker.check(at(3 * DAY));
    const r = await water(at(3 * DAY + HOUR));
    assert.notEqual(r.treeId, 1, '새 씨앗에 물을 준다');
    const rows = db.prepare('SELECT id, status FROM trees ORDER BY id').all() as { id: number; status: string }[];
    assert.deepEqual(rows.map((t) => t.status), ['completed', 'growing']);
  });

  test('새 씨앗은 심은 시각부터 3일을 센다', async () => {
    const { engine, checker } = setup();
    await engine.water({ verified: true, waterReward: 100 }, at(0));
    await engine.plantNewSeed(at(DAY));
    const s = await checker.check(at(DAY));
    assert.equal(s?.status, 'growing');
    assert.equal(s?.wiltsAt.toISOString(), at(4 * DAY).toISOString());
  });
});
