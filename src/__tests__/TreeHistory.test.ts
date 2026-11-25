import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import { seedDemoData } from '../data/demoData.ts';
import { pendingLocalMigrations } from '../data/localSchema.ts';
import { pendingMigrations } from '../data/schema.ts';
import { SqliteActivityRepository } from '../data/SqliteActivityRepository.ts';
import { SqliteTreeRepository } from '../data/SqliteTreeRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import { StatsService } from '../logic/StatsService.ts';
import { WateringEngine } from '../logic/WateringEngine.ts';
import type { CompletedTree, TreeProgress } from '../logic/WateringEngine.ts';
import { toHistoryView } from '../presentation/historyView.ts';
import {
  completionStats,
  daysBetween,
  dots,
  pastTreeView,
  period,
  treeRows,
  wiltPrompt,
} from '../presentation/treeHistoryView.ts';

/**
 * 시안 "내 기록"(나의 나무, 기록 조회), "메인화면 지난 나무", "나무 완성 · 새 씨앗",
 * "시든 나무 안내", "시들기 전 경고"에 쓰는 글자와 나무별 집계를 확인한다.
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

const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

const progress = (over: Partial<TreeProgress> = {}): TreeProgress => ({
  treeId: 3,
  status: 'growing',
  waterTotal: 13,
  stage: { id: 2, name: '새싹', waterRequired: 10 },
  stageNumber: 2,
  stageCount: 5,
  isFinalStage: false,
  nextStage: { id: 3, name: '묘목', waterRequired: 30 },
  waterToNextStage: 17,
  plantedAt: local(2026, 10, 1),
  lastWateredAt: null,
  ...over,
});

const completedTrees: CompletedTree[] = [
  { id: 2, plantedAt: local(2026, 8, 5), completedAt: local(2026, 9, 30), waterTotal: 100 },
  { id: 1, plantedAt: local(2026, 6, 1), completedAt: local(2026, 7, 20), waterTotal: 100 },
];

describe('나의 나무 목록', () => {
  test('지금 나무가 맨 위, 번호는 처음 심은 나무가 1 (시안: 나무 3 · 2 · 1)', () => {
    const rows = treeRows(progress(), completedTrees);
    assert.deepEqual(
      rows.map((r) => [r.name, r.period, r.chip, r.current]),
      [
        ['나무 3', '2026.10.01 ~ 키우는 중', '키우는 중', true],
        ['나무 2', '2026.08.05 ~ 09.30', '완성', false],
        ['나무 1', '2026.06.01 ~ 07.20', '완성', false],
      ],
    );
  });

  test('해가 바뀌면 끝 날짜에 연도도 쓴다', () => {
    assert.equal(period(local(2026, 12, 1), local(2027, 1, 20)), '2026.12.01 ~ 2027.01.20');
  });

  test('다 자랐지만 아직 새 씨앗을 안 심은 나무는 "완성"', () => {
    assert.equal(treeRows(progress({ isFinalStage: true }), [])[0].chip, '완성');
  });
});

describe('지난 나무 보기', () => {
  test('기간, "다 키운 나무", 키운 날 수와 물·열매 (시안: 49일 동안 키웠어요 · 물 100 · 열매 5개)', () => {
    const v = pastTreeView(completedTrees[1], 1, ['walk', 'diary', 'meditation', 'reading', 'sleep']);
    assert.equal(v.status.caption, '2026.06.01 ~ 07.20');
    assert.equal(v.status.title, '다 키운 나무');
    assert.equal(v.gauge.caption, '49일 동안 키웠어요');
    assert.equal(v.gauge.title, '물 100 · 열매 5개');
    assert.equal(v.treeLabel, '나무 1 · 완성');
    assert.equal(v.showFruits, true);
  });

  test('날 수: 같은 날이면 1일', () => {
    assert.equal(daysBetween(new Date(2026, 5, 1, 9), new Date(2026, 5, 1, 22)), 1);
    assert.equal(daysBetween(new Date(2026, 5, 1), new Date(2026, 6, 20)), 49);
  });
});

describe('나무 완성 화면', () => {
  test('함께한 날 · 인증한 활동 · 받은 물', () => {
    assert.deepEqual(completionStats(local(2026, 10, 13), new Date(2026, 10, 24, 9), 63, 100), [
      { label: '함께한 날', value: '42일' },
      { label: '인증한 활동', value: '63회' },
      { label: '받은 물', value: '100' },
    ]);
  });
});

describe('시듦 안내 창', () => {
  const HOUR = 60 * 60 * 1000;
  test('시들었으면 "나무가 시들었어요"', () => {
    assert.equal(wiltPrompt('wilted', 0), 'wilted');
  });
  test('하루 안에 시들면 "내일이면 나무가 시들어요"', () => {
    assert.equal(wiltPrompt('growing', 20 * HOUR), 'warn');
  });
  test('하루보다 많이 남았거나 모르면 띄우지 않는다', () => {
    assert.equal(wiltPrompt('growing', 30 * HOUR), null);
    assert.equal(wiltPrompt('growing', null), null);
    assert.equal(wiltPrompt('completed', 0), null);
  });
});

describe('기록 조회 카드', () => {
  test('날짜별 점은 인증 횟수만큼, 최대 5개', () => {
    assert.deepEqual(dots(2), [true, true, false, false, false]);
    assert.deepEqual(dots(9), [true, true, true, true, true]);
  });

  test('줄 이름은 오늘·어제·요일, 날짜는 "11/16"', async () => {
    const db = new DatabaseSync(':memory:');
    for (const m of pendingMigrations(0)) db.exec(m.sql);
    const stats = new StatsService({
      activities: new SqliteActivityRepository(asSqlDatabase(db)),
      now: () => new Date(2026, 10, 18, 12).getTime(),
    });
    const days = toHistoryView(await stats.lastDays(7)).week.days;
    assert.deepEqual(
      days.map((d) => [d.short, d.date]),
      [
        ['오늘', '11/18'],
        ['어제', '11/17'],
        ['월', '11/16'],
        ['일', '11/15'],
        ['토', '11/14'],
        ['금', '11/13'],
        ['목', '11/12'],
      ],
    );
  });
});

describe('나무별 집계 (체험용 데이터로)', () => {
  test('지금 나무와 완성한 나무의 인증 횟수·열매를 따로 센다', async () => {
    const appDb = new DatabaseSync(':memory:');
    appDb.exec('PRAGMA foreign_keys = ON;');
    for (const m of pendingMigrations(0)) appDb.exec(m.sql);
    const localDb = new DatabaseSync(':memory:');
    for (const m of pendingLocalMigrations(0)) localDb.exec(m.sql);
    const app = asSqlDatabase(appDb);
    await seedDemoData(app, asSqlDatabase(localDb), new Date(2026, 10, 24, 15));

    const engine = new WateringEngine(new SqliteTreeRepository(app));
    const stats = new StatsService({ activities: new SqliteActivityRepository(app) });
    const current = await engine.getProgress();
    assert.ok(current);
    const now = await stats.treeSummary(current.treeId);
    assert.ok(now.count > 20);
    assert.deepEqual(now.fruits, ['walk', 'diary', 'meditation', 'reading', 'sleep']);

    const [old] = await engine.completedTrees();
    assert.deepEqual(await stats.treeSummary(old.id), { count: 0, fruits: [] }, '체험 데이터의 완성 나무에는 기록이 없다');
  });
});
