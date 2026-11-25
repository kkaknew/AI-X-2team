import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { StatsService, TreeSummary } from '../logic/StatsService';
import type { TreeProgress, WateringEngine } from '../logic/WateringEngine';
import { FRUIT_STYLE } from './fruitView';
import { FruitTree } from './FruitTree';
import { completionStats } from './treeHistoryView';
import { colors, ErrorMessage, fontSize, Loading, radius, weight } from './ui';

export interface CompletionScreenProps {
  engine: WateringEngine | null;
  stats: StatsService | null;
  /** 새 씨앗을 심었으면 메인으로 */
  onPlanted: () => void;
  /** 나중에: 메인으로 (다 자란 나무를 더 본다) */
  onLater: () => void;
}

/** 시안 색종이 (위치·색·기울기 고정) */
const CONFETTI = [
  { x: 0.12, y: 30, w: 8, h: 18, c: FRUIT_STYLE.meditation.color, r: -20 },
  { x: 0.24, y: 90, w: 10, h: 10, c: FRUIT_STYLE.reading.color, r: 0, round: true },
  { x: 0.36, y: 20, w: 8, h: 16, c: FRUIT_STYLE.meditation.color, r: 25 },
  { x: 0.52, y: 10, w: 10, h: 10, c: FRUIT_STYLE.walk.color, r: 0, round: true },
  { x: 0.6, y: 70, w: 8, h: 18, c: FRUIT_STYLE.diary.color, r: 20 },
  { x: 0.08, y: 170, w: 16, h: 8, c: FRUIT_STYLE.meditation.color, r: -40 },
  { x: 0.3, y: 200, w: 8, h: 16, c: FRUIT_STYLE.diary.color, r: -15 },
  { x: 0.8, y: 120, w: 10, h: 10, c: FRUIT_STYLE.reading.color, r: 0, round: true },
  { x: 0.9, y: 200, w: 8, h: 18, c: FRUIT_STYLE.meditation.color, r: 30 },
  { x: 0.18, y: 260, w: 8, h: 16, c: colors.confettiOlive, r: -10 },
];

/**
 * 표현 계층: 나무 완성 화면 (시안 "나무 완성 · 새 씨앗") (#16)
 * 색종이, 열매 달린 다 자란 나무, "나무가 다 자랐어요!", 함께한 날 · 인증한 활동 · 받은 물,
 * [새 씨앗 심기] [나중에]. 새 씨앗을 심으면 지금 나무는 완성한 나무로 남는다.
 */
export default function CompletionScreen({ engine, stats, onPlanted, onLater }: CompletionScreenProps) {
  const { width: screenWidth } = useWindowDimensions();
  const [progress, setProgress] = useState<TreeProgress | null>(null);
  const [summary, setSummary] = useState<TreeSummary | null>(null);
  const [planting, setPlanting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onLater();
      return true;
    });
    return () => sub.remove();
  }, [onLater]);

  useEffect(() => {
    if (!engine || !stats) return;
    (async () => {
      const p = await engine.getProgress();
      setProgress(p);
      if (p) setSummary(await stats.treeSummary(p.treeId));
    })().catch(() => setError('나무를 불러오지 못했어요'));
  }, [engine, stats]);

  const plant = async () => {
    if (!engine) return;
    setPlanting(true);
    setError(null);
    try {
      await engine.plantNewSeed();
      onPlanted();
    } catch (e) {
      console.error('[CompletionScreen] 새 씨앗을 심지 못했습니다', e);
      setError('새 씨앗을 심지 못했어요. 다시 눌러 주세요');
      setPlanting(false);
    }
  };

  if (!progress || !summary) {
    return (
      <View style={styles.center}>
        {error ? <ErrorMessage message={error} variant="card" /> : <Loading />}
      </View>
    );
  }

  const treeWidth = Math.min(screenWidth - 80, 300);
  const items = completionStats(progress.plantedAt, new Date(), summary.count, progress.waterTotal);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      <View style={styles.stage}>
        {CONFETTI.map((c, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: c.x * screenWidth,
              top: c.y,
              width: c.w,
              height: c.h,
              borderRadius: c.round ? c.w / 2 : 2,
              backgroundColor: c.c,
              transform: [{ rotate: `${c.r}deg` }],
            }}
          />
        ))}
        <View style={styles.chip}>
          <Text style={styles.chipText}>나무 완성</Text>
        </View>
        <FruitTree width={treeWidth} earned={summary.fruits} />
      </View>

      <Text style={styles.title}>나무가 다 자랐어요!</Text>
      <Text style={styles.desc}>
        작은 실천이 모여 큰 나무가 됐어요.{'\n'}새 씨앗을 심고 다시 시작해 볼까요?
      </Text>

      <View style={styles.statsCard}>
        {items.map((s, i) => (
          <View key={s.label} style={[styles.stat, i > 0 && styles.statLine]}>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
          </View>
        ))}
      </View>

      {error && <ErrorMessage message={error} variant="card" />}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: planting }}
        disabled={planting}
        onPress={() => void plant()}
        style={styles.primary}
      >
        {planting ? <Loading size="button" /> : <Text style={styles.primaryText}>새 씨앗 심기</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onLater} style={styles.secondary}>
        <Text style={styles.secondaryText}>나중에</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: colors.background },
  container: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 14, alignItems: 'stretch' },
  stage: { alignItems: 'center', paddingTop: 36 },
  chip: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.doneChip,
    zIndex: 1,
  },
  chipText: { fontSize: fontSize.caption, fontWeight: weight.bold, color: colors.brownDark },
  title: { fontSize: 26, fontWeight: weight.bold, color: colors.text, textAlign: 'center' },
  desc: { fontSize: fontSize.body, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  statsCard: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statLine: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  statLabel: { fontSize: fontSize.caption, color: colors.textMuted },
  statValue: { fontSize: fontSize.cardTitle, fontWeight: weight.bold, color: colors.text },
  primary: {
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.brown,
  },
  primaryText: { fontSize: fontSize.emphasis, fontWeight: weight.bold, color: colors.textOnBrown },
  secondary: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryText: { fontSize: fontSize.reason, fontWeight: weight.bold, color: colors.text },
});
