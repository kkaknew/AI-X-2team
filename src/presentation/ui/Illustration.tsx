import type { ActivityCode } from '../../logic/ActivityRecorder';
import { fitHeight, FRUIT_ART_SIZE, fruitArtFor, treeArtFor, type FruitArt, type TreeArt } from './illustrations';
import { SvgIcon } from './SvgIcon';
import * as svgs from './svgs';

const TREE_SVG: Record<TreeArt, string> = {
  treeSeed: svgs.treeSeedSvg,
  treeSprout: svgs.treeSproutSvg,
  treeSapling: svgs.treeSaplingSvg,
  treeYoung: svgs.treeYoungSvg,
  treeFull: svgs.treeFullSvg,
  treeWiltedSeed: svgs.treeWiltedSeedSvg,
  treeWiltedSprout: svgs.treeWiltedSproutSvg,
  treeWiltedSapling: svgs.treeWiltedSaplingSvg,
  treeWiltedYoung: svgs.treeWiltedYoungSvg,
  treeWilted: svgs.treeWiltedSvg,
};

const FRUIT_SVG: Record<FruitArt, string> = {
  fruitWalk: svgs.fruitWalkSvg,
  fruitMeditation: svgs.fruitMeditationSvg,
  fruitDiary: svgs.fruitDiarySvg,
  fruitReading: svgs.fruitReadingSvg,
  fruitSleep: svgs.fruitSleepSvg,
};

/** 시안의 나무 그림 (단계·시듦에 맞춰). 너비만 주면 비율대로 그린다 */
export function TreeIllustration({
  stageNumber,
  status,
  width,
}: {
  stageNumber: number;
  status: 'growing' | 'wilted' | 'completed';
  width: number;
}) {
  const art = treeArtFor(stageNumber, status);
  return <SvgIcon xml={TREE_SVG[art]} width={width} height={fitHeight(art, width)} />;
}

/** 시안의 활동 열매 한 개 (기본 60x64) */
export function Fruit({ type, scale = 1 }: { type: ActivityCode; scale?: number }) {
  return (
    <SvgIcon
      xml={FRUIT_SVG[fruitArtFor(type)]}
      width={FRUIT_ART_SIZE.width * scale}
      height={FRUIT_ART_SIZE.height * scale}
    />
  );
}
