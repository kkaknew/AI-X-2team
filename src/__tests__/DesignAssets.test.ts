import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { fitHeight, fruitArtFor, treeArtFor } from '../presentation/ui/illustrations.ts';
import * as svgs from '../presentation/ui/svgs.ts';

/**
 * Figma 시안 그림(SVG)이 앱에 제대로 들어왔는지, 단계·활동에 맞는 그림을 고르는지 확인한다.
 * 그림은 assets/design/ 의 SVG를 build-svg-module.mjs로 바꾼 presentation/ui/svgs.ts 에 있다.
 */
describe('시안 그림', () => {
  test('모든 그림이 SVG이고 크기(viewBox)가 있다', () => {
    for (const [name, svg] of Object.entries(svgs)) {
      assert.match(svg, /^<svg /, name);
      assert.match(svg, /viewBox="[\d. -]+"/, name);
      assert.match(svg, /<\/svg>$/, name);
    }
  });

  test('나무 6장(씨앗·새싹·묘목·어린 나무·나무·시듦)과 열매 5개가 있다', () => {
    for (const name of [
      'treeSeedSvg', 'treeSproutSvg', 'treeSaplingSvg', 'treeYoungSvg', 'treeFullSvg', 'treeWiltedSvg',
      'treeWiltedSeedSvg', 'treeWiltedSproutSvg', 'treeWiltedSaplingSvg', 'treeWiltedYoungSvg',
      'fruitWalkSvg', 'fruitMeditationSvg', 'fruitDiarySvg', 'fruitReadingSvg', 'fruitSleepSvg',
    ]) {
      assert.ok(name in svgs, name);
    }
  });

  test('열매는 한 개씩 잘려 있고 회색 배경(#444444)이 없다', () => {
    const fruits = [svgs.fruitReadingSvg, svgs.fruitMeditationSvg, svgs.fruitDiarySvg, svgs.fruitWalkSvg, svgs.fruitSleepSvg];
    const boxes = fruits.map((s) => /viewBox="([^"]+)"/.exec(s)?.[1]);
    assert.deepEqual(boxes, ['20 30 60 64', '110 30 60 64', '200 30 60 64', '290 30 60 64', '380 30 60 64']);
    for (const s of fruits) assert.doesNotMatch(s, /#444444/);
  });

  test('열매 색이 활동마다 다르다 (독서 노랑, 명상 보라, 일기 빨강, 산책 파랑, 수면 남색)', () => {
    // 각 열매는 자기 viewBox 안의 원 색으로 보인다
    const bodyColor = (x: number) => new RegExp(`<circle cx="${x}" cy="65" r="27" fill="(#[0-9A-F]+)"`).exec(svgs.fruitWalkSvg)?.[1];
    assert.deepEqual([50, 140, 230, 320, 410].map(bodyColor), ['#E8B866', '#B3A2D4', '#E68F7B', '#86BBDC', '#7E8CC9']);
  });

  test('SvgXml이 못 읽는 style 속성이 남아 있지 않다', () => {
    for (const [name, svg] of Object.entries(svgs)) assert.doesNotMatch(svg, /\sstyle="/, name);
  });
});

describe('단계·활동에 맞는 그림 고르기', () => {
  test('단계 1~5는 씨앗·새싹·묘목·어린 나무·나무', () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5].map((n) => treeArtFor(n, 'growing')),
      ['treeSeed', 'treeSprout', 'treeSapling', 'treeYoung', 'treeFull'],
    );
  });

  test('시들었으면 그 단계의 시든 그림, 완성이면 마지막 단계 그림', () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5].map((n) => treeArtFor(n, 'wilted')),
      ['treeWiltedSeed', 'treeWiltedSprout', 'treeWiltedSapling', 'treeWiltedYoung', 'treeWilted'],
    );
    assert.equal(treeArtFor(5, 'completed'), 'treeFull');
  });

  test('단계가 범위를 벗어나도 가장 가까운 그림을 쓴다', () => {
    assert.equal(treeArtFor(0, 'growing'), 'treeSeed');
    assert.equal(treeArtFor(9, 'growing'), 'treeFull');
  });

  test('활동마다 자기 열매', () => {
    assert.equal(fruitArtFor('walk'), 'fruitWalk');
    assert.equal(fruitArtFor('sleep'), 'fruitSleep');
  });

  test('너비만 주면 원래 비율대로 높이를 정한다', () => {
    assert.equal(fitHeight('treeFull', 320), 431);
    assert.equal(fitHeight('treeFull', 160), 216);
    assert.equal(fitHeight('treeWilted', 320), 431);
  });
});
