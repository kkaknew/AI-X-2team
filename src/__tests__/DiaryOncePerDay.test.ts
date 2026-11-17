import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import { pendingLocalMigrations } from '../data/localSchema.ts';
import { MIGRATIONS, pendingMigrations } from '../data/schema.ts';
import { SqliteActivityRepository } from '../data/SqliteActivityRepository.ts';
import { SqliteLocalStore } from '../data/SqliteLocalStore.ts';
import { SqliteTreeRepository } from '../data/SqliteTreeRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import { ActivityRecorder, localDay } from '../logic/ActivityRecorder.ts';
import { ActivityVerifier } from '../logic/ActivityVerifier.ts';
import { WateringEngine } from '../logic/WateringEngine.ts';

/**
 * #10 후속: 일기는 하루 한 번만 물을 받고, 물은 1만 준다. (팀 결정)
 * - 같은 날 두 번째 일기부터는 저장·인증은 되지만 물은 0
 * - 앱을 껐다 켜도(ActivityRecorder를 새로 만들어도) 다시 받을 수 없다
 * - 다음 날에는 다시 물을 받는다
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

/** 휴대폰 시간대 기준 그날 정오 */
const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

function setup() {
  const appDb = new DatabaseSync(':memory:');
  appDb.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) appDb.exec(m.sql);
  const localDb = new DatabaseSync(':memory:');
  for (const m of pendingLocalMigrations(0)) localDb.exec(m.sql);

  const app = asSqlDatabase(appDb);
  const local = asSqlDatabase(localDb);
  const clock = { now: noon(2026, 11, 17) };

  /** 앱을 새로 켠 것처럼 ActivityRecorder를 새로 만든다 (DB는 그대로) */
  const openApp = () => {
    const watering = new WateringEngine(new SqliteTreeRepository(app));
    return new ActivityRecorder({
      verifier: new ActivityVerifier(),
      loadActivityType: async (code) => {
        const row = appDb
          .prepare('SELECT rule, water_reward FROM activity_types WHERE code = ?')
          .get(code) as { rule: string; water_reward: number };
        return { rule: row.rule, waterReward: row.water_reward };
      },
      water: (input) => watering.water(input),
      location: {} as never,
      now: () => clock.now,
      localStore: new SqliteLocalStore(local),
      activities: new SqliteActivityRepository(app),
    });
  };

  const waterTotal = () =>
    (appDb.prepare('SELECT water_total AS w FROM trees WHERE id = 1').get() as { w: number }).w;
  const diaryCount = () =>
    (localDb.prepare('SELECT COUNT(*) AS n FROM diary_entries').get() as { n: number }).n;

  return { appDb, clock, openApp, waterTotal, diaryCount };
}

describe('일기 물 보상', () => {
  test('일기 1편의 물 보상은 1이다', () => {
    const { appDb } = setup();
    const row = appDb.prepare("SELECT water_reward AS w FROM activity_types WHERE code = 'diary'").get() as { w: number };
    assert.equal(row.w, 1);
  });

  test('일기를 쓰면 물 1을 받는다', async () => {
    const { openApp, waterTotal } = setup();
    const r = await openApp().recordDiary('오늘 하루도 수고했다');
    assert.equal(r.verified, true);
    assert.equal(r.waterGiven, 1);
    assert.equal(waterTotal(), 1);
  });

  test('이미 설치된 앱(보상 2로 저장된 DB)도 업데이트하면 1로 바뀐다', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(MIGRATIONS[0]); // 예전 버전 DB (user_version 1)
    assert.equal((db.prepare("SELECT water_reward AS w FROM activity_types WHERE code = 'diary'").get() as { w: number }).w, 2);
    for (const m of pendingMigrations(1)) db.exec(m.sql);
    assert.equal((db.prepare("SELECT water_reward AS w FROM activity_types WHERE code = 'diary'").get() as { w: number }).w, 1);
  });
});

describe('하루 한 번만 물을 받는다', () => {
  test('같은 날 두 번째 일기는 저장·인증되지만 물은 받지 않는다', async () => {
    const { clock, openApp, waterTotal, diaryCount } = setup();
    const recorder = openApp();
    await recorder.recordDiary('아침 일기');
    clock.now += 3 * HOUR;
    const second = await recorder.recordDiary('저녁 일기');
    assert.equal(second.verified, true);
    assert.equal(second.waterGiven, 0);
    assert.match(second.notice ?? '', /오늘은 이미 일기로 물을 받았어요/);
    assert.ok(second.entryId, '일기 본문은 저장된다');
    assert.equal(diaryCount(), 2);
    assert.equal(waterTotal(), 1);
  });

  test('앱을 껐다 켜도 같은 날에는 다시 물을 받을 수 없다', async () => {
    const { clock, openApp, waterTotal } = setup();
    await openApp().recordDiary('첫 일기');
    clock.now += 1 * HOUR;
    const afterRestart = await openApp().recordDiary('다시 켜고 쓴 일기');
    assert.equal(afterRestart.waterGiven, 0);
    assert.equal(waterTotal(), 1);
  });

  test('다음 날에는 다시 물을 받는다', async () => {
    const { clock, openApp, waterTotal } = setup();
    await openApp().recordDiary('17일 일기');
    clock.now = noon(2026, 11, 18);
    const nextDay = await openApp().recordDiary('18일 일기');
    assert.equal(nextDay.waterGiven, 1);
    assert.equal(nextDay.notice, undefined);
    assert.equal(waterTotal(), 2);
  });

  test('빈 일기(인증 실패)는 횟수에 들어가지 않는다', async () => {
    const { clock, openApp, waterTotal } = setup();
    const recorder = openApp();
    await recorder.recordDiary('   ');
    clock.now += HOUR;
    const r = await recorder.recordDiary('이제 제대로 씀');
    assert.equal(r.waterGiven, 1);
    assert.equal(waterTotal(), 1);
  });

  test('activity_logs에는 두 번째 일기가 "인증됨, 물 0"으로 남는다', async () => {
    const { clock, openApp, appDb } = setup();
    const recorder = openApp();
    await recorder.recordDiary('하나');
    clock.now += HOUR;
    await recorder.recordDiary('둘');
    const rows = appDb.prepare('SELECT verified, water_given FROM activity_logs ORDER BY id').all() as Record<string, number>[];
    assert.deepEqual(rows.map((r) => ({ ...r })), [
      { verified: 1, water_given: 1 },
      { verified: 1, water_given: 0 },
    ]);
  });
});

describe('localDay', () => {
  test('휴대폰 시간대 기준 날짜를 돌려준다', () => {
    assert.equal(localDay(new Date(2026, 10, 17, 0, 5)), '2026-11-17');
    assert.equal(localDay(new Date(2026, 10, 17, 23, 55)), '2026-11-17');
    assert.equal(localDay(new Date(2026, 10, 18, 0, 0)), '2026-11-18');
  });
});
