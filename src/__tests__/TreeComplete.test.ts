import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import { pendingMigrations } from '../data/schema.ts';
import { SqliteTreeRepository } from '../data/SqliteTreeRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import type { TreeProgress } from '../logic/WateringEngine.ts';
import { WateringEngine } from '../logic/WateringEngine.ts';

/**
 * #16 [14] 나무 완성과 새 씨앗
 * 완료 조건: 마지막 단계에 도달하면 나무가 완료 처리되고 새 씨앗이 심어진다.
 *
 * 팀 결정 (김현수):
 * - 마지막 단계(나무, 물 100)에 도달하면 나무 화면에 완성과 [새 씨앗 심기] 버튼을 보여준다.
 *   버튼을 누르면 완료 처리하고 새 씨앗을 심는다. 안 누르고 다음 활동을 인증해도 같은 일을 한 뒤 새 씨앗에 물을 준다.
 * - 100을 넘겨 받은 물은 버린다. 새 씨앗은 항상 물 0부터.
 * - 완성한 나무 수와 목록을 활동 기록 화면에 보여준다.
 * 지금 성장 단계: 씨앗 0 → 새싹 10 → 묘목 30 → 어린 나무 60 → 나무 100 (누적 물)
 */
function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) db.exec(m.sql);
  const sql: SqlDatabase = {
    async getFirstAsync<T>(source: string, params: SqlValue[]) {
      return (db.prepare(source).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, params: SqlValue[]) {
      return db.prepare(source).all(...params) as T[];
    },
    async runAsync(source: string, params: SqlValue[]) {
      return db.prepare(source).run(...params);
    },
  };
  const trees = () =>
    db.prepare('SELECT id, stage_id, water_total, status, completed_at FROM trees ORDER BY id').all() as {
      id: number;
      stage_id: number;
      water_total: number;
      status: string;
      completed_at: string | null;
    }[];
  return { db, engine: new WateringEngine(new SqliteTreeRepository(sql)), trees };
}

const verified = (waterReward: number) => ({ verified: true, waterReward });
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour, 0, 0);

describe('마지막 단계에 도달하면', () => {
  test('나무 화면이 완성(isFinalStage)을 알고, 버튼을 누르기 전까지는 다 자란 나무를 보여준다', async () => {
    const { engine, trees } = setup();
    const r = await engine.water(verified(100), at(17));
    assert.equal(r.isFinalStage, true);
    assert.equal(r.stage.name, '나무');

    const p = await engine.getProgress();
    assert.equal(p?.isFinalStage, true);
    assert.equal(p?.stage.name, '나무');
    assert.equal(trees().length, 1);
  });

  test('[새 씨앗 심기]를 누르면 나무가 완료 처리되고 새 씨앗(씨앗, 물 0)이 심어진다', async () => {
    const { engine, trees } = setup();
    await engine.water(verified(100), at(17));
    const seed = await engine.plantNewSeed(at(17, 15));

    assert.equal(seed.stage.name, '씨앗');
    assert.equal(seed.stageNumber, 1);
    assert.equal(seed.waterTotal, 0);
    assert.equal(seed.status, 'growing');
    assert.notEqual(seed.treeId, 1);

    const [old, now] = trees();
    assert.equal(old.status, 'completed');
    assert.ok(old.completed_at);
    assert.equal(now.status, 'growing');
    assert.equal(now.water_total, 0);

    const progress = await engine.getProgress();
    assert.equal(progress?.treeId, seed.treeId);
  });

  test('완료 시각은 버튼을 누른 때가 아니라 다 자란 때(마지막으로 물을 받은 때)다', async () => {
    const { engine } = setup();
    await engine.water(verified(100), at(17, 9));
    await engine.plantNewSeed(at(18, 20));
    const [done] = await engine.completedTrees();
    assert.equal(done.completedAt, at(17, 9).toISOString());
  });

  test('새 씨앗을 심으면 구독한 화면(나무·활동 기록)이 바로 새 상태를 받는다', async () => {
    const { engine } = setup();
    await engine.water(verified(100));
    const received: TreeProgress[] = [];
    engine.subscribe((p) => received.push(p));

    await engine.plantNewSeed();
    assert.equal(received.length, 1);
    assert.equal(received[0].stage.name, '씨앗');
  });
});

describe('넘친 물은 버린다', () => {
  test('99에서 물 3을 받아 102가 돼도, 새 씨앗은 물 0부터 시작한다', async () => {
    const { engine } = setup();
    await engine.water(verified(99));
    const r = await engine.water(verified(3));
    assert.equal(r.waterGiven, 3);
    assert.equal(r.isFinalStage, true);

    const seed = await engine.plantNewSeed();
    assert.equal(seed.waterTotal, 0);
  });
});

describe('버튼을 안 눌렀을 때', () => {
  test('다음 활동을 인증하면 완료 처리하고 새 씨앗을 심은 뒤, 새 씨앗에 물을 준다', async () => {
    const { engine, trees } = setup();
    await engine.water(verified(100), at(17));
    const r = await engine.water(verified(3), at(18));

    assert.equal(r.waterTotal, 3);
    assert.equal(r.stage.name, '씨앗');
    assert.equal(r.isFinalStage, false);
    assert.deepEqual(
      trees().map((t) => [t.status, t.water_total]),
      [
        ['completed', 100],
        ['growing', 3],
      ],
    );
  });

  test('인증되지 않은 활동은 아무것도 바꾸지 않는다 (다 자란 나무 그대로)', async () => {
    const { engine, trees } = setup();
    await engine.water(verified(100));
    await engine.water({ verified: false, waterReward: 3 });
    assert.equal(trees().length, 1);
    assert.equal((await engine.getProgress())?.isFinalStage, true);
  });
});

describe('잘못 누르는 경우', () => {
  test('아직 다 자라지 않았으면 새 씨앗을 심지 않는다', async () => {
    const { engine, trees } = setup();
    await engine.water(verified(40));
    const p = await engine.plantNewSeed();
    assert.equal(p.waterTotal, 40);
    assert.equal(p.stage.name, '묘목');
    assert.equal(trees().length, 1);
  });

  test('버튼을 두 번 눌러도 새 씨앗은 하나만 심긴다', async () => {
    const { engine, trees } = setup();
    await engine.water(verified(100));
    await engine.plantNewSeed();
    await engine.plantNewSeed();
    assert.equal(trees().length, 2);
    assert.equal((await engine.completedTrees()).length, 1);
  });

  test('시든 나무가 다 자란 상태여도 새 씨앗을 심을 수 있다', async () => {
    const { db, engine, trees } = setup();
    await engine.water(verified(100));
    db.exec("UPDATE trees SET status = 'wilted'");
    const seed = await engine.plantNewSeed();
    assert.equal(seed.stage.name, '씨앗');
    assert.equal(trees()[0].status, 'completed');
  });
});

describe('완성한 나무 목록 (활동 기록 화면)', () => {
  test('처음에는 0그루', async () => {
    const { engine } = setup();
    assert.deepEqual(await engine.completedTrees(), []);
  });

  test('두 그루를 키우면 최근에 완성한 것부터 2그루', async () => {
    const { engine } = setup();
    await engine.water(verified(100), at(10));
    await engine.plantNewSeed(at(11));
    await engine.water(verified(100), at(15));
    await engine.plantNewSeed(at(16));

    const list = await engine.completedTrees();
    assert.equal(list.length, 2);
    assert.deepEqual(
      list.map((t) => t.completedAt),
      [at(15).toISOString(), at(10).toISOString()],
    );
    assert.equal(list[0].plantedAt, at(11).toISOString());
  });
});
