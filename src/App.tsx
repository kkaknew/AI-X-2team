import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { AppState, BackHandler, StyleSheet, View } from 'react-native';

import { describeDatabase, getActivityType, openAppDatabase, openLocalDatabase } from './data/database';
import { makeWilted, resetAllData, seedDemoData, setWater } from './data/demoData';
import { ExpoLocationRepository } from './data/ExpoLocationRepository';
import { ExpoMeditationPlayer } from './data/ExpoMeditationPlayer';
import { ExpoPushClient } from './data/ExpoPushClient';
import { SqliteReminderRepository } from './data/ReminderRepository';
import { SqliteActivityRepository } from './data/SqliteActivityRepository';
import { SqliteLocalStore } from './data/SqliteLocalStore';
import { SqliteTreeRepository } from './data/SqliteTreeRepository';
import { ActivityRecorder } from './logic/ActivityRecorder';
import { ActivityVerifier } from './logic/ActivityVerifier';
import { MeditationSession } from './logic/MeditationSession';
import { ReminderService } from './logic/ReminderService';
import { StatsService } from './logic/StatsService';
import { WateringEngine } from './logic/WateringEngine';
import { WiltingChecker } from './logic/WiltingChecker';
import type { ActivityCode } from './logic/ActivityRecorder';
import ActivityScreen from './presentation/ActivityScreen';
import CompletionScreen from './presentation/CompletionScreen';
import RecordsScreen from './presentation/RecordsScreen';
import type { DevTools } from './presentation/DevToolsCard';
import TreeScreen from './presentation/TreeScreen';
import { colors } from './presentation/ui';

/** 산책 중 화면을 옮겨도 산책이 이어지도록 위치 저장소는 앱 전체에서 하나만 쓴다 */
const location = new ExpoLocationRepository();

/** 명상 음악 재생기도 하나만 쓴다. 두 곡이 겹쳐 재생되지 않게 */
const meditation = new MeditationSession({ player: new ExpoMeditationPlayer() });

/**
 * 지금 보이는 화면. 시안대로 하단 탭 없이 메인(나의 나무)에서 들어간다.
 * - main: treeId가 있으면 그 지난 나무를 본다 (◀ ▶, 내 기록의 나의 나무)
 * - activity: 메인의 오늘의 활동·활동 보기에서 (고른 활동으로 연다)
 * - records: 메인의 프로필 버튼에서 (나의 나무·기록 조회·알림 설정)
 * - complete: 다 자란 나무의 [새 씨앗 심기]에서 (나무 완성 화면)
 */
type Route =
  | { name: 'main'; treeId: number | null }
  | { name: 'activity'; activity: ActivityCode }
  | { name: 'records' }
  | { name: 'complete' };

/**
 * 시듦 판정(#17)을 돌린다. 앱을 켤 때, 앱을 다시 앞으로 가져올 때, 물을 받았을 때.
 * - 시들었으면 나무 화면을 다시 그리게 한다
 * - 시들기 하루 전 경고 알림을 다시 맞춘다 (물을 받으면 시드는 시각이 뒤로 밀리므로)
 * @returns 감시를 멈추는 함수
 */
function startWiltingWatch(
  watering: WateringEngine,
  checker: WiltingChecker,
  reminders: ReminderService,
  /** 판정할 때마다 시들 때까지 남은 시간을 알린다 (메인의 시듦 안내 창) */
  onState: (remainingMs: number | null) => void,
): () => void {
  const sync = async () => {
    const state = await checker.check();
    onState(state ? state.remainingMs : null);
    if (state?.wiltedNow) await watering.refresh();
    await reminders.syncWiltWarning(state);
  };
  const run = () => {
    sync().catch((e) => console.error('[시듦] 판정 실패', e));
  };

  run();
  const unsubscribe = watering.subscribe(run);
  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'active') run();
  });
  return () => {
    unsubscribe();
    appState.remove();
  };
}

/**
 * 앱 시작점. 메인(나의 나무)에서 활동 기록·내 기록으로 들어갔다 돌아온다.
 * App.tsx는 계층을 조립하는 곳이라 데이터 계층(DB 초기화)을 직접 불러도 된다.
 */
