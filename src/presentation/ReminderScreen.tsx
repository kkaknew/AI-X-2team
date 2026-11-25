import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { type ReminderService, type ReminderSetting } from '../logic/ReminderService';
import { TimeWheel } from './activity/TimeWheel';
import { fromWheel, toWheel, type WheelTime } from './activityView';
import { colors, ErrorMessage, fontSize, Loading, radius, weight } from './ui';

/**
 * 표현 계층: 물주기 리마인더 설정. (#15 [13] 물주기 리마인더)
 * 시안 "내 기록"의 "알림 설정" 카드: 물주기 알림 켜고 끄기, 매일 알림 시각(눌러서 휠로 바꾸기).
 * 저장·예약은 ReminderService가 한다.
 */

export interface ReminderScreenProps {
  /** DB를 여는 동안은 null */
  reminders: ReminderService | null;
}

/** "21:00" → "오후 9:00" */
function timeLabel(time: string): string {
  const w = toWheel(time);
  return `${w.meridiem} ${w.hour}:${String(w.minute).padStart(2, '0')}`;
}

export default function ReminderScreen({ reminders }: ReminderScreenProps) {
  const [saved, setSaved] = useState<ReminderSetting | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [picking, setPicking] = useState<WheelTime | null>(null);

  useEffect(() => {
    if (!reminders) return;
    reminders
      .getSetting()
      .then(setSaved)
      .catch((e) => {
        console.error('[ReminderScreen] 알림 설정을 읽지 못했습니다', e);
        setError('알림 설정을 읽지 못했어요');
      });
  }, [reminders]);

  const save = (time: string, enabled: boolean) => {
    if (!reminders) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    reminders
      .update(time, enabled)
      .then((s) => {
        setSaved(s);
        setMessage(s.enabled ? `매일 ${timeLabel(s.time)}에 알려드릴게요` : '물주기 알림을 껐어요');
      })
      .catch((e) => setError(e instanceof Error ? e.message : '저장하지 못했어요'))
      .finally(() => setBusy(false));
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>알림 설정</Text>
      {!saved ? (
        error ? <ErrorMessage message={error} variant="card" /> : <Loading />
      ) : (
        <>
          <View style={styles.row}>
            <View style={styles.texts}>
              <Text style={styles.label}>물주기 알림</Text>
              <Text style={styles.sub}>정한 시각에 매일 알려드려요</Text>
            </View>
            <Switch
              value={saved.enabled}
              disabled={busy}
              onValueChange={(v) => save(saved.time, v)}
              trackColor={{ true: colors.brown, false: colors.border }}
              thumbColor={colors.surface}
              accessibilityLabel="물주기 알림 받기"
            />
          </View>
          <View style={[styles.row, styles.rowLine]}>
            <View style={styles.texts}>
              <Text style={styles.label}>매일 알림 시각</Text>
              <Text style={styles.sub}>바꾸려면 눌러요</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`알림 시각 ${timeLabel(saved.time)}, 바꾸기`}
              disabled={busy}
              onPress={() => setPicking(toWheel(saved.time))}
              style={styles.timeChip}
            >
              <Text style={styles.timeText}>{timeLabel(saved.time)} ›</Text>
            </Pressable>
          </View>
          {busy && <Loading size="screen" />}
          {message && <Text style={styles.ok}>{message}</Text>}
          {error && <ErrorMessage message={error} />}
        </>
      )}

      <Modal visible={picking !== null} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <View style={styles.backdrop}>
          <View style={styles.picker}>
            <Text style={styles.label}>매일 알림 시각</Text>
            {picking && <TimeWheel value={picking} onChange={setPicking} accent={colors.brown} />}
            <View style={styles.buttons}>
              <Pressable accessibilityRole="button" onPress={() => setPicking(null)} style={[styles.button, styles.cancel]}>
                <Text style={styles.cancelText}>취소</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (picking && saved) save(fromWheel(picking), true);
                  setPicking(null);
                }}
                style={[styles.button, styles.confirm]}
              >
                <Text style={styles.confirmText}>저장</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  title: { fontSize: fontSize.cardTitle, fontWeight: weight.bold, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12 },
  texts: { flex: 1, gap: 2 },
  label: { fontSize: fontSize.reason, fontWeight: weight.bold, color: colors.text },
  sub: { fontSize: fontSize.caption, color: colors.textMuted },
  timeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  timeText: { fontSize: fontSize.small, fontWeight: weight.bold, color: colors.text },
  ok: { fontSize: fontSize.small, color: colors.text },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: 'rgba(59, 61, 52, 0.4)' },
  picker: { width: '100%', maxWidth: 320, gap: 12, padding: 20, borderRadius: radius.card, backgroundColor: colors.background },
  buttons: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.inner },
  cancel: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  confirm: { backgroundColor: colors.brown },
  cancelText: { fontSize: fontSize.small, fontWeight: weight.bold, color: colors.text },
  confirmText: { fontSize: fontSize.small, fontWeight: weight.bold, color: colors.textOnBrown },
});
