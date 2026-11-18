import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { TreeProgress, WateringEngine } from '../logic/WateringEngine';
import { toTreeView } from './treeView';

export interface TreeScreenProps {
  /** DB를 여는 동안은 null */
  engine: WateringEngine | null;
}

/**
 * 표현 계층: 현재 성장 단계와 물의 양을 보여준다. (#9 [7] 나무 화면)
 * 화면이 열릴 때 지금 상태를 읽고, 활동이 인증돼 물을 받으면 바로 다시 그린다.
 * 마지막 단계에 도달하면 완성 축하와 [새 씨앗 심기] 버튼을 보여준다. (#16 [14])
 */
export default function TreeScreen({ engine }: TreeScreenProps) {
  const [progress, setProgress] = useState<TreeProgress | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [planting, setPlanting] = useState(false);
  const [plantError, setPlantError] = useState<string | null>(null);

  const plant = () => {
    if (!engine || planting) return;
    setPlanting(true);
    setPlantError(null);
    engine
      .plantNewSeed()
      .then((p) => {
        setProgress(p);
        setState('ready');
      })
      .catch((e) => {
        console.error('[TreeScreen] 새 씨앗을 심지 못했습니다', e);
        setPlantError('새 씨앗을 심지 못했어요. 다시 눌러 주세요');
      })
      .finally(() => setPlanting(false));
  };

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

      {progress.isFinalStage && (
        <View style={styles.complete} accessibilityLiveRegion="polite">
          <Text style={styles.completeTitle}>🎉 나무가 완성됐어요!</Text>
          <Text style={styles.completeSub}>
            새 씨앗을 심으면 완성한 나무로 기록되고, 씨앗부터 다시 키워요.{'\n'}
            버튼을 안 눌러도 다음 활동을 인증하면 새 씨앗이 심어져요.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: planting }}
            disabled={planting}
            onPress={plant}
            style={[styles.plantButton, planting && styles.dim]}
          >
            {planting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.plantLabel}>🌰 새 씨앗 심기</Text>
            )}
          </Pressable>
          {plantError && <Text style={styles.plantError}>{plantError}</Text>}
        </View>
      )}
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
  complete: {
    width: '100%',
    marginTop: 24,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#e8f4ec',
    alignItems: 'center',
  },
  completeTitle: { fontSize: 18, fontWeight: '700', color: '#2f7d4f' },
  completeSub: { fontSize: 13, lineHeight: 19, color: '#555555', textAlign: 'center', marginTop: 6 },
  plantButton: {
    marginTop: 14,
    alignSelf: 'stretch',
    borderRadius: 10,
    backgroundColor: '#2f7d4f',
    paddingVertical: 14,
    alignItems: 'center',
  },
  plantLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  plantError: { marginTop: 8, fontSize: 13, color: '#b3261e' },
  dim: { opacity: 0.5 },
});
