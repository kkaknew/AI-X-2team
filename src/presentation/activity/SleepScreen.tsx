import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  sleepDurationMin,
  sleepPeriod,
  type ActivityRecorder,
  type VerificationResult,
} from '../../logic/ActivityRecorder';
import {
  dotDate,
  fromWheel,
  hoursText,
  resultView,
  toWheel,
  wheelLabel,
  type ResultView,
  type WheelTime,
} from '../activityView';
import { ConfirmDialog, DailyNotice, Loading, splitNotice } from '../ui';
import { colors, fontSize, radius, sleepColors, weight } from '../ui/theme';
import { ActivityError, ActivityFrame, FooterButton, ResultBlock } from './ActivityFrame';
import { TimeWheel } from './TimeWheel';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : '알 수 없는 오류가 났어요');

const SLEEP = sleepColors;

/**
 * 수면 기록 화면 (시안 "수면 기록") (#13)
 * 잠든 시각·일어난 시각 카드를 눌러 고르고, 아래 휠로 시각을 바꾼다.
 * 인증될지(총 수면 시간 칩)와 하루 한 번 기록은 ActivityRecorder·판정기가 정한다.
 */
export default function SleepScreen({ recorder, onClose }: { recorder: ActivityRecorder; onClose: () => void }) {
  const [bed, setBed] = useState<WheelTime>(toWheel('23:30'));
  const [wake, setWake] = useState<WheelTime>(toWheel('07:00'));
  const [editing, setEditing] = useState<'bed' | 'wake'>('bed');
  const [preview, setPreview] = useState<VerificationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ResultView | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [dialog, setDialog] = useState(false);

  const bedText = fromWheel(bed);
  const wakeText = fromWheel(wake);
  const duration = sleepDurationMin(bedText, wakeText);
  const wakeDay = sleepPeriod(bedText, wakeText, new Date())?.endedAt ?? new Date();

  // 이 시간이면 인증되는지 판정기에 미리 묻는다
  useEffect(() => {
    if (duration === null) {
      setPreview(null);
      return;
    }
    let active = true;
    recorder
      .previewSleep(duration)
      .then((p) => active && setPreview(p))
      .catch(() => active && setPreview(null));
    return () => {
      active = false;
    };
  }, [recorder, duration]);

  const change = (next: WheelTime) => {
    if (editing === 'bed') setBed(next);
    else setWake(next);
    setResult(null);
    setBlocked(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setBlocked(null);
    try {
      const done = await recorder.recordSleep(bedText, wakeText);
      setResult(resultView('sleep', done.result));
      setRecorded(true);
    } catch (e) {
      // 그날 이미 기록했거나 시간이 겹치면 "막힘" 안내 (DuplicateSleepError)
      if (e instanceof Error && e.name === 'DuplicateSleepError') setBlocked(e.message);
      else setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const requestClose = useCallback(() => {
    if (recorded) setDialog(true);
    else onClose();
  }, [recorded, onClose]);

  const blockedText = blocked ? splitNotice(blocked) : null;

  return (
    <ActivityFrame
      title="수면 기록"
      subtitle="잠든 시각과 일어난 시각을 기록해 보세요"
      onRequestClose={requestClose}
      footer={
        <FooterButton label="저장" onPress={() => void save()} disabled={saving || duration === null}>
          {saving ? <Loading size="button" /> : undefined}
        </FooterButton>
      }
    >
      <View style={[styles.card, styles.dateRow]}>
        <Text style={styles.label}>일어난 날짜</Text>
        <Text style={styles.dateValue}>{dotDate(wakeDay)}</Text>
      </View>

      <View style={styles.timeRow}>
        <TimeCard
          icon="moon"
          label="잠든 시각"
          time={bed}
          active={editing === 'bed'}
          onPress={() => setEditing('bed')}
        />
        <TimeCard
          icon="sun"
          label="일어난 시각"
          time={wake}
          active={editing === 'wake'}
          onPress={() => setEditing('wake')}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{editing === 'bed' ? '잠든 시각 선택' : '일어난 시각 선택'}</Text>
        <TimeWheel value={editing === 'bed' ? bed : wake} onChange={change} accent={SLEEP.accent} />
      </View>

      <View style={styles.card}>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.label}>총 수면 시간</Text>
            <Text style={styles.total}>{duration === null ? '–' : hoursText(duration)}</Text>
          </View>
          {preview && (
            <View style={[styles.chip, !preview.verified && styles.chipFail]}>
              <Text style={[styles.chipText, !preview.verified && styles.chipTextFail]}>
                {preview.verified ? '인증 가능' : '인증 안 됨'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.rule} />
        <Text style={styles.note}>하루(일어난 날짜)에 한 번만 기록해요. 인증되면 물을 받아요.</Text>
      </View>

      {error && <ActivityError message={error} />}
      {blockedText && (
        <DailyNotice title={blockedText.title} description={blockedText.description} tone="blocked" />
      )}
      {result && <ResultBlock view={result} />}

      <ConfirmDialog
        open={dialog}
        title="오늘 기록이 올라갔어요!"
        message="종료할까요?"
        confirmLabel="종료할게요"
        onCancel={() => setDialog(false)}
        onConfirm={onClose}
      />
    </ActivityFrame>
  );
}

function TimeCard({
  icon,
  label,
  time,
  active,
  onPress,
}: {
  icon: 'moon' | 'sun';
  label: string;
  time: WheelTime;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} ${time.meridiem} ${wheelLabel(time)}`}
      onPress={onPress}
      style={[styles.timeCard, active && styles.timeCardActive]}
    >
      <View style={styles.timeHead}>
        <View style={[styles.iconCircle, icon === 'sun' && styles.iconSun]}>
          <Text style={styles.iconText}>{icon === 'moon' ? '☾' : '☀'}</Text>
        </View>
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.meridiem}>{time.meridiem}</Text>
      <Text style={styles.time}>{wheelLabel(time)}</Text>
      <Text style={[styles.timeHint, active && { color: SLEEP.accent }]}>
        {active ? '아래에서 시간을 골라요' : '눌러서 바꿔요'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: fontSize.small, color: colors.textMuted },
  dateValue: { fontSize: fontSize.emphasis, fontWeight: weight.medium, color: colors.text },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeCard: {
    flex: 1,
    gap: 2,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  timeCardActive: { borderWidth: 2, borderColor: SLEEP.border, backgroundColor: SLEEP.surface },
  timeHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  iconSun: { backgroundColor: sleepColors.sunBackground },
  iconText: { fontSize: fontSize.emphasis, color: sleepColors.icon },
  meridiem: { fontSize: fontSize.small, color: colors.textMuted },
  time: { fontSize: 30, fontWeight: weight.bold, color: colors.text },
  timeHint: { marginTop: 6, fontSize: fontSize.caption, color: colors.textMuted },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  total: { fontSize: 26, fontWeight: weight.bold, color: colors.text },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: SLEEP.chip },
  chipFail: { backgroundColor: colors.dangerBackground },
  chipText: { fontSize: fontSize.small, fontWeight: weight.medium, color: SLEEP.accent },
  chipTextFail: { color: colors.danger },
  rule: { height: 1, backgroundColor: colors.border },
  note: { fontSize: fontSize.small, color: colors.textMuted },
});
