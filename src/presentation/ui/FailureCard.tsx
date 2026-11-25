import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, weight } from './theme';

export interface FailureCardProps {
  /** 인증되지 않은 이유. 판정기(ActivityVerifier)가 준 문장을 그대로 넣는다. 1~3줄 */
  reasons: string[];
  /** 아래 작은 안내. 없으면 "물을 받지 못했어요. 다시 도전해 보세요." */
  hint?: string | null;
  title?: string;
}

/**
 * 공통 컴포넌트 ① 실패 카드 (시안 "공통 컴포넌트 · 문구표" 124:465)
 * 제목 "인증하지 못했어요" + 이유 1~3줄 + 안내 한 줄. 모든 활동이 같은 모양을 쓴다.
 */
export function FailureCard({
  reasons,
  hint = '물을 받지 못했어요. 다시 도전해 보세요.',
  title = '인증하지 못했어요',
}: FailureCardProps) {
  return (
    <View style={styles.card} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.title}>{title}</Text>
      <View style={styles.reasons}>
        {reasons.map((reason) => (
          <Text key={reason} style={styles.reason}>
            {reason}
          </Text>
        ))}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    gap: 8,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
  },
  title: { fontSize: fontSize.cardTitle, fontWeight: weight.bold, color: colors.danger },
  reasons: { gap: 4 },
  reason: { fontSize: fontSize.reason, fontWeight: weight.medium, color: colors.text },
  hint: { fontSize: fontSize.small, fontWeight: weight.regular, color: colors.textMuted },
});
