import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {
  parseReminderTime,
  REMINDER_BODY,
  REMINDER_TITLE,
  type ReminderService,
  type ReminderSetting,
} from '../logic/ReminderService';

/**
 * 표현 계층: 물주기 리마인더 설정. (#15 [13] 물주기 리마인더)
 * 매일 알림 받을 시각을 정하고 켜고 끈다. 저장·예약은 ReminderService가 한다.
 */

export interface ReminderScreenProps {
  /** DB를 여는 동안은 null */
  reminders: ReminderService | null;
}

const GREEN = '#2f7d4f';

export default function ReminderScreen({ reminders }: ReminderScreenProps) {
  if (!reminders) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={GREEN} />
      </View>
    );
  }
  return <ReminderForm reminders={reminders} />;
}

function ReminderForm({ reminders }: { reminders: ReminderService }) {
  /** 저장된 설정 (null이면 읽는 중) */
  const [saved, setSaved] = useState<ReminderSetting | null>(null);
  const [time, setTime] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    reminders
      .getSetting()
      .then((s) => {
        setSaved(s);
        setTime(s.time);
        setEnabled(s.enabled);
      })
      .catch((e) => {
        console.error('[ReminderScreen] 알림 설정을 읽지 못했습니다', e);
        setMessage({ ok: false, text: '알림 설정을 읽지 못했어요' });
      });
  }, [reminders]);

  const save = (nextTime: string, nextEnabled: boolean) => {
    setBusy(true);
    setMessage(null);
    reminders
      .update(nextTime, nextEnabled)
      .then((s) => {
        setSaved(s);
        setTime(s.time);
        setEnabled(s.enabled);
        setMessage({
          ok: true,
          text: s.enabled ? `매일 ${s.time}에 알려드릴게요` : '물주기 알림을 껐어요',
        });
      })
      .catch((e) => {
        // 실패하면 스위치를 저장된 상태로 되돌린다
        if (saved) setEnabled(saved.enabled);
        setMessage({ ok: false, text: e instanceof Error ? e.message : '저장하지 못했어요' });
      })
      .finally(() => setBusy(false));
  };

  if (!saved) {
    return (
      <View style={styles.center}>
        {message ? <Text style={styles.error}>{message.text}</Text> : <ActivityIndicator color={GREEN} />}
      </View>
    );
  }

  const valid = parseReminderTime(time) !== null;
  const changed = time !== saved.time || enabled !== saved.enabled;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>물주기 알림</Text>
      <Text style={styles.hint}>정한 시각에 매일 알림이 와요. 알림은 휴대폰 안에서만 예약돼요.</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>알림 받기</Text>
          <Switch
            value={enabled}
            disabled={busy}
            onValueChange={(v) => {
              setEnabled(v);
              // 켜고 끄기는 바로 저장한다 (시각이 맞을 때만)
              if (valid) save(time, v);
            }}
            trackColor={{ true: '#9fd0b0', false: '#cccccc' }}
            thumbColor={enabled ? GREEN : '#f4f4f4'}
            accessibilityLabel="물주기 알림 받기"
          />
        </View>

        <View style={[styles.row, styles.rowTop]}>
          <Text style={styles.label}>알림 시각</Text>
          <TextInput
            style={[styles.input, !valid && styles.inputInvalid]}
            value={time}
            onChangeText={setTime}
            placeholder="21:00"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            editable={!busy}
            accessibilityLabel="알림 시각, 시:분"
          />
        </View>
        {!valid && <Text style={styles.error}>시각을 21:00처럼 "시:분" 형식으로 입력해 주세요</Text>}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || !valid || !changed }}
          disabled={busy || !valid || !changed}
          onPress={() => save(time, enabled)}
          style={[styles.button, (busy || !valid || !changed) && styles.dim]}
        >
          <Text style={styles.buttonLabel}>저장</Text>
        </Pressable>
      </View>

      {busy && <ActivityIndicator style={styles.spinner} color={GREEN} />}
      {message && (
        <Text accessibilityLiveRegion="polite" style={message.ok ? styles.ok : styles.error}>
          {message.text}
        </Text>
      )}

      <View style={styles.preview}>
        <Text style={styles.previewLabel}>이런 알림이 와요</Text>
        <Text style={styles.previewTitle}>{REMINDER_TITLE}</Text>
        <Text style={styles.previewBody}>{REMINDER_BODY}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: '700', color: '#1d1d1d' },
  hint: { marginTop: 6, marginBottom: 16, fontSize: 14, lineHeight: 20, color: '#555555' },
  card: { borderRadius: 14, backgroundColor: '#f6f6f6', padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTop: { marginTop: 16 },
  label: { fontSize: 16, color: '#1d1d1d' },
  input: {
    width: 110,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dddddd',
    backgroundColor: '#ffffff',
    padding: 10,
    fontSize: 18,
    textAlign: 'center',
  },
  inputInvalid: { borderColor: '#b3261e' },
  button: {
    marginTop: 16,
    borderRadius: 10,
    backgroundColor: GREEN,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonLabel: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  dim: { opacity: 0.4 },
  spinner: { marginTop: 16 },
  ok: { marginTop: 16, fontSize: 14, color: GREEN },
  error: { marginTop: 8, fontSize: 14, color: '#b3261e' },
  preview: {
    marginTop: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dddddd',
    padding: 14,
  },
  previewLabel: { fontSize: 12, color: '#777777', marginBottom: 6 },
  previewTitle: { fontSize: 15, fontWeight: '600', color: '#1d1d1d' },
  previewBody: { marginTop: 2, fontSize: 14, color: '#555555' },
});
