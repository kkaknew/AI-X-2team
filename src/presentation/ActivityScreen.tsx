import { StyleSheet, Text, View } from 'react-native';

/** 표현 계층: 활동 5종을 선택해 기록하고 인증 결과를 보여준다. (#6) */
export default function ActivityScreen() {
  return (
    <View style={styles.container}>
      <Text>활동 기록 화면</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
