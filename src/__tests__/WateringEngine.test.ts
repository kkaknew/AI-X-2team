import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import { pendingMigrations } from '../data/schema.ts';
import { SqliteTreeRepository } from '../data/SqliteTreeRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import { stageForWater, WateringEngine, WateringError } from '../logic/WateringEngine.ts';

/**
 * #7 [5] 물주기
 * 완료 조건: 인증 1건당 보상만큼 물이 쌓이고, 기준량에 도달하면 다음 단계로 바뀌는 테스트가 통과한다.
 *
 * 앱과 같은 DB 초기 데이터를 Node 내장 SQLite(메모리 DB)에 만들어서 확인한다.
 * 지금 성장 단계: 씨앗 0 → 새싹 10 → 묘목 30 → 어린 나무 60 → 나무 100 (누적 물)
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

function setup() {
  const db = freshDb();
  const engine = new WateringEngine(new SqliteTreeRepository(asSqlDatabase(db)));
  const tree = () =>
    db.prepare('SELECT stage_id, water_total, last_watered_at FROM trees WHERE id = 1').get() as {
      stage_id: number;
      water_total: number;
      last_watered_at: string | null;
    };
  return { db, engine, tree };
}

const verified = (waterReward: number) => ({ verified: true, waterReward });

describe('물 쌓기', () => {
  test('인증 1건당 보상만큼 물이 쌓인다', async () => {
    const { engine, tree } = setup();
    const r1 = await engine.water(verified(3));
    assert.equal(r1.waterGiven, 3);
    assert.equal(r1.waterTotal, 3);
    const r2 = await engine.water(verified(2));
    assert.equal(r2.waterTotal, 5);
    assert.equal(tree().water_total, 5, 'DB에도 저장된다');
  });

  test('인증되지 않은 활동은 물을 주지 않는다', async () => {
    const { engine, tree } = setup();
    const r = await engine.water({ verified: false, waterReward: 3 });
    assert.equal(r.waterGiven, 0);
    assert.equal(r.waterTotal, 0);
    assert.equal(tree().water_total, 0);
    assert.equal(tree().last_watered_at, null, '마지막 물준 시각도 바뀌지 않는다');
  });

  test('물을 주면 마지막 물준 시각이 저장된다 (시듦 판정용)', async () => {
    const { engine, tree } = setup();
    const at = new Date('2026-11-11T09:30:00.000Z');
    await engine.water(verified(2), at);
    assert.equal(tree().last_watered_at, at.toISOString());
  });

  test('보상이 0 이하이거나 정수가 아니면 오류', async () => {
    const { engine } = setup();
    await assert.rejects(engine.water(verified(0)), WateringError);
    await assert.rejects(engine.water(verified(-1)), WateringError);
    await assert.rejects(engine.water(verified(1.5)), WateringError);
  });
});

describe('성장 단계', () => {
  test('기준량(10)에 못 미치면 씨앗 그대로다', async () => {
    const { engine, tree } = setup();
    let r = await engine.water(verified(3));
    r = await engine.water(verified(3));
    r = await engine.water(verified(3)); // 9
    assert.equal(r.waterTotal, 9);
    assert.equal(r.stage.name, '씨앗');
    assert.equal(r.stageChanged, false);
    assert.equal(tree().stage_id, 1);
  });

  test('기준량(10)에 딱 도달하면 새싹으로 바뀐다', async () => {
    const { engine, tree } = setup();
    for (let i = 0; i < 3; i++) await engine.water(verified(3)); // 9
    const r = await engine.water(verified(1)); // 10
    assert.equal(r.previousStage.name, '씨앗');
    assert.equal(r.stage.name, '새싹');
    assert.equal(r.stageChanged, true);
    assert.equal(tree().stage_id, 2, 'DB에도 단계가 저장된다');
  });

  test('단계가 그대로면 stageChanged는 false', async () => {
    const { engine } = setup();
    const r = await engine.water(verified(3));
    assert.equal(r.stage.name, '씨앗');
    assert.equal(r.stageChanged, false);
  });

  test('다음 단계와 남은 물을 알려준다', async () => {
    const { engine } = setup();
    const r = await engine.water(verified(3));
    assert.equal(r.nextStage?.name, '새싹');
    assert.equal(r.waterToNextStage, 7);
  });

  test('물을 계속 주면 씨앗 → 새싹 → 묘목 → 어린 나무 → 나무 순서로 자란다', async () => {
    const { engine } = setup();
    const names: string[] = [];
    for (let i = 0; i < 50; i++) {
      const r = await engine.water(verified(2));
      if (r.stageChanged) names.push(r.stage.name);
    }
    assert.deepEqual(names, ['새싹', '묘목', '어린 나무', '나무']);
  });

  test('마지막 단계(나무)에 도달하면 isFinalStage가 true', async () => {
    const { engine } = setup();
    let r = await engine.water(verified(99));
    assert.equal(r.isFinalStage, false);
    r = await engine.water(verified(1)); // 100
    assert.equal(r.stage.name, '나무');
    assert.equal(r.isFinalStage, true);
    assert.equal(r.nextStage, null);
    assert.equal(r.waterToNextStage, 0);
  });

  test('보상이 커서 두 단계를 한 번에 넘으면 도달한 가장 높은 단계가 된다', async () => {
    const { engine } = setup();
    const r = await engine.water(verified(35)); // 0 → 35: 새싹(10)·묘목(30) 모두 넘음
    assert.equal(r.stage.name, '묘목');
  });

  test('기준량을 바꾸면 코드 수정 없이 판정도 바뀐다', async () => {
    const { db, engine } = setup();
    db.exec("UPDATE growth_stages SET water_required = 5 WHERE name = '새싹'");
    const r = await engine.water(verified(5));
    assert.equal(r.stage.name, '새싹');
  });
});

describe('예외 상황', () => {
  test('키우는 나무가 없으면 오류', async () => {
    const { db, engine } = setup();
    db.exec("UPDATE trees SET status = 'completed'");
    await assert.rejects(engine.water(verified(3)), /키우고 있는 나무가 없습니다/);
  });

  test('stageForWater: 성장 단계가 비어 있으면 오류', () => {
    assert.throws(() => stageForWater(10, []), WateringError);
  });
});
