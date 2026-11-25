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

/** 열매 팝업의 누적 (산책: 총 횟수·총 거리 / 명상: 총 횟수·총 시간) */
export interface ActivityTotals {
  /** 인증된 횟수 */
  count: number;
  /** 인증된 기록의 거리 합 (m). 산책만 */
  distanceM: number;
  /** 인증된 기록의 시간 합 (분) */
  durationMin: number;
}

/** 수면 열매: 한 달 동안 날짜(일어난 날)별 잔 시간 */
export interface SleepMonth {
  year: number;
  /** 1~12 */
  month: number;
  /** "2026-11-18" → 그날 일어난 수면의 잔 시간(분). 기록한 날만 들어 있다 */
  byDay: Record<string, number>;
  /** 이번 달 총 수면 시간 (분) */
  totalMin: number;
  /** 기록한 날의 하루 평균 (분, 반올림). 기록이 없으면 0 */
  averageMin: number;
}

/** 나무 한 그루에서 한 일 (지난 나무 보기, 나무 완성 화면) */
export interface TreeSummary {
  /** 인증된 활동 수 */
  count: number;
  /** 인증된 활동 종류 = 달린 열매 (시안 순서) */
  fruits: ActivityCode[];
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

  /**
   * since 이후 한 번이라도 인증된 활동 종류 (메인 화면의 열매).
   * 지금 나무를 심은 시각을 넣으면 "이 나무에서 해 본 활동"이 된다.
   * @param since ISO 시각 (보통 TreeProgress.plantedAt)
   */
  /**
   * since 이후 인증된 type 기록의 누적 (열매 팝업). 보통 since는 지금 나무를 심은 시각이다.
   * @param since ISO 또는 SQLite datetime 형식
   */
  async totalsSince(type: ActivityCode, since: string): Promise<ActivityTotals> {
    const logs = await this.logsSince(since);
    const done = logs.filter((log) => log.type === type && log.verified);
    return {
      count: done.length,
      distanceM: done.reduce((sum, log) => sum + (log.distanceM ?? 0), 0),
      durationMin: done.reduce((sum, log) => sum + (log.durationMin ?? 0), 0),
    };
  }

  /**
   * 한 달 동안의 수면 (수면 열매 달력). 날짜는 일어난 날(휴대폰 시간대)로 센다.
   * 같은 날 기록이 여러 개면 더한다. 인증 여부와 상관없이 잔 시간을 보여준다.
   * @param month 1~12
   */
  async sleepMonth(year: number, month: number): Promise<SleepMonth> {
    // 1일 아침에 일어난 잠은 전달 밤에 잠들었으므로 하루 앞에서부터 읽는다
    const from = new Date(year, month - 1, 0);
    const to = new Date(year, month, 1);
    const logs = await this.deps.activities.logsBetween(from.toISOString(), to.toISOString());
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const byDay: Record<string, number> = {};
    for (const log of logs) {
      if (log.type !== 'sleep' || log.durationMin === null) continue;
      const day = dayOf(log);
      if (!day.startsWith(prefix)) continue;
      byDay[day] = (byDay[day] ?? 0) + log.durationMin;
    }
    const values = Object.values(byDay);
    const totalMin = values.reduce((a, b) => a + b, 0);
    return {
      year,
      month,
      byDay,
      totalMin,
      averageMin: values.length > 0 ? Math.round(totalMin / values.length) : 0,
    };
  }

  /** 나무 한 그루에 연결된 기록으로 인증 횟수와 열매를 센다 */
  async treeSummary(treeId: number): Promise<TreeSummary> {
    const logs = (await this.deps.activities.logsForTree(treeId)).filter((log) => log.verified);
    const done = new Set(logs.map((log) => log.type));
    return { count: logs.length, fruits: ACTIVITY_CODES.filter((code) => done.has(code)) };
  }

  /** since(ISO 또는 SQLite datetime)부터 지금까지의 모든 기록 */
  private async logsSince(since: string): Promise<ActivityLog[]> {
    // 첫 씨앗의 planted_at은 SQLite datetime('now') 형식("2026-11-24 08:00:00", UTC)이라 ISO로 맞춘다
    const from = new Date(since.includes('T') ? since : `${since.replace(' ', 'T')}Z`).toISOString();
    const until = new Date(this.now().getTime() + 1).toISOString();
    return this.deps.activities.logsBetween(from, until);
  }

  async verifiedTypesSince(since: string): Promise<ActivityCode[]> {
    const logs = await this.logsSince(since);
    const done = new Set(logs.filter((log) => log.verified).map((log) => log.type));
    return ACTIVITY_CODES.filter((code) => done.has(code));
  }
}
