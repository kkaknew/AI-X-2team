import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import type { ActivityRecorder } from '../../logic/ActivityRecorder';
import type { MeditationInput, MeditationSession, MeditationState } from '../../logic/MeditationSession';
import { clock, resultView, type ResultView } from '../activityView';
import { ConfirmDialog, DailyNotice, Loading } from '../ui';
import { colors, fontSize, radius, weight } from '../ui/theme';
import { ActivityError, ActivityFrame, ResultBlock } from './ActivityFrame';
import { CircleButton, HeroCard, SoundBars, useTicker } from './parts';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : '알 수 없는 오류가 났어요');

/**
 * 명상 화면 (시안 "명상", "명상 진행 중", "명상 인증 실패") (#11)
 * 정해진 음악이 끝날 때까지 화면을 만지지 않고 앱을 벗어나지 않으면 인증된다.
 * 화면 조작·앱 이탈은 MeditationSession이 기록만 하고, 인정 여부는 판정기가 정한다.
 * 이 화면을 떠나면(X → 포기, 뒤로 가기) 음악을 멈추고 기록 없이 취소된다.
 */
export default function MeditationScreen({
  recorder,
  meditation,
  onClose,
}: {
  recorder: ActivityRecorder;
  meditation: MeditationSession;
  onClose: () => void;
}) {
  const [session, setSession] = useState<MeditationState | null>(null);
  const [starting, setStarting] = useState(false);
  const [wateredToday, setWateredToday] = useState(false);
  const [result, setResult] = useState<ResultView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'giveUp' | 'recorded' | null>(null);
  const [recorded, setRecorded] = useState(false);
  const now = useTicker(session !== null);

  const remaining = session
    ? Math.max(0, Math.ceil(session.durationSec - (now - session.startedAt) / 1000))
    : 0;

  // 오늘 이미 명상으로 물을 받았는지 (시작 전 안내)
  useEffect(() => {
    if (session !== null) return;
    let active = true;
    recorder
      .meditationWateredToday()
      .then((watered) => active && setWateredToday(watered))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [recorder, session]);

  // 명상 중 다른 앱으로 나가면 기록해 둔다
  useEffect(() => {
    if (session === null) return;
    const sub = AppState.addEventListener('change', (state) => meditation.appStateChanged(state));
    return () => sub.remove();
  }, [session, meditation]);

  // 화면을 떠나면 음악을 멈추고 기록 없이 취소
  useEffect(() => () => void meditation.cancel(), [meditation]);

  const record = async (input: MeditationInput, playedSec: number) => {
    try {
      const r = await recorder.recordMeditation(input, playedSec);
      setResult(resultView('meditation', r));
      setRecorded(r.verified);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const start = async () => {
    setStarting(true);
    setError(null);
    setResult(null);
    try {
      const state = await meditation.start((input, playedSec) => {
        setSession(null);
        void record(input, playedSec);
      });
      setSession(state);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const requestClose = useCallback(() => {
    if (session !== null) setDialog('giveUp');
    else if (recorded) setDialog('recorded');
    else onClose();
  }, [session, recorded, onClose]);

  const giveUp = async () => {
    setDialog(null);
    await meditation.cancel();
    onClose();
  };

  return (
    <ActivityFrame
      title="명상"
      subtitle="오늘도 한 걸음씩 자라요"
      onRequestClose={requestClose}
      onTouchStart={session ? () => meditation.touch() : undefined}
    >
      {session === null ? (
        <HeroCard
          eyebrow="MEDITATE · 나를 위한 시간"
          title="잠시, 숨을 고르는 시간"
          subtitle="편안한 자세로 나에게 집중해 보세요"
          caption="천천히 들이쉬고, 편안하게 내쉬어요"
        >
          <CircleButton size={180} halo label="명상 시작" onPress={() => void start()} disabled={starting}>
            {starting ? <Loading size="button" /> : <Text style={styles.circleLabel}>시작</Text>}
          </CircleButton>
        </HeroCard>
      ) : (
        <HeroCard
          eyebrow="MEDITATE · 명상 중"
          title="숨을 고르는 중이에요"
          subtitle="화면을 만지지 말고 끝까지 들어 주세요"
          caption="곡이 끝까지 재생되면 인증돼요"
        >
          <CircleButton size={180} halo label={`남은 시간 ${clock(remaining)}`}>
            <Text style={styles.remainLabel}>남은 시간</Text>
            <Text style={styles.remain}>{clock(remaining)}</Text>
          </CircleButton>
        </HeroCard>
      )}

      <View style={styles.sound}>
        <View style={styles.soundTexts}>
          <Text style={styles.soundTitle}>마음을 가라앉히는 소리</Text>
          <Text style={styles.soundSub}>호흡에 귀 기울여 보세요</Text>
          <Text style={styles.credit}>{meditation.credit()}</Text>
        </View>
        <SoundBars />
      </View>

      {wateredToday && session === null && !result && (
        <DailyNotice
          title="오늘은 이미 명상으로 물을 받았어요"
          description="명상은 할 수 있지만 물은 내일 다시 받을 수 있어요"
        />
      )}
      {error && <ActivityError message={error} />}
      {result && <ResultBlock view={result} />}

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
    </ActivityFrame>
  );
}

const styles = StyleSheet.create({
  circleLabel: { fontSize: 20, fontWeight: weight.bold, color: colors.textOnBrown },
  remainLabel: { fontSize: fontSize.small, color: colors.textOnBrown, opacity: 0.85 },
  remain: { fontSize: 32, fontWeight: weight.bold, color: colors.textOnBrown },
  sound: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  soundTexts: { flex: 1, gap: 6 },
  soundTitle: { fontSize: fontSize.emphasis, fontWeight: weight.bold, color: colors.text },
  soundSub: { fontSize: fontSize.small, color: colors.textMuted },
  credit: { marginTop: 6, fontSize: 11, lineHeight: 15, color: colors.textSubtle },
});
