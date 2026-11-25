import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ActivityCode, ActivityRecorder, WritingEntry } from '../logic/ActivityRecorder';
import type { ActivityTotals, SleepMonth, StatsService } from '../logic/StatsService';
import { dotDate } from './activityView';
import {
  BOOK_COLORS,
  bookPage,
  dayKeyOf,
  FRUIT_STYLE,
  hoursLong,
  hoursShort,
  shiftMonth,
  totalsView,
  writingsByDay,
} from './fruitView';
import { colors, ErrorMessage, fontSize, Fruit, Loading, radius, weight } from './ui';
import { MonthCalendar } from './ui/MonthCalendar';

export interface FruitPopupProps {
  /** 연 열매. null이면 닫혀 있다 */
  type: ActivityCode | null;
  onClose: () => void;
  recorder: ActivityRecorder | null;
  stats: StatsService | null;
  /** 지금 나무를 심은 시각. 산책·명상 열매의 누적은 이 나무에서 한 것만 센다 */
  plantedAt: string;
}

/**
 * 표현 계층: 열매 팝업 5종 (시안 "열매 팝업")
 * - 산책·명상: 이 나무에서의 총 횟수·총 거리/시간과 기록 상태
 * - 일기: 월 달력, 쓴 날 표시, 날짜를 누르면 그날 일기
 * - 독서: 책 12권씩 책장, 책을 누르면 독후감
 * - 수면: 이번 달 총 수면·하루 평균, 날짜별 잔 시간 달력
 * 일기·독후감 본문은 기기 안 개인 기록 DB에서만 읽어 보여준다.
 */
