import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import { pendingMigrations } from '../data/schema.ts';
import { SqliteActivityRepository } from '../data/SqliteActivityRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import { ActivityRecorder, DuplicateSleepError, sleepPeriod } from '../logic/ActivityRecorder.ts';
import { ActivityVerifier } from '../logic/ActivityVerifier.ts';

/**
 * #13 [11] 수면 기록
 * 완료 조건: 취침·기상 시각을 기록하고, 기준 시간 이상이면 인증된다.
 *
 * 앱과 같은 DB 초기 데이터를 Node 내장 SQLite(메모리 DB)에 만들어서 확인한다.
 * 지금 기준: 수면 7시간(420분) 이상이면 인증, 보상 물 2
 */
function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) db.exec(m.sql);
  return db;
}

/** Node 내장 SQLite를 expo-sqlite와 같은 모양(SqlDatabase)으로 감싼다 */
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

/** 기기 현지 시간으로 날짜 만들기 (월은 1부터) */
const local = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi);

function setup(now: Date) {
  const db = freshDb();
  const sql = asSqlDatabase(db);
  const activities = new SqliteActivityRepository(sql);
  let clock = now.getTime();
  const watered: number[] = [];
  const recorder = new ActivityRecorder({
    verifier: new ActivityVerifier(),
    loadActivityType: async (code) =>
      db.prepare('SELECT rule, water_reward AS waterReward FROM activity_types WHERE code = ?').get(code) as {
        rule: string;
        waterReward: number;
      },
    water: async ({ waterReward }) => {
      watered.push(waterReward);
      return { waterGiven: waterReward };
    },
    location: {
      startWalk: async () => {},
      stopWalk: async () => ({ distanceM: 0, durationSec: 0, startedAt: '', endedAt: '' }),
      isWalking: () => false,
    },
    activities,
    now: () => clock,
  });
  const logs = () =>
    db
      .prepare(
        `SELECT t.code, l.started_at, l.ended_at, l.duration_min, l.verified, l.water_given, l.tree_id
         FROM activity_logs l JOIN activity_types t ON t.id = l.type_id ORDER BY l.id`,
      )
      .all() as {
      code: string;
      started_at: string;
      ended_at: string;
      duration_min: number;
      verified: number;
      water_given: number;
      tree_id: number | null;
    }[];
  return { recorder, activities, logs, watered, setNow: (d: Date) => (clock = d.getTime()) };
}

describe('sleepPeriod: 시각을 실제 날짜로', () => {
  test('아침에 기록하면 어젯밤 잠든 것으로 본다', () => {
    const p = sleepPeriod('23:30', '07:00', local(2026, 11, 17, 8));
    assert.ok(p);
    assert.deepEqual(p.startedAt, local(2026, 11, 16, 23, 30));
    assert.deepEqual(p.endedAt, local(2026, 11, 17, 7));
    assert.equal(p.durationMin, 450);
  });

  test('기상 시각이 아직 안 됐으면 어제 아침 일어난 것으로 본다', () => {
    const p = sleepPeriod('23:00', '07:00', local(2026, 11, 17, 6));
    assert.ok(p);
    assert.deepEqual(p.endedAt, local(2026, 11, 16, 7));
    assert.deepEqual(p.startedAt, local(2026, 11, 15, 23));
  });

  test('자정 넘어 잠든 경우', () => {
    const p = sleepPeriod('01:00', '08:15', local(2026, 11, 17, 9));
    assert.ok(p);
    assert.deepEqual(p.startedAt, local(2026, 11, 17, 1));
    assert.equal(p.durationMin, 435);
  });

  test('형식이 틀리면 null', () => {
    assert.equal(sleepPeriod('11시', '07:00', local(2026, 11, 17, 8)), null);
    assert.equal(sleepPeriod('07:00', '07:00', local(2026, 11, 17, 8)), null);
  });
});

