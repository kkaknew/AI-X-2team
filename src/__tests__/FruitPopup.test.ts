import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import type { WalkProgress, WalkSummary } from '../data/LocationRepository.ts';
import type { NewActivityLog } from '../data/ActivityRepository.ts';
import { pendingMigrations } from '../data/schema.ts';
import { SqliteActivityRepository } from '../data/SqliteActivityRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import { ActivityRecorder } from '../logic/ActivityRecorder.ts';
import { ActivityVerifier } from '../logic/ActivityVerifier.ts';
import type { MeditationPlayer } from '../data/MeditationPlayer.ts';
import { MeditationSession } from '../logic/MeditationSession.ts';
import { StatsService } from '../logic/StatsService.ts';
import {
  bookPage,
  hoursLong,
  hoursShort,
  monthGrid,
  shiftMonth,
  totalsView,
  writingsByDay,
} from '../presentation/fruitView.ts';

/**
 * Figma 시안 열매 팝업 5종 (산책·명상·일기·독서·수면)
 * 팝업에 필요한 기록 저장(산책, 명상 시간)과 집계, 화면용 글자·달력을 확인한다.
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

class FakeLocation {
  next: WalkSummary = { distanceM: 2100, durationSec: 1800, startedAt: '', endedAt: '' };
  async startWalk(_p?: (p: WalkProgress) => void) {}
  async stopWalk() {
    return this.next;
  }
  isWalking() {
    return false;
  }
}

function setup(nowIso = '2026-11-24T03:00:00.000Z') {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) db.exec(m.sql);
  const sql = asSqlDatabase(db);
  const activities = new SqliteActivityRepository(sql);
  let now = new Date(nowIso).getTime();
  const location = new FakeLocation();
  const recorder = new ActivityRecorder({
    verifier: new ActivityVerifier(),
    loadActivityType: async (code) => {
      const row = db.prepare('SELECT rule, water_reward FROM activity_types WHERE code = ?').get(code) as {
        rule: string;
        water_reward: number;
      };
      return { rule: row.rule, waterReward: row.water_reward };
    },
    water: async ({ waterReward }) => ({ waterGiven: waterReward }),
    location,
    activities,
    now: () => now,
  });
  const stats = new StatsService({ activities, now: () => now });
  const add = (log: Partial<NewActivityLog> & { startedAt: string }) =>
    activities.addLog({ type: 'diary', endedAt: null, durationMin: null, verified: true, waterGiven: 1, ...log });
  const logs = () =>
    db
      .prepare(
        `SELECT t.code, l.distance_m, l.duration_min, l.verified FROM activity_logs l
         JOIN activity_types t ON t.id = l.type_id ORDER BY l.id`,
      )
      .all() as { code: string; distance_m: number | null; duration_min: number | null; verified: number }[];
  return { recorder, stats, location, add, logs, setNow: (iso: string) => (now = new Date(iso).getTime()) };
}

describe('열매 팝업에 필요한 기록 저장', () => {
  test('산책을 마치면 거리·시간이 활동 기록에 남는다 (좌표는 남지 않는다)', async () => {
    const { recorder, logs } = setup();
    await recorder.startWalk();
    await recorder.finishWalk();
    assert.deepEqual(logs().map((l) => ({ ...l })), [
      { code: 'walk', distance_m: 2100, duration_min: 30, verified: 1 },
    ]);
  });

  test('인증되지 않은 산책도 기록에는 남는다 (인증 여부와 함께)', async () => {
    const { recorder, location, logs } = setup();
    location.next = { distanceM: 10_000, durationSec: 1200, startedAt: '', endedAt: '' }; // 30km/h
    await recorder.startWalk();
    const done = await recorder.finishWalk();
    assert.equal(done.result.verified, false);
    assert.equal(logs()[0].verified, 0);
  });

  test('명상은 실제로 들은 시간이 남는다 (음악이 끝나면 곡 길이만큼)', async () => {
    const { recorder, logs } = setup();
    let clock = 1_000_000;
    const player: MeditationPlayer = {
      credit: '',
      async play(onEnd) {
        end = onEnd;
        return { durationSec: 187 };
      },
      async stop() {},
    };
    let end: () => void = () => {};
    const session = new MeditationSession({ player, now: () => clock });
    let played = -1;
    await session.start((input, sec) => {
      played = sec;
      void recorder.recordMeditation(input, sec);
    });
    clock += 187_000;
    end();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(played, 187);
    assert.equal(logs()[0].duration_min, 3);
  });
});

describe('열매 집계', () => {
  test('산책 열매: 이 나무를 심은 뒤 인증된 산책의 횟수·거리', async () => {
    const { stats, add } = setup();
    await add({ type: 'walk', startedAt: '2026-11-01T00:00:00.000Z', distanceM: 5000 }); // 심기 전
    await add({ type: 'walk', startedAt: '2026-11-20T00:00:00.000Z', distanceM: 2100, durationMin: 30 });
    await add({ type: 'walk', startedAt: '2026-11-21T00:00:00.000Z', distanceM: 1300, durationMin: 20 });
    await add({ type: 'walk', startedAt: '2026-11-22T00:00:00.000Z', distanceM: 9000, verified: false });
    assert.deepEqual(await stats.totalsSince('walk', '2026-11-10T00:00:00.000Z'), {
      count: 2,
      distanceM: 3400,
      durationMin: 50,
    });
  });

  test('명상 열매: 총 횟수·총 시간 (첫 씨앗의 SQLite 시각 형식도 읽는다)', async () => {
    const { stats, add } = setup();
    await add({ type: 'meditation', startedAt: '2026-11-20T00:00:00.000Z', durationMin: 3 });
    await add({ type: 'meditation', startedAt: '2026-11-21T00:00:00.000Z', durationMin: 3 });
    const t = await stats.totalsSince('meditation', '2026-11-10 00:00:00');
    assert.equal(t.count, 2);
    assert.equal(t.durationMin, 6);
  });

  test('수면 열매: 일어난 날로 이번 달 날짜별 잔 시간, 총합과 하루 평균', async () => {
    const { stats, add } = setup();
    const sleep = (bed: Date, min: number) =>
      add({
        type: 'sleep',
        startedAt: bed.toISOString(),
        endedAt: new Date(bed.getTime() + min * 60_000).toISOString(),
        durationMin: min,
      });
    await sleep(new Date(2026, 9, 31, 23, 0), 450); // 11/1 아침에 일어남 → 11월
    await sleep(new Date(2026, 10, 1, 23, 30), 420); // 11/2
    await sleep(new Date(2026, 10, 29, 23, 0), 480); // 11/30
    await sleep(new Date(2026, 10, 30, 23, 0), 400); // 12/1 → 12월
    const m = await stats.sleepMonth(2026, 11);
    assert.deepEqual(m.byDay, { '2026-11-01': 450, '2026-11-02': 420, '2026-11-30': 480 });
    assert.equal(m.totalMin, 1350);
    assert.equal(m.averageMin, 450);
  });

  test('수면 기록이 없는 달은 0', async () => {
    const { stats } = setup();
    assert.deepEqual(await stats.sleepMonth(2026, 11), { year: 2026, month: 11, byDay: {}, totalMin: 0, averageMin: 0 });
  });
});

describe('열매 팝업 글자와 달력', () => {
  test('산책 열매 누적 문구: 기록이 없으면 시안 그대로', () => {
    const v = totalsView('walk', { count: 0, distanceM: 0, durationMin: 0 });
    assert.deepEqual(v.lines, ['총 횟수 0회', '총 거리 0.0km']);
    assert.equal(v.tag, '기록 없음');
    assert.equal(v.title, '아직 산책 기록이 없어요');
    assert.equal(v.description, '첫 산책을 기록하면 나무가 자라고, 열매가 생겨요.');
  });

  test('기록이 있으면 횟수·거리와 "기록 있음"', () => {
    const v = totalsView('walk', { count: 2, distanceM: 3450, durationMin: 50 });
    assert.deepEqual(v.lines, ['총 횟수 2회', '총 거리 3.5km']);
    assert.equal(v.tag, '기록 있음');
    assert.equal(totalsView('meditation', { count: 1, distanceM: 0, durationMin: 3 }).lines[1], '총 시간 3분');
  });

  test('달력: 2026년 10월은 목요일부터 31일, 5주', () => {
    const weeks = monthGrid(2026, 10);
    assert.equal(weeks.length, 5);
    assert.deepEqual(weeks[0], [null, null, null, null, 1, 2, 3]);
    assert.deepEqual(weeks[4], [25, 26, 27, 28, 29, 30, 31]);
  });

  test('달 넘기기: 1월 이전은 작년 12월', () => {
    assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
    assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  });

  test('일기를 쓴 날별로 묶는다 (휴대폰 시간대)', () => {
    const at = (d: Date) => d.toISOString();
    const map = writingsByDay([
      { id: 1, writtenAt: at(new Date(2026, 10, 18, 22)), charCount: 3, title: '', body: 'a' },
      { id: 2, writtenAt: at(new Date(2026, 10, 18, 9)), charCount: 3, title: '', body: 'b' },
      { id: 3, writtenAt: at(new Date(2026, 10, 19, 9)), charCount: 3, title: '', body: 'c' },
    ]);
    assert.deepEqual([...map.keys()], ['2026-11-18', '2026-11-19']);
    assert.deepEqual(map.get('2026-11-18')?.map((e) => e.id), [1, 2]);
  });

  test('수면 시간 표시', () => {
    assert.equal(hoursShort(450), '7.5h');
    assert.equal(hoursShort(433), '7.2h');
    assert.equal(hoursLong(11695), '194시간 55분');
    assert.equal(hoursLong(420), '7시간');
  });

  test('독서 책장: 12권씩, 쪽 번호는 범위 안으로', () => {
    const books = Array.from({ length: 13 }, (_, i) => i);
    assert.deepEqual(bookPage(books, 1).items.length, 12);
    assert.deepEqual(bookPage(books, 2), { items: [12], page: 2, pages: 2 });
    assert.equal(bookPage(books, 9).page, 2);
    assert.deepEqual(bookPage([], 1), { items: [], page: 1, pages: 1 });
  });
});
