import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import { makeWilted, resetAllData, seedDemoData, setWater } from '../data/demoData.ts';
import { pendingLocalMigrations } from '../data/localSchema.ts';
import { pendingMigrations } from '../data/schema.ts';
import { SqliteActivityRepository } from '../data/SqliteActivityRepository.ts';
import { SqliteLocalStore } from '../data/SqliteLocalStore.ts';
import { SqliteTreeRepository } from '../data/SqliteTreeRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import { StatsService } from '../logic/StatsService.ts';
import { WateringEngine } from '../logic/WateringEngine.ts';
import { toMainView } from '../presentation/mainView.ts';

/**
 * 개발용 체험 데이터 (내 기록 화면의 개발용 버튼)
 * 넣으면 메인·열매 팝업·기록 조회가 다 채워지고, 지우면 새 씨앗 하나만 남는지 확인한다.
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

const NOW = new Date(2026, 10, 24, 15, 0);

function setup() {
  const appDb = new DatabaseSync(':memory:');
  appDb.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) appDb.exec(m.sql);
  const localDb = new DatabaseSync(':memory:');
  for (const m of pendingLocalMigrations(0)) localDb.exec(m.sql);
  const app = asSqlDatabase(appDb);
  const local = asSqlDatabase(localDb);
  const engine = new WateringEngine(new SqliteTreeRepository(app));
  const stats = new StatsService({ activities: new SqliteActivityRepository(app), now: () => NOW.getTime() });
  const store = new SqliteLocalStore(local);
  const count = (db: DatabaseSync, sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return { appDb, localDb, app, local, engine, stats, store, count };
}

describe('체험용 기록 넣기', () => {
  test('나무가 다 자란 상태가 되고, 완성한 나무가 1그루 생긴다 (메인: 나무 2 · 완성)', async () => {
    const { app, local, engine, stats } = setup();
    await seedDemoData(app, local, NOW);
    const p = await engine.getProgress();
    assert.ok(p);
    assert.equal(p.isFinalStage, true);
    assert.equal((await engine.completedTrees()).length, 1);

    const view = toMainView(p, {
      todayCount: (await stats.today()).count,
      doneTypes: await stats.verifiedTypesSince(p.plantedAt),
      completedCount: 1,
      now: NOW,
    });
    assert.equal(view.mode, 'complete');
    assert.equal(view.treeLabel, '나무 2 · 완성');
    assert.deepEqual(view.fruits, ['walk', 'diary', 'meditation', 'reading', 'sleep'], '열매 5개가 다 달린다');
  });

  test('열매 팝업이 채워진다: 산책·명상 누적, 이번 달 수면, 일기·독후감', async () => {
    const { app, local, engine, stats, store } = setup();
    await seedDemoData(app, local, NOW);
    const p = await engine.getProgress();
    assert.ok(p);
    const walk = await stats.totalsSince('walk', p.plantedAt);
    assert.equal(walk.count, 6, '오늘 저녁 7시 산책은 아직 오지 않은 시각이라 빠진다 (지금 오후 3시)');
    assert.ok(walk.distanceM > 10_000);
    const meditation = await stats.totalsSince('meditation', p.plantedAt);
    assert.ok(meditation.count >= 9 && meditation.durationMin > 0);
    const sleep = await stats.sleepMonth(2026, 11);
    assert.ok(Object.keys(sleep.byDay).length >= 14);
    assert.ok(sleep.averageMin >= 390);
    assert.equal((await store.listDiaries(100)).length, 13);
    assert.deepEqual(
      (await store.listReadings(10)).map((r) => r.title).sort(),
      ['미움받을 용기', '아주 작은 습관의 힘', '어린 왕자'],
    );
  });

  test('독후감은 모두 200자 이상이라 인증된 기록이다', async () => {
    const { app, local, appDb } = setup();
    await seedDemoData(app, local, NOW);
    const rows = appDb
      .prepare(
        "SELECT l.char_count AS c, l.verified AS v FROM activity_logs l JOIN activity_types t ON t.id = l.type_id WHERE t.code = 'reading'",
      )
      .all() as { c: number; v: number }[];
    assert.equal(rows.length, 3);
    for (const r of rows) {
      assert.ok(r.c >= 200, `${r.c}자`);
      assert.equal(r.v, 1);
    }
  });

  test('기록 조회(최근 7일)에도 산책이 들어간다', async () => {
    const { app, local, stats } = setup();
    await seedDemoData(app, local, NOW);
    const week = await stats.lastDays(7);
    assert.ok(week.byType.walk > 0);
    assert.ok(week.count > 10);
  });
});

describe('기록 모두 지우기', () => {
  test('기록·나무·일기·독후감이 지워지고 새 씨앗 하나만 남는다', async () => {
    const { appDb, localDb, app, local, engine, count } = setup();
    await seedDemoData(app, local, NOW);
    await resetAllData(app, local, NOW);
    assert.equal(count(appDb, 'SELECT COUNT(*) AS n FROM activity_logs'), 0);
    assert.equal(count(appDb, 'SELECT COUNT(*) AS n FROM trees'), 1);
    assert.equal(count(localDb, 'SELECT COUNT(*) AS n FROM diary_entries'), 0);
    assert.equal(count(localDb, 'SELECT COUNT(*) AS n FROM reading_entries'), 0);
    const p = await engine.getProgress();
    assert.equal(p?.stage.name, '씨앗');
    assert.equal(p?.waterTotal, 0);
    assert.equal((await engine.completedTrees()).length, 0);
  });

  test('이른 아침에 넣어도 미래 시각의 기록은 생기지 않는다', async () => {
    const { app, local, appDb } = setup();
    const early = new Date(2026, 10, 24, 5, 0);
    await seedDemoData(app, local, early);
    const latest = (appDb.prepare('SELECT MAX(COALESCE(ended_at, started_at)) AS t FROM activity_logs').get() as { t: string }).t;
    assert.ok(new Date(latest).getTime() <= early.getTime(), latest);
  });

  test('지운 뒤 다시 넣어도 된다', async () => {
    const { app, local, engine } = setup();
    await resetAllData(app, local, NOW);
    await seedDemoData(app, local, NOW);
    assert.equal((await engine.getProgress())?.isFinalStage, true);
  });
});

describe('개발용 물 정하기', () => {
  test('물 45로 맞추면 묘목 단계, 어린 나무까지 15 남음', async () => {
    const { app, engine } = setup();
    await setWater(app, 45, NOW);
    const p = await engine.getProgress();
    assert.equal(p?.waterTotal, 45);
    assert.equal(p?.stage.name, '묘목');
    assert.equal(p?.waterToNextStage, 15);
  });

  test('100이면 다 자란 나무, 0이면 다시 씨앗', async () => {
    const { app, engine } = setup();
    await setWater(app, 100, NOW);
    assert.equal((await engine.getProgress())?.nextStage, null);
    await setWater(app, 0, NOW);
    assert.equal((await engine.getProgress())?.stage.name, '씨앗');
  });

  test('시든 나무도 되살아나고, 다 키운 나무는 바뀌지 않는다', async () => {
    const { app, appDb, local, engine } = setup();
    await seedDemoData(app, local, NOW);
    const before = await engine.completedTrees();
    appDb.exec("UPDATE trees SET status = 'wilted' WHERE status = 'growing'");
    await setWater(app, 20, NOW);
    const p = await engine.getProgress();
    assert.equal(p?.status, 'growing');
    assert.equal(p?.waterTotal, 20);
    assert.deepEqual(await engine.completedTrees(), before);
  });
});

describe('개발용 바로 시들게 하기', () => {
  test('지금 나무가 시든 상태가 되고, 물·단계는 그대로다', async () => {
    const { app, engine } = setup();
    await setWater(app, 35, NOW);
    await makeWilted(app, NOW);
    const p = await engine.getProgress();
    assert.equal(p?.status, 'wilted');
    assert.equal(p?.waterTotal, 35);
    assert.equal(p?.stage.name, '묘목');
  });

  test('마지막 물이 3일보다 전이라 다시 판정해도 시든 상태, 심은 시각도 그 앞이다', async () => {
    const { app, engine } = setup();
    await makeWilted(app, NOW);
    const p = await engine.getProgress();
    const last = new Date(p!.lastWateredAt!).getTime();
    assert.ok(NOW.getTime() - last > 3 * 24 * 60 * 60 * 1000);
    assert.ok(new Date(p!.plantedAt.includes('T') ? p!.plantedAt : p!.plantedAt + 'Z').getTime() <= last);
  });

  test('물을 받으면 다시 자란다', async () => {
    const { app, engine } = setup();
    await makeWilted(app, NOW);
    await engine.water({ verified: true, waterReward: 1 }, NOW);
    assert.equal((await engine.getProgress())?.status, 'growing');
  });
});
