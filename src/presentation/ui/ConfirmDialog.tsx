import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, weight } from './theme';

export interface ConfirmDialogProps {
  open: boolean;
  /** 굵은 문구. 예: "아직 기록이 올라가지 않았어요. 그만할까요?" */
  title: string;
  /** 작은 문구 (선택). 예: "종료할까요?" */
  message?: string;
  /** 왼쪽 밝은 버튼. 보통 "계속할게요" (창만 닫는다) */
  cancelLabel?: string;
  /** 오른쪽 갈색 버튼. 예: "포기할게요", "종료할게요", "저장하고 종료" */
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 확인 창 (시안 "확인 창 · 안내": 종료 확인창, 종료 기록후, 종료 저장전, 위치 권한, 시든 나무, 시들기 전 경고)
 * 모두 같은 틀: 가운데 문구 + 버튼 두 개.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  cancelLabel = '계속할게요',
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.box} accessibilityRole="alert">
          <View style={styles.texts}>
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>
          <View style={styles.buttons}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.button, styles.cancel]}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onConfirm} style={[styles.button, styles.confirm]}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: 'rgba(59, 61, 52, 0.4)',
  },
  box: {
    width: '100%',
    maxWidth: 300,
    gap: 20,
    padding: 20,
    borderRadius: radius.card,
    backgroundColor: colors.background,
  },
  texts: { gap: 6, alignItems: 'center' },
  title: {
    fontSize: fontSize.reason,
    fontWeight: weight.bold,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  message: { fontSize: fontSize.small, color: colors.textMuted, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.inner },
  cancel: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  confirm: { backgroundColor: colors.brown },
  cancelText: { fontSize: fontSize.small, fontWeight: weight.bold, color: colors.text },
  confirmText: { fontSize: fontSize.small, fontWeight: weight.bold, color: colors.textOnBrown },
});
