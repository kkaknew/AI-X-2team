import * as SQLite from 'expo-sqlite';

import { pendingMigrations, TABLE_NAMES } from './schema';

/**
 * 데이터 계층: 휴대폰 안의 SQLite DB를 열고 스키마를 최신으로 맞춘다. (#4)
 * 로직 계층은 이 파일을 직접 쓰지 않고 Repository 인터페이스만 안다.
 */
const DB_NAME = 'dopamine-tree.db';

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export function openAppDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!opening) {
    opening = open().catch((e) => {
      opening = null;
      throw e;
    });
  }
  return opening;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (const m of pendingMigrations(row?.user_version ?? 0)) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(m.sql);
      await db.execAsync(`PRAGMA user_version = ${m.version}`);
    });
  }
  return db;
}

/**
 * 활동 종류 1개의 인증 기준(rule JSON 문자열)과 물 보상.
 * 판정과 물주기는 로직 계층이 한다. 여기서는 값만 읽어 준다.
 */
export async function getActivityType(
  code: string,
): Promise<{ rule: string; waterReward: number }> {
  const db = await openAppDatabase();
  const row = await db.getFirstAsync<{ rule: string; water_reward: number }>(
    'SELECT rule, water_reward FROM activity_types WHERE code = ?',
    code,
  );
  if (!row) throw new Error(`활동 종류(${code})를 찾을 수 없습니다`);
  return { rule: row.rule, waterReward: row.water_reward };
}

/** 개발 중 확인용: 테이블별 행 개수 */
export async function describeDatabase(): Promise<string> {
  const db = await openAppDatabase();
  const parts: string[] = [];
  for (const table of TABLE_NAMES) {
    const r = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
    parts.push(`${table} ${r?.n ?? 0}`);
  }
  const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return `DB v${v?.user_version ?? 0} | ${parts.join(', ')}`;
}
