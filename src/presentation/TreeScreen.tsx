import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import type { ActivityCode, ActivityRecorder } from '../logic/ActivityRecorder';
import type { StatsService } from '../logic/StatsService';
import type { CompletedTree, TreeProgress, WateringEngine } from '../logic/WateringEngine';
import FruitPopup from './FruitPopup';
import { FRUIT_TREE_H, FRUIT_TREE_W, FruitTree } from './FruitTree';
import { ACTIVITY_MENU, toMainView, type MainView } from './mainView';
import { pastTreeView, wiltPrompt } from './treeHistoryView';
import {
  activitySvg,
  chevronLeftSvg,
  chevronRightSvg,
  colors,
  ConfirmDialog,
  dropSvg,
  ErrorMessage,
  fontSize,
  Loading,
  radius,
  SvgIcon,
  TREE_ART_SIZE,
  treeArtFor,
  TreeIllustration,
  userSvg,
  weight,
} from './ui';

export interface TreeScreenProps {
  /** DB를 여는 동안은 null */
  engine: WateringEngine | null;
  /** 오늘 인증 수, 이 나무의 열매를 읽는다. DB를 여는 동안은 null */
  stats: StatsService | null;
  /** 열매 팝업의 일기·독후감 (기기 안 개인 기록). DB를 여는 동안은 null */
  recorder: ActivityRecorder | null;
  /** 활동 기록하러 가기. 활동을 고르고 왔으면 그 활동으로 연다 */
  onOpenActivity: (activity?: ActivityCode) => void;
  /** 프로필 버튼: 내 기록(기록 조회·알림 설정) */
  onOpenRecords: () => void;
  /** 다 자란 나무의 [새 씨앗 심기]: 나무 완성 화면으로 */
  onOpenComplete: () => void;
  /** 지금 보고 있는 지난 나무 id. null이면 지금 나무 */
  viewTreeId: number | null;
  /** ◀ ▶ 로 나무를 넘기거나 "지금 나무로 돌아가기" (null) */
  onViewTree: (treeId: number | null) => void;
  /** 시들 때까지 남은 시간(ms, WiltingChecker). 모르면 null. 시듦 안내 창에 쓴다 */
  wiltRemainingMs: number | null;
}

/** 시듦 안내 창은 앱을 켤 때마다 한 번만 */
let wiltPromptShown = false;

/**
 * 표현 계층: 메인 화면 "나의 나무". (#9 나무 화면을 Figma 시안대로)
 * - 상태 카드 + 물방울 게이지, 나무 그림(단계·시듦), 열매(누르면 열매 팝업), 오늘의 활동 카드, 활동 보기 창
 * - 상태별 글자는 mainView.ts가 정한다. 물을 받으면 바로 다시 그린다.
 * - 다 자라면 아래 버튼이 [새 씨앗 심기]가 되고, 누르면 나무 완성 화면으로 간다. (#16)
 * - ◀ ▶ 로 다 키운 지난 나무를 다시 본다 (시안 "메인화면 지난 나무").
 * - 시들었거나 하루 안에 시들면 안내 창을 띄운다 (시안 "시든 나무 안내", "시들기 전 경고").
 */
