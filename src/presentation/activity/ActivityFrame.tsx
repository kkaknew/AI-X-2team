import { useEffect, type ReactNode } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DailyNotice, ErrorMessage, FailureCard, splitNotice } from '../ui';
import { colors, fontSize, radius, weight } from '../ui/theme';
import type { ResultView } from '../activityView';

/**
 * 활동 화면 공통 틀 (시안 "활동 화면"): 제목·부제·X 버튼, 내용, 아래 고정 버튼(저장)
 * X나 안드로이드 뒤로 가기를 누르면 onRequestClose를 부른다. 화면이 확인 창을 띄울지 정한다.
 */
export function ActivityFrame({
  title,
  subtitle,
  onRequestClose,
  footer,
  onTouchStart,
  children,
}: {
  title: string;
  subtitle: string;
  onRequestClose: () => void;
  /** 화면 아래에 고정할 버튼 (일기·독서·수면의 저장) */
  footer?: ReactNode;
  /** 명상 중 화면 조작 감지 */
  onTouchStart?: () => void;
  children: ReactNode;
}) {
  // 안드로이드 뒤로 가기도 X와 같이 처리한다 (App의 처리보다 먼저 불린다)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestClose();
      return true;
    });
    return () => sub.remove();
  }, [onRequestClose]);

  return (
    <View style={styles.root} onTouchStart={onTouchStart}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            onPress={onRequestClose}
            hitSlop={8}
            style={styles.close}
          >
            <Text style={styles.closeText}>X</Text>
          </Pressable>
        </View>
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

/** 아래 고정 갈색 버튼 (저장) */
export function FooterButton({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** 저장 중 로딩 표시를 넣을 때 */
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.footerButton, disabled && styles.dim]}
    >
      {children ?? <Text style={styles.footerLabel}>{label}</Text>}
    </Pressable>
  );
}

/** 기록 결과: 성공 카드 / 하루 한 번 안내 / 실패 카드 */
export function ResultBlock({ view }: { view: ResultView }) {
  if (view.kind === 'success') {
    return (
      <View style={styles.success} accessibilityLiveRegion="polite">
        <Text style={styles.successText}>{view.message}</Text>
      </View>
    );
  }
  if (view.kind === 'notice') {
    const { title, description } = splitNotice(view.text);
    return <DailyNotice title={title} description={description} />;
  }
  return <FailureCard reasons={view.reasons} />;
}

/** 저장·기록 중 오류 */
export function ActivityError({ message }: { message: string }) {
  return <ErrorMessage message={message} variant="card" />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  container: { paddingTop: 24, paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  titleGroup: { flex: 1, gap: 4 },
  title: { fontSize: fontSize.title, fontWeight: weight.bold, color: colors.text },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  closeText: { fontSize: fontSize.cardTitle, fontWeight: weight.bold, color: colors.text },
  footer: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8 },
  footerButton: {
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.brown,
  },
  footerLabel: { fontSize: fontSize.emphasis, fontWeight: weight.bold, color: colors.textOnBrown },
  dim: { opacity: 0.5 },
  success: {
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  successText: { fontSize: fontSize.emphasis, fontWeight: weight.bold, color: colors.text },
});
