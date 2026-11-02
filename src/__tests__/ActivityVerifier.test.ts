import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import type { ActivityCode } from '../data/schema.ts';
import { pendingMigrations } from '../data/schema.ts';
import { ActivityVerifier, InvalidRuleError, parseRule } from '../logic/ActivityVerifier.ts';

/**
 * #6 [4] 활동 인증 규칙
 * 완료 조건: 활동별 완료 조건을 판정한다. 평균 시속 7km 초과 산책은 인정하지 않는 테스트가 통과한다.
 *
 * 기준 수치는 앱과 같은 DB 초기 데이터(activity_types.rule)를 Node 내장 SQLite로 읽어서 쓴다.
 * 지금 기준: 산책 1km·20분 이상·평균 시속 7km 이하 / 일기 1자 / 독후감 200자 / 수면 7시간
 */
function rulesFromDb(): Record<ActivityCode, string> {
  const db = new DatabaseSync(':memory:');
  for (const m of pendingMigrations(0)) db.exec(m.sql);
  const rows = db.prepare('SELECT code, rule FROM activity_types').all() as { code: ActivityCode; rule: string }[];
  db.close();
  return Object.fromEntries(rows.map((r) => [r.code, r.rule])) as Record<ActivityCode, string>;
}

const RULES = rulesFromDb();
const verifier = new ActivityVerifier();
const min = (m: number) => m * 60;

describe('산책', () => {
  test('평균 시속 7km 산책은 인정한다 (2.8km를 24분)', () => {
    const result = verifier.verify({ type: 'walk', distanceM: 2800, durationSec: min(24) }, RULES.walk);
    assert.deepEqual(result, { verified: true, reasons: [] });
  });

  test('평균 시속 7km 초과 산책은 인정하지 않는다 (3km를 24분 = 7.5km/h)', () => {
    const result = verifier.verify({ type: 'walk', distanceM: 3000, durationSec: min(24) }, RULES.walk);
    assert.equal(result.verified, false);
    assert.deepEqual(result.reasons, ['평균 시속이 7km를 넘어요 (7.5km/h). 차량 이동은 인정되지 않아요']);
  });

  test('7km/h를 아주 조금만 넘어도 인정하지 않는다 (2801m를 24분)', () => {
    assert.equal(verifier.verify({ type: 'walk', distanceM: 2801, durationSec: min(24) }, RULES.walk).verified, false);
  });

  test('차를 타고 이동하면 인정하지 않는다 (10km를 20분 = 30km/h)', () => {
    const result = verifier.verify({ type: 'walk', distanceM: 10_000, durationSec: min(20) }, RULES.walk);
    assert.equal(result.verified, false);
    assert.match(result.reasons[0], /30km\/h/);
  });

  test('보통 걸음으로 2.1km를 30분 걸으면 인정한다', () => {
    assert.equal(verifier.verify({ type: 'walk', distanceM: 2100, durationSec: min(30) }, RULES.walk).verified, true);
  });

  test('1km보다 짧으면 인정하지 않는다', () => {
    const result = verifier.verify({ type: 'walk', distanceM: 800, durationSec: min(25) }, RULES.walk);
    assert.deepEqual(result.reasons, ['거리가 1000m보다 짧아요 (800m)']);
  });

  test('20분보다 짧으면 인정하지 않고, 이유가 여러 개면 다 알려준다', () => {
    const result = verifier.verify({ type: 'walk', distanceM: 1200, durationSec: min(10) }, RULES.walk);
    assert.equal(result.verified, false);
    assert.deepEqual(result.reasons, [
      '시간이 20분보다 짧아요 (10분)',
      '평균 시속이 7km를 넘어요 (7.2km/h). 차량 이동은 인정되지 않아요',
    ]);
  });

  test('GPS를 못 받아 거리·시간이 0이면 인정하지 않는다', () => {
    const result = verifier.verify({ type: 'walk', distanceM: 0, durationSec: 0 }, RULES.walk);
    assert.equal(result.verified, false);
    assert.equal(result.reasons.length, 2);
  });
});

describe('일기·독서', () => {
  test('일기는 쓰면 인정, 안 쓰면 인정하지 않는다', () => {
    assert.equal(verifier.verify({ type: 'diary', charCount: 1 }, RULES.diary).verified, true);
    assert.deepEqual(verifier.verify({ type: 'diary', charCount: 0 }, RULES.diary).reasons, ['일기를 작성해야 해요']);
  });

  test('독후감은 200자부터 인정한다', () => {
    assert.equal(verifier.verify({ type: 'reading', charCount: 200 }, RULES.reading).verified, true);
    assert.deepEqual(verifier.verify({ type: 'reading', charCount: 199 }, RULES.reading).reasons, [
      '독후감이 200자보다 짧아요 (199자)',
    ]);
  });
});

describe('수면', () => {
  test('7시간부터 인정한다', () => {
    assert.equal(verifier.verify({ type: 'sleep', durationMin: 420 }, RULES.sleep).verified, true);
    assert.deepEqual(verifier.verify({ type: 'sleep', durationMin: 390 }, RULES.sleep).reasons, [
      '수면 시간이 7시간보다 짧아요 (6시간 30분)',
    ]);
  });
});

describe('명상', () => {
  const ok = { type: 'meditation', fullyPlayed: true, touched: false, leftApp: false } as const;

  test('음악을 끝까지 듣고 조작하지 않으면 인정한다', () => {
    assert.equal(verifier.verify(ok, RULES.meditation).verified, true);
  });

  test('화면이 꺼지는 것은 괜찮다', () => {
    assert.equal(verifier.verify({ ...ok, screenOff: true }, RULES.meditation).verified, true);
  });

  test('중간에 끊기거나, 화면을 만지거나, 앱을 나가면 인정하지 않는다', () => {
    assert.deepEqual(verifier.verify({ ...ok, fullyPlayed: false }, RULES.meditation).reasons, [
      '음악이 끝까지 재생되지 않았어요',
    ]);
    assert.deepEqual(verifier.verify({ ...ok, touched: true }, RULES.meditation).reasons, ['명상 중에 화면을 조작했어요']);
    assert.deepEqual(verifier.verify({ ...ok, leftApp: true }, RULES.meditation).reasons, ['명상 중에 앱을 벗어났어요']);
  });
});

describe('인증 기준(rule) 읽기', () => {
  test('DB에 있는 활동 5종의 기준을 모두 읽을 수 있다', () => {
    for (const code of Object.keys(RULES) as ActivityCode[]) {
      assert.doesNotThrow(() => parseRule(code, RULES[code]), code);
    }
    assert.equal(parseRule('walk', RULES.walk).max_avg_speed_kmh, 7);
  });

  test('기준이 깨져 있으면 알려준다', () => {
    assert.throws(() => parseRule('walk', 'not json'), InvalidRuleError);
    assert.throws(() => parseRule('walk', '{"min_distance_m": 1000}'), /max_avg_speed_kmh|min_duration_min/);
    assert.throws(() => verifier.verify({ type: 'reading', charCount: 300 }, '[]'), InvalidRuleError);
  });

  test('기준 수치를 바꾸면 판정도 따라 바뀐다 (코드 수정 없이)', () => {
    const faster = JSON.stringify({ min_distance_m: 1000, min_duration_min: 20, max_avg_speed_kmh: 8 });
    assert.equal(verifier.verify({ type: 'walk', distanceM: 3000, durationSec: min(24) }, faster).verified, true);
  });
});
