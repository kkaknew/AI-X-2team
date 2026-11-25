import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, ConfirmDialog, ErrorMessage, fontSize, Loading, radius, weight } from './ui';

export interface DevTools {
  /** 지난 2주치 체험 기록을 넣고 나무를 다 자란 상태로 */
  seed: () => Promise<void>;
  /** 기록·나무·일기·독후감을 모두 지우고 새 씨앗만 */
  reset: () => Promise<void>;
  /** 지금 나무의 물을 이 값으로 맞춘다 (단계도 따라 바뀐다) */
  setWater: (amount: number) => Promise<void>;
  /** 지금 나무를 바로 시든 상태로 */
  wilt: () => Promise<void>;
}

/** 빠른 선택: 각 성장 단계가 시작하는 물 (씨앗 0 · 새싹 10 · 묘목 30 · 어린 나무 60 · 나무 100) */
const WATER_PRESETS = [0, 10, 30, 60, 100];

/**
 * 개발용 (Expo로 개발할 때만 보인다, 배포 앱에는 없다)
 * 화면 확인을 위해 이 폰의 기록을 체험용으로 채우거나 모두 지운다.
 */
export default function DevToolsCard({ tools }: { tools: DevTools }) {
  const [confirm, setConfirm] = useState<'seed' | 'reset' | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waterText, setWaterText] = useState('');

  const applyWilt = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await tools.wilt();
      setMessage('지금 나무를 시든 상태로 만들었어요. 나의 나무로 돌아가 보세요. 물을 주면 다시 살아나요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '실패했어요');
    } finally {
      setBusy(false);
    }
  };

  const applyWater = async (amount: number) => {
    if (!Number.isFinite(amount) || amount < 0) {
      setError('0 이상의 숫자를 넣어 주세요');
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await tools.setWater(amount);
      setMessage(`지금 나무의 물을 ${Math.floor(amount)}(으)로 맞췄어요. 나의 나무로 돌아가 보세요.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '실패했어요');
    } finally {
      setBusy(false);
    }
  };

  const run = async (kind: 'seed' | 'reset') => {
    setConfirm(null);
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await (kind === 'seed' ? tools.seed() : tools.reset());
      setMessage(kind === 'seed' ? '체험용 기록을 넣었어요. 나의 나무로 돌아가 보세요.' : '모든 기록을 지웠어요. 새 씨앗부터 시작해요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '실패했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>개발용 · 체험 데이터</Text>
      <Text style={styles.hint}>개발 중에만 보여요. 이 폰에 저장된 기록이 바뀌어요.</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => setConfirm('seed')}
          style={[styles.button, styles.primary]}
        >
          <Text style={styles.primaryText}>체험용 기록 넣기</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => setConfirm('reset')}
          style={[styles.button, styles.secondary]}
        >
          <Text style={styles.secondaryText}>기록 모두 지우기</Text>
        </Pressable>
      </View>

      <Text style={styles.subtitle}>지금 나무의 물 정하기</Text>
      <View style={styles.row}>
        {WATER_PRESETS.map((w) => (
          <Pressable
            key={w}
            accessibilityRole="button"
            accessibilityLabel={`물 ${w}로 맞추기`}
            disabled={busy}
            onPress={() => void applyWater(w)}
            style={[styles.button, styles.secondary]}
          >
            <Text style={styles.chipText}>{w}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <TextInput
          value={waterText}
          onChangeText={(t) => setWaterText(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="직접 입력 (예: 45)"
          placeholderTextColor={colors.textSubtle}
          maxLength={5}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy || waterText === ''}
          onPress={() => void applyWater(Number(waterText))}
          style={[styles.button, styles.primary, waterText === '' && styles.dim]}
        >
          <Text style={styles.primaryText}>이 값으로</Text>
        </Pressable>
      </View>

      <Text style={styles.subtitle}>시듦 확인</Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void applyWilt()}
        style={[styles.button, styles.secondary]}
      >
        <Text style={styles.secondaryText}>지금 나무 바로 시들게 하기</Text>
      </Pressable>

      {busy && <Loading size="screen" />}
      {message && <Text style={styles.message}>{message}</Text>}
      {error && <ErrorMessage message={error} />}

      <ConfirmDialog
        open={confirm === 'seed'}
        title="체험용 기록을 넣을까요?"
        message="지난 2주치 산책·명상·일기·독후감·수면 기록이 더해지고, 나무가 다 자란 상태가 돼요."
        cancelLabel="취소"
        confirmLabel="넣을게요"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run('seed')}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        title="기록을 모두 지울까요?"
        message="활동 기록, 나무, 일기, 독후감이 모두 지워지고 되돌릴 수 없어요. 알림 설정은 남아요."
        cancelLabel="취소"
        confirmLabel="지울게요"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run('reset')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    margin: 16,
    marginBottom: 0,
    padding: 14,
    borderRadius: radius.inner,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textSubtle,
  },
  title: { fontSize: fontSize.small, fontWeight: weight.bold, color: colors.text },
  hint: { fontSize: fontSize.caption, color: colors.textMuted },
  row: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.inner },
  primary: { backgroundColor: colors.brown },
  primaryText: { fontSize: fontSize.small, fontWeight: weight.bold, color: colors.textOnBrown },
  secondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  secondaryText: { fontSize: fontSize.small, fontWeight: weight.bold, color: colors.danger },
  message: { fontSize: fontSize.small, color: colors.text },
  subtitle: { marginTop: 6, fontSize: fontSize.small, fontWeight: weight.bold, color: colors.text },
  chipText: { fontSize: fontSize.small, fontWeight: weight.bold, color: colors.text },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.inner,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: fontSize.small,
    color: colors.text,
  },
  dim: { opacity: 0.5 },
});
