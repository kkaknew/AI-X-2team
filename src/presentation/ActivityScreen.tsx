import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  sleepDurationMin,
  type ActivityCode,
  type ActivityRecorder,
  type RecordResult,
} from '../logic/ActivityRecorder';

/**
 * 표현 계층: 활동 5종을 선택해 기록하고 인증 결과를 보여준다. (#8 [6] 활동 기록 화면)
 *
 * 인증 기준(거리, 글자 수, 시간 등)은 이 화면이 모른다. ActivityRecorder가 판정하고,
 * 화면은 결과(verified, reasons)만 보여준다.
 * 일기·독후감 본문은 글자 수만 넘기고 저장하지 않는다. (본문 저장은 #10, #12)
 */

const ACTIVITIES: { code: ActivityCode; label: string; emoji: string }[] = [
  { code: 'walk', label: '산책', emoji: '🚶' },
  { code: 'diary', label: '일기', emoji: '📔' },
  { code: 'meditation', label: '명상', emoji: '🧘' },
  { code: 'reading', label: '독서', emoji: '📚' },
  { code: 'sleep', label: '수면', emoji: '😴' },
];

/**
 * 명상 시간(초). 임시 값이다.
 * 정해진 클래식 음악 재생(#11 명상 인증)이 붙으면 음악 길이로 바뀐다. 지금은 타이머로 대신한다.
 */
const MEDITATION_SEC = 60;

interface Outcome {
  result: RecordResult;
  /** 결과 아래에 덧붙일 기록 요약. 예: "1.2km · 25분" */
  detail?: string;
}

interface FormProps {
  recorder: ActivityRecorder;
  busy: boolean;
  /** 기록 버튼을 누르면 이 함수로 감싸서 실행한다. 로딩·에러 표시를 맡는다. */
  run: (task: () => Promise<Outcome | void>) => void;
  /** 산책·명상 중에는 다른 활동으로 못 바꾸게 잠근다 */
  setLocked: (locked: boolean) => void;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : '알 수 없는 오류가 났어요');
const pad = (n: number) => String(n).padStart(2, '0');
const clock = (sec: number) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
const km = (m: number) => `${(m / 1000).toFixed(2)}km`;
const hoursText = (min: number) => `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}`;
/** 공백을 뺀 글자 수. 이모지도 한 글자로 센다 */
const countChars = (text: string) => Array.from(text.trim()).length;

export interface ActivityScreenProps {
  /** DB를 여는 동안은 null */
  recorder: ActivityRecorder | null;
}

export default function ActivityScreen({ recorder }: ActivityScreenProps) {
  if (!recorder) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={GREEN} />
      </View>
    );
  }
  return <ActivityForm recorder={recorder} />;
}

