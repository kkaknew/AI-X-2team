import { StyleSheet, Text, View } from 'react-native';

import { SvgIcon } from './SvgIcon';
import { noticeDropSvg } from './svgs';
import { colors, fontSize, radius, weight } from './theme';

export interface DailyNoticeProps {
  /** 예: "오늘은 이미 일기로 물을 받았어요" */
  title: string;
  /** 예: "일기는 저장했고, 물은 내일 다시 받을 수 있어요" */
  description?: string | null;
  /**
   * 안내: 인증은 됐지만 물은 0 (물방울 아이콘, 베이지)
   * 막힘: 기록 자체를 막을 때, 예: 수면 하루 한 번 (느낌표, 붉은색)
   */
  tone?: 'info' | 'blocked';
}

/**
 * 공통 컴포넌트 ② 하루 한 번 안내 (시안 124:472 톤=안내, 124:477 톤=막힘)
 * 모든 활동이 같은 모양을 쓴다.
 */
export function DailyNotice({ title, description, tone = 'info' }: DailyNoticeProps) {
  const blocked = tone === 'blocked';
  return (
    <View
      style={[styles.box, blocked ? styles.boxBlocked : styles.boxInfo]}
      accessibilityLiveRegion="polite"
    >
      {blocked ? (
        <View style={styles.alert}>
          <Text style={styles.alertMark}>!</Text>
        </View>
      ) : (
        <SvgIcon xml={noticeDropSvg} width={22} height={31} />
      )}
      <View style={styles.texts}>
        <Text style={[styles.title, blocked && styles.titleBlocked]}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignSelf: 'stretch',
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  boxInfo: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  boxBlocked: { backgroundColor: colors.dangerBackground, borderColor: colors.dangerBorder },
  alert: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  alertMark: { fontSize: fontSize.reason, fontWeight: weight.bold, color: colors.textOnBrown },
  texts: { flex: 1, gap: 3 },
  title: { fontSize: fontSize.emphasis, fontWeight: weight.bold, color: colors.text },
  titleBlocked: { color: colors.danger },
  description: { fontSize: fontSize.small, fontWeight: weight.regular, color: colors.textMuted },
});
