import { useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

import { MERIDIEMS, WHEEL_HOURS, WHEEL_MINUTES, type WheelTime } from '../activityView';
import { colors, fontSize, sleepColors, weight } from '../ui/theme';

const ITEM_H = 36;
const VISIBLE = 5;

/** 수면 시각 선택 휠 (시안 "시각 선택": 오전/오후 · 시 · 분(10분 단위)) */
export function TimeWheel({
  value,
  onChange,
  accent,
}: {
  value: WheelTime;
  onChange: (next: WheelTime) => void;
  /** 가운데 고른 값 글자색 */
  accent: string;
}) {
  return (
    <View style={styles.wheel}>
      <View style={[styles.band, { top: ITEM_H * 2 }]} pointerEvents="none" />
      <Column
        items={MERIDIEMS}
        selected={value.meridiem}
        render={(m) => m}
        onSelect={(meridiem) => onChange({ ...value, meridiem })}
        accent={accent}
      />
      <Column
        items={WHEEL_HOURS}
        selected={value.hour}
        render={(h) => String(h)}
        onSelect={(hour) => onChange({ ...value, hour })}
        accent={accent}
      />
      <Text style={[styles.colon, { color: accent }]}>:</Text>
      <Column
        items={WHEEL_MINUTES}
        selected={value.minute}
        render={(m) => String(m).padStart(2, '0')}
        onSelect={(minute) => onChange({ ...value, minute })}
        accent={accent}
      />
    </View>
  );
}

function Column<T extends string | number>({
  items,
  selected,
  render,
  onSelect,
  accent,
}: {
  items: readonly T[];
  selected: T;
  render: (item: T) => string;
  onSelect: (item: T) => void;
  accent: string;
}) {
  const ref = useRef<ScrollViewInstance>(null);
  const index = Math.max(0, items.indexOf(selected));

  // 밖에서 값이 바뀌면(잠든 시각 ↔ 일어난 시각 전환) 그 자리로 굴린다
  useEffect(() => {
    ref.current?.scrollTo({ y: index * ITEM_H, animated: false });
  }, [index]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const item = items[Math.min(items.length - 1, Math.max(0, i))];
    if (item !== selected) onSelect(item);
  };

  return (
    <ScrollView
      ref={ref}
      style={styles.column}
      contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      contentOffset={{ x: 0, y: index * ITEM_H }}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={(e) => {
        // 손을 떼고 관성 없이 멈춘 경우
        if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) settle(e);
      }}
      nestedScrollEnabled
    >
      {items.map((item) => {
        const active = item === selected;
        return (
          <Text
            key={String(item)}
            onPress={() => onSelect(item)}
            style={[styles.item, active && [styles.itemActive, { color: accent }]]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {render(item)}
          </Text>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wheel: {
    height: ITEM_H * VISIBLE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_H,
    borderRadius: 10,
    backgroundColor: sleepColors.band,
  },
  column: { width: 72, height: ITEM_H * VISIBLE, flexGrow: 0 },
  item: {
    height: ITEM_H,
    lineHeight: ITEM_H,
    textAlign: 'center',
    fontSize: fontSize.emphasis,
    color: colors.faint,
  },
  itemActive: { fontSize: 20, fontWeight: weight.bold },
  colon: { width: 16, textAlign: 'center', fontSize: 20, fontWeight: weight.bold, color: colors.text },
});
