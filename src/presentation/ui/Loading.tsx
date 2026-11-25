import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { SvgIcon } from './SvgIcon';
import { spinnerButtonSvg, spinnerScreenSvg } from './svgs';
import { colors, fontSize, weight } from './theme';

export interface LoadingProps {
  /** 화면: 40px 스피너 + 아래 문구 / 버튼: 18px 스피너 + 옆 문구 (갈색 버튼 안) */
  size?: 'screen' | 'button';
  /** 없으면 스피너만 */
  message?: string | null;
}

/**
 * 공통 컴포넌트 ③ 로딩 (시안 124:484 크기=화면, 124:489 크기=버튼)
 * 시안의 스피너 그림을 계속 돌린다.
 */
export function Loading({ size = 'screen', message }: LoadingProps) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const button = size === 'button';
  const px = button ? 18 : 40;

  return (
    <View
      style={button ? styles.row : styles.column}
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? '불러오는 중'}
    >
      <Animated.View style={{ width: px, height: px, transform: [{ rotate }] }}>
        <SvgIcon xml={button ? spinnerButtonSvg : spinnerScreenSvg} width={px} height={px} />
      </Animated.View>
      {message ? (
        <Text style={button ? styles.buttonText : styles.screenText}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', gap: 12, padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  screenText: { fontSize: fontSize.body, fontWeight: weight.medium, color: colors.textMuted },
  buttonText: { fontSize: fontSize.small, fontWeight: weight.medium, color: colors.textOnBrown },
});
