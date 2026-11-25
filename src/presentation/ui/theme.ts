/**
 * 표현 계층: Figma 시안("수정 할거" 페이지)의 색·글자·모서리 값.
 * 화면은 색을 직접 쓰지 않고 여기 값을 쓴다. 시안 색이 바뀌면 이 파일만 고친다.
 *
 * 글꼴: 시안은 Noto Sans KR이다. 아직 글꼴 파일을 넣지 않아 휴대폰 기본 글꼴에 굵기만 맞춘다.
 */

export const colors = {
  /** 화면 배경 (베이지) */
  background: '#f6f2ea',
  /** 카드·버튼 위 밝은 면 */
  surface: '#fcfaf5',
  /** 카드 안쪽, 칩 */
  surfaceMuted: '#ece8dc',
  border: '#e5dfd0',

  text: '#3b3d34',
  textMuted: '#7a7a6c',
  textSubtle: '#80806f',
  /** 갈색 버튼·진한 면 위 글자 */
  textOnBrown: '#fcfaf5',

  /** 주 버튼 (갈색) */
  brown: '#846e5b',
  /** 나무 이름 칩 글자 */
  brownDark: '#6d5a49',

  /** 실패·오류·막힘 */
  danger: '#a4573f',
  dangerBackground: '#f6e4da',
  dangerBorder: '#e8c5b3',

  /** 물방울 게이지 진행 칩 */
  water: '#3f7a9f',
  waterBackground: '#dcebf5',

  white: '#ffffff',
  /** 휠에서 고르지 않은 값 */
  faint: '#b9b6aa',
  /** "완성" 칩 (노랑) */
  doneChip: '#f3e6bf',
  /** 지금 나무 줄 (내 기록 나의 나무) */
  highlight: '#f3ece6',
  highlightBorder: '#c9b8a4',
  /** 명상 시작 버튼 바깥 고리 두 겹 */
  haloOuter: '#f3f1ea',
  haloInner: '#ecebe0',
  /** 나무 완성 색종이 중 올리브색 (나머지는 열매 색) */
  confettiOlive: '#c8c08a',
} as const;

/** 수면 화면의 남색 계열 (시안 "수면 기록") */
export const sleepColors = {
  accent: '#6470b4',
  border: '#8a92d0',
  surface: '#eef0fa',
  chip: '#e3e6f6',
  /** 휠 가운데 띠 */
  band: '#eceef9',
  sunBackground: '#f6ead2',
  icon: '#7d6a3f',
} as const;

export const radius = {
  /** 작은 칩 (pill) */
  pill: 999,
  /** 카드 안쪽 상자, 활동 버튼 */
  inner: 14,
  /** 갈색 버튼 */
  button: 16,
  /** 카드, 안내 */
  card: 20,
  /** 나무 그림 영역 */
  illustration: 24,
} as const;

/** 굵기. 시안의 Noto Sans KR Regular / Medium / Bold */
export const weight = {
  regular: '400',
  medium: '500',
  bold: '700',
} as const;

/** 시안의 글자 크기 */
export const fontSize = {
  caption: 12,
  small: 13,
  body: 14,
  reason: 15,
  button: 15,
  emphasis: 16,
  cardTitle: 18,
  headline: 22,
  title: 28,
} as const;
