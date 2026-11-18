import type { CountByType, PeriodStats } from '../logic/StatsService';

/**
 * 표현 계층: 일·주간 집계를 화면에 보여줄 글자와 수치로 바꾼다. (#14 [12] 기록 조회 화면)
 * React Native 없이 테스트할 수 있도록 HistoryScreen.tsx와 나눴다.
 */

const ACTIVITIES: { code: keyof CountByType; label: string; emoji: string }[] = [
  { code: 'walk', label: '산책', emoji: '🚶' },
  { code: 'diary', label: '일기', emoji: '📔' },
  { code: 'meditation', label: '명상', emoji: '🧘' },
  { code: 'reading', label: '독서', emoji: '📚' },
  { code: 'sleep', label: '수면', emoji: '😴' },
];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export interface ActivityItem {
  label: string;
  emoji: string;
  count: number;
}

export interface DayRow {
  /** "오늘", "어제", "11/16 (월)" */
  label: string;
  count: number;
  water: number;
  /** 최근 7일 중 가장 많이 한 날을 1로 본 막대 길이 (0~1) */
  ratio: number;
}

export interface HistoryView {
  today: { count: number; water: number; items: ActivityItem[] };
  week: { count: number; water: number; items: ActivityItem[]; days: DayRow[] };
}

const items = (byType: CountByType): ActivityItem[] =>
  ACTIVITIES.map((a) => ({ label: a.label, emoji: a.emoji, count: byType[a.code] }));

/** "2026-11-16" → "11/16 (월)". 오늘·어제는 그렇게 부른다 */
export function dayLabel(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const [ty, tm, td] = today.split('-').map(Number);
  const diff = Math.round((new Date(ty, tm - 1, td).getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  return `${m}/${d} (${WEEKDAYS[date.getDay()]})`;
}

/** @param week StatsService.lastDays(7)의 결과. 마지막 날이 오늘이다 */
export function toHistoryView(week: PeriodStats): HistoryView {
  const today = week.days[week.days.length - 1];
  const max = Math.max(1, ...week.days.map((d) => d.count));
  return {
    today: { count: today.count, water: today.water, items: items(today.byType) },
    week: {
      count: week.count,
      water: week.water,
      items: items(week.byType),
      // 최근 날짜가 위로 오게
      days: [...week.days].reverse().map((d) => ({
        label: dayLabel(d.day, today.day),
        count: d.count,
        water: d.water,
        ratio: d.count / max,
      })),
    },
  };
}