export default function FruitPopup({ type, onClose, recorder, stats, plantedAt }: FruitPopupProps) {
  return (
    <Modal visible={type !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {type && (
          <View style={[styles.popup, { backgroundColor: FRUIT_STYLE[type].tint }]}>
            <View style={styles.header}>
              <View style={styles.headerTitle}>
                <Fruit type={type} scale={0.45} />
                <Text style={styles.title}>{FRUIT_STYLE[type].title}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={10}>
                <Text style={styles.close}>X</Text>
              </Pressable>
            </View>
            {!recorder || !stats ? (
              <Loading />
            ) : type === 'walk' || type === 'meditation' ? (
              <TotalsContent type={type} stats={stats} plantedAt={plantedAt} />
            ) : type === 'diary' ? (
              <DiaryContent recorder={recorder} />
            ) : type === 'reading' ? (
              <ReadingContent recorder={recorder} />
            ) : (
              <SleepContent stats={stats} />
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

function TotalsContent({
  type,
  stats,
  plantedAt,
}: {
  type: 'walk' | 'meditation';
  stats: StatsService;
  plantedAt: string;
}) {
  const [totals, setTotals] = useState<ActivityTotals | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    stats
      .totalsSince(type, plantedAt)
      .then(setTotals)
      .catch(() => setError(true));
  }, [stats, type, plantedAt]);

  if (error) return <ErrorMessage message="기록을 불러오지 못했어요" variant="card" />;
  if (!totals) return <Loading />;
  const v = totalsView(type, totals);
  return (
    <View style={styles.body}>
      <View style={styles.summary}>
        <Text style={styles.summaryText}>{v.lines[0]}</Text>
        <Text style={styles.summaryText}>{v.lines[1]}</Text>
      </View>
      <View style={styles.status}>
        <View style={styles.statusHead}>
          <Text style={styles.muted}>기록 상태</Text>
          <View style={[styles.tag, { backgroundColor: FRUIT_STYLE[type].tint }]}>
            <Text style={[styles.tagText, { color: colors.text }]}>{v.tag}</Text>
          </View>
        </View>
        <Text style={styles.statusTitle}>{v.title}</Text>
        <Text style={styles.muted}>{v.description}</Text>
      </View>
    </View>
  );
}

function useCalendar() {
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [selected, setSelected] = useState<string | null>(dayKeyOf(now));
  return {
    ...ym,
    selected,
    setSelected,
    prev: () => setYm((v) => shiftMonth(v.year, v.month, -1)),
    next: () => setYm((v) => shiftMonth(v.year, v.month, 1)),
  };
}

function DiaryContent({ recorder }: { recorder: ActivityRecorder }) {
  const cal = useCalendar();
  const [entries, setEntries] = useState<WritingEntry[] | null>(null);
  const [open, setOpen] = useState<WritingEntry[] | null>(null);

  useEffect(() => {
    recorder
      .recentWritings('diary', 500)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [recorder]);

  const byDay = useMemo(() => writingsByDay(entries ?? []), [entries]);
  const marked = useMemo(() => Object.fromEntries([...byDay.keys()].map((k) => [k, ''])), [byDay]);

  if (!entries) return <Loading />;
  if (open) {
    return (
      <View style={styles.body}>
        <Pressable accessibilityRole="button" onPress={() => setOpen(null)}>
          <Text style={styles.back}>‹ 달력으로</Text>
        </Pressable>
        <Text style={styles.pageTitle}>{dotDate(new Date(open[0].writtenAt))}</Text>
        <ScrollView style={styles.pageCard} contentContainerStyle={styles.pageCardInner}>
          {open.map((e) => (
            <Text key={e.id} style={styles.pageBody}>
              {e.body}
            </Text>
          ))}
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={styles.body}>
      <MonthCalendar
        year={cal.year}
        month={cal.month}
        accent={FRUIT_STYLE.diary.color}
        selected={cal.selected}
        marked={marked}
        onSelect={(key) => {
          cal.setSelected(key);
          const list = byDay.get(key);
          if (list) setOpen(list);
        }}
        onPrev={cal.prev}
        onNext={cal.next}
      />
      {entries.length === 0 && <Text style={styles.muted}>아직 쓴 일기가 없어요. 일기를 쓰면 달력에 표시돼요.</Text>}
    </View>
  );
}

function ReadingContent({ recorder }: { recorder: ActivityRecorder }) {
  const [books, setBooks] = useState<WritingEntry[] | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<WritingEntry | null>(null);

  useEffect(() => {
    recorder
      .recentWritings('reading', 500)
      .then(setBooks)
      .catch(() => setBooks([]));
  }, [recorder]);

  if (!books) return <Loading />;
  if (open) {
    return (
      <View style={styles.body}>
        <Pressable accessibilityRole="button" onPress={() => setOpen(null)}>
          <Text style={styles.back}>‹ 책장으로</Text>
        </Pressable>
        <View style={styles.pageCard}>
          <View style={styles.statusHead}>
            <Text style={styles.statusTitle}>{open.title || '제목 없는 책'}</Text>
            <View style={[styles.tag, { backgroundColor: FRUIT_STYLE.reading.tint }]}>
              <Text style={[styles.tagText, { color: colors.text }]}>독서 기록</Text>
            </View>
          </View>
          <Text style={styles.muted}>
            {dotDate(new Date(open.writtenAt))} · {open.charCount}자
          </Text>
          <ScrollView style={styles.pageScroll}>
            <Text style={styles.pageBody}>{open.body}</Text>
          </ScrollView>
        </View>
      </View>
    );
  }

  const shelf = bookPage(books, page);
  return (
    <View style={styles.body}>
      <View style={styles.shelf}>
        {books.length === 0 && <Text style={styles.muted}>아직 기록한 책이 없어요. 독후감을 쓰면 책장에 꽂혀요.</Text>}
        <View style={styles.books}>
          {shelf.items.map((b, i) => (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              accessibilityLabel={b.title || '제목 없는 책'}
              onPress={() => setOpen(b)}
              style={[styles.book, { backgroundColor: BOOK_COLORS[i % BOOK_COLORS.length] }]}
            >
              <View style={styles.bookBand} />
              <Text style={styles.bookTitle} numberOfLines={3}>
                {b.title || '제목 없음'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.pager}>
          <Pressable accessibilityRole="button" accessibilityLabel="이전 쪽" onPress={() => setPage(shelf.page - 1)} hitSlop={8}>
            <Text style={styles.pagerArrow}>◀</Text>
          </Pressable>
          <Text style={styles.muted}>
            {shelf.page} / {shelf.pages}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="다음 쪽" onPress={() => setPage(shelf.page + 1)} hitSlop={8}>
            <Text style={styles.pagerArrow}>▶</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function SleepContent({ stats }: { stats: StatsService }) {
  const cal = useCalendar();
  const [data, setData] = useState<SleepMonth | null>(null);

  useEffect(() => {
    setData(null);
    stats
      .sleepMonth(cal.year, cal.month)
      .then(setData)
      .catch(() => setData({ year: cal.year, month: cal.month, byDay: {}, totalMin: 0, averageMin: 0 }));
  }, [stats, cal.year, cal.month]);

  const marked = useMemo(
    () => Object.fromEntries(Object.entries(data?.byDay ?? {}).map(([k, min]) => [k, hoursShort(min)])),
    [data],
  );

  return (
    <View style={styles.body}>
      <View style={styles.sleepSummary}>
        <View>
          <Text style={styles.muted}>이번 달 총 수면 시간</Text>
          <Text style={styles.sleepTotal}>{data ? hoursLong(data.totalMin) : '–'}</Text>
        </View>
        <View style={styles.sleepAverage}>
          <Text style={styles.muted}>하루 평균</Text>
          <Text style={[styles.sleepAverageText, { color: FRUIT_STYLE.sleep.color }]}>
            {data ? hoursLong(data.averageMin) : '–'}
          </Text>
        </View>
      </View>
      <MonthCalendar
        year={cal.year}
        month={cal.month}
        accent={FRUIT_STYLE.sleep.color}
        selected={cal.selected}
        marked={marked}
        onSelect={cal.setSelected}
        onPrev={cal.prev}
        onNext={cal.next}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(59, 61, 52, 0.4)',
  },
  popup: { width: '100%', maxWidth: 340, maxHeight: '85%', gap: 12, padding: 16, borderRadius: radius.card },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: fontSize.emphasis, fontWeight: weight.bold, color: colors.text },
  close: { fontSize: fontSize.emphasis, fontWeight: weight.bold, color: colors.text },
  body: { gap: 10 },
  muted: { fontSize: fontSize.small, color: colors.textMuted },
  summary: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 14,
    borderRadius: radius.inner,
    backgroundColor: colors.surface,
  },
  summaryText: { fontSize: fontSize.reason, fontWeight: weight.medium, color: colors.text },
  status: { gap: 6, padding: 14, borderRadius: radius.inner, backgroundColor: colors.surface },
  statusHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusTitle: { flexShrink: 1, fontSize: fontSize.reason, fontWeight: weight.bold, color: colors.text },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  tagText: { fontSize: 11, fontWeight: weight.bold },
  back: { fontSize: fontSize.small, fontWeight: weight.medium, color: colors.textMuted },
  pageTitle: { fontSize: fontSize.emphasis, fontWeight: weight.bold, color: colors.text },
  pageCard: { maxHeight: 420, gap: 8, padding: 14, borderRadius: radius.inner, backgroundColor: colors.surface },
  pageCardInner: { gap: 12 },
  pageScroll: { maxHeight: 340 },
  pageBody: { fontSize: fontSize.body, lineHeight: 22, color: colors.text },
  shelf: { gap: 10, padding: 12, borderRadius: radius.inner, backgroundColor: colors.surface },
  books: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  book: {
    width: '22%',
    height: 92,
    padding: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  bookBand: { alignSelf: 'stretch', height: 6, borderRadius: 2, marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.7)' },
  bookTitle: { fontSize: 10, fontWeight: weight.medium, color: colors.text, textAlign: 'center' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  pagerArrow: { fontSize: fontSize.caption, color: colors.textMuted },
  sleepSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: 14,
    borderRadius: radius.inner,
    backgroundColor: colors.surface,
  },
  sleepTotal: { fontSize: 20, fontWeight: weight.bold, color: colors.text },
  sleepAverage: { alignItems: 'flex-end' },
  sleepAverageText: { fontSize: fontSize.reason, fontWeight: weight.bold },
});
