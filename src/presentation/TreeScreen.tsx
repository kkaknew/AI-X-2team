import { StyleSheet, Text, View } from 'react-native';

/** 표현 계층: 현재 성장 단계, 물의 양, 시듦 상태를 보여준다. (#7) */
export default function TreeScreen() {
  return (
    <View style={styles.container}>
      <Text>나무 화면</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
