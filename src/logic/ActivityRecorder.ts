import type { ActivityLog, ActivityRepository } from '../data/ActivityRepository';
import type { LocalStore } from '../data/LocalStore';
import type { LocationRepository, WalkProgress } from '../data/LocationRepository';
import type { ActivityCode } from '../data/schema';
import type { ActivityInput, VerificationResult } from './ActivityVerifier';
import type { WateringInput } from './WateringEngine';

/**
 * 로직 계층: 활동 기록 화면(#8)이 쓰는 창구.
 *
 * 화면은 데이터 계층(DB, GPS)을 직접 부를 수 없어서 이 모듈을 통해서만 기록한다.
 * - 인증 기준(rule)을 DB에서 읽어 ActivityVerifier로 판정한다. 화면은 기준 수치를 모른다.
 * - 인증되면 그 활동의 물 보상(water_reward)만큼 WateringEngine(#7)으로 나무에 물을 준다.
 *   그러면 나무 화면(#9)은 WateringEngine.subscribe()로 바로 갱신된다.
 * - 수면(#13)은 취침·기상 시각을 실제 날짜·시각으로 바꿔 activity_logs에 저장한다.
 *   이미 기록한 잠과 시간이 겹치면 다시 기록하지 않는다 (같은 잠으로 물을 두 번 받지 않게).
 * - 일기(#10)는 본문을 기기 안 개인 기록 저장소(LocalStore)에만 저장하고,
 *   activity_logs에는 글자 수와 인증 결과만 남긴다.
 * - 산책 중인 상태(시작 시각, 지금까지 거리)를 들고 있어서,
 *   탭을 옮겼다 돌아와도 화면이 다시 이어서 보여줄 수 있다.
 */

export type { ActivityCode, ActivityInput, ActivityLog, VerificationResult, WalkProgress };

export interface ActivityRecorderDeps {
  /** 판정기. 보통 new ActivityVerifier() */
  verifier: { verify(activity: ActivityInput, ruleJson: string): VerificationResult };
  /** activity_types의 rule(JSON 문자열)과 water_reward를 읽어 온다 */
  loadActivityType(code: ActivityCode): Promise<{ rule: string; waterReward: number }>;
  /** 물주기. 보통 WateringEngine.water. 없으면(DB 준비 전 등) 판정만 한다 */
  water?: (input: WateringInput) => Promise<{ waterGiven: number }>;
  /** GPS 산책 기록 */
  location: LocationRepository;
  /** 활동 기록 저장소 (activity_logs). 없으면(DB 준비 전 등) 저장하지 않는다 */
  activities?: ActivityRepository;
  /** 현재 시각 (ms). 테스트에서 바꿔 끼운다 */
  now?: () => number;
  /** 일기 본문을 저장할 기기 안 개인 기록 저장소 (#10). 없으면 본문을 저장하지 않는다 */
  localStore?: LocalStore;
}

/** 일기를 기록한 결과 */
export interface DiaryResult extends RecordResult {
  /** 기기에 저장된 일기 번호. 저장하지 않았으면 null */
  entryId: number | null;
  charCount: number;
}

/** 휴대폰 시간대 기준 날짜 ("2026-11-17"). 하루 한 번 판단에 쓴다 */
export function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 글자 수: 앞뒤 공백을 빼고, 이모지 같은 글자도 1자로 센다 */
export const countChars = (text: string): number => Array.from(text.trim()).length;

/** 활동 1건을 기록한 결과 */
export interface RecordResult extends VerificationResult {
  /** 이번에 나무에 준 물. 인증되지 않았으면 0 */
  waterGiven: number;
  /** 인증은 됐지만 물을 주지 않은 이유 등, 화면에 함께 보여줄 안내. 없으면 undefined */
  notice?: string;
}

/** 산책이 끝났을 때 화면에 보여줄 값 */
export interface WalkResult {
  distanceM: number;
  durationSec: number;
  result: RecordResult;
}

/** 잠든 시각부터 일어난 시각까지 */
export interface SleepPeriod {
  /** 잠든 시각 */
  startedAt: Date;
  /** 일어난 시각 */
  endedAt: Date;
  durationMin: number;
}

/** 수면을 기록한 결과 */
export interface SleepResult extends SleepPeriod {
  result: RecordResult;
}

/** 이미 기록한 잠과 시간이 겹치거나, 그날(일어난 날짜) 수면을 이미 기록했을 때 */
export class DuplicateSleepError extends Error {
  constructor(message = '이미 기록한 수면 시간과 겹쳐요. 같은 잠은 한 번만 기록할 수 있어요') {
    super(message);
    this.name = 'DuplicateSleepError';
  }
}

