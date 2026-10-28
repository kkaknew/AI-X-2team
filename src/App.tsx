import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import ActivityScreen from './presentation/ActivityScreen';
import HistoryScreen from './presentation/HistoryScreen';
import TreeScreen from './presentation/TreeScreen';

const TABS = [
  { key: 'tree', label: '나무', Screen: TreeScreen },
  { key: 'activity', label: '활동 기록', Screen: ActivityScreen },
  { key: 'history', label: '기록 조회', Screen: HistoryScreen },
] as const;

/** 하단 탭으로 세 화면을 오가는 뼈대. */
export default function App() {
  const [index, setIndex] = useState(0);
  const { Screen } = TABS[index];

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <Screen />
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
