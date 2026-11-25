import type { ActivityCode, WritingEntry } from '../logic/ActivityRecorder';
import type { ActivityTotals } from '../logic/StatsService';

/**
 * 표현 계층: 열매 팝업 5종 (시안 "열매 팝업": 산책·명상·일기·독서·수면 열매)에 보여줄 글자와 달력.
 * React Native 없이 테스트할 수 있도록 FruitPopup.tsx와 나눴다.
 */

export interface FruitStyle {
  title: string;
  /** 팝업 배경 (열매 색을 옅게) */
  tint: string;
  /** 열매 몸통 색 (강조) */
  color: string;
}

export const FRUIT_STYLE: Record<ActivityCode, FruitStyle> = {
  walk: { title: '산책 열매', tint: '#eef4f9', color: '#86bbdc' },
  meditation: { title: '명상 열매', tint: '#f2eff8', color: '#b3a2d4' },
  diary: { title: '일기 열매', tint: '#fbeeea', color: '#e68f7b' },
  reading: { title: '독서 열매', tint: '#faf4e6', color: '#e8b866' },
  sleep: { title: '수면 열매', tint: '#eef0fa', color: '#7e8cc9' },
};

/** 산책·명상 열매의 누적 문구 */
export function totalsView(
  type: 'walk' | 'meditation',
  t: ActivityTotals,
): { lines: [string, string]; hasRecord: boolean; tag: string; title: string; description: string } {
  const hasRecord = t.count > 0;
  const second =
    type === 'walk' ? `총 거리 ${(t.distanceM / 1000).toFixed(1)}km` : `총 시간 ${t.durationMin}분`;
  const noun = type === 'walk' ? '산책' : '명상';
  return {
    lines: [`총 횟수 ${t.count}회`, second],
    hasRecord,
    tag: hasRecord ? '기록 있음' : '기록 없음',
    title: hasRecord ? `이 나무에서 ${noun}을 ${t.count}번 했어요` : `아직 ${noun} 기록이 없어요`,
    description: hasRecord
      ? '꾸준히 할수록 나무가 더 잘 자라요.'
      : type === 'walk'
        ? '첫 산책을 기록하면 나무가 자라고, 열매가 생겨요.'
        : '오늘 첫 명상을 시작하면 나무가 자라요',
  };
}

/* ---------- 달력 (일요일부터) ---------- */

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-18" (휴대폰 시간대) */
export const dayKey = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

export const dayKeyOf = (d: Date) => dayKey(d.getFullYear(), d.getMonth() + 1, d.getDate());

/** 한 달 달력: 주(7칸)마다 날짜, 앞뒤 빈칸은 null */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null)];
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 이전·다음 달 */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** 일기를 쓴 날별로 묶는다 (휴대폰 시간대). 최근에 쓴 것이 앞 */
export function writingsByDay(entries: WritingEntry[]): Map<string, WritingEntry[]> {
  const map = new Map<string, WritingEntry[]>();
  for (const e of entries) {
    const key = dayKeyOf(new Date(e.writtenAt));
    map.set(key, [...(map.get(key) ?? []), e]);
  }
  return map;
}

/** 수면 달력 칸의 작은 글자: 450분 → "7.5h" */
export const hoursShort = (min: number) => `${Math.round((min / 60) * 10) / 10}h`;

/** "194시간 55분" */
export const hoursLong = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
};

/** 독서 열매 책장: 한 쪽에 12권 */
export const BOOKS_PER_PAGE = 12;

export function bookPage<T>(books: T[], page: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(books.length / BOOKS_PER_PAGE));
  const p = Math.min(Math.max(page, 1), pages);
  return { items: books.slice((p - 1) * BOOKS_PER_PAGE, p * BOOKS_PER_PAGE), page: p, pages };
}

/** 책 등 색 (시안: 노랑·분홍·베이지·보라·하늘을 돌려 쓴다) */
export const BOOK_COLORS = ['#f3dfa9', '#f2c9bd', '#e8dcc6', '#d9cfe8', '#cfe1ee'];
