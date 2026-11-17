import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import { pendingLocalMigrations } from '../data/localSchema.ts';
import { MIGRATIONS, pendingMigrations } from '../data/schema.ts';
import { SqliteActivityRepository } from '../data/SqliteActivityRepository.ts';
import { SqliteLocalStore } from '../data/SqliteLocalStore.ts';
import { SqliteTreeRepository } from '../data/SqliteTreeRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import { ActivityRecorder } from '../logic/ActivityRecorder.ts';
import { ActivityVerifier } from '../logic/ActivityVerifier.ts';
import { WateringEngine } from '../logic/WateringEngine.ts';

/**
 * #12 [10] 독서 인증(독후감)
 * 완료 조건: 독후감을 기준 분량(200자) 이상 작성하면 인증된다. 기준 미만이면 저장은 되지만 인증되지 않는다.
 * 팀 결정: 인증되면 물 1, 하루(휴대폰 날짜)에 한 번만 받는다. (일기 #10과 같은 방식)
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

/** 글자 수가 n인 독후감 */
const report = (n: number, ch = '책') => ch.repeat(n);

function setup() {
  const appDb = new DatabaseSync(':memory:');
  appDb.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) appDb.exec(m.sql);
  const localDb = new DatabaseSync(':memory:');
  for (const m of pendingLocalMigrations(0)) localDb.exec(m.sql);

  const app = asSqlDatabase(appDb);
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
      localStore: new SqliteLocalStore(asSqlDatabase(localDb)),
      activities: new SqliteActivityRepository(app),
    });
  };

  const waterTotal = () =>
    (appDb.prepare('SELECT water_total AS w FROM trees WHERE id = 1').get() as { w: number }).w;
  const savedCount = () =>
    (localDb.prepare('SELECT COUNT(*) AS n FROM reading_entries').get() as { n: number }).n;

  return { appDb, localDb, clock, openApp, waterTotal, savedCount };
}

describe('200자 기준으로 인증', () => {
  test('200자 이상이면 인증되고 물 1을 받는다', async () => {
    const { openApp, waterTotal, savedCount } = setup();
    const r = await openApp().recordReading('데미안', report(200));
    assert.equal(r.verified, true);
    assert.equal(r.waterGiven, 1);
    assert.equal(r.charCount, 200);
    assert.equal(waterTotal(), 1);
    assert.equal(savedCount(), 1);
  });

  test('200자 미만이면 저장은 되지만 인증되지 않고 물도 없다', async () => {
    const { openApp, waterTotal, savedCount } = setup();
    const r = await openApp().recordReading('데미안', report(199));
    assert.equal(r.verified, false);
    assert.equal(r.waterGiven, 0);
    assert.notEqual(r.entryId, null);
    assert.deepEqual(r.reasons, ['독후감이 200자보다 짧아요 (199자)']);
    assert.match(r.notice ?? '', /독후감은 저장했어요/);
    assert.equal(savedCount(), 1);
    assert.equal(waterTotal(), 0);
  });

  test('글자 수는 앞뒤 공백을 빼고 센다', async () => {
    const { openApp } = setup();
    const r = await openApp().recordReading('', `   ${report(199)}   `);
    assert.equal(r.charCount, 199);
    assert.equal(r.verified, false);
  });

  test('빈 독후감은 저장하지 않는다', async () => {
    const { openApp, savedCount } = setup();
    const r = await openApp().recordReading('제목만', '   ');
    assert.equal(r.verified, false);
    assert.equal(r.entryId, null);
    assert.equal(savedCount(), 0);
  });
});

