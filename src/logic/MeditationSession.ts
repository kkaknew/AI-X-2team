import type { MeditationPlayer } from '../data/MeditationPlayer';
import type { ActivityInput } from './ActivityVerifier';

/**
 * 로직 계층: 명상 한 번을 진행하며 사실만 모은다. (#11 [9] 명상 인증)
 *
 * 완료 조건: 정해진 클래식 음악이 끝까지 재생되는 동안 다른 조작이 없으면 인증된다.
 *           도중에 앱을 벗어나거나 화면을 조작하면 실패 처리된다.
 *
 * - 음악을 틀고, 재생 중에 화면을 만졌는지·앱을 벗어났는지를 기록한다.
 * - 음악이 끝나면 모은 사실(fullyPlayed, touched, leftApp)을 넘긴다.
 *   인정할지는 ActivityVerifier가 activity_types.rule을 보고 정한다. 여기서는 판정하지 않는다.
 * - 화면 꺼짐은 앱 이탈과 구분할 수 없어서 기록하지 않는다 (screenOff는 비워 둔다).
 */

export type MeditationInput = Extract<ActivityInput, { type: 'meditation' }>;

export interface MeditationSessionDeps {
  player: MeditationPlayer;
  /** 현재 시각 (ms). 테스트에서 바꿔 끼운다 */
  now?: () => number;
  /**
   * 시작 직후 이 시간(ms) 동안의 터치는 세지 않는다.
   * 시작 버튼을 누른 손가락이 떨어지는 것까지 조작으로 세지 않기 위해서다.
   */
  touchGraceMs?: number;
}

/** 진행 중인 명상 */
export interface MeditationState {
  /** 음악이 시작된 시각 (ms) */
  startedAt: number;
  /** 곡 길이 (초) */
  durationSec: number;
}

const DEFAULT_TOUCH_GRACE_MS = 500;

export class MeditationSession {
  private readonly deps: MeditationSessionDeps;
  private state: MeditationState | null = null;
  private touched = false;
  private leftApp = false;
  /** start()를 부를 때마다 늘린다. 이전 재생의 onEnd가 늦게 와도 무시하려고 쓴다 */
  private run = 0;

  constructor(deps: MeditationSessionDeps) {
    this.deps = deps;
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  /**
   * 음악을 틀고 명상을 시작한다.
   * @param onFinish 음악이 끝까지 재생되면 그동안 모은 사실과 함께 한 번 불린다
   * @returns 진행 상태 (남은 시간 표시용)
   */
  async start(onFinish: (input: MeditationInput) => void): Promise<MeditationState> {
    if (this.state) throw new Error('이미 명상 중입니다');
    const run = ++this.run;
    this.touched = false;
    this.leftApp = false;

    const { durationSec } = await this.deps.player.play(() => {
      if (run !== this.run || !this.state) return;
      onFinish(this.finish(true));
    });

    // 곡을 불러오는 동안 취소됐으면 시작하지 않는다
    if (run !== this.run) {
      await this.deps.player.stop();
      throw new Error('명상이 취소됐어요');
    }
    this.state = { startedAt: this.now(), durationSec };
    return { ...this.state };
  }

  /** 명상 음악 출처 표기 (화면에 그대로 보여준다) */
  credit(): string {
    return this.deps.player.credit;
  }

  /** 진행 중인 명상. 없으면 null */
  current(): MeditationState | null {
    return this.state ? { ...this.state } : null;
  }

  /** 화면을 만졌을 때 부른다 */
  touch(): void {
    if (!this.state) return;
    const grace = this.deps.touchGraceMs ?? DEFAULT_TOUCH_GRACE_MS;
    if (this.now() - this.state.startedAt < grace) return;
    this.touched = true;
  }

  /** 앱 상태가 바뀔 때 부른다 (React Native AppState 값). active가 아니면 앱을 벗어난 것으로 본다 */
  appStateChanged(appState: string): void {
    if (this.state && appState !== 'active') this.leftApp = true;
  }

  /** 중간에 그만둔다. 음악을 멈추고, 끝까지 듣지 못한 것으로 사실을 돌려준다. 진행 중이 아니면 null */
  async giveUp(): Promise<MeditationInput | null> {
    if (!this.state) return null;
    const input = this.finish(false);
    await this.deps.player.stop();
    return input;
  }

  /** 기록하지 않고 취소한다 (명상 화면을 떠날 때). 불러오는 중이어도 취소된다 */
  async cancel(): Promise<void> {
    this.run++;
    this.state = null;
    await this.deps.player.stop();
  }

  private finish(fullyPlayed: boolean): MeditationInput {
    this.state = null;
    this.run++;
    return { type: 'meditation', fullyPlayed, touched: this.touched, leftApp: this.leftApp };
  }
}
