import type { ActivityLog, ActivityRepository } from '../data/ActivityRepository';
import type { ActivityCode } from '../data/schema';

/**
 * 로직 계층: 일·주간 활동 횟수와 받은 물의 양을 집계한다. (#14 [12] 기록 조회 화면)
 *
 * 완료 조건: 일·주간 활동 횟수와 받은 물의 양이 표시된다.
 *
 * - 횟수는 "인증된" 활동만 센다. 인증에 실패한 기록은 세지 않는다.
 * - 물은 실제로 나무에 준 양(activity_logs.water_given)을 더한다. 하루 한 번 규칙으로 물 0인 기록도 횟수에는 들어간다.
 * - 날짜는 휴대폰 시간대 기준이다. 수면은 잠든 날이 아니라 일어난 날로 센다 (수면 하루 한 번 규칙과 같게).
 * - 주간은 오늘을 포함한 최근 7일이다.
 * - activity_logs에 저장되는 활동만 집계된다. (산책은 아직 저장하지 않아서 빠진다)
 */

export type CountByType = Record<ActivityCode, number>;

/** 하루 집계 */
export interface DayStats {
  /** 휴대폰 시간대 기준 날짜 "2026-11-18" */
  day: string;
  /** 인증된 활동 수 */
  count: number;
  /** 받은 물 */
  water: number;
  byType: CountByType;
}

/** 여러 날 집계 */
export interface PeriodStats {
  /** 오래된 날부터 오늘까지 하루씩 */
  days: DayStats[];
  count: number;
  water: number;
  byType: CountByType;
}

export interface StatsServiceDeps {
  activities: ActivityRepository;
  /** 현재 시각 (ms). 테스트에서 바꿔 끼운다 */
  now?: () => number;
}

/** schema.ts의 ACTIVITY_CODES와 같은 순서 (타입만 가져와 테스트에서도 그대로 돌게 한다) */
const ACTIVITY_CODES: readonly ActivityCode[] = ['walk', 'diary', 'meditation', 'reading', 'sleep'];

const emptyCounts = (): CountByType => ({ walk: 0, diary: 0, meditation: 0, reading: 0, sleep: 0 });

/** 휴대폰 시간대 기준 날짜 ("2026-11-18"). ActivityRecorder.localDay와 같은 형식 */
function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 이 기록을 어느 날로 셀지. 수면은 일어난 날 */
function dayOf(log: ActivityLog): string {
  const at = log.type === 'sleep' && log.endedAt ? log.endedAt : log.startedAt;
  return localDay(new Date(at));
}

export class StatsService {
  private readonly deps: StatsServiceDeps;

  constructor(deps: StatsServiceDeps) {
    this.deps = deps;
  }

  private now(): Date {
    return new Date(this.deps.now ? this.deps.now() : Date.now());
  }

  /** 오늘 하루 */
  async today(): Promise<DayStats> {
    const { days } = await this.lastDays(1);
    return days[0];
  }

  /** 오늘을 포함한 최근 n일 (기본 7일) */
  async lastDays(n = 7): Promise<PeriodStats> {
    const today = this.now();
    const days: DayStats[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      days.push({ day: localDay(d), count: 0, water: 0, byType: emptyCounts() });
    }

    // 수면은 전날 밤에 잠든 기록이 오늘로 세어지므로 하루 더 앞에서부터 읽는다
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const logs = await this.deps.activities.logsBetween(from.toISOString(), to.toISOString());

    const byDay = new Map(days.map((d) => [d.day, d]));
    for (const log of logs) {
      const day = byDay.get(dayOf(log));
      if (!day) continue;
      day.water += log.waterGiven;
      if (log.verified) {
        day.count += 1;
        day.byType[log.type] += 1;
      }
    }

    const byType = emptyCounts();
    for (const d of days) for (const code of ACTIVITY_CODES) byType[code] += d.byType[code];
    return {
      days,
      count: days.reduce((sum, d) => sum + d.count, 0),
      water: days.reduce((sum, d) => sum + d.water, 0),
      byType,
    };
  }
}