describe('완료 조건: 취침·기상 시각을 기록하고, 기준 시간 이상이면 인증된다', () => {
  test('7시간 이상 자면 인증되고, 취침·기상 시각이 DB에 저장된다', async () => {
    const { recorder, logs, watered } = setup(local(2026, 11, 17, 8));
    const r = await recorder.recordSleep('23:00', '07:00');
    assert.equal(r.result.verified, true);
    assert.equal(r.result.waterGiven, 2);
    assert.deepEqual(watered, [2]);

    const [log] = logs();
    assert.equal(log.code, 'sleep');
    assert.equal(log.started_at, local(2026, 11, 16, 23).toISOString());
    assert.equal(log.ended_at, local(2026, 11, 17, 7).toISOString());
    assert.equal(log.duration_min, 480);
    assert.equal(log.verified, 1);
    assert.equal(log.water_given, 2);
    assert.equal(log.tree_id, 1, '지금 키우는 나무에 연결된다');
  });

  test('딱 7시간이면 인증된다', async () => {
    const { recorder } = setup(local(2026, 11, 17, 8));
    assert.equal((await recorder.recordSleep('00:00', '07:00')).result.verified, true);
  });

  test('7시간보다 적게 자면 인증되지 않지만 기록은 남는다', async () => {
    const { recorder, logs, watered } = setup(local(2026, 11, 17, 8));
    const r = await recorder.recordSleep('02:00', '07:00');
    assert.equal(r.result.verified, false);
    assert.equal(r.result.waterGiven, 0);
    assert.ok(r.result.reasons[0].includes('7시간'));
    assert.deepEqual(watered, []);

    const [log] = logs();
    assert.equal(log.duration_min, 300);
    assert.equal(log.verified, 0);
    assert.equal(log.water_given, 0);
  });
});

describe('같은 잠은 한 번만', () => {
  test('같은 잠을 다시 기록하면 막고 물도 주지 않는다', async () => {
    const { recorder, logs, watered } = setup(local(2026, 11, 17, 8));
    await recorder.recordSleep('23:00', '07:00');
    await assert.rejects(recorder.recordSleep('23:00', '07:00'), DuplicateSleepError);
    await assert.rejects(recorder.recordSleep('01:00', '06:00'), DuplicateSleepError, '시간이 겹치는 잠');
    assert.equal(logs().length, 1);
    assert.deepEqual(watered, [2]);
  });

  test('다음 날 밤의 잠은 따로 기록된다', async () => {
    const { recorder, logs, setNow } = setup(local(2026, 11, 17, 8));
    await recorder.recordSleep('23:00', '07:00');
    setNow(local(2026, 11, 18, 8));
    await recorder.recordSleep('23:00', '07:00');
    assert.equal(logs().length, 2);
  });

  test('일어난 시각과 다음 잠든 시각이 딱 붙어 있어도 겹친 것이 아니다', async () => {
    const { recorder, setNow } = setup(local(2026, 11, 17, 8));
    await recorder.recordSleep('23:00', '07:00');
    setNow(local(2026, 11, 17, 15));
    // 낮잠 07:00~14:00 (앞의 잠이 끝난 시각에 시작)
    const r = await recorder.recordSleep('07:00', '14:00');
    assert.equal(r.result.verified, true);
  });
});

describe('최근 수면 기록', () => {
  test('최근 것부터 돌려준다', async () => {
    const { recorder, setNow } = setup(local(2026, 11, 15, 8));
    await recorder.recordSleep('23:00', '07:00');
    setNow(local(2026, 11, 16, 8));
    await recorder.recordSleep('22:00', '06:00');
    setNow(local(2026, 11, 17, 8));
    await recorder.recordSleep('01:00', '05:00');

    const recent = await recorder.recentSleeps(2);
    assert.deepEqual(
      recent.map((l) => l.startedAt),
      [local(2026, 11, 17, 1).toISOString(), local(2026, 11, 15, 22).toISOString()],
    );
    assert.equal(recent[0].verified, false);
    assert.equal(recent[1].verified, true);
  });

  test('저장소가 없으면 빈 배열', async () => {
    const recorder = new ActivityRecorder({
      verifier: new ActivityVerifier(),
      loadActivityType: async () => ({ rule: '{"min_duration_min": 420}', waterReward: 2 }),
      location: {
        startWalk: async () => {},
        stopWalk: async () => ({ distanceM: 0, durationSec: 0, startedAt: '', endedAt: '' }),
        isWalking: () => false,
      },
    });
    assert.deepEqual(await recorder.recentSleeps(), []);
  });
});
