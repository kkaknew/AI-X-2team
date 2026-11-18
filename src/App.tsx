import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { describeDatabase, getActivityType, openAppDatabase, openLocalDatabase } from './data/database';
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
import { WateringEngine } from './logic/WateringEngine';
import ActivityScreen, { type ActivityScreenProps } from './presentation/ActivityScreen';
import HistoryScreen from './presentation/HistoryScreen';
import ReminderScreen, { type ReminderScreenProps } from './presentation/ReminderScreen';
import TreeScreen, { type TreeScreenProps } from './presentation/TreeScreen';

/** 모든 화면에 같은 로직 객체를 넘긴다. 쓰지 않는 화면은 무시한다 */
type ScreenProps = TreeScreenProps & ActivityScreenProps & ReminderScreenProps;

/** 산책 중 탭을 옮겨도 산책이 이어지도록 위치 저장소는 앱 전체에서 하나만 쓴다 */
const location = new ExpoLocationRepository();

/** 명상 음악 재생기도 하나만 쓴다. 두 곡이 겹쳐 재생되지 않게 */
const meditation = new MeditationSession({ player: new ExpoMeditationPlayer() });

const TABS: { key: string; label: string; Screen: ComponentType<ScreenProps> }[] = [
  { key: 'tree', label: '나무', Screen: TreeScreen },
  { key: 'activity', label: '활동 기록', Screen: ActivityScreen },
  { key: 'history', label: '기록 조회', Screen: HistoryScreen },
  { key: 'reminder', label: '알림', Screen: ReminderScreen },
];

/**
 * 앱 시작점. 하단 탭으로 세 화면을 오간다.
 * App.tsx는 계층을 조립하는 곳이라 데이터 계층(DB 초기화)을 직접 불러도 된다.
 */
export default function App() {
  const [index, setIndex] = useState(0);
  const [engine, setEngine] = useState<WateringEngine | null>(null);
  const [recorder, setRecorder] = useState<ActivityRecorder | null>(null);
  const [reminders, setReminders] = useState<ReminderService | null>(null);

  useEffect(() => {
    describeDatabase()
      .then((summary) => console.log(`[DB] ${summary}`))
      .catch((e) => console.error('[DB] 초기화 실패', e));
    Promise.all([openAppDatabase(), openLocalDatabase()])
      .then(([db, localDb]) => {
        const watering = new WateringEngine(new SqliteTreeRepository(db));
        setEngine(watering);
        setRecorder(
          new ActivityRecorder({
            verifier: new ActivityVerifier(),
            loadActivityType: getActivityType,
            water: (input) => watering.water(input),
            location,
            activities: new SqliteActivityRepository(db),
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
      })
      .catch((e) => console.error('[DB] 물주기 엔진 준비 실패', e));
  }, []);
  const { Screen } = TABS[index];

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <Screen engine={engine} recorder={recorder} meditation={meditation} reminders={reminders} />
      </View>
      <View style={styles.tabBar}>
        {TABS.map((tab, i) => (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === index }}
            onPress={() => setIndex(i)}
            style={styles.tab}
          >
            <Text style={[styles.tabLabel, i === index && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', paddingTop: 48 },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#cccccc',
    paddingBottom: 24,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabLabel: { fontSize: 14, color: '#888888' },
  tabLabelActive: { color: '#2f7d4f', fontWeight: '600' },
});
