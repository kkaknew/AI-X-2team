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
 * - 산책 중인 상태(시작 시각, 지금까지 거리)를 들고 있어서,
 *   탭을 옮겼다 돌아와도 화면이 다시 이어서 보여줄 수 있다.
 */

export type { ActivityCode, ActivityInput, VerificationResult, WalkProgress };

export interface ActivityRecorderDeps {
  /** 판정기. 보통 new ActivityVerifier() */
  verifier: { verify(activity: ActivityInput, ruleJson: string): VerificationResult };
  /** activity_types의 rule(JSON 문자열)과 water_reward를 읽어 온다 */
  loadActivityType(code: ActivityCode): Promise<{ rule: string; waterReward: number }>;
  /** 물주기. 보통 WateringEngine.water. 없으면(DB 준비 전 등) 판정만 한다 */
  water?: (input: WateringInput) => Promise<{ waterGiven: number }>;
  /** GPS 산책 기록 */
  location: LocationRepository;
  /** 현재 시각 (ms). 테스트에서 바꿔 끼운다 */
  now?: () => number;
}

/** 활동 1건을 기록한 결과 */
export interface RecordResult extends VerificationResult {
  /** 이번에 나무에 준 물. 인증되지 않았으면 0 */
  waterGiven: number;
}

/** 산책이 끝났을 때 화면에 보여줄 값 */
export interface WalkResult {
  distanceM: number;
  durationSec: number;
  result: RecordResult;
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
  async record(activity: ActivityInput): Promise<RecordResult> {
    const { rule, waterReward } = await this.deps.loadActivityType(activity.type);
    const result = this.deps.verifier.verify(activity, rule);
    let waterGiven = 0;
    if (result.verified && this.deps.water) {
      ({ waterGiven } = await this.deps.water({ verified: true, waterReward }));
    }
    return { ...result, waterGiven };
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
