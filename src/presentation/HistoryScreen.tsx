import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { StatsService } from '../logic/StatsService';
import type { WateringEngine } from '../logic/WateringEngine';
import { toHistoryView, type HistoryView } from './historyView';
import { dots } from './treeHistoryView';
import { colors, ErrorMessage, fontSize, Loading, radius, weight } from './ui';

export interface HistoryScreenProps {
  /** DB를 여는 동안은 null */
  stats: StatsService | null;
  /** 물을 준 직후 다시 집계하려고 구독한다. 없으면 화면을 열 때만 집계한다 */
  engine: WateringEngine | null;
}

/**
 * 표현 계층: 일·주간 활동 횟수와 받은 물의 양. (#14 [12] 기록 조회 화면)
 * 시안 "내 기록"의 "기록 조회" 카드: 오늘 인증·오늘 받은 물, 최근 7일 날짜별 횟수(점)와 물.
 * 집계 규칙(무엇을 세는지, 어느 날로 세는지)은 StatsService가 정한다.
 */
export default function HistoryScreen({ stats, engine }: HistoryScreenProps) {
  const [view, setView] = useState<HistoryView | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!stats) return;
    try {
      setView(toHistoryView(await stats.lastDays(7)));
      setError(false);
    } catch (e) {
      console.error('[HistoryScreen] 기록을 읽지 못했습니다', e);
      setError(true);
    }
  }, [stats]);

  useEffect(() => {
    void load();
  }, [load]);

  // 다른 화면에서 활동을 인증해 물을 받으면 다시 집계한다
  useEffect(() => engine?.subscribe(() => void load()), [engine, load]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>기록 조회</Text>
        <View style={styles.chip}>
          <Text style={styles.chipText}>최근 7일</Text>
        </View>
      </View>

      {error && <ErrorMessage message="기록을 불러오지 못했어요" variant="card" />}
      {!view && !error && <Loading />}
      {view && (
        <>
          <View style={styles.summary}>
            <View style={styles.box}>
              <Text style={styles.boxLabel}>오늘 인증</Text>
              <Text style={styles.boxValue}>{view.today.count}회</Text>
            </View>
            <View style={styles.box}>
              <Text style={styles.boxLabel}>오늘 받은 물</Text>
              <Text style={styles.boxValue}>{view.today.water.toLocaleString()}</Text>
            </View>
          </View>

          {view.week.days.map((d, i) => (
            <View key={d.date} style={[styles.row, i > 0 && styles.rowLine]}>
              <View style={styles.day}>
                <Text style={styles.dayName}>{d.short}</Text>
                <Text style={styles.dayDate}>{d.date}</Text>
              </View>
              <View style={styles.dots} accessibilityLabel={`${d.label} ${d.count}회`}>
                {dots(d.count).map((on, j) => (
                  <View key={j} style={[styles.dot, on && styles.dotOn]} />
                ))}
              </View>
              <Text style={styles.count}>{d.count}회</Text>
              <Text style={styles.water}>물 {d.water.toLocaleString()}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: fontSize.cardTitle, fontWeight: weight.bold, color: colors.text },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  chipText: { fontSize: 11, fontWeight: weight.bold, color: colors.textSubtle },
  summary: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  box: { flex: 1, gap: 2, padding: 12, borderRadius: radius.inner, backgroundColor: colors.surfaceMuted },
  boxLabel: { fontSize: fontSize.caption, color: colors.textMuted },
  boxValue: { fontSize: fontSize.headline, fontWeight: weight.bold, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  day: { width: 52 },
  dayName: { fontSize: fontSize.small, fontWeight: weight.bold, color: colors.text },
  dayDate: { fontSize: 10, color: colors.textMuted },
  dots: { flex: 1, flexDirection: 'row', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted },
  dotOn: { backgroundColor: colors.brown },
  count: { width: 36, fontSize: fontSize.small, color: colors.text },
  water: { minWidth: 64, textAlign: 'right', fontSize: fontSize.small, fontWeight: weight.bold, color: colors.text },
});
