import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { TreeProgress, WateringEngine } from '../logic/WateringEngine';
import { toTreeView } from './treeView';

export interface TreeScreenProps {
  /** DB를 여는 동안은 null */
  engine: WateringEngine | null;
}

/**
 * 표현 계층: 현재 성장 단계와 물의 양을 보여준다. (#9 [7] 나무 화면)
 * 화면이 열릴 때 지금 상태를 읽고, 활동이 인증돼 물을 받으면 바로 다시 그린다.
 */
export default function TreeScreen({ engine }: TreeScreenProps) {
  const [progress, setProgress] = useState<TreeProgress | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');

  useEffect(() => {
    if (!engine) return;
    let active = true;

    engine
      .getProgress()
      .then((p) => {
        if (!active) return;
        setProgress(p);
        setState(p ? 'ready' : 'empty');
      })
      .catch((e) => {
        console.error('[TreeScreen] 나무 상태를 읽지 못했습니다', e);
        if (active) setState('error');
      });

    const unsubscribe = engine.subscribe((p) => {
      setProgress(p);
      setState('ready');
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [engine]);

  if (state !== 'ready' || !progress) {
    const message = {
      loading: '나무를 불러오는 중이에요',
      empty: '키우고 있는 나무가 없어요',
      error: '나무를 불러오지 못했어요',
      ready: '',
    }[state];
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>{message}</Text>
      </View>
    );
  }

  const view = toTreeView(progress);

  return (
    <View style={styles.container}>
      <Text style={styles.icon} accessibilityLabel={view.stageName}>
        {view.icon}
      </Text>
      <Text style={styles.stageName}>{view.stageName}</Text>
      <Text style={styles.muted}>{view.stageLabel}</Text>

      <Text style={styles.water}>{view.waterLabel}</Text>
      <View
        style={styles.bar}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(view.progress * 100) }}
      >
        <View style={[styles.barFill, { width: `${view.progress * 100}%` }]} />
      </View>
      <Text style={styles.muted}>{view.nextLabel}</Text>

      {view.statusNote && <Text style={styles.wilted}>{view.statusNote}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  icon: { fontSize: 96, marginBottom: 12 },
  stageName: { fontSize: 24, fontWeight: '600', color: '#2f7d4f' },
  water: { fontSize: 18, marginTop: 24, marginBottom: 8, color: '#2b6cb0' },
  bar: {
    width: '100%',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e6eef5',
    overflow: 'hidden',
    marginBottom: 8,
  },
  barFill: { height: '100%', backgroundColor: '#4a90d9' },
  muted: { fontSize: 14, color: '#888888' },
  wilted: { fontSize: 14, color: '#b7791f', marginTop: 16, textAlign: 'center' },
});
