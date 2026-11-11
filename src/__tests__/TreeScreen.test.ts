import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import { pendingMigrations } from '../data/schema.ts';
import { SqliteTreeRepository } from '../data/SqliteTreeRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import type { TreeProgress } from '../logic/WateringEngine.ts';
import { WateringEngine } from '../logic/WateringEngine.ts';
import { toTreeView } from '../presentation/treeView.ts';

/**
 * #9 [7] 나무 화면
 * 완료 조건: 현재 성장 단계와 물의 양이 표시되고, 활동 인증 직후 갱신된다.
 *
 * 화면(TreeScreen.tsx)은 getProgress()로 읽은 상태를 toTreeView()로 바꿔 그리고,
 * subscribe()로 물을 준 직후 새 상태를 받는다. 이 두 부분을 앱과 같은 DB 초기 데이터로 확인한다.
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
  return { db, engine: new WateringEngine(new SqliteTreeRepository(sql)) };
}

const verified = (waterReward: number) => ({ verified: true, waterReward });

async function viewNow(engine: WateringEngine) {
  const p = await engine.getProgress();
  assert.ok(p, '키우는 나무가 있어야 한다');
  return toTreeView(p);
}

describe('성장 단계와 물의 양 표시', () => {
  test('처음에는 씨앗, 물 0, 새싹까지 10 남음', async () => {
    const { engine } = setup();
    const view = await viewNow(engine);
    assert.equal(view.stageName, '씨앗');
    assert.equal(view.stageLabel, '1 / 5단계');
    assert.equal(view.waterLabel, '물 0');
    assert.equal(view.nextLabel, '새싹까지 물 10 남았어요');
    assert.equal(view.progress, 0);
    assert.equal(view.icon, '🌰');
  });

  test('물 13이면 새싹, 묘목까지 17 남음, 진행 막대는 새싹→묘목 구간 기준 (3/20)', async () => {
    const { engine } = setup();
    await engine.water(verified(13));
    const view = await viewNow(engine);
    assert.equal(view.stageName, '새싹');
    assert.equal(view.stageLabel, '2 / 5단계');
    assert.equal(view.waterLabel, '물 13');
    assert.equal(view.nextLabel, '묘목까지 물 17 남았어요');
    assert.equal(view.progress, 3 / 20);
  });

  test('마지막 단계면 진행 막대가 꽉 차고 다 자랐다고 보여준다', async () => {
    const { engine } = setup();
    await engine.water(verified(100));
    const view = await viewNow(engine);
    assert.equal(view.stageName, '나무');
    assert.equal(view.icon, '🌳');
    assert.equal(view.progress, 1);
    assert.equal(view.nextLabel, '다 자랐어요!');
  });

  test('시든 나무면 안내 문구를 보여주고, 아니면 보여주지 않는다', async () => {
    const { db, engine } = setup();
    assert.equal((await viewNow(engine)).statusNote, null);
    db.exec("UPDATE trees SET status = 'wilted'");
    assert.match((await viewNow(engine)).statusNote ?? '', /시들었어요/);
  });

  test('키우는 나무가 없으면 getProgress는 null (화면은 "나무가 없어요")', async () => {
    const { db, engine } = setup();
    db.exec("UPDATE trees SET status = 'completed'");
    assert.equal(await engine.getProgress(), null);
  });
});

describe('활동 인증 직후 갱신', () => {
  test('인증된 활동으로 물을 주면 구독한 화면이 바로 새 상태를 받는다', async () => {
    const { engine } = setup();
    const received: TreeProgress[] = [];
    engine.subscribe((p) => received.push(p));

    await engine.water(verified(3));
    assert.equal(received.length, 1);
    assert.equal(toTreeView(received[0]).waterLabel, '물 3');

    await engine.water(verified(7)); // 10 → 새싹
    assert.equal(received.length, 2);
    assert.equal(toTreeView(received[1]).stageName, '새싹');
  });

  test('받은 상태는 DB에서 다시 읽은 상태와 같다', async () => {
    const { engine } = setup();
    let pushed: TreeProgress | null = null;
    engine.subscribe((p) => (pushed = p));
    await engine.water(verified(35));
    assert.deepEqual(pushed, await engine.getProgress());
  });

  test('인증되지 않아 물을 안 주면 화면을 갱신하지 않는다', async () => {
    const { engine } = setup();
    let calls = 0;
    engine.subscribe(() => calls++);
    await engine.water({ verified: false, waterReward: 3 });
    assert.equal(calls, 0);
  });

  test('화면을 떠나 구독을 끊으면 더 받지 않는다', async () => {
    const { engine } = setup();
    let calls = 0;
    const unsubscribe = engine.subscribe(() => calls++);
    await engine.water(verified(2));
    unsubscribe();
    await engine.water(verified(2));
    assert.equal(calls, 1);
  });

  test('구독한 쪽에서 오류가 나도 물주기는 저장되고 실패하지 않는다', async (t) => {
    const { engine } = setup();
    t.mock.method(console, 'error', () => {});
    engine.subscribe(() => {
      throw new Error('화면 오류');
    });
    const r = await engine.water(verified(4));
    assert.equal(r.waterTotal, 4);
    assert.equal((await engine.getProgress())?.waterTotal, 4);
  });
});
