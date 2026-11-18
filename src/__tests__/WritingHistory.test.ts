import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import { pendingLocalMigrations } from '../data/localSchema.ts';
import { pendingMigrations } from '../data/schema.ts';
import { SqliteActivityRepository } from '../data/SqliteActivityRepository.ts';
import { SqliteLocalStore } from '../data/SqliteLocalStore.ts';
import { SqliteTreeRepository } from '../data/SqliteTreeRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import { ActivityRecorder } from '../logic/ActivityRecorder.ts';
import { ActivityVerifier } from '../logic/ActivityVerifier.ts';
import { WateringEngine } from '../logic/WateringEngine.ts';

/**
 * 쓴 일기·독후감 다시 보기
 * - 활동 기록 화면의 일기·독서 아래에 "지난 일기/독후감" 목록을 보여준다 (ActivityRecorder.recentWritings)
 * - 내용은 기기 안 개인 기록 DB에서만 읽는다
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
const LONG = '책을 읽고 느낀 점을 길게 적었다. '.repeat(12); // 200자 이상

function setup(withStore = true) {
  const appDb = new DatabaseSync(':memory:');
  appDb.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) appDb.exec(m.sql);
  const localDb = new DatabaseSync(':memory:');
  for (const m of pendingLocalMigrations(0)) localDb.exec(m.sql);

  const app = asSqlDatabase(appDb);
  const clock = { now: new Date(2026, 10, 18, 9, 0).getTime() };
  const watering = new WateringEngine(new SqliteTreeRepository(app));
  const recorder = new ActivityRecorder({
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
    localStore: withStore ? new SqliteLocalStore(asSqlDatabase(localDb)) : undefined,
    activities: new SqliteActivityRepository(app),
  });
  return { recorder, clock };
}

describe('지난 일기 다시 보기', () => {
  test('쓴 일기를 최근 것부터 전체 내용 그대로 다시 볼 수 있다', async () => {
    const { recorder, clock } = setup();
    await recorder.recordDiary('아침에 산책했다.');
    clock.now += 3 * HOUR;
    await recorder.recordDiary('  저녁에는 책을 읽었다.\n내일도 힘내자.  ');

    const list = await recorder.recentWritings('diary');
    assert.deepEqual(
      list.map((e) => e.body),
      ['저녁에는 책을 읽었다.\n내일도 힘내자.', '아침에 산책했다.'],
    );
    assert.equal(list[0].title, '', '일기는 제목이 없다');
    assert.equal(list[0].writtenAt, new Date(clock.now).toISOString());
    assert.equal(list[1].charCount, 9);
  });

  test('물을 받지 못한 두 번째 일기도 목록에 보인다', async () => {
    const { recorder, clock } = setup();
    await recorder.recordDiary('첫 번째');
    clock.now += HOUR;
    const second = await recorder.recordDiary('두 번째');
    assert.equal(second.waterGiven, 0);
    assert.equal((await recorder.recentWritings('diary')).length, 2);
  });

  test('빈 일기는 목록에 생기지 않는다', async () => {
    const { recorder } = setup();
    await recorder.recordDiary('   ');
    assert.deepEqual(await recorder.recentWritings('diary'), []);
  });

  test('보여줄 개수를 정할 수 있다', async () => {
    const { recorder, clock } = setup();
    for (let i = 1; i <= 5; i++) {
      await recorder.recordDiary(`일기 ${i}`);
      clock.now += HOUR;
    }
    const list = await recorder.recentWritings('diary', 3);
    assert.deepEqual(list.map((e) => e.body), ['일기 5', '일기 4', '일기 3']);
  });
});

describe('지난 독후감 다시 보기', () => {
  test('책 제목과 독후감 내용을 다시 볼 수 있다', async () => {
    const { recorder } = setup();
    await recorder.recordReading('  어린 왕자 ', LONG);
    const [entry] = await recorder.recentWritings('reading');
    assert.equal(entry.title, '어린 왕자');
    assert.equal(entry.body, LONG.trim());
  });

  test('200자가 안 돼 인증되지 않은 독후감도 목록에 보인다', async () => {
    const { recorder } = setup();
    const r = await recorder.recordReading('', '짧은 감상');
    assert.equal(r.verified, false);
    const list = await recorder.recentWritings('reading');
    assert.deepEqual(list.map((e) => e.body), ['짧은 감상']);
  });

  test('일기와 독후감 목록은 섞이지 않는다', async () => {
    const { recorder } = setup();
    await recorder.recordDiary('일기입니다');
    await recorder.recordReading('책', LONG);
    assert.deepEqual((await recorder.recentWritings('diary')).map((e) => e.body), ['일기입니다']);
    assert.equal((await recorder.recentWritings('reading')).length, 1);
  });
});

describe('저장소가 없을 때', () => {
  test('DB가 준비되기 전에는 빈 목록을 돌려준다', async () => {
    const { recorder } = setup(false);
    assert.deepEqual(await recorder.recentWritings('diary'), []);
    assert.deepEqual(await recorder.recentWritings('reading'), []);
  });
});
