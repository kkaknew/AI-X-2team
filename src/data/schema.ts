/**
 * 데이터 계층: 기기 내 SQLite DB 스키마와 초기 데이터. (#4 [2] DB 스키마 생성)
 *
 * 모든 데이터는 휴대폰 안의 SQLite 파일에만 저장한다. 서버는 쓰지 않는다.
 * 이 파일은 SQL 문자열만 가지고 있어서, 앱(expo-sqlite)과 테스트(node:sqlite)가 같이 쓴다.
 *
 * 스키마를 바꿀 때는 MIGRATIONS 배열 끝에 새 SQL을 추가한다. 이미 있는 항목은 고치지 않는다.
 * (이미 설치된 앱의 DB는 PRAGMA user_version으로 몇 번째까지 적용했는지 기억한다.)
 */

/** 1번 마이그레이션: ERD의 테이블 6개 */
const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  nickname    TEXT    NOT NULL DEFAULT '나',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS growth_stages (
  id              INTEGER PRIMARY KEY,
  name            TEXT    NOT NULL UNIQUE,
  water_required  INTEGER NOT NULL CHECK (water_required >= 0)
);

CREATE TABLE IF NOT EXISTS activity_types (
  id            INTEGER PRIMARY KEY,
  code          TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  water_reward  INTEGER NOT NULL CHECK (water_reward > 0),
  rule          TEXT    NOT NULL CHECK (json_valid(rule))
);

CREATE TABLE IF NOT EXISTS trees (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  stage_id         INTEGER NOT NULL REFERENCES growth_stages(id),
  water_total      INTEGER NOT NULL DEFAULT 0 CHECK (water_total >= 0),
  status           TEXT    NOT NULL DEFAULT 'growing'
                   CHECK (status IN ('growing', 'wilted', 'completed')),
  planted_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  last_watered_at  TEXT,
  completed_at     TEXT
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  tree_id       INTEGER REFERENCES trees(id),
  type_id       INTEGER NOT NULL REFERENCES activity_types(id),
  started_at    TEXT    NOT NULL,
  ended_at      TEXT,
  duration_min  INTEGER CHECK (duration_min >= 0),
  distance_m    INTEGER CHECK (distance_m >= 0),
  char_count    INTEGER CHECK (char_count >= 0),
  verified      INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  water_given   INTEGER NOT NULL DEFAULT 0 CHECK (water_given >= 0)
);

CREATE TABLE IF NOT EXISTS reminders (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  type_id    INTEGER REFERENCES activity_types(id),
  remind_at  TEXT    NOT NULL CHECK (remind_at GLOB '[0-2][0-9]:[0-5][0-9]'),
  enabled    INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_started ON activity_logs (user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_trees_user_status ON trees (user_id, status);
`;

/**
 * 초기 데이터: 성장 단계, 활동 5종, 기본 사용자, 첫 씨앗.
 * 수치(필요한 물의 양, 보상, 인증 기준)는 예시 값이다. 팀에서 확정하면 새 마이그레이션으로 바꾼다.
 */
const SEED = `
INSERT OR IGNORE INTO growth_stages (id, name, water_required) VALUES
  (1, '씨앗',      0),
  (2, '새싹',     10),
  (3, '묘목',     30),
  (4, '어린 나무', 60),
  (5, '나무',    100);

INSERT OR IGNORE INTO activity_types (id, code, name, water_reward, rule) VALUES
  (1, 'walk',       '산책', 3, '{"min_distance_m": 1000, "min_duration_min": 20, "max_avg_speed_kmh": 7}'),
  (2, 'diary',      '일기', 2, '{"min_char_count": 1}'),
  (3, 'meditation', '명상', 2, '{"require_full_playback": true, "allow_touch": false, "allow_leave_app": false, "allow_screen_off": true}'),
  (4, 'reading',    '독서', 3, '{"min_char_count": 200}'),
  (5, 'sleep',      '수면', 2, '{"min_duration_min": 420}');

INSERT OR IGNORE INTO users (id, nickname) VALUES (1, '나');

INSERT OR IGNORE INTO trees (id, user_id, stage_id) VALUES (1, 1, 1);
`;

/** 순서대로 한 번씩만 적용된다. 인덱스 + 1이 user_version이 된다. */
export const MIGRATIONS: readonly string[] = [CREATE_TABLES + SEED];

export const SCHEMA_VERSION = MIGRATIONS.length;

export const TABLE_NAMES = [
  'users',
  'growth_stages',
  'activity_types',
  'trees',
  'activity_logs',
  'reminders',
] as const;

export type ActivityCode = 'walk' | 'diary' | 'meditation' | 'reading' | 'sleep';

export const ACTIVITY_CODES: readonly ActivityCode[] = [
  'walk',
  'diary',
  'meditation',
  'reading',
  'sleep',
];

/** currentVersion까지 적용된 DB에 아직 적용하지 않은 마이그레이션 목록 */
export function pendingMigrations(currentVersion: number): { version: number; sql: string }[] {
  return MIGRATIONS.map((sql, i) => ({ version: i + 1, sql })).filter(
    (m) => m.version > currentVersion,
  );
}
