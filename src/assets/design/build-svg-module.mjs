// Figma에서 내보낸 SVG를 앱에서 쓰는 모듈(presentation/ui/svgs.ts)로 바꾼다.
//
// 쓰는 법 (src 폴더에서):  node assets/design/build-svg-module.mjs
//
// - icon/, tree/ 의 SVG는 그대로 넣는다.
// - fruit/sheet.svg 는 Figma "열매 컴포넌트" 섹션을 통째로 내보낸 것이다.
//   회색 배경·테두리를 빼고, 열매 5개를 viewBox로 하나씩 잘라 쓴다.
// - react-native-svg의 SvgXml이 읽지 못하는 style·preserveAspectRatio·overflow 속성과
//   한글 레이어 이름(id)은 뺀다. mask·clipPath·gradient id는 그대로 둔다.
// - Figma에서 그림을 다시 내보내면 같은 이름으로 덮어쓰고 이 스크립트를 다시 돌리면 된다.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', 'presentation', 'ui', 'svgs.ts');

const ICONS = {
  drop: 'icon/drop.svg',
  noticeDrop: 'icon/notice-drop.svg',
  spinnerScreen: 'icon/spinner-screen.svg',
  spinnerButton: 'icon/spinner-button.svg',
  user: 'icon/user.svg',
  activity: 'icon/activity.svg',
  chevronLeft: 'icon/chevron-left.svg',
  chevronRight: 'icon/chevron-right.svg',
};

const TREES = {
  treeSeed: 'tree/1-seed.svg',
  treeSprout: 'tree/2-sprout.svg',
  treeSapling: 'tree/3-sapling.svg',
  treeYoung: 'tree/4-young.svg',
  treeFull: 'tree/5-tree.svg',
  /** 단계별 시든 그림 (시안 "나무 시듦": 플랫 나무 00·01·02·03·05) */
  treeWiltedSeed: 'tree/wilted-1-seed.svg',
  treeWiltedSprout: 'tree/wilted-2-sprout.svg',
  treeWiltedSapling: 'tree/wilted-3-sapling.svg',
  treeWiltedYoung: 'tree/wilted-4-young.svg',
  treeWilted: 'tree/wilted-5-tree.svg',
  /** 메인 화면 시안의 큰 나무 (372x465, 열매를 얹는 자리) */
  treeMain: 'tree/main-tree.svg',
};

/** fruit/sheet.svg 안의 열매 위치 (Figma 열매 컴포넌트: 60x64, 90px 간격) */
const FRUITS = ['fruitReading', 'fruitMeditation', 'fruitDiary', 'fruitWalk', 'fruitSleep'];
const FRUIT = { x0: 20, step: 90, y: 30, width: 60, height: 64 };

function clean(svg) {
  return svg
    .replace(/\s(style|preserveAspectRatio|overflow)="[^"]*"/g, '')
    .replace(/\s+id="[^"]*&#[^"]*"/g, '')
    .replace(/\n\s*/g, '')
    .trim();
}

const read = (file) => readFileSync(join(here, file), 'utf8');

const lines = [
  '/**',
  ' * 표현 계층: Figma 시안에서 내보낸 그림(SVG). react-native-svg의 SvgXml로 그린다.',
  ' * 자동 생성 파일이다. 직접 고치지 말고 assets/design/ 의 SVG를 바꾼 뒤',
  ' * `node assets/design/build-svg-module.mjs`를 다시 돌린다.',
  ' */',
  '',
];

for (const [name, file] of Object.entries({ ...ICONS, ...TREES })) {
  lines.push(`export const ${name}Svg = \`${clean(read(file))}\`;`);
}

// 열매: 배경(첫 path)과 테두리(둘째 path)를 빼고, 열매 하나 크기로 잘라낸다
const sheet = clean(read('fruit/sheet.svg'));
const body = sheet
  .replace(/^<svg[^>]*>/, '')
  .replace(/<\/svg>$/, '')
  .replace(/^<path[^>]*\/>/, '')
  .replace(/^<path[^>]*\/>/, '');
FRUITS.forEach((name, i) => {
  const x = FRUIT.x0 + FRUIT.step * i;
  const svg =
    `<svg width="${FRUIT.width}" height="${FRUIT.height}" ` +
    `viewBox="${x} ${FRUIT.y} ${FRUIT.width} ${FRUIT.height}" fill="none" ` +
    `xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  lines.push(`export const ${name}Svg = \`${svg}\`;`);
});

writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(`wrote ${out}`);
