/**
 * 데이터 계층: 개인 기록 DB(dopamine-tree-local.db)의 스키마. (#10)
 *
 * 앱 DB(schema.ts)와 파일을 나눴다. 앱 DB는 나중에 결과를 공유·동기화할 수 있지만,
 * 이 파일의 내용(일기 본문)은 기기 밖으로 나가지 않는다.
 * 바꿀 때는 LOCAL_MIGRATIONS 끝에 추가한다. 이미 있는 항목은 고치지 않는다.
 */
const CREATE_DIARY = `
CREATE TABLE IF NOT EXISTS diary_entries (
  id          INTEGER PRIMARY KEY,
  written_at  TEXT    NOT NULL,
  body        TEXT    NOT NULL,
  char_count  INTEGER NOT NULL CHECK (char_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_diary_entries_written ON diary_entries (written_at);
`;

/** 2번: 독후감 (#12 [10] 독서 인증). 책 제목과 본문도 일기처럼 기기 밖으로 나가지 않는다 */
const CREATE_READING = `
CREATE TABLE IF NOT EXISTS reading_entries (
  id          INTEGER PRIMARY KEY,
  written_at  TEXT    NOT NULL,
  title       TEXT    NOT NULL DEFAULT '',
  body        TEXT    NOT NULL,
  char_count  INTEGER NOT NULL CHECK (char_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_reading_entries_written ON reading_entries (written_at);
`;

export const LOCAL_MIGRATIONS: readonly string[] = [CREATE_DIARY, CREATE_READING];

export const LOCAL_SCHEMA_VERSION = LOCAL_MIGRATIONS.length;

/** currentVersion까지 적용된 개인 기록 DB에 아직 적용하지 않은 마이그레이션 */
export function pendingLocalMigrations(currentVersion: number): { version: number; sql: string }[] {
  return LOCAL_MIGRATIONS.map((sql, i) => ({ version: i + 1, sql })).filter(
    (m) => m.version > currentVersion,
  );
}
