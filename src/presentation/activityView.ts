import type { ActivityCode, RecordResult } from '../logic/ActivityRecorder';

/**
 * 표현 계층: 활동 화면 5개(시안 "활동 화면", "활동 화면 상태")에 보여줄 글자를 정한다.
 * React Native 없이 테스트할 수 있도록 화면 파일과 나눴다. 인증 기준은 여기서 정하지 않는다.
 */

export const ACTIVITY_LABEL: Record<ActivityCode, string> = {
  walk: '산책',
  meditation: '명상',
  diary: '일기',
  reading: '독서',
  sleep: '수면',
};

/** 기록 결과를 시안의 어떤 모양으로 보여줄지 */
export type ResultView =
  /** "오늘 산책 기록이 올라갔어요!" 카드 */
  | { kind: 'success'; message: string }
  /** 하루 한 번 안내 (인증은 됐지만 물 0, 또는 독후감 200자 미만으로 저장만 됨) */
  | { kind: 'notice'; text: string }
  /** 실패 카드 "인증하지 못했어요" + 이유 */
  | { kind: 'failure'; reasons: string[] };

export function resultView(type: ActivityCode, result: RecordResult): ResultView {
  if (result.notice && (result.waterGiven === 0 || !result.verified)) {
    return { kind: 'notice', text: result.notice };
  }
  if (!result.verified) return { kind: 'failure', reasons: result.reasons };
  return { kind: 'success', message: `오늘 ${ACTIVITY_LABEL[type]} 기록이 올라갔어요!` };
}

/** 글자 수 표시. goal이 1보다 크면 "90 / 200자"와 남은 글자 안내 (독후감), 아니면 "126자" (일기) */
export function writingCounter(count: number, goal: number): { text: string; hint: string | null } {
  if (goal <= 1) return { text: `${count}자`, hint: null };
  return {
    text: `${count} / ${goal}자`,
    hint: count >= goal ? '인증 기준을 채웠어요' : `${goal - count}자 더 쓰면 인증돼요`,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 초 → "12:34" */
export const clock = (sec: number) => `${pad(Math.floor(sec / 60))}:${pad(Math.max(0, sec) % 60)}`;

/** m → "1.20km" */
export const km = (m: number) => `${(m / 1000).toFixed(2)}km`;

/** "2026.11.24" (휴대폰 시간대) */
export const dotDate = (d: Date) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

/** 분 → "7시간 30분" */
export const hoursText = (min: number) =>
  `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}`;

/* ---------- 수면 시각 휠 (시안: 오전/오후 · 시 · 10분 단위 분) ---------- */

export type Meridiem = '오전' | '오후';

export interface WheelTime {
  meridiem: Meridiem;
  /** 1~12 */
  hour: number;
  /** 0, 10, 20, 30, 40, 50 */
  minute: number;
}

export const MERIDIEMS: readonly Meridiem[] = ['오전', '오후'];
export const WHEEL_HOURS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const WHEEL_MINUTES: readonly number[] = [0, 10, 20, 30, 40, 50];

/** "23:30" → 오후 11:30 (분은 가장 가까운 10분으로) */
export function toWheel(clockText: string): WheelTime {
  const [h, m] = clockText.split(':').map(Number);
  const minute = Math.min(50, Math.round((m || 0) / 10) * 10);
  const hour24 = ((h || 0) % 24 + 24) % 24;
  return {
    meridiem: hour24 < 12 ? '오전' : '오후',
    hour: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
  };
}

/** 오후 11:30 → "23:30" (ActivityRecorder.recordSleep이 받는 형식) */
export function fromWheel(t: WheelTime): string {
  const base = t.hour % 12;
  const hour24 = t.meridiem === '오후' ? base + 12 : base;
  return `${pad(hour24)}:${pad(t.minute)}`;
}

/** 시각 카드의 큰 글자 "11:30" */
export const wheelLabel = (t: WheelTime) => `${t.hour}:${pad(t.minute)}`;
