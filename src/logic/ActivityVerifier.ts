import type { ActivityCode } from '../data/schema';

/**
 * 로직 계층: 활동별 완료 조건 판정. (#6 [4] 활동 인증 규칙)
 *
 * 기준 수치는 DB의 activity_types.rule(JSON)에 있고, 이 모듈은 그 값을 읽어서 판정만 한다.
 * 수치가 바뀌면 DB(마이그레이션)만 고치면 되고 이 코드는 그대로다.
 *
 * - 산책: 거리 ≥ min_distance_m, 시간 ≥ min_duration_min, 평균 시속 ≤ max_avg_speed_kmh
 *   (평균 시속 7km "초과"는 차량 이동으로 보고 인정하지 않는다. 딱 7km/h는 인정)
 * - 일기·독서: 글자 수 ≥ min_char_count (본문은 받지 않는다. 글자 수만)
 * - 수면: 잔 시간 ≥ min_duration_min
 * - 명상: 음악 끝까지 재생 + 화면 조작·앱 이탈 없음 (화면 꺼짐은 rule에 따라)
 *
 * 화면(#8)과 물주기 엔진(#7)은 이 규칙을 몰라도 된다. 결과(verified, reasons)만 쓴다.
 */

/** 판정에 넣는 활동 결과. 좌표나 본문 같은 원본은 들어오지 않는다. */
export type ActivityInput =
  | { type: 'walk'; distanceM: number; durationSec: number }
  | { type: 'diary'; charCount: number }
  | { type: 'reading'; charCount: number }
  | { type: 'sleep'; durationMin: number }
  | {
      type: 'meditation';
      /** 정해진 음악이 끝까지 재생됐는가 */
      fullyPlayed: boolean;
      /** 재생 중 화면을 조작했는가 */
      touched: boolean;
      /** 재생 중 다른 앱으로 나갔는가 */
      leftApp: boolean;
      /** 재생 중 화면이 꺼졌는가 */
      screenOff?: boolean;
    };

/** activity_types.rule 컬럼에 들어 있는 JSON 모양 */
export interface ActivityRules {
  walk: { min_distance_m: number; min_duration_min: number; max_avg_speed_kmh: number };
  diary: { min_char_count: number };
  reading: { min_char_count: number };
  sleep: { min_duration_min: number };
  meditation: {
    require_full_playback: boolean;
    allow_touch: boolean;
    allow_leave_app: boolean;
    allow_screen_off: boolean;
  };
}

export interface VerificationResult {
  verified: boolean;
  /** 인증되지 않은 이유. 화면에 그대로 보여줄 수 있는 문장. 인증되면 빈 배열 */
  reasons: string[];
}

/** rule JSON이 깨졌거나 필요한 값이 없을 때 */
export class InvalidRuleError extends Error {
  constructor(type: ActivityCode, detail: string) {
    super(`${type} 인증 기준(rule)이 올바르지 않습니다: ${detail}`);
    this.name = 'InvalidRuleError';
  }
}

const RULE_FIELDS: { [T in ActivityCode]: Record<keyof ActivityRules[T], 'number' | 'boolean'> } = {
  walk: { min_distance_m: 'number', min_duration_min: 'number', max_avg_speed_kmh: 'number' },
  diary: { min_char_count: 'number' },
  reading: { min_char_count: 'number' },
  sleep: { min_duration_min: 'number' },
  meditation: {
    require_full_playback: 'boolean',
    allow_touch: 'boolean',
    allow_leave_app: 'boolean',
    allow_screen_off: 'boolean',
  },
};

/** activity_types.rule 문자열을 읽어 필요한 값이 다 있는지 확인한다. */
export function parseRule<T extends ActivityCode>(type: T, json: string): ActivityRules[T] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidRuleError(type, 'JSON 형식이 아닙니다');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InvalidRuleError(type, 'JSON 객체가 아닙니다');
  }
  const record = parsed as Record<string, unknown>;
  for (const [key, kind] of Object.entries(RULE_FIELDS[type])) {
    if (typeof record[key] !== kind) {
      throw new InvalidRuleError(type, `${key}(${kind})가 없습니다`);
    }
  }
  return parsed as ActivityRules[T];
}

