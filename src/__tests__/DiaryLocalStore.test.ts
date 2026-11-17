import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import { pendingLocalMigrations } from '../data/localSchema.ts';
import { pendingMigrations } from '../data/schema.ts';
import { SqliteActivityRepository } from '../data/SqliteActivityRepository.ts';
import { SqliteLocalStore } from '../data/SqliteLocalStore.ts';
import { SqliteTreeRepository } from '../data/SqliteTreeRepository.ts';
import type { SqlDatabase, SqlValue } from '../data/SqliteTreeRepository.ts';
import { ActivityRecorder, countChars } from '../logic/ActivityRecorder.ts';
import { ActivityVerifier } from '../logic/ActivityVerifier.ts';
import { WateringEngine } from '../logic/WateringEngine.ts';

/**
 * #10 [8] 일기 로컬 저장
 * 완료 조건: 일기 본문은 기기에만 저장되고, 서버에는 작성 여부만 기록된다.
 *
 * - 본문: 개인 기록 DB(dopamine-tree-local.db)의 diary_entries에만 들어간다
 * - 앱 DB(나중에 공유·동기화될 수 있는 쪽)의 activity_logs에는 글자 수·인증 여부·받은 물만 남는다
 * 앱과 같은 스키마를 Node 내장 SQLite(메모리 DB) 두 개로 만들어 확인한다.
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

const NOW = Date.parse('2026-11-17T12:00:00.000Z');
const DIARY = '오늘은 친구와 한강을 걸었다. 바람이 시원했다.';

function setup() {
  const appDb = new DatabaseSync(':memory:');
  appDb.exec('PRAGMA foreign_keys = ON;');
  for (const m of pendingMigrations(0)) appDb.exec(m.sql);

  const localDb = new DatabaseSync(':memory:');
  for (const m of pendingLocalMigrations(0)) localDb.exec(m.sql);

  const app = asSqlDatabase(appDb);
  const localStore = new SqliteLocalStore(asSqlDatabase(localDb));
  const watering = new WateringEngine(new SqliteTreeRepository(app));
  const recorder = new ActivityRecorder({
    verifier: new ActivityVerifier(),
    loadActivityType: async (code) => {
      const row = appDb
        .prepare('SELECT rule, water_reward FROM activity_types WHERE code = ?')
        .get(code) as { rule: string; water_reward: number };
      return { rule: row.rule, waterReward: row.water_reward };
    },
    water: (input) => watering.water(input),
    location: { startWalk: async () => {}, stopWalk: async () => ({ distanceM: 0, durationSec: 0 }) } as never,
    now: () => NOW,
    localStore,
    activities: new SqliteActivityRepository(app),
  });

  /** DB 안의 모든 테이블·모든 칸에서 text가 들어 있는 값을 찾는다 */
  const findText = (db: DatabaseSync, text: string): string[] => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    const hits: string[] = [];
    for (const { name } of tables) {
      for (const row of db.prepare(`SELECT * FROM ${name}`).all() as Record<string, unknown>[]) {
        for (const [col, v] of Object.entries(row)) {
          if (typeof v === 'string' && v.includes(text)) hits.push(`${name}.${col}`);
        }
      }
    }
    return hits;
  };

  return { appDb, localDb, localStore, recorder, findText };
}

