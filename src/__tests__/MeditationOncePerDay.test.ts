import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import { MIGRATIONS, pendingMigrations } from '../data/schema.ts';
import { SqliteActivityRepository } from '../data/SqliteActivityRepository.ts';
import { SqliteTreeRepository } from '../data/SqliteTreeRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import { ActivityRecorder } from '../logic/ActivityRecorder.ts';
import { ActivityVerifier } from '../logic/ActivityVerifier.ts';
import { WateringEngine } from '../logic/WateringEngine.ts';

/**
 * #11 후속: 명상은 하루 한 번만 물을 받고, 물은 1만 준다. (일기·수면·독서와 같은 방식)
 * - 같은 날 두 번째 명상부터는 인증은 되지만 물은 0
 * - 앱을 껐다 켜도(ActivityRecorder를 새로 만들어도) 다시 받을 수 없다
 * - 인증에 실패한 명상은 물을 받은 것으로 치지 않는다
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

/** 휴대폰 시간대 기준 그날 h시 */
const at = (y: number, m: number, d: number, h: number, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

/** 음악을 끝까지, 조작·이탈 없이 들은 명상 */
const good = { type: 'meditation', fullyPlayed: true, touched: false, leftApp: false } as const;

function setup() {
  const appDb = new DatabaseSync(':memory:');
  appDb.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) appDb.exec(m.sql);
  const app = asSqlDatabase(appDb);
  const clock = { now: at(2026, 11, 18, 9) };

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
      location: {
        startWalk: async () => {},
        stopWalk: async () => ({ distanceM: 0, durationSec: 0, startedAt: '', endedAt: '' }),
        isWalking: () => false,
      },
      activities: new SqliteActivityRepository(app),
      now: () => clock.now,
    });
  };

  const treeWater = () => (appDb.prepare('SELECT water_total AS w FROM trees WHERE id = 1').get() as { w: number }).w;
  const meditationLogs = () =>
    (
      appDb
        .prepare(
          `SELECT l.verified, l.water_given FROM activity_logs l
           JOIN activity_types t ON t.id = l.type_id WHERE t.code = 'meditation' ORDER BY l.id`,
        )
        .all() as { verified: number; water_given: number }[]
    ).map((r) => ({ ...r }));

  return { appDb, clock, openApp, treeWater, meditationLogs };
}

describe('명상 물 보상', () => {
  test('명상 보상은 물 1이다 (5번 마이그레이션)', () => {
    const { appDb } = setup();
    const row = appDb.prepare("SELECT water_reward AS w FROM activity_types WHERE code = 'meditation'").get() as {
      w: number;
    };
    assert.equal(row.w, 1);
  });

  test('인증되면 나무에 물 1이 쌓인다', async () => {
    const { openApp, treeWater } = setup();
    const result = await openApp().recordMeditation(good);
    assert.equal(result.verified, true);
    assert.equal(result.waterGiven, 1);
    assert.equal(result.notice, undefined);
    assert.equal(treeWater(), 1);
  });

  test('이미 설치된 앱(4번까지 적용)도 다음 실행 때 보상이 2에서 1로 바뀐다', () => {
    const db = new DatabaseSync(':memory:');
    for (const sql of MIGRATIONS.slice(0, 4)) db.exec(sql);
    const reward = () =>
      (db.prepare("SELECT water_reward AS w FROM activity_types WHERE code = 'meditation'").get() as { w: number }).w;
    assert.equal(reward(), 2);
    for (const m of pendingMigrations(4)) db.exec(m.sql);
    assert.equal(reward(), 1);
  });
});

describe('하루 한 번', () => {
  test('같은 날 두 번째 명상은 인증되지만 물은 주지 않고 안내를 보여준다', async () => {
    const { clock, openApp, treeWater } = setup();
    const recorder = openApp();
    await recorder.recordMeditation(good);

    clock.now = at(2026, 11, 18, 21);
    const second = await recorder.recordMeditation(good);
    assert.equal(second.verified, true);
    assert.equal(second.waterGiven, 0);
    assert.equal(second.notice, '오늘은 이미 명상으로 물을 받았어요. 물은 내일 다시 받을 수 있어요');
    assert.equal(treeWater(), 1, '나무에는 물 1만 쌓인다');
  });

  test('앱을 껐다 켜도 같은 날에는 다시 물을 받을 수 없다', async () => {
    const { clock, openApp, treeWater } = setup();
    await openApp().recordMeditation(good);

    clock.now = at(2026, 11, 18, 22);
    const result = await openApp().recordMeditation(good);
    assert.equal(result.waterGiven, 0);
    assert.equal(treeWater(), 1);
  });

  test('자정이 지나면(다음 날) 다시 물을 받는다', async () => {
    const { clock, openApp, treeWater } = setup();
    clock.now = at(2026, 11, 18, 23, 50);
    await openApp().recordMeditation(good);

    clock.now = at(2026, 11, 19, 0, 10);
    assert.equal((await openApp().recordMeditation(good)).waterGiven, 1);
    assert.equal(treeWater(), 2);
  });

  test('인증에 실패한 명상은 횟수에 들지 않는다 (실패 후 다시 성공하면 물을 받는다)', async () => {
    const { clock, openApp } = setup();
    const recorder = openApp();
    const failed = await recorder.recordMeditation({ ...good, touched: true });
    assert.equal(failed.verified, false);
    assert.equal(failed.notice, undefined, '실패에는 하루 한 번 안내를 붙이지 않는다');

    clock.now = at(2026, 11, 18, 10);
    assert.equal((await recorder.recordMeditation(good)).waterGiven, 1);
  });

  test('성공·실패 모두 활동 기록에 남는다', async () => {
    const { clock, openApp, meditationLogs } = setup();
    const recorder = openApp();
    await recorder.recordMeditation({ ...good, leftApp: true });
    clock.now = at(2026, 11, 18, 10);
    await recorder.recordMeditation(good);
    clock.now = at(2026, 11, 18, 11);
    await recorder.recordMeditation(good);
    assert.deepEqual(meditationLogs(), [
      { verified: 0, water_given: 0 },
      { verified: 1, water_given: 1 },
      { verified: 1, water_given: 0 },
    ]);
  });

  test('명상을 시작하기 전에 오늘 이미 물을 받았는지 알 수 있다', async () => {
    const { clock, openApp } = setup();
    const recorder = openApp();
    assert.equal(await recorder.meditationWateredToday(), false);
    await recorder.recordMeditation(good);
    assert.equal(await recorder.meditationWateredToday(), true);

    clock.now = at(2026, 11, 19, 8);
    assert.equal(await recorder.meditationWateredToday(), false, '다음 날에는 다시 받을 수 있다');
  });

  test('다른 활동으로 받은 물은 명상과 상관없다', async () => {
    const { openApp } = setup();
    const recorder = openApp();
    await recorder.recordDiary('오늘은 산책을 했다');
    assert.equal(await recorder.meditationWateredToday(), false);
    assert.equal((await recorder.recordMeditation(good)).waterGiven, 1);
  });
});