function ActivityForm({ recorder }: { recorder: ActivityRecorder }) {
  const [selected, setSelected] = useState<ActivityCode>('walk');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  /** 명상 중 화면 조작을 감지하려고 화면 전체의 터치를 여기로 알린다 */
  const touchListener = useRef<(() => void) | null>(null);

  const select = (code: ActivityCode) => {
    if (locked || busy) return;
    setSelected(code);
    setOutcome(null);
    setError(null);
  };

  const run: FormProps['run'] = (task) => {
    setBusy(true);
    setError(null);
    setOutcome(null);
    task()
      .then((o) => {
        if (o) setOutcome(o);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  };

  const formProps: FormProps = { recorder, busy, run, setLocked };

  return (
    <View style={styles.root} onTouchStart={() => touchListener.current?.()}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>오늘 어떤 활동을 했나요?</Text>

        <View style={styles.chips}>
          {ACTIVITIES.map((a) => {
            const active = a.code === selected;
            return (
              <Pressable
                key={a.code}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: locked && !active }}
                onPress={() => select(a.code)}
                style={[styles.chip, active && styles.chipActive, locked && !active && styles.dim]}
              >
                <Text style={styles.chipEmoji}>{a.emoji}</Text>
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{a.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.card}>
          {selected === 'walk' && <WalkForm {...formProps} />}
          {selected === 'diary' && (
            <WritingForm {...formProps} type="diary" placeholder="오늘 하루를 적어 보세요" />
          )}
          {selected === 'reading' && (
            <WritingForm {...formProps} type="reading" placeholder="읽은 책의 독후감을 적어 보세요" />
          )}
          {selected === 'sleep' && <SleepForm {...formProps} />}
          {selected === 'meditation' && (
            <MeditationForm {...formProps} touchListener={touchListener} />
          )}
        </View>

        {busy && <ActivityIndicator style={styles.spinner} color="#2f7d4f" />}
        {error && <Text style={styles.error}>{error}</Text>}
        {outcome && <ResultCard outcome={outcome} />}
      </ScrollView>
    </View>
  );
}

function ResultCard({ outcome: { result, detail } }: { outcome: Outcome }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.result, result.verified ? styles.resultOk : styles.resultFail]}
    >
      <Text style={styles.resultTitle}>
        {!result.verified
          ? '인증되지 않았어요'
          : result.waterGiven > 0
            ? `💧 인증 성공! 나무에 물 ${result.waterGiven}을 줬어요`
            : '💧 인증 성공!'}
      </Text>
      {detail && <Text style={styles.resultDetail}>{detail}</Text>}
      {result.reasons.map((r) => (
        <Text key={r} style={styles.reason}>
          • {r}
        </Text>
      ))}
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
  kind = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, kind === 'secondary' && styles.buttonSecondary, disabled && styles.dim]}
    >
      <Text style={[styles.buttonLabel, kind === 'secondary' && styles.buttonLabelSecondary]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 1초마다 다시 그리게 한다 (경과 시간 표시용) */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function WalkForm({ recorder, busy, run, setLocked }: FormProps) {
  // 탭을 옮겼다 와도 산책은 계속된다. 진행 중이면 이어서 보여준다.
  const [walk, setWalk] = useState(recorder.currentWalk());
  const now = useTicker(walk !== null);

  useEffect(() => {
    setLocked(walk !== null);
  }, [walk, setLocked]);

  useEffect(() => recorder.watchWalk(setWalk), [recorder]);

  const start = () =>
    run(async () => {
      await recorder.startWalk();
      setWalk(recorder.currentWalk());
    });

  const stop = () =>
    run(async () => {
      setWalk(null);
      const { distanceM, durationSec, result } = await recorder.finishWalk();
      return { result, detail: `${km(distanceM)} · ${Math.floor(durationSec / 60)}분` };
    });

  if (walk === null) {
    return (
      <>
        <Text style={styles.hint}>
          시작을 누르고 걸은 뒤 종료를 누르세요. 앱 화면을 켜 둔 동안 거리를 잽니다.
          {'\n'}이동 경로는 저장하지 않고 거리와 시간만 남겨요.
        </Text>
        <Button label="산책 시작" onPress={start} disabled={busy} />
      </>
    );
  }

  const elapsed = Math.max(0, Math.floor((now - walk.startedAt) / 1000));
  return (
    <>
      <Text style={styles.big}>{km(walk.distanceM)}</Text>
      <Text style={styles.sub}>{clock(elapsed)} 경과</Text>
      <Button label="산책 종료하고 인증하기" onPress={stop} disabled={busy} />
    </>
  );
}

function WritingForm({
  recorder,
  busy,
  run,
  type,
  placeholder,
}: FormProps & { type: 'diary' | 'reading'; placeholder: string }) {
  const [text, setText] = useState('');
  const charCount = countChars(text);

  const submit = () =>
    run(async () => {
      const result = await recorder.record({ type, charCount });
      if (result.verified) setText('');
      return { result, detail: `${charCount}자 작성` };
    });

  return (
    <>
      <TextInput
        style={styles.textArea}
        multiline
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        textAlignVertical="top"
      />
      <Text style={styles.counter}>{charCount}자</Text>
      <Button label="기록하고 인증하기" onPress={submit} disabled={busy} />
    </>
  );
}

function SleepForm({ recorder, busy, run }: FormProps) {
  const [bedtime, setBedtime] = useState('23:00');
  const [wakeTime, setWakeTime] = useState('07:00');
  const duration = sleepDurationMin(bedtime, wakeTime);

  const submit = () =>
    run(async () => {
      if (duration === null) throw new Error('시각을 23:30처럼 "시:분" 형식으로 입력해 주세요');
      const result = await recorder.record({ type: 'sleep', durationMin: duration });
      return { result, detail: `${bedtime} ~ ${wakeTime} (${hoursText(duration)})` };
    });

  return (
    <>
      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={styles.label}>잠든 시각</Text>
          <TextInput
            style={styles.input}
            value={bedtime}
            onChangeText={setBedtime}
            placeholder="23:00"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>일어난 시각</Text>
          <TextInput
            style={styles.input}
            value={wakeTime}
            onChangeText={setWakeTime}
            placeholder="07:00"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
        </View>
      </View>
      <Text style={styles.counter}>
        {duration === null ? '시각 형식을 확인해 주세요 (예: 23:30)' : `${hoursText(duration)} 잤어요`}
      </Text>
      <Button label="기록하고 인증하기" onPress={submit} disabled={busy} />
    </>
  );
}

function MeditationForm({
  recorder,
  busy,
  run,
  setLocked,
  touchListener,
}: FormProps & { touchListener: MutableRefObject<(() => void) | null> }) {
  const [endAt, setEndAt] = useState<number | null>(null);
  const flags = useRef({ touched: false, leftApp: false });
  const now = useTicker(endAt !== null);
  const remaining = endAt === null ? MEDITATION_SEC : Math.max(0, Math.ceil((endAt - now) / 1000));

  const finish = (fullyPlayed: boolean) => {
    setEndAt(null);
    setLocked(false);
    touchListener.current = null;
    const { touched, leftApp } = flags.current;
    run(async () => {
      const result = await recorder.record({ type: 'meditation', fullyPlayed, touched, leftApp });
      return { result };
    });
  };

  // 시간이 다 되면 판정한다. 화면 조작·앱 이탈은 기록만 해 두고, 인정 여부는 판정기가 정한다.
  useEffect(() => {
    if (endAt !== null && remaining === 0) finish(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt, remaining]);

  // 명상 중 다른 앱으로 나가면 기록해 둔다
  useEffect(() => {
    if (endAt === null) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flags.current.leftApp = true;
    });
    return () => sub.remove();
  }, [endAt]);

  // 명상 중에 화면을 떠나면(탭 이동) 그냥 취소된다
  useEffect(
    () => () => {
      touchListener.current = null;
      setLocked(false);
    },
    [touchListener, setLocked],
  );

  const start = () => {
    flags.current = { touched: false, leftApp: false };
    setLocked(true);
    setEndAt(Date.now() + MEDITATION_SEC * 1000);
    // 시작 버튼을 누른 터치가 끝난 뒤부터 조작을 센다
    setTimeout(() => {
      touchListener.current = () => {
        flags.current.touched = true;
      };
    }, 300);
  };

  if (endAt === null) {
    return (
      <>
        <Text style={styles.hint}>
          {MEDITATION_SEC / 60}분 동안 화면을 만지지 말고, 다른 앱으로 나가지 말고 명상해 보세요.
        </Text>
        <Button label="명상 시작" onPress={start} disabled={busy} />
      </>
    );
  }

  return (
    <>
      <Text style={styles.big}>{clock(remaining)}</Text>
      <Text style={styles.sub}>눈을 감고 호흡에 집중해 보세요</Text>
      <Button label="그만하기" kind="secondary" onPress={() => finish(false)} />
    </>
  );
}

const GREEN = '#2f7d4f';

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16, color: '#1d1d1d' },
  chips: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  chip: {
    flex: 1,
    marginHorizontal: 3,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dddddd',
    backgroundColor: '#fafafa',
  },
  chipActive: { borderColor: GREEN, backgroundColor: '#e8f4ec' },
  chipEmoji: { fontSize: 22 },
  chipLabel: { marginTop: 4, fontSize: 13, color: '#555555' },
  chipLabelActive: { color: GREEN, fontWeight: '600' },
  dim: { opacity: 0.4 },
  card: { borderRadius: 14, backgroundColor: '#f6f6f6', padding: 16 },
  hint: { fontSize: 14, lineHeight: 20, color: '#555555', marginBottom: 14 },
  big: { fontSize: 40, fontWeight: '700', textAlign: 'center', color: '#1d1d1d' },
  sub: { fontSize: 14, textAlign: 'center', color: '#777777', marginBottom: 16 },
  textArea: {
    minHeight: 140,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dddddd',
    backgroundColor: '#ffffff',
    padding: 12,
    fontSize: 15,
  },
  counter: { alignSelf: 'flex-end', marginVertical: 8, fontSize: 13, color: '#777777' },
  row: { flexDirection: 'row' },
  field: { flex: 1, marginHorizontal: 4 },
  label: { fontSize: 13, color: '#555555', marginBottom: 6 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dddddd',
    backgroundColor: '#ffffff',
    padding: 12,
    fontSize: 18,
    textAlign: 'center',
  },
  button: { borderRadius: 10, backgroundColor: GREEN, paddingVertical: 14, alignItems: 'center' },
  buttonSecondary: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#bbbbbb' },
  buttonLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  buttonLabelSecondary: { color: '#444444' },
  spinner: { marginTop: 16 },
  error: { marginTop: 16, color: '#b3261e', fontSize: 14 },
  result: { marginTop: 16, borderRadius: 14, padding: 16, borderWidth: 1 },
  resultOk: { backgroundColor: '#e8f4ec', borderColor: '#9fd0b0' },
  resultFail: { backgroundColor: '#fdeeee', borderColor: '#f0b4b0' },
  resultTitle: { fontSize: 16, fontWeight: '700', color: '#1d1d1d' },
  resultDetail: { marginTop: 4, fontSize: 14, color: '#555555' },
  reason: { marginTop: 6, fontSize: 14, color: '#5c1d18' },
});
