import type { ActivityCode } from '../logic/ActivityRecorder';
import type { TreeProgress } from '../logic/WateringEngine';

/**
 * 표현 계층: 메인 화면(시안 "메인화면 기본·씨앗 심은 뒤·시들었을때·다 자랐을때")에 보여줄 글자와 상태를 정한다.
 * React Native 없이 테스트할 수 있도록 TreeScreen.tsx와 나눴다.
 */

/** 메인 화면 상태 4가지 */
export type MainMode = 'growing' | 'seed' | 'wilted' | 'complete';

export interface MainView {
  mode: MainMode;
  /** 상태 카드: 작은 글자 · 큰 제목 · 오른쪽 칩 */
  status: { caption: string; title: string; chip: string; tone: 'normal' | 'danger' | 'done' };
  /** 물방울 게이지: 작은 글자 · 큰 글자 · 오른쪽 % */
  gauge: { caption: string; title: string; percent: number; tone: 'water' | 'danger' | 'done' };
  /** 그림 왼쪽 위 칩. 예: "나무 3 · 키우는 중" */
  treeLabel: string;
  /** 다 자란 나무에만 열매를 단다 (시안: 큰 나무 위 열매 자리) */
  showFruits: boolean;
  /** 이 나무에서 한 번이라도 인증한 활동 = 달린 열매 */
  fruits: ActivityCode[];
  /** 아래 큰 버튼: 활동 보기 / 새 씨앗 심기 */
  primaryAction: 'activities' | 'plant';
}

export interface MainContext {
  /** 오늘 인증한 활동 수 (StatsService.today().count) */
  todayCount: number;
  /** 지금 나무에서 인증한 활동 종류 (StatsService.verifiedTypesSince) */
  doneTypes: ActivityCode[];
  /** 지금까지 완성한 나무 수 (WateringEngine.completedTrees().length) */
  completedCount: number;
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** SQLite datetime('now') 형식("2026-11-24 08:00:00", UTC)도 읽는다 */
function parseTime(text: string): Date {
  return new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
}

/** 지금 단계에서 다음 단계까지 얼마나 찼는지 (0~100, 정수) */
export function stagePercent(p: TreeProgress): number {
  if (!p.nextStage) return 100;
  const span = p.nextStage.waterRequired - p.stage.waterRequired;
  if (span <= 0) return 0;
  const ratio = (p.waterTotal - p.stage.waterRequired) / span;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}

/** 마지막 물(없으면 심은 날)부터 며칠째인지. 최소 1 */
export function daysWithoutRecord(p: TreeProgress, now: Date): number {
  const since = parseTime(p.lastWateredAt ?? p.plantedAt);
  return Math.max(1, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
}

export function toMainView(p: TreeProgress, ctx: MainContext): MainView {
  const treeNumber = ctx.completedCount + 1;
  const percent = stagePercent(p);
  const showFruits = p.isFinalStage;
  const base = { showFruits, fruits: ctx.doneTypes };

  if (p.isFinalStage) {
    return {
      ...base,
      mode: 'complete',
      status: { caption: '축하해요', title: '나무가 다 자랐어요', chip: '완성', tone: 'done' },
      gauge: { caption: '나무가 다 자랐어요', title: '새 씨앗을 심어 보세요', percent: 100, tone: 'done' },
      treeLabel: `나무 ${treeNumber} · 완성`,
      primaryAction: 'plant',
    };
  }

  if (p.status === 'wilted') {
    return {
      ...base,
      mode: 'wilted',
      status: {
        caption: `${daysWithoutRecord(p, ctx.now)}일째 기록이 없어요`,
        title: '나무가 시들었어요',
        chip: '시듦',
        tone: 'danger',
      },
      gauge: { caption: '물을 받으면 다시 자라요', title: '오늘 기록하면 살아나요', percent, tone: 'danger' },
      treeLabel: `나무 ${treeNumber} · 시듦`,
      primaryAction: 'activities',
    };
  }

  const gauge = {
    caption: '다음 단계까지',
    title: `물 ${p.waterToNextStage} 남음`,
    percent,
    tone: 'water' as const,
  };
  const treeLabel = `나무 ${treeNumber} · 키우는 중`;

  // 나무를 다 키우고 새로 심은 씨앗 (아직 물을 한 번도 안 받음)
  if (ctx.completedCount > 0 && p.waterTotal === 0) {
    return {
      ...base,
      mode: 'seed',
      status: { caption: '새 씨앗을 심었어요', title: '첫 기록을 시작해요', chip: '씨앗', tone: 'normal' },
      gauge,
      treeLabel,
      primaryAction: 'activities',
    };
  }

  return {
    ...base,
    mode: 'growing',
    status: {
      caption: '오늘의 활동',
      title: ctx.todayCount > 0 ? '작은 실천, 큰 성장' : '첫 기록을 시작해요',
      chip: '나의 성장',
      tone: 'normal',
    },
    gauge,
    treeLabel,
    primaryAction: 'activities',
  };
}

/** 활동 선택 창(바텀시트)·오늘의 활동 카드에 쓰는 활동 5종 (시안 순서와 문구) */
export const ACTIVITY_MENU: { code: ActivityCode; label: string; description: string }[] = [
  { code: 'walk', label: '산책', description: '나만의 속도로 걷기' },
  { code: 'meditation', label: '명상', description: '잠시 마음 쉬어가기' },
  { code: 'diary', label: '일기', description: '오늘의 감정 남기기' },
  { code: 'reading', label: '독서', description: '책 속의 생각 모으기' },
  { code: 'sleep', label: '수면', description: '잠든 시각과 일어난 시각 남기기' },
];