const minutes = (seconds: number) => Math.floor(seconds / 60);
const oneDecimal = (n: number) => Math.round(n * 10) / 10;

function verifyWalk(
  { distanceM, durationSec }: { distanceM: number; durationSec: number },
  rule: ActivityRules['walk'],
): string[] {
  const reasons: string[] = [];
  if (distanceM < rule.min_distance_m) {
    reasons.push(`거리가 ${rule.min_distance_m}m보다 짧아요 (${Math.round(distanceM)}m)`);
  }
  if (durationSec < rule.min_duration_min * 60) {
    reasons.push(`시간이 ${rule.min_duration_min}분보다 짧아요 (${minutes(durationSec)}분)`);
  }
  // 평균 시속 = (거리m / 1000) / (시간초 / 3600)
  // 나눗셈 오차 없이 비교하려고 양쪽에 곱한다: 거리m × 3600 > 최대시속 × 1000 × 시간초
  const tooFast =
    durationSec <= 0
      ? distanceM > 0
      : distanceM * 3600 > rule.max_avg_speed_kmh * 1000 * durationSec;
  if (tooFast) {
    const speed = durationSec > 0 ? oneDecimal((distanceM / durationSec) * 3.6) : Infinity;
    reasons.push(
      `평균 시속이 ${rule.max_avg_speed_kmh}km를 넘어요 (${speed}km/h). 차량 이동은 인정되지 않아요`,
    );
  }
  return reasons;
}

/** @param words 조사까지 붙인 말. 예: { object: '독후감을', subject: '독후감이' } */
function verifyWriting(
  charCount: number,
  rule: { min_char_count: number },
  words: { object: string; subject: string },
): string[] {
  if (charCount >= rule.min_char_count) return [];
  return rule.min_char_count <= 1
    ? [`${words.object} 작성해야 해요`]
    : [`${words.subject} ${rule.min_char_count}자보다 짧아요 (${charCount}자)`];
}

function verifySleep(durationMin: number, rule: ActivityRules['sleep']): string[] {
  if (durationMin >= rule.min_duration_min) return [];
  const hours = (min: number) => `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}`;
  return [`수면 시간이 ${hours(rule.min_duration_min)}보다 짧아요 (${hours(Math.max(0, durationMin))})`];
}

function verifyMeditation(
  input: Extract<ActivityInput, { type: 'meditation' }>,
  rule: ActivityRules['meditation'],
): string[] {
  const reasons: string[] = [];
  if (rule.require_full_playback && !input.fullyPlayed) reasons.push('음악이 끝까지 재생되지 않았어요');
  if (!rule.allow_touch && input.touched) reasons.push('명상 중에 화면을 조작했어요');
  if (!rule.allow_leave_app && input.leftApp) reasons.push('명상 중에 앱을 벗어났어요');
  if (!rule.allow_screen_off && input.screenOff) reasons.push('명상 중에 화면이 꺼졌어요');
  return reasons;
}

export class ActivityVerifier {
  /**
   * 활동 1건을 판정한다.
   * @param activity 활동 결과 (산책이면 LocationRepository.stopWalk()의 거리·시간)
   * @param ruleJson 그 활동 종류의 activity_types.rule 값
   */
  verify(activity: ActivityInput, ruleJson: string): VerificationResult {
    let reasons: string[];
    switch (activity.type) {
      case 'walk':
        reasons = verifyWalk(activity, parseRule('walk', ruleJson));
        break;
      case 'diary':
        reasons = verifyWriting(activity.charCount, parseRule('diary', ruleJson), {
          object: '일기를',
          subject: '일기가',
        });
        break;
      case 'reading':
        reasons = verifyWriting(activity.charCount, parseRule('reading', ruleJson), {
          object: '독후감을',
          subject: '독후감이',
        });
        break;
      case 'sleep':
        reasons = verifySleep(activity.durationMin, parseRule('sleep', ruleJson));
        break;
      case 'meditation':
        reasons = verifyMeditation(activity, parseRule('meditation', ruleJson));
        break;
    }
    return { verified: reasons.length === 0, reasons };
  }
}
