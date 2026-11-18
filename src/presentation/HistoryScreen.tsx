import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { StatsService } from '../logic/StatsService';
import type { WateringEngine } from '../logic/WateringEngine';
import { toHistoryView, type ActivityItem, type HistoryView } from './historyView';

export interface HistoryScreenProps {
  /** DB를 여는 동안은 null */
  stats: StatsService | null;
  /** 물을 준 직후 다시 집계하려고 구독한다. 없으면 화면을 열 때만 집계한다 */
  engine: WateringEngine | null;
}

/**
 * 표현 계층: 일·주간 활동 횟수와 받은 물의 양을 보여준다. (#14 [12] 기록 조회 화면)
 * 집계 규칙(무엇을 세는지, 어느 날로 세는지)은 StatsService가 정한다.
 */
export default function HistoryScreen({ stats, engine }: HistoryScreenProps) {
  const [view, setView] = useState<HistoryView | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const refresh = () => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  };

  if (!view) {
    return (
      <View style={styles.center}>
        {error ? (
          <Text style={styles.muted}>기록을 불러오지 못했어요</Text>
        ) : (
          <ActivityIndicator color={GREEN} />
        )}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Text style={styles.title}>기록 조회</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>오늘</Text>
        <Summary count={view.today.count} water={view.today.water} />
        <Items items={view.today.items} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>최근 7일</Text>
        <Summary count={view.week.count} water={view.week.water} />
        <Items items={view.week.items} />

        <View style={styles.days}>
          {view.week.days.map((d) => (
            <View key={d.label} style={styles.dayRow}>
              <Text style={styles.dayLabel}>{d.label}</Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${d.ratio * 100}%` }]} />
              </View>
              <Text style={styles.dayValue}>
                {d.count}번 · 💧{d.water}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.note}>
        인증된 활동만 횟수에 들어가요. 하루 한 번 물을 받은 뒤의 활동은 물 0으로 셉니다.
        {'\n'}산책은 아직 기록이 저장되지 않아 집계에서 빠져 있어요.
      </Text>
    </ScrollView>
  );
}

function Summary({ count, water }: { count: number; water: number }) {
  return (
    <View style={styles.summary}>
      <View style={styles.summaryBox}>
        <Text style={styles.summaryValue}>{count}번</Text>
        <Text style={styles.muted}>인증한 활동</Text>
      </View>
      <View style={styles.summaryBox}>
        <Text style={[styles.summaryValue, styles.water]}>💧 {water}</Text>
        <Text style={styles.muted}>받은 물</Text>
      </View>
    </View>
  );
}

function Items({ items }: { items: ActivityItem[] }) {
  return (
    <View style={styles.items}>
      {items.map((item) => (
        <View key={item.label} style={[styles.item, item.count === 0 && styles.dim]}>
          <Text style={styles.itemEmoji}>{item.emoji}</Text>
          <Text style={styles.itemLabel}>{item.label}</Text>
          <Text style={styles.itemCount}>{item.count}</Text>
        </View>
      ))}
    </View>
  );
}

const GREEN = '#2f7d4f';

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16, color: '#1d1d1d' },
  card: { borderRadius: 14, backgroundColor: '#f6f6f6', padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1d1d1d', marginBottom: 12 },
  summary: { flexDirection: 'row', marginBottom: 12 },
  summaryBox: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 26, fontWeight: '700', color: GREEN },
  water: { color: '#2b6cb0' },
  items: { flexDirection: 'row', justifyContent: 'space-between' },
  item: {
    flex: 1,
    marginHorizontal: 3,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  dim: { opacity: 0.45 },
  itemEmoji: { fontSize: 20 },
  itemLabel: { fontSize: 12, color: '#555555', marginTop: 2 },
  itemCount: { fontSize: 16, fontWeight: '700', color: '#1d1d1d' },
  days: { marginTop: 16 },
  dayRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  dayLabel: { width: 76, fontSize: 13, color: '#555555' },
  bar: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#e3e8e4', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: GREEN },
  dayValue: { width: 76, textAlign: 'right', fontSize: 13, color: '#333333' },
  muted: { fontSize: 13, color: '#888888' },
  note: { fontSize: 12, lineHeight: 18, color: '#888888' },
});
