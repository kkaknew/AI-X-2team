import type { GrowthStage, TreeRepository } from '../data/TreeRepository';

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

export class WateringEngine {
  private readonly trees: TreeRepository;

  constructor(trees: TreeRepository) {
    this.trees = trees;
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

    const index = stages.findIndex((s) => s.id === stage.id);
    const nextStage = index < stages.length - 1 ? stages[index + 1] : null;

    return {
      treeId: tree.id,
      waterGiven,
      waterTotal,
      previousStage,
      stage,
      stageChanged: stage.id !== previousStage.id,
      isFinalStage: nextStage === null,
      nextStage,
      waterToNextStage: nextStage ? nextStage.waterRequired - waterTotal : 0,
    };
  }
}
