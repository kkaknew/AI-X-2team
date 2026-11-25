import type { ActivityCode } from '../logic/ActivityRecorder';
import type { CompletedTree, TreeProgress } from '../logic/WateringEngine';
import type { MainView } from './mainView';

/**
 * 표현 계층: 나무 목록(내 기록의 "나의 나무"), 지난 나무 보기(메인 ◀ ▶), 나무 완성 화면,
 * 시듦 안내 창에 보여줄 글자. React Native 없이 테스트할 수 있도록 화면 파일과 나눴다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** SQLite datetime('now') 형식("2026-11-24 08:00:00", UTC)도 읽는다 */
export function parseTime(text: string): Date {
  return new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
}

/** "2026.06.01" */
export const dotDay = (d: Date) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
/** "07.20" (같은 해 끝 날짜) */
const shortDay = (d: Date) => `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

/** 심은 날부터 끝난 날까지 며칠 (06.01 → 07.20 = 49일). 같은 날이면 1일 */
export function daysBetween(start: Date, end: Date): number {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.max(1, Math.round((b - a) / DAY_MS));
}

/** "2026.06.01 ~ 07.20", 진행 중이면 "2026.10.01 ~ 키우는 중" */
export function period(plantedAt: string, completedAt: string | null): string {
  const start = parseTime(plantedAt);
  if (!completedAt) return `${dotDay(start)} ~ 키우는 중`;
  const end = parseTime(completedAt);
  return `${dotDay(start)} ~ ${end.getFullYear() === start.getFullYear() ? shortDay(end) : dotDay(end)}`;
}

/** 내 기록 "나의 나무" 한 줄 */
export interface TreeRow {
  treeId: number;
  /** "나무 3" (처음 심은 나무가 1) */
  name: string;
  period: string;
  chip: '키우는 중' | '완성';
  /** 지금 키우는 나무 */
  current: boolean;
  /** 썸네일 그림: 지금 나무는 단계 그림, 다 키운 나무는 다 자란 그림 */
  stageNumber: number;
}

/**
 * 지금 나무 + 다 키운 나무들을 최근 것부터. completed는 WateringEngine.completedTrees() (최근 완성부터)
 */
export function treeRows(active: TreeProgress | null, completed: CompletedTree[]): TreeRow[] {
  const total = completed.length + (active ? 1 : 0);
  const rows: TreeRow[] = [];
  if (active) {
    rows.push({
      treeId: active.treeId,
      name: `나무 ${total}`,
      period: period(active.plantedAt, null),
      chip: active.isFinalStage ? '완성' : '키우는 중',
      current: true,
      stageNumber: active.stageNumber,
    });
  }
  completed.forEach((t, i) => {
    rows.push({
      treeId: t.id,
      name: `나무 ${completed.length - i}`,
      period: period(t.plantedAt, t.completedAt),
      chip: '완성',
      current: false,
      stageNumber: 99,
    });
  });
  return rows;
}

/**
 * 메인에서 지난 나무를 볼 때의 상태 카드·게이지 (시안 "메인화면 지난 나무")
 * @param number 이 나무가 몇 번째 나무인지 (1부터)
 */
export function pastTreeView(
  tree: CompletedTree,
  number: number,
  fruits: ActivityCode[],
): MainView {
  const days = daysBetween(parseTime(tree.plantedAt), parseTime(tree.completedAt));
  return {
    mode: 'complete',
    status: { caption: period(tree.plantedAt, tree.completedAt), title: '다 키운 나무', chip: '완성', tone: 'done' },
    gauge: {
      caption: `${days}일 동안 키웠어요`,
      title: `물 ${tree.waterTotal} · 열매 ${fruits.length}개`,
      percent: 100,
      tone: 'done',
    },
    treeLabel: `나무 ${number} · 완성`,
    showFruits: true,
    fruits,
    primaryAction: 'plant',
  };
}

/** 나무 완성 화면의 "함께한 날 · 인증한 활동 · 받은 물" */
export function completionStats(
  plantedAt: string,
  now: Date,
  count: number,
  water: number,
): { label: string; value: string }[] {
  return [
    { label: '함께한 날', value: `${daysBetween(parseTime(plantedAt), now)}일` },
    { label: '인증한 활동', value: `${count}회` },
    { label: '받은 물', value: `${water}` },
  ];
}

/**
 * 메인을 열 때 띄울 시듦 안내 (시안 "시든 나무 안내", "시들기 전 경고")
 * @param status 지금 나무 상태
 * @param remainingMs 시들 때까지 남은 시간 (WiltingChecker). 모르면 null
 */
export function wiltPrompt(
  status: TreeProgress['status'],
  remainingMs: number | null,
): 'wilted' | 'warn' | null {
  if (status === 'wilted') return 'wilted';
  if (status === 'growing' && remainingMs !== null && remainingMs > 0 && remainingMs <= DAY_MS) return 'warn';
  return null;
}

/** 내 기록 "기록 조회" 날짜별 줄의 점 (인증 횟수, 최대 5개) */
export function dots(count: number, max = 5): boolean[] {
  return Array.from({ length: max }, (_, i) => i < count);
}
