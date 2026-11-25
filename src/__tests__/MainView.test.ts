import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import type { NewActivityLog } from '../data/ActivityRepository.ts';
import { pendingMigrations } from '../data/schema.ts';
import { SqliteActivityRepository } from '../data/SqliteActivityRepository.ts';
import { SqliteTreeRepository } from '../data/SqliteTreeRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import { StatsService } from '../logic/StatsService.ts';
import type { TreeProgress } from '../logic/WateringEngine.ts';
import { WateringEngine } from '../logic/WateringEngine.ts';
import { ACTIVITY_MENU, daysWithoutRecord, stagePercent, toMainView } from '../presentation/mainView.ts';

/**
 * Figma 시안 메인 화면 (기본 · 씨앗 심은 뒤 · 시들었을때 · 다 자랐을때)
 * 상태 카드, 물방울 게이지, 나무 이름 칩, 열매, 아래 버튼이 상태에 맞게 바뀌는지 확인한다.
 * 성장 단계: 씨앗 0 → 새싹 10 → 묘목 30 → 어린 나무 60 → 나무 100 (누적 물)
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

function setup(now = new Date('2026-11-24T03:00:00.000Z')) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) db.exec(m.sql);
  const sql = asSqlDatabase(db);
  const engine = new WateringEngine(new SqliteTreeRepository(sql));
  const activities = new SqliteActivityRepository(sql);
  const stats = new StatsService({ activities, now: () => now.getTime() });
  const addLog = (when: Date, log: Partial<NewActivityLog> = {}) =>
    activities.addLog({
      type: 'diary',
      startedAt: when.toISOString(),
      endedAt: null,
      durationMin: null,
      verified: true,
      waterGiven: 1,
      ...log,
    });
  return { db, engine, stats, addLog, now };
}

const ctx = (over: Partial<Parameters<typeof toMainView>[1]> = {}) => ({
  todayCount: 0,
  doneTypes: [],
  completedCount: 0,
  now: new Date('2026-11-24T03:00:00.000Z'),
  ...over,
});

async function progressAfter(water: number[]): Promise<TreeProgress> {
  const { engine } = setup();
  for (const w of water) await engine.water({ verified: true, waterReward: w }, new Date('2026-11-24T01:00:00.000Z'));
  const p = await engine.getProgress();
  assert.ok(p);
  return p;
}

describe('나무 상태에 심은 시각·마지막 물 준 시각이 들어 있다', () => {
  test('처음 씨앗은 심은 시각만 있고 물 준 시각은 없다', async () => {
    const p = await progressAfter([]);
    assert.ok(p.plantedAt.length > 0);
    assert.equal(p.lastWateredAt, null);
  });

  test('물을 받으면 그 시각이 들어간다 (구독으로 받은 상태도 같다)', async () => {
    const { engine } = setup();
    let pushed: TreeProgress | null = null;
    engine.subscribe((p) => (pushed = p));
    const at = new Date('2026-11-24T05:00:00.000Z');
    await engine.water({ verified: true, waterReward: 2 }, at);
    assert.equal((await engine.getProgress())?.lastWateredAt, at.toISOString());
    assert.equal((pushed as TreeProgress | null)?.lastWateredAt, at.toISOString());
  });
});

describe('메인 화면 상태', () => {
  test('기본: 오늘 기록이 없으면 "첫 기록을 시작해요", 있으면 "작은 실천, 큰 성장"', async () => {
    const p = await progressAfter([3]);
    const v = toMainView(p, ctx());
    assert.equal(v.mode, 'growing');
    assert.deepEqual(v.status, { caption: '오늘의 활동', title: '첫 기록을 시작해요', chip: '나의 성장', tone: 'normal' });
    assert.equal(toMainView(p, ctx({ todayCount: 2 })).status.title, '작은 실천, 큰 성장');
    assert.equal(v.primaryAction, 'activities');
  });

  test('물방울 게이지: 다음 단계까지 남은 물과 이번 단계에서 찬 비율', async () => {
    const p = await progressAfter([3]); // 씨앗(0) → 새싹(10)까지 3/10
    const v = toMainView(p, ctx());
    assert.deepEqual(v.gauge, { caption: '다음 단계까지', title: '물 7 남음', percent: 30, tone: 'water' });
  });

  test('나무 이름 칩: 완성한 나무 수 + 1번째 나무', async () => {
    const p = await progressAfter([3]);
    assert.equal(toMainView(p, ctx()).treeLabel, '나무 1 · 키우는 중');
    assert.equal(toMainView(p, ctx({ completedCount: 2 })).treeLabel, '나무 3 · 키우는 중');
  });

  test('씨앗 심은 뒤: 나무를 다 키우고 새로 심은 씨앗은 "새 씨앗을 심었어요"', async () => {
    const p = await progressAfter([]);
    const v = toMainView(p, ctx({ completedCount: 1 }));
    assert.equal(v.mode, 'seed');
    assert.equal(v.status.caption, '새 씨앗을 심었어요');
    assert.equal(v.status.chip, '씨앗');
    // 첫 번째 나무는 그냥 기본 상태
    assert.equal(toMainView(p, ctx()).mode, 'growing');
  });

  test('시들었을때: "N일째 기록이 없어요", 시듦 칩, 붉은 게이지', async () => {
    const { db, engine } = setup();
    await engine.water({ verified: true, waterReward: 3 }, new Date('2026-11-20T03:00:00.000Z'));
    db.exec("UPDATE trees SET status = 'wilted'");
    const p = await engine.getProgress();
    assert.ok(p);
    const v = toMainView(p, ctx({ now: new Date('2026-11-24T04:00:00.000Z') }));
    assert.equal(v.mode, 'wilted');
    assert.deepEqual(v.status, { caption: '4일째 기록이 없어요', title: '나무가 시들었어요', chip: '시듦', tone: 'danger' });
    assert.equal(v.gauge.tone, 'danger');
    assert.equal(v.gauge.title, '오늘 기록하면 살아나요');
    assert.equal(v.treeLabel, '나무 1 · 시듦');
  });

  test('다 자랐을때: 축하, 100%, 열매를 달고, 아래 버튼은 새 씨앗 심기', async () => {
    const p = await progressAfter([100]);
    const v = toMainView(p, ctx({ doneTypes: ['walk', 'diary'] }));
    assert.equal(v.mode, 'complete');
    assert.equal(v.status.title, '나무가 다 자랐어요');
    assert.equal(v.gauge.percent, 100);
    assert.equal(v.showFruits, true);
    assert.deepEqual(v.fruits, ['walk', 'diary']);
    assert.equal(v.primaryAction, 'plant');
  });

  test('다 자라기 전에는 열매를 달지 않는다 (시안의 열매 자리는 큰 나무에만 있다)', async () => {
    const p = await progressAfter([60]);
    assert.equal(toMainView(p, ctx({ doneTypes: ['walk'] })).showFruits, false);
  });
});

describe('계산 도우미', () => {
  test('게이지 %는 이번 단계 안에서 0~100', async () => {
    assert.equal(stagePercent(await progressAfter([])), 0);
    assert.equal(stagePercent(await progressAfter([20])), 50); // 새싹(10) → 묘목(30) 중 10/20
    assert.equal(stagePercent(await progressAfter([100])), 100);
  });

  test('기록 없는 날 수: 물을 한 번도 안 받았으면 심은 날부터, 최소 1일', async () => {
    const p = await progressAfter([]);
    const planted = new Date(p.plantedAt.includes('T') ? p.plantedAt : `${p.plantedAt.replace(' ', 'T')}Z`);
    assert.equal(daysWithoutRecord(p, new Date(planted.getTime() + 60_000)), 1);
    assert.equal(daysWithoutRecord(p, new Date(planted.getTime() + 3 * 86_400_000 + 1)), 3);
  });

  test('활동 선택 창에 수면까지 5개가 시안 순서로 있다', () => {
    assert.deepEqual(ACTIVITY_MENU.map((a) => a.label), ['산책', '명상', '일기', '독서', '수면']);
  });
});

describe('이 나무의 열매 (지금 나무에서 인증한 활동 종류)', () => {
  test('나무를 심은 뒤 인증한 활동만, 인증 실패는 빼고, 시안 순서로', async () => {
    const { stats, addLog } = setup();
    await addLog(new Date('2026-11-01T00:00:00.000Z'), { type: 'walk' }); // 심기 전
    await addLog(new Date('2026-11-20T00:00:00.000Z'), { type: 'diary' });
    await addLog(new Date('2026-11-21T00:00:00.000Z'), { type: 'sleep' });
    await addLog(new Date('2026-11-22T00:00:00.000Z'), { type: 'meditation', verified: false, waterGiven: 0 });
    await addLog(new Date('2026-11-23T00:00:00.000Z'), { type: 'diary' });
    assert.deepEqual(await stats.verifiedTypesSince('2026-11-10T00:00:00.000Z'), ['diary', 'sleep']);
  });

  test('첫 씨앗의 심은 시각(SQLite 형식 "2026-11-10 00:00:00")도 읽는다', async () => {
    const { stats, addLog } = setup();
    await addLog(new Date('2026-11-09T23:00:00.000Z'), { type: 'walk' });
    await addLog(new Date('2026-11-10T01:00:00.000Z'), { type: 'reading' });
    assert.deepEqual(await stats.verifiedTypesSince('2026-11-10 00:00:00'), ['reading']);
  });
});
