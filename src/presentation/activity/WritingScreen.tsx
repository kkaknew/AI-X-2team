import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { countChars, type ActivityRecorder } from '../../logic/ActivityRecorder';
import { dotDate, resultView, writingCounter, type ResultView } from '../activityView';
import { ConfirmDialog, Loading } from '../ui';
import { colors, fontSize, radius, weight } from '../ui/theme';
import { ActivityError, ActivityFrame, FooterButton, ResultBlock } from './ActivityFrame';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : '알 수 없는 오류가 났어요');

const COPY = {
  diary: {
    title: '일기 쓰기',
    subtitle: '오늘의 감정을 기록해 보세요',
    placeholder: '오늘 하루는 어땠나요?',
  },
  reading: {
    title: '독서 기록',
    subtitle: '오늘 읽은 책을 기록해 보세요',
    placeholder: '읽으면서 느낀 점을 적어보세요',
  },
} as const;

/**
 * 일기 쓰기·독서 기록 화면 (시안 "일기 쓰기", "일기 쓰기 (글자 수)", "일기 저장 (하루 한 번 안내)",
 * "독서 기록", "독서 기록 (글자 수)", "독서 기록 (200자 달성)")
 * 본문은 ActivityRecorder가 기기 안 개인 기록 DB에만 저장하고, 판정에는 글자 수만 쓴다. (#10, #12)
 * 저장하지 않은 글이 있으면 닫을 때 "저장하지 않은 내용이 있어요" 창을 띄운다.
 */
export default function WritingScreen({
  type,
  recorder,
  onClose,
}: {
  type: 'diary' | 'reading';
  recorder: ActivityRecorder;
  onClose: () => void;
}) {
  const copy = COPY[type];
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [goal, setGoal] = useState(0);
  const [result, setResult] = useState<ResultView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'unsaved' | 'recorded' | null>(null);
  const [recorded, setRecorded] = useState(false);

  // 인증 기준 글자 수 (독후감 200자). 기준은 판정기의 rule에 있다
  useEffect(() => {
    recorder
      .writingGoal(type)
      .then(setGoal)
      .catch(() => setGoal(0));
  }, [recorder, type]);

  const count = countChars(body);
  const counter = writingCounter(count, goal);

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const r = type === 'diary' ? await recorder.recordDiary(body) : await recorder.recordReading(title, body);
      setResult(resultView(type, r));
      if (r.entryId !== null) setDirty(false);
      if (r.verified || r.entryId !== null) setRecorded(true);
      return r.entryId !== null;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const requestClose = useCallback(() => {
    if (dirty && count > 0) setDialog('unsaved');
    else if (recorded) setDialog('recorded');
    else onClose();
  }, [dirty, count, recorded, onClose]);

  const saveAndClose = async () => {
    setDialog(null);
    if (await save()) onClose();
  };

  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setDirty(true);
    setResult(null);
  };

  return (
    <ActivityFrame
      title={copy.title}
      subtitle={copy.subtitle}
      onRequestClose={requestClose}
      footer={
        <FooterButton label="저장" onPress={() => void save()} disabled={saving || !dirty}>
          {saving ? <Loading size="button" /> : undefined}
        </FooterButton>
      }
    >
      {type === 'diary' ? (
        <View style={styles.box}>
          <Text style={styles.date}>{dotDate(new Date())}</Text>
        </View>
      ) : (
        <View style={styles.box}>
          <Text style={styles.label}>책 제목</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={edit(setTitle)}
            placeholder="책 제목을 입력하세요"
            placeholderTextColor={colors.textSubtle}
            maxLength={100}
          />
        </View>
      )}

      <View style={[styles.box, styles.bodyBox]}>
        {type === 'reading' && <Text style={styles.label}>읽으면서 느낀 점</Text>}
        <TextInput
          style={styles.body}
          multiline
          value={body}
          onChangeText={edit(setBody)}
          placeholder={copy.placeholder}
          placeholderTextColor={colors.textSubtle}
          textAlignVertical="top"
        />
        <View style={styles.counterRow}>
          {counter.hint && <Text style={styles.counterHint}>{counter.hint}</Text>}
          <Text style={styles.counter}>{counter.text}</Text>
        </View>
      </View>

      {error && <ActivityError message={error} />}
      {result && <ResultBlock view={result} />}

      <ConfirmDialog
        open={dialog === 'unsaved'}
        title="저장하지 않은 내용이 있어요"
        message="변경 사항을 저장하고 종료할까요?"
        confirmLabel="저장하고 종료"
        onCancel={() => setDialog(null)}
        onConfirm={() => void saveAndClose()}
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
  box: {
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  bodyBox: { minHeight: 380 },
  date: { fontSize: fontSize.emphasis, fontWeight: weight.medium, color: colors.text },
  label: { fontSize: fontSize.small, color: colors.textMuted },
  titleInput: { fontSize: fontSize.cardTitle, fontWeight: weight.bold, color: colors.text, padding: 0 },
  body: {
    flex: 1,
    minHeight: 300,
    padding: 0,
    fontSize: fontSize.reason,
    lineHeight: 24,
    color: colors.text,
  },
  counterRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  counterHint: { fontSize: fontSize.small, color: colors.textMuted },
  counter: { fontSize: fontSize.body, fontWeight: weight.bold, color: colors.textSubtle },
});
