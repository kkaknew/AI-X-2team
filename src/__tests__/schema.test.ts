import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  ACTIVITY_CODES,
  MIGRATIONS,
  SCHEMA_VERSION,
  TABLE_NAMES,
  pendingMigrations,
} from '../data/schema.ts';

/**
 * #4 [2] DB 스키마 생성 완료 조건:
 * ERD의 6개 테이블이 생성되고, 활동 5종과 성장 단계 초기 데이터가 들어 있다.
 * 앱과 같은 SQL을 Node 내장 SQLite(메모리 DB)에 적용해 확인한다.
 */
function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) {
    db.exec(m.sql);
    db.exec(`PRAGMA user_version = ${m.version}`);
  }
  return db;
}

const count = (db: DatabaseSync, sql: string) => (db.prepare(sql).get() as { n: number }).n;

test('ERD의 테이블 6개가 생성된다', () => {
  const db = freshDb();
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[];
  assert.deepEqual(
    rows.map((r) => r.name),
    [...TABLE_NAMES].sort(),
  );
});

test('활동 5종 초기 데이터가 들어 있고 규칙은 올바른 JSON이다', () => {
  const db = freshDb();
  const rows = db.prepare('SELECT code, water_reward, rule FROM activity_types ORDER BY id').all() as {
    code: string;
    water_reward: number;
    rule: string;
  }[];
  assert.deepEqual(
    rows.map((r) => r.code),
    [...ACTIVITY_CODES],
  );
  for (const r of rows) {
    assert.ok(r.water_reward > 0, `${r.code} 보상은 0보다 커야 합니다`);
    assert.equal(typeof JSON.parse(r.rule), 'object');
  }
  const walk = JSON.parse(rows[0].rule);
  assert.equal(walk.max_avg_speed_kmh, 7, '산책 평균 시속 7km 초과는 인정하지 않는다');
});

test('성장 단계는 씨앗(0)부터 시작하고 필요한 물의 양이 점점 늘어난다', () => {
  const db = freshDb();
  const stages = db.prepare('SELECT name, water_required FROM growth_stages ORDER BY id').all() as {
    name: string;
    water_required: number;
  }[];
  assert.ok(stages.length >= 2);
  assert.equal(stages[0].water_required, 0);
  for (let i = 1; i < stages.length; i++) {
    assert.ok(stages[i].water_required > stages[i - 1].water_required, `${stages[i].name} 기준이 이전 단계보다 커야 합니다`);
  }
});

test('처음 실행하면 기본 사용자와 씨앗 단계 나무가 1그루 있다', () => {
  const db = freshDb();
  assert.equal(count(db, 'SELECT COUNT(*) AS n FROM users'), 1);
  const tree = db.prepare('SELECT stage_id, water_total, status FROM trees').get() as {
    stage_id: number;
    water_total: number;
    status: string;
  };
  assert.deepEqual({ ...tree }, { stage_id: 1, water_total: 0, status: 'growing' });
});

test('외래키와 값 제약이 동작한다', () => {
  const db = freshDb();
  assert.throws(
    () => db.exec("INSERT INTO activity_logs (user_id, type_id, started_at) VALUES (1, 99, '2026-11-02T10:00')"),
    /FOREIGN KEY/,
  );
  assert.throws(() => db.exec("UPDATE trees SET status = 'dead' WHERE id = 1"), /CHECK/);
  assert.throws(() => db.exec("INSERT INTO reminders (user_id, remind_at) VALUES (1, '9시')"), /CHECK/);
});

test('마이그레이션을 다시 실행해도 데이터가 중복되지 않는다', () => {
  const db = freshDb();
  for (const sql of MIGRATIONS) db.exec(sql);
  assert.equal(count(db, 'SELECT COUNT(*) AS n FROM activity_types'), 5);
  assert.equal(count(db, 'SELECT COUNT(*) AS n FROM trees'), 1);
});

test('이미 최신인 DB에는 적용할 마이그레이션이 없다', () => {
  assert.equal(pendingMigrations(SCHEMA_VERSION).length, 0);
  assert.equal(pendingMigrations(0).length, SCHEMA_VERSION);
});
