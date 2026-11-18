import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import type { NewActivityLog } from '../data/ActivityRepository.ts';
import { pendingMigrations } from '../data/schema.ts';
import { SqliteActivityRepository } from '../data/SqliteActivityRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import { StatsService } from '../logic/StatsService.ts';
import { dayLabel, toHistoryView } from '../presentation/historyView.ts';

/**
 * #14 [12] 기록 조회 화면
 * 완료 조건: 일·주간 활동 횟수와 받은 물의 양이 표시된다.
 *
 * 앱과 같은 DB를 Node 내장 SQLite(메모리 DB)에 만들고 activity_logs에 기록을 넣어 확인한다.
 * 날짜는 휴대폰 시간대 기준이고, 주간은 오늘을 포함한 최근 7일이다.
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
const at = (m: number, d: number, h: number, mi = 0) => new Date(2026, m - 1, d, h, mi);

function setup(now = at(11, 18, 20)) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) db.exec(m.sql);
  const activities = new SqliteActivityRepository(asSqlDatabase(db));
  const stats = new StatsService({ activities, now: () => now.getTime() });

  /** 기록 1건 넣기. 기본은 인증된 일기, 물 1 */
  const add = (when: Date, log: Partial<NewActivityLog> = {}) =>
    activities.addLog({
      type: 'diary',
      startedAt: when.toISOString(),
      endedAt: null,
      durationMin: null,
      verified: true,
      waterGiven: 1,
      ...log,
    });
  return { stats, add };
}

describe('오늘', () => {
  test('기록이 없으면 0번, 물 0', async () => {
    const { stats } = setup();
    const today = await stats.today();
    assert.equal(today.day, '2026-11-18');
    assert.equal(today.count, 0);
    assert.equal(today.water, 0);
  });

  test('오늘 인증한 활동 횟수와 받은 물을 종류별로 센다', async () => {
    const { stats, add } = setup();
    await add(at(11, 18, 8), { type: 'meditation' });
    await add(at(11, 18, 9), { type: 'diary' });
    await add(at(11, 18, 21), { type: 'reading' });
    const today = await stats.today();
    assert.equal(today.count, 3);
    assert.equal(today.water, 3);
    assert.deepEqual(today.byType, { walk: 0, diary: 1, meditation: 1, reading: 1, sleep: 0 });
  });

  test('인증에 실패한 기록은 횟수에 들지 않는다', async () => {
    const { stats, add } = setup();
    await add(at(11, 18, 8), { type: 'meditation', verified: false, waterGiven: 0 });
    await add(at(11, 18, 9), { type: 'meditation' });
    const today = await stats.today();
    assert.equal(today.count, 1);
    assert.equal(today.byType.meditation, 1);
  });

  test('하루 한 번 규칙으로 물 0인 기록도 횟수에는 들고, 물은 실제로 받은 만큼만 더한다', async () => {
    const { stats, add } = setup();
    await add(at(11, 18, 9), { type: 'diary', waterGiven: 1 });
    await add(at(11, 18, 13), { type: 'diary', waterGiven: 0 });
    const today = await stats.today();
    assert.equal(today.count, 2);
    assert.equal(today.water, 1);
  });

  test('어제 기록은 오늘에 들지 않는다 (자정 기준)', async () => {
    const { stats, add } = setup(at(11, 18, 0, 30));
    await add(at(11, 17, 23, 50));
    await add(at(11, 18, 0, 10));
    assert.equal((await stats.today()).count, 1);
  });

  test('수면은 잠든 날이 아니라 일어난 날로 센다', async () => {
    const { stats, add } = setup();
    await add(at(11, 17, 23), {
      type: 'sleep',
      endedAt: at(11, 18, 7).toISOString(),
      durationMin: 480,
    });
    const week = await stats.lastDays(7);
    assert.equal(week.days[6].byType.sleep, 1, '오늘(18일)로 센다');
    assert.equal(week.days[5].byType.sleep, 0, '어제(17일)로 세지 않는다');
  });
});

describe('최근 7일', () => {
  test('오늘을 포함해 7일을 오래된 날부터 하루씩 돌려준다', async () => {
    const { stats } = setup();
    const week = await stats.lastDays(7);
    assert.deepEqual(
      week.days.map((d) => d.day),
      ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'],
    );
  });

  test('날마다, 그리고 7일 합계로 횟수와 물을 센다', async () => {
    const { stats, add } = setup();
    await add(at(11, 12, 9), { type: 'meditation' });
    await add(at(11, 15, 9), { type: 'reading' });
    await add(at(11, 15, 22), { type: 'diary' });
    await add(at(11, 18, 9), { type: 'diary', waterGiven: 0 });
    const week = await stats.lastDays(7);
    assert.deepEqual(
      week.days.map((d) => d.count),
      [1, 0, 0, 2, 0, 0, 1],
    );
    assert.equal(week.count, 4);
    assert.equal(week.water, 3);
    assert.deepEqual(week.byType, { walk: 0, diary: 2, meditation: 1, reading: 1, sleep: 0 });
  });

  test('7일보다 오래된 기록과 내일 이후 기록은 빠진다', async () => {
    const { stats, add } = setup();
    await add(at(11, 11, 23, 59));
    await add(at(11, 19, 0, 1));
    await add(at(11, 12, 0, 1));
    assert.equal((await stats.lastDays(7)).count, 1);
  });
});

describe('화면 표시', () => {
  test('날짜는 오늘·어제, 그 전은 "월/일 (요일)"로 보여준다', () => {
    assert.equal(dayLabel('2026-11-18', '2026-11-18'), '오늘');
    assert.equal(dayLabel('2026-11-17', '2026-11-18'), '어제');
    assert.equal(dayLabel('2026-11-16', '2026-11-18'), '11/16 (월)');
    assert.equal(dayLabel('2026-11-12', '2026-11-18'), '11/12 (목)');
  });

  test('오늘 요약과 최근 7일(최근 날이 위)을 화면용으로 바꾼다', async () => {
    const { stats, add } = setup();
    await add(at(11, 15, 9), { type: 'reading' });
    await add(at(11, 15, 10), { type: 'diary' });
    await add(at(11, 18, 9), { type: 'meditation' });
    const view = toHistoryView(await stats.lastDays(7));

    assert.equal(view.today.count, 1);
    assert.equal(view.today.water, 1);
    assert.deepEqual(
      view.today.items.map((i) => `${i.label} ${i.count}`),
      ['산책 0', '일기 0', '명상 1', '독서 0', '수면 0'],
    );

    assert.equal(view.week.count, 3);
    assert.equal(view.week.days[0].label, '오늘');
    assert.equal(view.week.days[3].label, '11/15 (일)');
    assert.equal(view.week.days[3].ratio, 1, '가장 많이 한 날이 꽉 찬 막대');
    assert.equal(view.week.days[0].ratio, 0.5);
  });

  test('기록이 하나도 없어도 막대 길이는 0이다 (0으로 나누지 않는다)', async () => {
    const { stats } = setup();
    const view = toHistoryView(await stats.lastDays(7));
    assert.ok(view.week.days.every((d) => d.ratio === 0));
  });
});