/** 진행 중인 산책 */
export interface WalkState {
  /** 시작 시각 (ms) */
  startedAt: number;
  /** 지금까지 걸은 거리 (m) */
  distanceM: number;
}

export class ActivityRecorder {
  private readonly deps: ActivityRecorderDeps;
  private walk: WalkState | null = null;
  private walkListener: ((walk: WalkState) => void) | null = null;

  constructor(deps: ActivityRecorderDeps) {
    this.deps = deps;
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  /**
   * 활동 1건을 판정하고, 인증되면 물을 준다.
   * 일기·독서는 본문이 아니라 글자 수만 받는다.
   */
  async record(activity: ActivityInput, options: { water?: boolean } = {}): Promise<RecordResult> {
    const { rule, waterReward } = await this.deps.loadActivityType(activity.type);
    const result = this.deps.verifier.verify(activity, rule);
    let waterGiven = 0;
    if (result.verified && this.deps.water && options.water !== false) {
      ({ waterGiven } = await this.deps.water({ verified: true, waterReward }));
    }
    return { ...result, waterGiven };
  }

  /**
   * 수면 기록 (#13). 취침·기상 시각("HH:MM")을 받아 가장 최근의 그 잠으로 보고,
   * 판정·물주기를 한 뒤 activity_logs에 저장한다.
   * 수면은 하루(일어난 날짜) 한 번만 기록한다. 물 보상은 1 (schema 3번 마이그레이션).
   * 형식이 틀리면 Error, 이미 기록한 잠과 겹치거나 그날 이미 기록했으면 DuplicateSleepError를 던진다.
   */
  async recordSleep(bedtime: string, wakeTime: string): Promise<SleepResult> {
    const period = sleepPeriod(bedtime, wakeTime, new Date(this.now()));
    if (!period) throw new Error('시각을 23:30처럼 "시:분" 형식으로 입력해 주세요');

    const startedAt = period.startedAt.toISOString();
    const endedAt = period.endedAt.toISOString();
    const activities = this.deps.activities;
    if (activities) {
      if ((await activities.findOverlapping('sleep', startedAt, endedAt)).length > 0) {
        throw new DuplicateSleepError();
      }
      // 하루(일어난 날짜, 휴대폰 시간대 기준)에 한 번만. 밤잠을 기록했으면 같은 날 낮잠은 기록하지 않는다
      const wakeDay = localDay(period.endedAt);
      const recent = await activities.recentLogs('sleep', 20);
      if (recent.some((log) => log.endedAt && localDay(new Date(log.endedAt)) === wakeDay)) {
        const d = period.endedAt;
        throw new DuplicateSleepError(
          `${d.getMonth() + 1}/${d.getDate()}에 일어난 수면은 이미 기록했어요. 수면은 하루에 한 번만 기록할 수 있어요`,
        );
      }
    }

    const result = await this.record({ type: 'sleep', durationMin: period.durationMin });
    await activities?.addLog({
      type: 'sleep',
      startedAt,
      endedAt,
      durationMin: period.durationMin,
      verified: result.verified,
      waterGiven: result.waterGiven,
    });
    return { ...period, result };
  }

  /**
   * 일기 1편을 기록한다. (#10 [8] 일기 로컬 저장)
   * 1. 본문은 LocalStore(기기 안 개인 기록 DB)에만 저장한다. 빈 일기는 저장하지 않는다.
   * 2. 판정과 물주기에는 글자 수만 넘긴다.
   * 3. activity_logs에는 "일기, 몇 자, 인증 여부, 받은 물"만 남긴다. 본문은 넘기지 않는다.
   * 4. 일기로 물을 받는 것은 하루(휴대폰 날짜 기준) 한 번뿐이다. 그날 두 번째 일기부터는
   *    저장·인증은 되지만 물은 주지 않는다. 앱을 껐다 켜도 activity_logs로 확인하므로 다시 받을 수 없다.
   */
  async recordDiary(body: string): Promise<DiaryResult> {
    const writtenAt = new Date(this.now());
    const charCount = countChars(body);
    const alreadyWatered = await this.wateredToday('diary', writtenAt);

    let entryId: number | null = null;
    if (charCount > 0 && this.deps.localStore) {
      ({ id: entryId } = await this.deps.localStore.saveDiary(body.trim(), charCount, writtenAt));
    }

    const recorded = await this.record({ type: 'diary', charCount }, { water: !alreadyWatered });
    const result: RecordResult =
      recorded.verified && alreadyWatered
        ? { ...recorded, notice: '오늘은 이미 일기로 물을 받았어요. 일기는 저장했고, 물은 내일 다시 받을 수 있어요' }
        : recorded;

    await this.deps.activities?.addLog({
      type: 'diary',
      startedAt: writtenAt.toISOString(),
      endedAt: null,
      durationMin: null,
      charCount,
      verified: result.verified,
      waterGiven: result.waterGiven,
    });

    return { ...result, entryId, charCount };
  }

  /** 같은 종류의 활동으로 오늘(at과 같은 날짜) 이미 물을 받았는가. 저장소가 없으면 false */
  private async wateredToday(type: ActivityCode, at: Date): Promise<boolean> {
    if (!this.deps.activities) return false;
    const day = localDay(at);
    const logs = await this.deps.activities.recentLogs(type, 20);
    return logs.some((log) => log.waterGiven > 0 && localDay(new Date(log.startedAt)) === day);
  }

  /** 최근 수면 기록 (최근 것부터). 저장소가 없으면 빈 배열 */
  async recentSleeps(limit = 3): Promise<ActivityLog[]> {
    return this.deps.activities ? this.deps.activities.recentLogs('sleep', limit) : [];
  }

  /** 산책 시작. 위치 권한이 없으면 에러를 던진다 (메시지를 화면에 그대로 보여주면 된다). */
  async startWalk(): Promise<void> {
    const walk: WalkState = { startedAt: this.now(), distanceM: 0 };
    this.walk = walk;
    try {
      await this.deps.location.startWalk((progress) => {
        if (this.walk !== walk) return;
        walk.distanceM = progress.distanceM;
        this.walkListener?.({ ...walk });
      });
    } catch (error) {
      if (this.walk === walk) this.walk = null;
      throw error;
    }
  }

  /** 진행 중인 산책. 없으면 null */
  currentWalk(): WalkState | null {
    return this.walk ? { ...this.walk } : null;
  }

  /** 산책 거리가 바뀔 때마다 알림을 받는다. 돌려준 함수를 부르면 해제된다. */
  watchWalk(listener: (walk: WalkState) => void): () => void {
    this.walkListener = listener;
    return () => {
      if (this.walkListener === listener) this.walkListener = null;
    };
  }

  /** 산책 종료 후 판정. 좌표는 데이터 계층에서 이미 버려졌고 거리·시간만 넘어온다. */
  async finishWalk(): Promise<WalkResult> {
    this.walk = null;
    const { distanceM, durationSec } = await this.deps.location.stopWalk();
    const result = await this.record({ type: 'walk', distanceM, durationSec });
    return { distanceM, durationSec, result };
  }
}

/** "HH:MM"을 자정부터의 분으로. 형식이 틀리면 null */
function parseClock(text: string): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * 취침·기상 시각("HH:MM")으로 잔 시간(분)을 구한다.
 * 기상 시각이 취침 시각보다 이르면 다음 날 일어난 것으로 본다. 형식이 틀리거나 두 시각이 같으면 null.
 */
export function sleepDurationMin(bedtime: string, wakeTime: string): number | null {
  const bed = parseClock(bedtime);
  const wake = parseClock(wakeTime);
  if (bed === null || wake === null || bed === wake) return null;
  return wake > bed ? wake - bed : wake + 24 * 60 - bed;
}

/**
 * 취침·기상 시각("HH:MM")을 실제 날짜·시각으로 바꾼다.
 * 기상 시각은 now 이전 중 가장 최근의 그 시각(오늘, 아직 안 됐으면 어제)으로 보고,
 * 취침 시각은 거기서 잔 시간만큼 거슬러 올라간다. 시각은 기기의 현지 시간 기준이다.
 * 형식이 틀리거나 두 시각이 같으면 null.
 */
export function sleepPeriod(bedtime: string, wakeTime: string, now: Date): SleepPeriod | null {
  const durationMin = sleepDurationMin(bedtime, wakeTime);
  const wake = parseClock(wakeTime);
  if (durationMin === null || wake === null) return null;

  const endedAt = new Date(now);
  endedAt.setHours(Math.floor(wake / 60), wake % 60, 0, 0);
  if (endedAt.getTime() > now.getTime()) endedAt.setDate(endedAt.getDate() - 1);
  const startedAt = new Date(endedAt.getTime() - durationMin * 60_000);
  return { startedAt, endedAt, durationMin };
}