export default function TreeScreen({
  engine,
  stats,
  recorder,
  onOpenActivity,
  onOpenRecords,
  onOpenComplete,
  viewTreeId,
  onViewTree,
  wiltRemainingMs,
}: TreeScreenProps) {
  const [progress, setProgress] = useState<TreeProgress | null>(null);
  const [currentView, setCurrentView] = useState<MainView | null>(null);
  const [completed, setCompleted] = useState<CompletedTree[]>([]);
  /** 다 키운 나무별 열매 (◀ 누르기 전에 미리 읽어 둔다) */
  const [pastFruits, setPastFruits] = useState<Record<number, ActivityCode[]>>({});
  const [todayTypes, setTodayTypes] = useState<ActivityCode[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fruit, setFruit] = useState<ActivityCode | null>(null);
  const [prompt, setPrompt] = useState<'wilted' | 'warn' | null>(null);

  const load = useCallback(async () => {
    if (!engine || !stats) return;
    const p = await engine.getProgress();
    if (!p) {
      setState('empty');
      return;
    }
    const [done, today, doneTypes] = await Promise.all([
      engine.completedTrees(),
      stats.today(),
      stats.verifiedTypesSince(p.plantedAt),
    ]);
    setProgress(p);
    setCompleted(done);
    setTodayTypes(ACTIVITY_MENU.map((a) => a.code).filter((code) => today.byType[code] > 0));
    setCurrentView(
      toMainView(p, {
        todayCount: today.count,
        doneTypes,
        completedCount: done.length,
        now: new Date(),
      }),
    );
    setState('ready');
  }, [engine, stats]);

  // 나무 순서: 오래된 다 키운 나무 → … → 지금 나무 (◀ ▶)
  const order = progress ? [...completed.map((t) => t.id).reverse(), progress.treeId] : [];
  const pastTree = viewTreeId !== null ? completed.find((t) => t.id === viewTreeId) ?? null : null;
  const position = pastTree ? order.indexOf(pastTree.id) : order.length - 1;

  // 다 키운 나무들의 열매를 미리 읽어 둔다. ◀를 눌렀을 때 로딩 화면 없이 바로 넘어가게
  useEffect(() => {
    if (!stats || completed.length === 0) return;
    let active = true;
    Promise.all(
      completed.map((t) =>
        stats
          .treeSummary(t.id)
          .then((s) => [t.id, s.fruits] as const)
          .catch(() => [t.id, [] as ActivityCode[]] as const),
      ),
    ).then((entries) => {
      if (active) setPastFruits(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [completed, stats]);

  // 시듦 안내 (앱을 켤 때 한 번)
  useEffect(() => {
    if (!progress || wiltPromptShown) return;
    const next = wiltPrompt(progress.status, wiltRemainingMs);
    if (next) {
      wiltPromptShown = true;
      setPrompt(next);
    }
  }, [progress, wiltRemainingMs]);

  useEffect(() => {
    if (!engine) return;
    let active = true;
    load().catch((e) => {
      console.error('[TreeScreen] 나무 상태를 읽지 못했습니다', e);
      if (active) setState('error');
    });
    // 물을 받거나 시들어 상태가 바뀌면 다시 그린다
    const unsubscribe = engine.subscribe(() => {
      load().catch((e) => console.error('[TreeScreen] 다시 읽지 못했습니다', e));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [engine, load]);

  const openActivity = (activity?: ActivityCode) => {
    setSheetOpen(false);
    onOpenActivity(activity);
  };

  const view = pastTree ? pastTreeView(pastTree, position + 1, pastFruits[pastTree.id] ?? []) : currentView;

  if (state !== 'ready' || !view || !progress) {
    return (
      <View style={styles.center}>
        {state === 'loading' && <Loading message="나무를 불러오는 중이에요" />}
        {state === 'empty' && <Text style={styles.muted}>키우고 있는 나무가 없어요</Text>}
        {state === 'error' && <ErrorMessage message="나무를 불러오지 못했어요" variant="card" />}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Header onOpenRecords={onOpenRecords} />
        <StatusCard view={view} />
        <TreeArea
          progress={progress}
          view={view}
          past={pastTree !== null}
          onOpenFruit={pastTree ? undefined : setFruit}
          canPrev={position > 0}
          canNext={position < order.length - 1}
          onPrev={() => onViewTree(order[position - 1])}
          onNext={() => {
            const next = order[position + 1];
            onViewTree(next === progress.treeId ? null : next);
          }}
        />

        {pastTree ? (
          <View style={styles.pastBar}>
            <Text style={styles.pastTitle}>지난 나무를 보고 있어요</Text>
            <Text style={styles.pastDesc}>활동 기록은 지금 키우는 나무에 쌓여요</Text>
            <Pressable accessibilityRole="button" onPress={() => onViewTree(null)} style={styles.primary}>
              <Text style={styles.primaryLabel}>→ 지금 나무로 돌아가기</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TodayCard todayTypes={todayTypes} onPick={openActivity} />
            <View style={styles.primaryRow}>
              {view.primaryAction === 'plant' ? (
                <Pressable accessibilityRole="button" onPress={onOpenComplete} style={styles.primary}>
                  <Text style={styles.primaryLabel}>🌱 새 씨앗 심기</Text>
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setSheetOpen(true)} style={styles.primary}>
                  <SvgIcon xml={activitySvg} width={18} height={18} />
                  <Text style={styles.primaryLabel}>활동 보기</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <ActivitySheet open={sheetOpen} onClose={() => setSheetOpen(false)} onPick={openActivity} />
      <ConfirmDialog
        open={prompt === 'wilted'}
        title="나무가 시들었어요"
        message="3일 동안 기록이 없었어요. 오늘 활동을 하나 기록하면 나무가 다시 살아나요."
        cancelLabel="닫기"
        confirmLabel="활동 하러 가기"
        onCancel={() => setPrompt(null)}
        onConfirm={() => {
          setPrompt(null);
          setSheetOpen(true);
        }}
      />
      <ConfirmDialog
        open={prompt === 'warn'}
        title="내일이면 나무가 시들어요"
        message="오늘 활동을 하나만 기록해 주세요. 물을 주면 나무가 시들지 않아요."
        cancelLabel="나중에"
        confirmLabel="지금 기록하기"
        onCancel={() => setPrompt(null)}
        onConfirm={() => {
          setPrompt(null);
          setSheetOpen(true);
        }}
      />
      <FruitPopup
        type={fruit}
        onClose={() => setFruit(null)}
        recorder={recorder}
        stats={stats}
        plantedAt={progress.plantedAt}
      />
    </View>
  );
}

function Header({ onOpenRecords }: { onOpenRecords: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.titleGroup}>
        <Text style={styles.title}>나의 나무</Text>
        <Text style={styles.subtitle}>오늘도 한 걸음씩 자라요</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="내 기록"
        onPress={onOpenRecords}
        style={styles.profile}
      >
        <SvgIcon xml={userSvg} width={20} height={20} />
      </Pressable>
    </View>
  );
}

function StatusCard({ view }: { view: MainView }) {
  const { status, gauge } = view;
  return (
    <View style={styles.card}>
      <View style={styles.statusRow}>
        <View style={styles.statusTexts}>
          <Text style={[styles.statusCaption, status.tone === 'danger' && styles.dangerText]}>
            {status.caption}
          </Text>
          <Text style={styles.statusTitle}>{status.title}</Text>
        </View>
        <View
          style={[
            styles.chip,
            status.tone === 'danger' && styles.chipDanger,
            status.tone === 'done' && styles.chipDone,
          ]}
        >
          <Text
            style={[
              styles.chipText,
              status.tone === 'danger' && styles.dangerText,
              status.tone === 'done' && styles.waterText,
            ]}
          >
            {status.chip}
          </Text>
        </View>
      </View>

      <View style={[styles.gauge, gauge.tone === 'danger' && styles.gaugeDanger]}>
        <View style={styles.gaugeLeft}>
          <SvgIcon xml={dropSvg} width={28} height={40} />
          <View>
            <Text style={styles.gaugeCaption}>{gauge.caption}</Text>
            <Text style={styles.gaugeTitle}>{gauge.title}</Text>
          </View>
        </View>
        <View style={[styles.percentChip, gauge.tone === 'danger' && styles.chipDanger]}>
          <Text style={[styles.percentText, gauge.tone === 'danger' && styles.dangerText]}>
            {gauge.percent}%
          </Text>
        </View>
      </View>
    </View>
  );
}

const ART_W = FRUIT_TREE_W;
const ART_H = FRUIT_TREE_H;

function TreeArea({
  progress,
  view,
  past,
  onOpenFruit,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  progress: TreeProgress;
  view: MainView;
  /** 지난 나무를 보는 중이면 그 나무는 다 자란 그림 */
  past: boolean;
  /** 없으면 열매를 눌러도 아무 일도 없다 (지난 나무) */
  onOpenFruit?: (code: ActivityCode) => void;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(screenWidth - 40, 420);
  const k = width / ART_W;
  const height = ART_H * k;
  const full = past || (view.showFruits && progress.status !== 'wilted');

  return (
    <View style={[styles.treeArea, { height }]}>
      {full ? (
        // 다 자란 나무: 시안 열매 자리에 열매. 이 나무에서 기록한 활동의 열매만 단다
        <FruitTree width={width} earned={view.fruits} onPressFruit={onOpenFruit} />
      ) : (
        <View style={styles.treeBottom}>
          <TreeIllustration
            stageNumber={progress.stageNumber}
            status={progress.status}
            // 그림마다 시안 크기가 달라서(단계 320, 시든 나무 372) 같은 비율로 줄인다
            width={TREE_ART_SIZE[treeArtFor(progress.stageNumber, progress.status)].width * k}
          />
        </View>
      )}

      {/* 지난 나무 넘기기 (시안 "나무 전환") */}
      {(canPrev || canNext) && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이전 나무"
            disabled={!canPrev}
            onPress={onPrev}
            style={[styles.arrow, styles.arrowLeft, { top: height / 2 - 19 }, !canPrev && styles.arrowOff]}
          >
            <SvgIcon xml={chevronLeftSvg} width={18} height={18} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="다음 나무"
            disabled={!canNext}
            onPress={onNext}
            style={[styles.arrow, styles.arrowRight, { top: height / 2 - 19 }, !canNext && styles.arrowOff]}
          >
            <SvgIcon xml={chevronRightSvg} width={18} height={18} />
          </Pressable>
        </>
      )}

      <View style={styles.treeChip}>
        <Text style={styles.treeChipText}>{view.treeLabel}</Text>
      </View>
    </View>
  );
}

function TodayCard({
  todayTypes,
  onPick,
}: {
  todayTypes: ActivityCode[];
  onPick: (activity: ActivityCode) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.todayHeader}>
        <Text style={styles.todayTitle}>오늘의 활동</Text>
        <Text style={styles.todayHint}>매일 한 걸음</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.todayRow}>
        {ACTIVITY_MENU.map((a) => {
          const done = todayTypes.includes(a.code);
          return (
            <Pressable
              key={a.code}
              accessibilityRole="button"
              accessibilityLabel={`${a.label} 기록하기${done ? ', 오늘 함' : ''}`}
              onPress={() => onPick(a.code)}
              style={[styles.todayButton, done && styles.todayButtonDone]}
            >
              <Text style={styles.todayLabel}>{a.label}</Text>
              <Text style={styles.todayAction}>기록하기</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ActivitySheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (activity: ActivityCode) => void;
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="활동 메뉴 닫기" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <View style={styles.statusTexts}>
            <Text style={styles.sheetTitle}>어떤 활동을 해볼까요?</Text>
            <Text style={styles.subtitle}>작은 실천을 나무의 성장으로 남겨요</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
            <Text style={styles.sheetClose}>닫기</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.sheetGrid}>
          {ACTIVITY_MENU.map((a) => (
            <Pressable
              key={a.code}
              accessibilityRole="button"
              onPress={() => onPick(a.code)}
              style={styles.sheetItem}
            >
              <Text style={styles.sheetItemTitle}>{a.label}</Text>
              <Text style={styles.sheetItemDesc}>{a.description}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.background,
  },
  container: { paddingTop: 24, paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  muted: { fontSize: fontSize.body, color: colors.textMuted },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleGroup: { gap: 4 },
  title: { fontSize: fontSize.title, fontWeight: weight.bold, color: colors.text },
  subtitle: { fontSize: fontSize.body, fontWeight: weight.regular, color: colors.textMuted },
  profile: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },

  card: {
    gap: 8,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  statusTexts: { flex: 1, gap: 4 },
  statusCaption: { fontSize: fontSize.small, fontWeight: weight.medium, color: colors.textMuted },
  statusTitle: { fontSize: fontSize.headline, fontWeight: weight.bold, color: colors.text },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipDanger: { backgroundColor: colors.dangerBackground },
  chipDone: { backgroundColor: colors.waterBackground },
  chipText: { fontSize: fontSize.caption, fontWeight: weight.bold, color: colors.textSubtle },
  dangerText: { color: colors.danger },
  waterText: { color: colors.water },

  gauge: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.inner,
    backgroundColor: colors.surfaceMuted,
  },
  gaugeDanger: { backgroundColor: colors.dangerBackground },
  gaugeLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gaugeCaption: { fontSize: fontSize.caption, fontWeight: weight.medium, color: colors.textMuted },
  gaugeTitle: { fontSize: fontSize.cardTitle, fontWeight: weight.bold, color: colors.text },
  percentChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.waterBackground,
  },
  percentText: { fontSize: fontSize.small, fontWeight: weight.bold, color: colors.water },

  treeArea: {
    overflow: 'hidden',
    borderRadius: radius.illustration,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  treeBottom: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  treeChip: {
    position: 'absolute',
    left: 14,
    top: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  treeChipText: { fontSize: fontSize.caption, fontWeight: weight.bold, color: colors.brownDark },
  arrow: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  arrowLeft: { left: 10 },
  arrowRight: { right: 10 },
  arrowOff: { opacity: 0.3 },
  pastBar: { alignItems: 'center', gap: 6, paddingTop: 6 },
  pastTitle: { fontSize: fontSize.reason, fontWeight: weight.bold, color: colors.text },
  pastDesc: { fontSize: fontSize.small, color: colors.textMuted, marginBottom: 6 },

  todayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  todayTitle: { fontSize: fontSize.emphasis, fontWeight: weight.bold, color: colors.text },
  todayHint: { fontSize: fontSize.small, fontWeight: weight.medium, color: colors.textSubtle },
  todayRow: { gap: 8 },
  todayButton: {
    width: 81,
    gap: 6,
    padding: 12,
    borderRadius: radius.inner,
    borderWidth: 1,
    borderColor: colors.surfaceMuted,
    backgroundColor: colors.surfaceMuted,
  },
  todayButtonDone: { borderColor: colors.border, backgroundColor: colors.surface },
  todayLabel: { fontSize: fontSize.caption, fontWeight: weight.medium, color: colors.textMuted },
  todayAction: { fontSize: fontSize.small, fontWeight: weight.bold, color: colors.text },

  primaryRow: { alignItems: 'center', paddingTop: 10 },
  primary: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: radius.button,
    backgroundColor: colors.brown,
  },
  primaryLabel: { fontSize: fontSize.button, fontWeight: weight.bold, color: colors.textOnBrown },

  backdrop: { flex: 1, backgroundColor: 'rgba(59, 61, 52, 0.35)' },
  sheet: {
    maxHeight: '70%',
    paddingHorizontal: 20,
    paddingBottom: 28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    marginVertical: 10,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: weight.bold, color: colors.text },
  sheetClose: { fontSize: fontSize.small, fontWeight: weight.medium, color: colors.textSubtle },
  sheetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sheetItem: {
    width: '48%',
    flexGrow: 1,
    gap: 6,
    padding: 16,
    borderRadius: radius.inner,
    backgroundColor: colors.surfaceMuted,
  },
  sheetItemTitle: { fontSize: fontSize.emphasis, fontWeight: weight.bold, color: colors.text },
  sheetItemDesc: { fontSize: fontSize.caption, fontWeight: weight.regular, color: colors.textMuted },
});