describe('본문은 기기 안 개인 기록 DB에만 저장된다', () => {
  test('일기 본문이 개인 기록 DB에 저장되고 다시 읽을 수 있다', async () => {
    const { recorder, localStore } = setup();
    const r = await recorder.recordDiary(DIARY);
    assert.ok(r.entryId);
    const saved = await localStore.getDiary(r.entryId);
    assert.equal(saved?.body, DIARY);
    assert.equal(saved?.charCount, countChars(DIARY));
    assert.equal(saved?.writtenAt, new Date(NOW).toISOString());
  });

  test('앱 DB 어디에도 일기 본문이 없다', async () => {
    const { recorder, appDb, findText } = setup();
    await recorder.recordDiary(DIARY);
    assert.deepEqual(findText(appDb, '한강'), []);
  });

  test('본문 앞뒤 공백은 빼고 저장한다', async () => {
    const { recorder, localStore } = setup();
    const r = await recorder.recordDiary('  오늘도 맑음  \n');
    assert.equal((await localStore.getDiary(r.entryId!))?.body, '오늘도 맑음');
  });

  test('빈 일기는 저장하지 않는다', async () => {
    const { recorder, localDb } = setup();
    const r = await recorder.recordDiary('   ');
    assert.equal(r.entryId, null);
    assert.equal((localDb.prepare('SELECT COUNT(*) AS n FROM diary_entries').get() as { n: number }).n, 0);
  });

  test('최근 일기부터 목록으로 볼 수 있다', async () => {
    const { localStore } = setup();
    await localStore.saveDiary('첫 번째', 4, new Date('2026-11-15T10:00:00Z'));
    await localStore.saveDiary('두 번째', 4, new Date('2026-11-16T10:00:00Z'));
    const list = await localStore.listDiaries();
    assert.deepEqual(list.map((d) => d.body), ['두 번째', '첫 번째']);
  });
});

describe('앱 DB에는 작성 여부만 기록된다', () => {
  test('activity_logs에 일기 1건, 글자 수, 인증 여부, 받은 물이 남는다', async () => {
    const { recorder, appDb } = setup();
    const r = await recorder.recordDiary(DIARY);
    const rows = appDb
      .prepare(
        `SELECT t.code, l.char_count, l.verified, l.water_given, l.tree_id, l.started_at
           FROM activity_logs l JOIN activity_types t ON t.id = l.type_id`,
      )
      .all() as Record<string, unknown>[];
    assert.equal(rows.length, 1);
    assert.deepEqual({ ...rows[0] }, {
      code: 'diary',
      char_count: countChars(DIARY),
      verified: 1,
      water_given: r.waterGiven,
      tree_id: 1,
      started_at: new Date(NOW).toISOString(),
    });
  });

  test('activity_logs에는 본문을 담을 칸이 없다', () => {
    const { appDb } = setup();
    const cols = (appDb.prepare('PRAGMA table_info(activity_logs)').all() as { name: string }[]).map((c) => c.name);
    for (const banned of ['body', 'text', 'content', 'diary']) {
      assert.ok(!cols.includes(banned), `${banned} 칸이 있으면 안 된다`);
    }
  });

  test('빈 일기도 "작성하지 않음(인증 실패)"으로 기록되고 물은 받지 않는다', async () => {
    const { recorder, appDb } = setup();
    const r = await recorder.recordDiary('');
    assert.equal(r.verified, false);
    assert.equal(r.waterGiven, 0);
    const row = appDb.prepare('SELECT char_count, verified, water_given FROM activity_logs').get() as Record<string, number>;
    assert.deepEqual({ ...row }, { char_count: 0, verified: 0, water_given: 0 });
  });
});

describe('인증과 물주기는 그대로 동작한다', () => {
  test('일기를 쓰면 인증되고 보상만큼 물을 받는다', async () => {
    const { recorder, appDb } = setup();
    const reward = (appDb.prepare("SELECT water_reward AS w FROM activity_types WHERE code = 'diary'").get() as { w: number }).w;
    const r = await recorder.recordDiary(DIARY);
    assert.equal(r.verified, true);
    assert.equal(r.waterGiven, reward);
    assert.equal((appDb.prepare('SELECT water_total AS w FROM trees WHERE id = 1').get() as { w: number }).w, reward);
  });

  test('저장소가 연결되지 않아도 판정은 된다 (본문 저장만 건너뜀)', async () => {
    const recorder = new ActivityRecorder({
      verifier: new ActivityVerifier(),
      loadActivityType: async () => ({ rule: '{"min_char_count": 1}', waterReward: 2 }),
      location: {} as never,
    });
    const r = await recorder.recordDiary(DIARY);
    assert.equal(r.verified, true);
    assert.equal(r.entryId, null);
  });
});

describe('글자 수 세기', () => {
  test('앞뒤 공백은 세지 않고, 이모지도 1자로 센다', () => {
    assert.equal(countChars('  안녕  '), 2);
    assert.equal(countChars('좋아😀'), 3);
    assert.equal(countChars(''), 0);
  });
});
