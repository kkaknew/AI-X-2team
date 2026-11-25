import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, weight } from '../ui/theme';

/** 1초마다 다시 그리게 한다 (경과·남은 시간 표시용) */
export function useTicker(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** 산책·명상 큰 카드 (시안 "산책 시작 카드", "명상 시작 카드") */
export function HeroCard({
  eyebrow,
  title,
  subtitle,
  caption,
  children,
}: {
  /** 예: "WALK · 나를 위한 시간" */
  eyebrow: string;
  title: string;
  subtitle: string;
  /** 카드 아래 작은 안내 */
  caption: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroSubtitle}>{subtitle}</Text>
      <View style={styles.heroBody}>{children}</View>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

/** 갈색 동그란 버튼 (시작·종료). halo면 명상처럼 바깥 고리를 그린다 */
export function CircleButton({
  size,
  onPress,
  disabled,
  halo,
  label,
  children,
}: {
  size: number;
  onPress?: () => void;
  disabled?: boolean;
  halo?: boolean;
  /** 화면 읽기 프로그램용 이름 */
  label: string;
  children: ReactNode;
}) {
  const circle = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
        disabled && styles.dim,
      ]}
    >
      {children}
    </Pressable>
  );
  if (!halo) return circle;
  return (
    <View style={[styles.haloOuter, { width: size + 60, height: size + 60, borderRadius: (size + 60) / 2 }]}>
      <View style={[styles.haloInner, { width: size + 30, height: size + 30, borderRadius: (size + 30) / 2 }]}>
        {circle}
      </View>
    </View>
  );
}

/** 명상 "마음을 가라앉히는 소리" 카드의 소리 막대 */
export function SoundBars() {
  const heights = [18, 30, 46, 26, 40, 22, 34];
  return (
    <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {heights.map((h, i) => (
        <View key={i} style={[styles.bar, { height: h }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: radius.illustration,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  eyebrow: { fontSize: fontSize.caption, fontWeight: weight.bold, color: colors.textSubtle },
  heroTitle: { fontSize: fontSize.headline + 2, fontWeight: weight.bold, color: colors.text, textAlign: 'center' },
  heroSubtitle: { fontSize: fontSize.body, color: colors.textMuted, textAlign: 'center' },
  heroBody: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 24 },
  caption: { fontSize: fontSize.small, color: colors.textMuted, textAlign: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brown },
  haloOuter: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.haloOuter },
  haloInner: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.haloInner },
  dim: { opacity: 0.5 },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 48 },
  bar: { width: 5, borderRadius: 3, backgroundColor: colors.brown },
});
