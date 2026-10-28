import { StyleSheet, Text, View } from 'react-native';

/** 표현 계층: 일·주간 활동 횟수와 받은 물의 양을 보여준다. (#12) */
export default function HistoryScreen() {
  return (
    <View style={styles.container}>
      <Text>기록 조회 화면</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
