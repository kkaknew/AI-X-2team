import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import type { ActivityRecorder } from '../../logic/ActivityRecorder';
import { clock, km, resultView, type ResultView } from '../activityView';
import { ConfirmDialog, Loading } from '../ui';
import { colors, fontSize, weight } from '../ui/theme';
import { ActivityError, ActivityFrame, ResultBlock } from './ActivityFrame';
import { CircleButton, HeroCard, useTicker } from './parts';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : '알 수 없는 오류가 났어요');

type Dialog = 'giveUp' | 'recorded' | 'permission' | null;

/**
 * 산책 화면 (시안 "산책", "산책 진행 중", "산책 인증 실패", "위치 권한 거부 안내")
 * 시작 → 걷는 중(거리·경과 시간) → 종료하면 판정. 거리 계산·인증 기준은 로직 계층이 한다.
 * 다른 화면으로 가도 산책은 이어진다 (돌아오면 진행 중 화면).
 */
export default function WalkScreen({ recorder, onClose }: { recorder: ActivityRecorder; onClose: () => void }) {
  const [walk, setWalk] = useState(recorder.currentWalk());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResultView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [recorded, setRecorded] = useState(false);
  const now = useTicker(walk !== null);

  useEffect(() => recorder.watchWalk(setWalk), [recorder]);

  const start = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await recorder.startWalk();
      setWalk(recorder.currentWalk());
    } catch (e) {
      // 위치 권한을 받지 못하면 안내 창 (LocationPermissionError, 데이터 계층)
      if (e instanceof Error && e.name === 'LocationPermissionError') setDialog('permission');
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    setError(null);
    try {
      setWalk(null);
      const done = await recorder.finishWalk();
      setResult(resultView('walk', done.result));
      setRecorded(done.result.verified);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const requestClose = useCallback(() => {
    if (walk !== null) setDialog('giveUp');
    else if (recorded) setDialog('recorded');
    else onClose();
  }, [walk, recorded, onClose]);

  const giveUp = async () => {
    setDialog(null);
    await recorder.cancelWalk().catch((e) => console.error('[WalkScreen] 산책 취소 실패', e));
    onClose();
  };

  const elapsed = walk ? Math.max(0, Math.floor((now - walk.startedAt) / 1000)) : 0;

  return (
    <ActivityFrame title="산책" subtitle="오늘도 한 걸음씩 자라요" onRequestClose={requestClose}>
      {walk === null ? (
        <HeroCard
          eyebrow="WALK · 나를 위한 시간"
          title="나를 위한 한 걸음"
          subtitle="천천히, 나만의 속도로 걸어보세요"
          caption="시작을 눌러 산책을 기록해 보세요"
        >
          <CircleButton size={176} label="산책 시작" onPress={() => void start()} disabled={busy}>
            {busy ? <Loading size="button" /> : <Text style={styles.circleLabel}>시작</Text>}
          </CircleButton>
        </HeroCard>
      ) : (
        <HeroCard
          eyebrow="WALK · 산책 중"
          title="걷는 중이에요"
          subtitle="천천히, 나만의 속도로 걷고 있어요"
          caption="평균 시속 7km를 넘으면 인정되지 않아요"
        >
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{km(walk.distanceM)}</Text>
              <Text style={styles.statLabel}>거리</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{clock(elapsed)}</Text>
              <Text style={styles.statLabel}>경과 시간</Text>
            </View>
          </View>
          <CircleButton size={116} label="산책 종료하고 인증하기" onPress={() => void stop()} disabled={busy}>
            {busy ? <Loading size="button" /> : <Text style={styles.circleLabel}>종료</Text>}
          </CircleButton>
        </HeroCard>
      )}

      {error && <ActivityError message={error} />}
      {result && <ResultBlock view={result} />}
      {walk === null && <Text style={styles.footnote}>하루의 작은 움직임이{'\n'}나무를 키워요</Text>}

      <ConfirmDialog
        open={dialog === 'giveUp'}
        title={'아직 기록이 올라가지 않았어요.\n그만할까요?'}
        confirmLabel="포기할게요"
        onCancel={() => setDialog(null)}
        onConfirm={() => void giveUp()}
      />
      <ConfirmDialog
        open={dialog === 'recorded'}
        title="오늘 기록이 올라갔어요!"
        message="종료할까요?"
        confirmLabel="종료할게요"
        onCancel={() => setDialog(null)}
        onConfirm={onClose}
      />
      <ConfirmDialog
        open={dialog === 'permission'}
        title="위치 권한이 필요해요"
        message="산책 거리를 재려면 위치 권한이 필요해요. 위치는 이 기기 밖으로 보내지 않아요."
        cancelLabel="나중에"
        confirmLabel="설정 열기"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          void Linking.openSettings();
        }}
      />
    </ActivityFrame>
  );
}

const styles = StyleSheet.create({
  circleLabel: { fontSize: 20, fontWeight: weight.bold, color: colors.textOnBrown },
  stats: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  stat: { alignItems: 'center', paddingHorizontal: 16, gap: 4 },
  statValue: { fontSize: 32, fontWeight: weight.bold, color: colors.text },
  statLabel: { fontSize: fontSize.caption, color: colors.textMuted },
  divider: { width: 1, height: 44, backgroundColor: colors.border },
  footnote: {
    marginTop: 16,
    fontSize: fontSize.emphasis,
    fontWeight: weight.bold,
    lineHeight: 22,
    color: colors.textSubtle,
    textAlign: 'center',
  },
});
