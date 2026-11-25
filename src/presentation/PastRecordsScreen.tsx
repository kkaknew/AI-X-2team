import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ActivityLog, ActivityRecorder, WritingEntry } from '../logic/ActivityRecorder';
import type { CompletedTree, WateringEngine } from '../logic/WateringEngine';
import { dotDate, hoursText } from './activityView';
import { colors, fontSize, Loading, radius, weight } from './ui';

export interface PastRecordsScreenProps {
  recorder: ActivityRecorder | null;
  engine: WateringEngine | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** "11/16 23:00" (휴대폰 시간대) */
const dateTime = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * 표현 계층: 내 기록 › 지난 기록. 완성한 나무(#16), 지난 일기·독후감(#32), 최근 수면(#13)
 * 예전 활동 기록 화면 아래에 있던 목록을 활동 화면이 시안대로 나뉘면서 이리로 옮겼다.
 * 시안에서는 열매 팝업(일기 달력, 독서 책 목록, 수면 달력)과 내 기록의 나의 나무로 바뀔 예정이다.
 * 일기·독후감 본문은 기기 안 개인 기록 DB에서만 읽어 보여준다.
 */
export default function PastRecordsScreen({ recorder, engine }: PastRecordsScreenProps) {
  if (!recorder) {
    return (
      <View style={styles.center}>
        <Loading />
      </View>
    );
  }
  // 내 기록 화면(스크롤) 안에 들어가므로 스스로 스크롤하지 않는다
  return (
    <View style={styles.container}>
      <CompletedTrees engine={engine} />
      <Writings recorder={recorder} type="diary" />
      <Writings recorder={recorder} type="reading" />
      <Sleeps recorder={recorder} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function CompletedTrees({ engine }: { engine: WateringEngine | null }) {
  const [trees, setTrees] = useState<CompletedTree[] | null>(null);

  useEffect(() => {
    if (!engine) return;
    let active = true;
    const load = () => {
      engine
        .completedTrees()
        .then((list) => active && setTrees(list))
        .catch((e) => console.error('[PastRecords] 완성한 나무를 읽지 못했습니다', e));
    };
    load();
    const unsubscribe = engine.subscribe(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [engine]);

  if (!trees) return null;
  return (
    <Section title={`완성한 나무 ${trees.length}그루`}>
      {trees.length === 0 ? (
        <Text style={styles.empty}>나무가 다 자라면 여기에 기록돼요</Text>
      ) : (
        trees.slice(0, 10).map((t, i) => (
          <Text key={t.id} style={styles.item}>
            나무 {trees.length - i} · {dotDate(new Date(t.plantedAt))} ~ {dotDate(new Date(t.completedAt))}
          </Text>
        ))
      )}
    </Section>
  );
}

function Writings({ recorder, type }: { recorder: ActivityRecorder; type: 'diary' | 'reading' }) {
  const [entries, setEntries] = useState<WritingEntry[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const noun = type === 'diary' ? '일기' : '독후감';

  useEffect(() => {
    recorder
      .recentWritings(type, 20)
      .then(setEntries)
      .catch((e) => console.error('[PastRecords] 지난 기록을 읽지 못했습니다', e));
  }, [recorder, type]);

  return (
    <Section title={`지난 ${noun}${entries.length > 0 ? ` (${entries.length}편)` : ''}`}>
      {entries.length === 0 && <Text style={styles.empty}>아직 쓴 {noun}이 없어요</Text>}
      {entries.map((e) => {
        const open = openId === e.id;
        return (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpenId(open ? null : e.id)}
            style={styles.entry}
          >
            <Text style={styles.meta}>
              {dateTime(new Date(e.writtenAt))} · {e.charCount}자{open ? '' : '  ▾'}
            </Text>
            {e.title !== '' && <Text style={styles.entryTitle}>《{e.title}》</Text>}
            <Text style={styles.entryBody} numberOfLines={open ? undefined : 2}>
              {e.body}
            </Text>
          </Pressable>
        );
      })}
    </Section>
  );
}

function Sleeps({ recorder }: { recorder: ActivityRecorder }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    recorder
      .recentSleeps(7)
      .then(setLogs)
      .catch((e) => console.error('[PastRecords] 최근 수면 기록을 읽지 못했습니다', e));
  }, [recorder]);

  return (
    <Section title="최근 수면">
      {logs.length === 0 && <Text style={styles.empty}>아직 수면 기록이 없어요</Text>}
      {logs.map((log) => (
        <Text key={log.id} style={styles.item}>
          {log.verified ? '💧' : '–'} {dateTime(new Date(log.startedAt))}
          {log.endedAt ? ` ~ ${dateTime(new Date(log.endedAt))}` : ''}
          {log.durationMin !== null ? ` · ${hoursText(log.durationMin)}` : ''}
        </Text>
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { gap: 12 },
  section: {
    gap: 8,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sectionTitle: { fontSize: fontSize.emphasis, fontWeight: weight.bold, color: colors.text },
  empty: { fontSize: fontSize.small, color: colors.textMuted },
  item: { fontSize: fontSize.body, color: colors.text },
  entry: { gap: 4, padding: 12, borderRadius: radius.inner, backgroundColor: colors.surfaceMuted },
  meta: { fontSize: fontSize.caption, color: colors.textMuted },
  entryTitle: { fontSize: fontSize.body, fontWeight: weight.bold, color: colors.text },
  entryBody: { fontSize: fontSize.body, lineHeight: 20, color: colors.text },
});