export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'main', treeId: null });
  /** 시들 때까지 남은 시간 (ms). 모르면 null */
  const [wiltRemainingMs, setWiltRemainingMs] = useState<number | null>(null);
  const [engine, setEngine] = useState<WateringEngine | null>(null);
  const [recorder, setRecorder] = useState<ActivityRecorder | null>(null);
  const [reminders, setReminders] = useState<ReminderService | null>(null);
  const [stats, setStats] = useState<StatsService | null>(null);
  /** 개발 중에만: 체험용 기록 넣기·모두 지우기 (내 기록 화면) */
  const [devTools, setDevTools] = useState<DevTools | undefined>(undefined);
  /** 체험 데이터로 기록이 통째로 바뀌면 늘린다 (화면을 새로 읽게) */
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    let stopWilting: (() => void) | null = null;
    describeDatabase()
      .then((summary) => console.log(`[DB] ${summary}`))
      .catch((e) => console.error('[DB] 초기화 실패', e));
    Promise.all([openAppDatabase(), openLocalDatabase()])
      .then(([db, localDb]) => {
        const trees = new SqliteTreeRepository(db);
        const watering = new WateringEngine(trees);
        const activities = new SqliteActivityRepository(db);
        setEngine(watering);
        setStats(new StatsService({ activities }));
        setRecorder(
          new ActivityRecorder({
            verifier: new ActivityVerifier(),
            loadActivityType: getActivityType,
            water: (input) => watering.water(input),
            location,
            activities,
            localStore: new SqliteLocalStore(localDb),
          }),
        );
        const reminderService = new ReminderService({
          push: new ExpoPushClient(),
          repo: new SqliteReminderRepository(db),
        });
        setReminders(reminderService);
        // 저장된 알림 설정대로 다시 예약 (권한은 새로 묻지 않는다)
        reminderService
          .restore()
          .catch((e) => console.error('[알림] 물주기 알림을 다시 예약하지 못했습니다', e));
        stopWilting = startWiltingWatch(
          watering,
          new WiltingChecker(trees),
          reminderService,
          setWiltRemainingMs,
        );

        if (__DEV__) {
          const after = async () => {
            await watering.refresh();
            setDataVersion((v) => v + 1);
          };
          setDevTools({
            seed: async () => {
              await seedDemoData(db, localDb);
              await after();
            },
            reset: async () => {
              await resetAllData(db, localDb);
              await after();
            },
            setWater: async (amount) => {
              await setWater(db, amount);
              await after();
            },
            wilt: async () => {
              await makeWilted(db);
              await after();
            },
          });
        }
      })
      .catch((e) => console.error('[DB] 물주기 엔진 준비 실패', e));
    return () => stopWilting?.();
  }, []);

  // 안드로이드 뒤로 가기: 메인이 아니면 메인으로 (지난 나무를 보는 중이면 지금 나무로)
  useEffect(() => {
    if (route.name === 'main' && route.treeId === null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setRoute({ name: 'main', treeId: null });
      return true;
    });
    return () => sub.remove();
  }, [route]);

  const goMain = useCallback(() => setRoute({ name: 'main', treeId: null }), []);

  return (
    <View style={styles.container}>
      {route.name === 'main' && (
        <TreeScreen
          key={dataVersion}
          engine={engine}
          stats={stats}
          recorder={recorder}
          onOpenActivity={(activity) => setRoute({ name: 'activity', activity: activity ?? 'walk' })}
          onOpenRecords={() => setRoute({ name: 'records' })}
          onOpenComplete={() => setRoute({ name: 'complete' })}
          viewTreeId={route.treeId}
          onViewTree={(treeId) => setRoute({ name: 'main', treeId })}
          wiltRemainingMs={wiltRemainingMs}
        />
      )}
      {route.name === 'complete' && (
        <CompletionScreen engine={engine} stats={stats} onPlanted={goMain} onLater={goMain} />
      )}
      {route.name === 'activity' && (
        <ActivityScreen
          activity={route.activity}
          recorder={recorder}
          meditation={meditation}
          onClose={goMain}
        />
      )}
      {route.name === 'records' && (
        <RecordsScreen
          stats={stats}
          engine={engine}
          reminders={reminders}
          recorder={recorder}
          devTools={devTools}
          dataVersion={dataVersion}
          onClose={goMain}
          onOpenTree={(treeId) =>
            // 지금 나무를 누르면 그냥 메인으로
            engine
              ?.getProgress()
              .then((p) => setRoute({ name: 'main', treeId: p?.treeId === treeId ? null : treeId }))
              .catch(() => setRoute({ name: 'main', treeId }))
          }
        />
      )}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 48 },
  body: { flex: 1 },
});
