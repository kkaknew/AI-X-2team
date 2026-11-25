import type { ActivityCode } from '../../logic/ActivityRecorder';

/**
 * 표현 계층: 나무 단계·상태와 활동 종류에 맞는 시안 그림 이름을 고른다.
 * 그림 자체(svgs.ts)를 import하지 않아서 React Native 없이 테스트할 수 있다.
 *
 * 시안 단계: 1 씨앗(물 0) · 2 새싹(10) · 3 묘목(30) · 4 어린 나무(60) · 5 나무(100)
 * DB growth_stages와 이름·순서가 같다. 시안의 "(예비) 자라는 나무"는 아직 쓰지 않는다.
 */

export type TreeArt =
  | 'treeSeed'
  | 'treeSprout'
  | 'treeSapling'
  | 'treeYoung'
  | 'treeFull'
  | 'treeWiltedSeed'
  | 'treeWiltedSprout'
  | 'treeWiltedSapling'
  | 'treeWiltedYoung'
  | 'treeWilted';

export type FruitArt = 'fruitWalk' | 'fruitMeditation' | 'fruitDiary' | 'fruitReading' | 'fruitSleep';

const STAGE_ART: readonly TreeArt[] = ['treeSeed', 'treeSprout', 'treeSapling', 'treeYoung', 'treeFull'];

/** 단계별 시든 그림 (시안 "나무 시듦" 5장) */
const WILTED_ART: readonly TreeArt[] = [
  'treeWiltedSeed',
  'treeWiltedSprout',
  'treeWiltedSapling',
  'treeWiltedYoung',
  'treeWilted',
];

/** 그림 원래 크기 (Figma 프레임 크기). 화면에서 비율을 지키며 줄일 때 쓴다 */
export const TREE_ART_SIZE: Record<TreeArt, { width: number; height: number }> = {
  treeSeed: { width: 320, height: 431 },
  treeSprout: { width: 320, height: 431 },
  treeSapling: { width: 320, height: 431 },
  treeYoung: { width: 320, height: 431 },
  treeFull: { width: 320, height: 431 },
  treeWiltedSeed: { width: 320, height: 431 },
  treeWiltedSprout: { width: 320, height: 431 },
  treeWiltedSapling: { width: 320, height: 431 },
  treeWiltedYoung: { width: 320, height: 431 },
  treeWilted: { width: 320, height: 431 },
};

export const FRUIT_ART_SIZE = { width: 60, height: 64 } as const;

/**
 * @param stageNumber 지금 단계가 몇 번째인가 (1부터, WateringEngine의 TreeProgress.stageNumber)
 * @param status 나무 상태. 시들었으면 그 단계의 시든 그림
 */
export function treeArtFor(stageNumber: number, status: 'growing' | 'wilted' | 'completed'): TreeArt {
  const index = Math.min(Math.max(Math.round(stageNumber), 1), STAGE_ART.length) - 1;
  return status === 'wilted' ? WILTED_ART[index] : STAGE_ART[index];
}

const FRUIT_ART: Record<ActivityCode, FruitArt> = {
  walk: 'fruitWalk',
  meditation: 'fruitMeditation',
  diary: 'fruitDiary',
  reading: 'fruitReading',
  sleep: 'fruitSleep',
};

/** 활동 종류의 열매 그림 (열매 색: 산책 파랑, 명상 보라, 일기 빨강, 독서 노랑, 수면 남색) */
export function fruitArtFor(type: ActivityCode): FruitArt {
  return FRUIT_ART[type];
}

/** 너비만 정했을 때 비율을 지킨 높이 */
export function fitHeight(art: TreeArt, width: number): number {
  const { width: w, height: h } = TREE_ART_SIZE[art];
  return Math.round((width * h) / w);
}