describe('물은 하루 한 번만', () => {
  test('같은 날 두 번째 독후감은 저장·인증되지만 물은 받지 않는다', async () => {
    const { clock, openApp, waterTotal, savedCount } = setup();
    const recorder = openApp();
    await recorder.recordReading('첫 책', report(250));
    clock.now += 3 * HOUR;
    const second = await recorder.recordReading('두 번째 책', report(300));
    assert.equal(second.verified, true);
    assert.equal(second.waterGiven, 0);
    assert.match(second.notice ?? '', /오늘은 이미 독후감으로 물을 받았어요/);
    assert.equal(waterTotal(), 1);
    assert.equal(savedCount(), 2);
  });

  test('앱을 껐다 켜도 같은 날에는 다시 받지 않는다', async () => {
    const { openApp, waterTotal } = setup();
    await openApp().recordReading('첫 책', report(200));
    const again = await openApp().recordReading('또', report(200));
    assert.equal(again.waterGiven, 0);
    assert.equal(waterTotal(), 1);
  });

  test('200자 미만으로 먼저 썼다면, 그날 200자 이상 쓸 때 물을 받는다', async () => {
    const { clock, openApp, waterTotal } = setup();
    const recorder = openApp();
    await recorder.recordReading('짧게', report(50));
    clock.now += HOUR;
    const r = await recorder.recordReading('제대로', report(220));
    assert.equal(r.waterGiven, 1);
    assert.equal(waterTotal(), 1);
  });

  test('다음 날에는 다시 물을 받는다', async () => {
    const { clock, openApp, waterTotal } = setup();
    await openApp().recordReading('월요일', report(200));
    clock.now = noon(2026, 11, 18);
    const next = await openApp().recordReading('화요일', report(200));
    assert.equal(next.waterGiven, 1);
    assert.equal(waterTotal(), 2);
  });

  test('일기로 물을 받은 날에도 독후감 물은 따로 받는다', async () => {
    const { openApp, waterTotal } = setup();
    const recorder = openApp();
    await recorder.recordDiary('오늘 일기');
    const r = await recorder.recordReading('책', report(200));
    assert.equal(r.waterGiven, 1);
    assert.equal(waterTotal(), 2);
  });
});

describe('본문은 기기 안 개인 기록 DB에만', () => {
  test('제목·본문은 개인 기록 DB에 있고, 앱 DB에는 글자 수·인증 여부·물만 남는다', async () => {
    const { appDb, localDb, openApp } = setup();
    const body = `숨은 문장${report(200)}`;
    await openApp().recordReading('비밀의 책 제목', body);

    const saved = localDb.prepare('SELECT title, body, char_count FROM reading_entries').get() as {
      title: string;
      body: string;
      char_count: number;
    };
    assert.equal(saved.title, '비밀의 책 제목');
    assert.equal(saved.body, body);
    assert.equal(saved.char_count, 205);

    const log = appDb
      .prepare("SELECT char_count, verified, water_given FROM activity_logs WHERE type_id = (SELECT id FROM activity_types WHERE code = 'reading')")
      .get() as { char_count: number; verified: number; water_given: number };
    assert.deepEqual({ ...log }, { char_count: 205, verified: 1, water_given: 1 });

    const appText = JSON.stringify(appDb.prepare('SELECT * FROM activity_logs').all());
    assert.ok(!appText.includes('숨은 문장') && !appText.includes('비밀의 책'), appText);
  });

  test('최근 독후감을 최근 것부터 볼 수 있다', async () => {
    const { clock, openApp } = setup();
    const recorder = openApp();
    await recorder.recordReading('A', report(10));
    clock.now += HOUR;
    await recorder.recordReading('B', report(10));
    assert.deepEqual((await recorder.recentReadings()).map((r) => r.title), ['B', 'A']);
  });
});

describe('물 보상 값', () => {
  test('독서 물 보상은 1이다', () => {
    const { appDb } = setup();
    const row = appDb.prepare("SELECT water_reward AS w FROM activity_types WHERE code = 'reading'").get() as { w: number };
    assert.equal(row.w, 1);
  });

  test('이미 설치된 앱(보상 3으로 저장된 DB)도 업데이트하면 1로 바뀐다', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(MIGRATIONS[0]);
    const get = () => (db.prepare("SELECT water_reward AS w FROM activity_types WHERE code = 'reading'").get() as { w: number }).w;
    assert.equal(get(), 3);
    for (const m of pendingMigrations(1)) db.exec(m.sql);
    assert.equal(get(), 1);
  });
});
