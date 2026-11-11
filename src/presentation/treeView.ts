import type { TreeProgress } from '../logic/WateringEngine';

/**
 * 표현 계층: 나무 상태를 화면에 보여줄 글자와 수치로 바꾼다. (#9 [7] 나무 화면)
 * React Native 없이 테스트할 수 있도록 TreeScreen.tsx와 나눴다.
 */

/** 단계 순서대로 보여줄 그림. 단계가 더 많으면 마지막 그림을 쓴다 */
const STAGE_ICONS = ['🌰', '🌱', '🌿', '🪴', '🌳'];

export interface TreeView {
  icon: string;
  stageName: string;
  /** 예: "2 / 5단계" */
  stageLabel: string;
  /** 예: "물 13" */
  waterLabel: string;
  /** 지금 단계에서 다음 단계까지 얼마나 찼는지 (0~1). 마지막 단계면 1 */
  progress: number;
  /** 예: "묘목까지 물 17 남았어요" */
  nextLabel: string;
  /** 시들었을 때만 보여줄 안내. 아니면 null */
  statusNote: string | null;
}

export function toTreeView(p: TreeProgress): TreeView {
  const icon = STAGE_ICONS[Math.min(p.stageNumber, STAGE_ICONS.length) - 1];

  let progress = 1;
  if (p.nextStage) {
    const span = p.nextStage.waterRequired - p.stage.waterRequired;
    progress = span > 0 ? (p.waterTotal - p.stage.waterRequired) / span : 0;
  }

  return {
    icon,
    stageName: p.stage.name,
    stageLabel: `${p.stageNumber} / ${p.stageCount}단계`,
    waterLabel: `물 ${p.waterTotal}`,
    progress: Math.min(1, Math.max(0, progress)),
    nextLabel: p.nextStage
      ? `${p.nextStage.name}까지 물 ${p.waterToNextStage} 남았어요`
      : '다 자랐어요!',
    statusNote: p.status === 'wilted' ? '나무가 시들었어요. 활동을 인증해 물을 주세요' : null,
  };
}
