import type { GrowthStage, TreeRepository, TreeStatus } from '../data/TreeRepository';

/**
 * 로직 계층: 인증된 활동 1건당 물을 주고 성장 단계를 올린다. (#7 [5] 물주기)
 *
 * 완료 조건: 인증 1건당 보상만큼 물이 쌓이고, 기준량에 도달하면 다음 단계로 바뀐다.
 *
 * - 어떤 활동이었는지는 모른다. "인증됐는가"와 "보상이 몇인가"만 받는다.
 *   보상은 DB의 activity_types.water_reward, 인증 여부는 ActivityVerifier 결과다.
 * - 단계는 누적 물(water_total)이 growth_stages.water_required 이상인 가장 높은 단계다.
 *   기준량은 DB에 있어서, 바꿀 때 이 코드는 고치지 않는다.
 * - 마지막 단계에 도달한 뒤 나무를 완료 처리하고 새 씨앗을 심는 것은 #16 [14]에서 한다.
 *   여기서는 isFinalStage로 알려주기만 한다.
 * - 물을 줄 때마다 last_watered_at을 갱신한다. 시듦 판정(#17 [15])이 이 값을 쓴다.
 * - 나무 화면(#9 [7])은 getProgress()로 지금 상태를 읽고, subscribe()로 물을 준 직후 새 상태를 받는다.
 */

/** 물주기에 넣는 값. 활동 종류나 원본 데이터는 들어오지 않는다. */
export interface WateringInput {
  /** ActivityVerifier.verify(...).verified */
  verified: boolean;
  /** 그 활동 종류의 activity_types.water_reward */
  waterReward: number;
}

export interface WateringResult {
  treeId: number;
  /** 이번에 준 물. 인증되지 않았으면 0 */
  waterGiven: number;
  /** 물을 준 뒤 누적 물 */
  waterTotal: number;
  previousStage: GrowthStage;
  stage: GrowthStage;
  /** 이번 물주기로 단계가 바뀌었는가 */
  stageChanged: boolean;
  /** 마지막 단계(나무)에 도달했는가 */
  isFinalStage: boolean;
  /** 다음 단계. 마지막 단계면 null */
  nextStage: GrowthStage | null;
  /** 다음 단계까지 남은 물. 마지막 단계면 0 */
  waterToNextStage: number;
}

/** 나무 화면에 보여줄 지금 나무 상태 */
export interface TreeProgress {
  treeId: number;
  status: TreeStatus;
  waterTotal: number;
  stage: GrowthStage;
  /** 지금 단계가 몇 번째인가 (1부터) */
  stageNumber: number;
  stageCount: number;
  isFinalStage: boolean;
  /** 다음 단계. 마지막 단계면 null */
  nextStage: GrowthStage | null;
  /** 다음 단계까지 남은 물. 마지막 단계면 0 */
  waterToNextStage: number;
}

export type TreeProgressListener = (progress: TreeProgress) => void;

export class WateringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WateringError';
  }
}

/** 누적 물에 맞는 단계 (기준량 이하인 것 중 가장 높은 단계) */
export function stageForWater(waterTotal: number, stages: GrowthStage[]): GrowthStage {
  const sorted = sortStages(stages);
  let current = sorted[0];
  for (const stage of sorted) {
    if (waterTotal >= stage.waterRequired) current = stage;
  }
  return current;
}

function sortStages(stages: GrowthStage[]): GrowthStage[] {
  if (stages.length === 0) throw new WateringError('성장 단계가 없습니다');
  return [...stages].sort((a, b) => a.waterRequired - b.waterRequired || a.id - b.id);
}

/** @param sortedStages sortStages()로 정렬한 단계 */
function progressOf(
  tree: { id: number; status: TreeStatus; waterTotal: number },
  sortedStages: GrowthStage[],
): TreeProgress {
  const stage = stageForWater(tree.waterTotal, sortedStages);
  const index = sortedStages.findIndex((s) => s.id === stage.id);
  const nextStage = index < sortedStages.length - 1 ? sortedStages[index + 1] : null;
  return {
    treeId: tree.id,
    status: tree.status,
    waterTotal: tree.waterTotal,
    stage,
    stageNumber: index + 1,
    stageCount: sortedStages.length,
    isFinalStage: nextStage === null,
    nextStage,
    waterToNextStage: nextStage ? nextStage.waterRequired - tree.waterTotal : 0,
  };
}

export class WateringEngine {
  private readonly trees: TreeRepository;
  private readonly listeners = new Set<TreeProgressListener>();

  constructor(trees: TreeRepository) {
    this.trees = trees;
  }

  /** 지금 키우는 나무의 상태. 키우는 나무가 없으면 null */
  async getProgress(): Promise<TreeProgress | null> {
    const tree = await this.trees.getActiveTree();
    if (!tree) return null;
    return progressOf(tree, sortStages(await this.trees.getStages()));
  }

  /**
   * 물을 준 직후 새 나무 상태를 받는다. 인증되지 않아 물을 주지 않았으면 부르지 않는다.
   * @returns 구독을 끊는 함수
   */
  subscribe(listener: TreeProgressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 활동 1건에 대한 물을 준다.
   * @param input 인증 여부와 보상
   * @param at 물을 준 시각 (기본: 지금)
   */
  async water(input: WateringInput, at: Date = new Date()): Promise<WateringResult> {
    if (!Number.isInteger(input.waterReward) || input.waterReward <= 0) {
      throw new WateringError(`물 보상은 1 이상의 정수여야 합니다 (${input.waterReward})`);
    }

    const tree = await this.trees.getActiveTree();
    if (!tree) throw new WateringError('키우고 있는 나무가 없습니다');

    const stages = sortStages(await this.trees.getStages());
    const previousStage = stages.find((s) => s.id === tree.stageId) ?? stageForWater(tree.waterTotal, stages);

    const waterGiven = input.verified ? input.waterReward : 0;
    const waterTotal = tree.waterTotal + waterGiven;
    const stage = stageForWater(waterTotal, stages);

    if (waterGiven > 0) {
      await this.trees.saveWatering(tree.id, {
        stageId: stage.id,
        waterTotal,
        lastWateredAt: at.toISOString(),
      });
    }

    const progress = progressOf({ ...tree, waterTotal }, stages);
    if (waterGiven > 0) this.notify(progress);

    return {
      treeId: tree.id,
      waterGiven,
      waterTotal,
      previousStage,
      stage,
      stageChanged: stage.id !== previousStage.id,
      isFinalStage: progress.isFinalStage,
      nextStage: progress.nextStage,
      waterToNextStage: progress.waterToNextStage,
    };
  }

  /** 화면 쪽 오류 때문에 이미 저장된 물주기가 실패로 보이지 않도록, 구독자 오류는 기록만 한다 */
  private notify(progress: TreeProgress): void {
    for (const listener of this.listeners) {
      try {
        listener(progress);
      } catch (e) {
        console.error('[WateringEngine] 구독자 오류', e);
      }
    }
  }
}
