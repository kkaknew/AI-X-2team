import type { TreeRepository, TreeStatus } from '../data/TreeRepository';

/**
 * 로직 계층: 시듦 판정. (#17 [15] 시듦 판정)
 *
 * 완료 조건: 마지막 인증 활동 후 기준 기간(3일)이 지나면 나무 상태가 시듦으로 바뀌고
 * 나무 화면에 표시된다. 시들기 하루 전에 경고 알림이 간다.
 *
 * - "마지막 인증 활동"은 나무가 마지막으로 물을 받은 시각(trees.last_watered_at)이다.
 *   물을 한 번도 받지 않았으면 씨앗을 심은 시각(planted_at)부터 센다.
 * - 기준 기간이 지나면 'growing' → 'wilted'로 바꾼다. 다시 물을 받으면 WateringEngine이 'growing'으로 돌린다.
 * - 물주기와 실행 시점이 다르다. 물주기는 "활동했을 때", 시듦은 "활동하지 않고 시간이 지났을 때"라서
 *   앱을 켤 때·다시 앞으로 가져올 때 check()를 부른다.
 * - 경고 알림 시각(warnAt)은 계산만 하고, 실제 예약은 ReminderService가 한다.
 */

/** 마지막 물주기 후 며칠이 지나면 시드는가 (팀 결정 전 예시 값) */
export const WILT_AFTER_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WiltState {
  treeId: number;
  /** 판정 후 상태 */
  status: Exclude<TreeStatus, 'completed'>;
  /** 이번 판정으로 시들었는가 (growing → wilted) */
  wiltedNow: boolean;
  /** 기준 시각: 마지막으로 물을 받은 시각, 없으면 심은 시각 */
  lastActiveAt: Date;
  /** 이 시각이 되면 시든다 */
  wiltsAt: Date;
  /** 시들기 하루 전. 이 시각에 경고 알림을 보낸다 */
  warnAt: Date;
  /** 시들 때까지 남은 시간(ms). 이미 시들었으면 0 */
  remainingMs: number;
}

export interface WiltingOptions {
  /** 기본 WILT_AFTER_DAYS. 테스트·팀 결정에 따라 바꾼다 */
  wiltAfterDays?: number;
}

export class WiltingChecker {
  private readonly trees: TreeRepository;
  private readonly wiltAfterMs: number;

  constructor(trees: TreeRepository, options: WiltingOptions = {}) {
    const days = options.wiltAfterDays ?? WILT_AFTER_DAYS;
    if (!(days >= 1)) throw new Error(`시드는 기간은 1일 이상이어야 합니다 (${days})`);
    this.trees = trees;
    this.wiltAfterMs = days * DAY_MS;
  }

  /**
   * 지금 키우는 나무를 판정한다. 기준 기간이 지났으면 시듦으로 바꿔 저장한다.
   * 키우는 나무가 없으면 null.
   */
  async check(now: Date = new Date()): Promise<WiltState | null> {
    const tree = await this.trees.getActiveTree();
    if (!tree || tree.status === 'completed') return null;

    const lastActiveAt = new Date(tree.lastWateredAt ?? tree.plantedAt);
    const wiltsAt = new Date(lastActiveAt.getTime() + this.wiltAfterMs);
    const warnAt = new Date(wiltsAt.getTime() - DAY_MS);

    let status = tree.status;
    let wiltedNow = false;
    if (status === 'growing' && now.getTime() >= wiltsAt.getTime()) {
      await this.trees.setStatus(tree.id, 'wilted');
      status = 'wilted';
      wiltedNow = true;
    }

    return {
      treeId: tree.id,
      status,
      wiltedNow,
      lastActiveAt,
      wiltsAt,
      warnAt,
      remainingMs: status === 'wilted' ? 0 : wiltsAt.getTime() - now.getTime(),
    };
  }
}
