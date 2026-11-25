import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, weight } from './theme';

export interface ErrorMessageProps {
  message: string;
  /** 한 줄: 화면 안에 짧게 / 카드: 붉은 상자 */
  variant?: 'line' | 'card';
}

/**
 * 공통 컴포넌트 ④ 오류 (시안 124:495 형태=한 줄, 124:499 형태=카드)
 * 불러오기·저장 실패 같은 오류를 모든 화면이 같은 모양으로 보여준다.
 */
export function ErrorMessage({ message, variant = 'line' }: ErrorMessageProps) {
  const card = variant === 'card';
  return (
    <View style={card ? styles.card : styles.line} accessibilityRole="alert">
      <View style={styles.mark}>
        <Text style={styles.markText}>!</Text>
      </View>
      <Text style={[styles.text, card && styles.textCard]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: {
    alignSelf: 'stretch',
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
  },
  mark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  markText: { fontSize: fontSize.caption, fontWeight: weight.bold, color: colors.textOnBrown },
  text: { fontSize: fontSize.body, fontWeight: weight.medium, color: colors.danger },
  textCard: { flex: 1 },
});
