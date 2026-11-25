import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { WateringEngine } from '../logic/WateringEngine';
import DevToolsCard, { type DevTools } from './DevToolsCard';
import HistoryScreen, { type HistoryScreenProps } from './HistoryScreen';
import PastRecordsScreen, { type PastRecordsScreenProps } from './PastRecordsScreen';
import ReminderScreen, { type ReminderScreenProps } from './ReminderScreen';
import { treeRows, type TreeRow } from './treeHistoryView';
import { colors, ErrorMessage, fontSize, Loading, radius, TreeIllustration, weight } from './ui';

export type RecordsScreenProps = HistoryScreenProps &
  ReminderScreenProps &
  PastRecordsScreenProps & {
    /** 메인으로 돌아가기 (X, 뒤로 가기) */
    onClose: () => void;
    /** 나의 나무에서 나무를 누르면 메인에서 그 나무를 보여준다 */
    onOpenTree: (treeId: number) => void;
    /** 개발 중에만 넘어온다 (체험용 기록 넣기·모두 지우기) */
    devTools?: DevTools;
    /** 기록이 통째로 바뀌면 늘어난다. 아래 화면을 다시 읽게 한다 */
    dataVersion?: number;
  };

/**
 * 표현 계층: 메인 화면 프로필 버튼으로 들어가는 "내 기록". (시안 "프로필 (기록 조회 · 알림 설정)")
 * 나의 나무(지금 나무 + 다 키운 나무) · 기록 조회(#14) · 알림 설정(#15)을 한 화면에.
 * 아래에 지난 일기·독후감·수면 목록을 접어 둔다.
 */
export default function RecordsScreen(props: RecordsScreenProps) {
  const { onClose } = props;
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>내 기록</Text>
          <Text style={styles.subtitle}>기록 조회와 알림 설정</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={styles.close}>
          <Text style={styles.closeText}>X</Text>
        </Pressable>
      </View>

      <View key={props.dataVersion ?? 0} style={styles.sections}>
        <MyTrees engine={props.engine} onOpenTree={props.onOpenTree} />
        <HistoryScreen stats={props.stats} engine={props.engine} />
        <ReminderScreen reminders={props.reminders} />

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showPast }}
          onPress={() => setShowPast((v) => !v)}
          style={styles.pastToggle}
        >
          <Text style={styles.pastToggleText}>지난 일기·독후감·수면 {showPast ? '접기 ▴' : '보기 ▾'}</Text>
        </Pressable>
        {showPast && <PastRecordsScreen recorder={props.recorder} engine={props.engine} />}
      </View>

      {props.devTools && <DevToolsCard tools={props.devTools} />}
    </ScrollView>
  );
}

/** 시안 "나의 나무": 지금 나무와 다 키운 나무. 누르면 메인에서 그 나무를 다시 본다 */
function MyTrees({ engine, onOpenTree }: { engine: WateringEngine | null; onOpenTree: (id: number) => void }) {
  const [rows, setRows] = useState<TreeRow[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!engine) return;
    const [active, completed] = await Promise.all([engine.getProgress(), engine.completedTrees()]);
    setRows(treeRows(active, completed));
  }, [engine]);

  useEffect(() => {
    load().catch(() => setError(true));
  }, [load]);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>나의 나무</Text>
        <Text style={styles.hint}>눌러서 다시 보기</Text>
      </View>
      {error && <ErrorMessage message="나무를 불러오지 못했어요" variant="card" />}
      {!rows && !error && <Loading />}
      {rows?.map((row) => (
        <Pressable
          key={row.treeId}
          accessibilityRole="button"
          accessibilityLabel={`${row.name}, ${row.period}, ${row.chip}`}
          onPress={() => onOpenTree(row.treeId)}
          style={[styles.treeRow, row.current && styles.treeRowCurrent]}
        >
          <View style={styles.thumb}>
            <TreeIllustration stageNumber={row.stageNumber} status="growing" width={44} />
          </View>
          <View style={styles.treeTexts}>
            <Text style={styles.treeName}>{row.name}</Text>
            <Text style={styles.treePeriod}>{row.period}</Text>
          </View>
          <View style={[styles.treeChip, row.chip === '완성' && styles.treeChipDone]}>
            <Text style={styles.treeChipText}>{row.chip}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  container: { paddingTop: 24, paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  titleGroup: { gap: 4 },
  title: { fontSize: fontSize.title, fontWeight: weight.bold, color: colors.text },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  closeText: { fontSize: fontSize.cardTitle, fontWeight: weight.bold, color: colors.text },
  sections: { gap: 16 },
  card: {
    gap: 10,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: fontSize.cardTitle, fontWeight: weight.bold, color: colors.text },
  hint: { fontSize: fontSize.caption, color: colors.textSubtle },
  treeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.inner + 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  treeRowCurrent: { borderColor: colors.highlightBorder, backgroundColor: colors.highlight },
  thumb: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: radius.inner,
    backgroundColor: colors.surfaceMuted,
  },
  treeTexts: { flex: 1, gap: 2 },
  treeName: { fontSize: fontSize.reason, fontWeight: weight.bold, color: colors.text },
  treePeriod: { fontSize: fontSize.caption, color: colors.textMuted },
  treeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  treeChipDone: { backgroundColor: colors.doneChip },
  treeChipText: { fontSize: 11, fontWeight: weight.bold, color: colors.brownDark },
  chevron: { fontSize: fontSize.cardTitle, color: colors.textSubtle },
  pastToggle: { alignItems: 'center', paddingVertical: 8 },
  pastToggleText: { fontSize: fontSize.small, fontWeight: weight.medium, color: colors.textMuted },
});
