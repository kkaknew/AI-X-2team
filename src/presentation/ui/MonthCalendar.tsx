import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayKey, monthGrid, WEEKDAYS } from '../fruitView';
import { SvgIcon } from './SvgIcon';
import { chevronLeftSvg, chevronRightSvg } from './svgs';
import { colors, fontSize, radius, weight } from './theme';

/**
 * 한 달 달력 (시안 일기 열매·수면 열매). 일요일부터.
 * marked: 기록이 있는 날 → 아래 작은 글자(수면 "7.5h") 또는 점(일기)
 */
export function MonthCalendar({
  year,
  month,
  accent,
  selected,
  marked,
  onSelect,
  onPrev,
  onNext,
}: {
  year: number;
  month: number;
  /** 선택일·점 색 (열매 색) */
  accent: string;
  /** 선택한 날 "2026-11-18" */
  selected: string | null;
  /** 날짜 키 → 칸 아래 글자. 빈 문자열이면 점만 찍는다 */
  marked: Record<string, string>;
  onSelect: (key: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={onPrev} style={styles.nav}>
          <SvgIcon xml={chevronLeftSvg} width={16} height={16} />
        </Pressable>
        <Text style={styles.month}>
          {year}년 {month}월
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={onNext} style={styles.nav}>
          <SvgIcon xml={chevronRightSvg} width={16} height={16} />
        </Pressable>
      </View>

      <View style={styles.row}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      {monthGrid(year, month).map((week, i) => (
        <View key={i} style={styles.row}>
          {week.map((day, j) => {
            if (day === null) return <View key={j} style={styles.cell} />;
            const key = dayKey(year, month, day);
            const mark = marked[key];
            const isSelected = selected === key;
            return (
              <Pressable
                key={j}
                accessibilityRole="button"
                accessibilityLabel={`${month}월 ${day}일${mark !== undefined ? ', 기록 있음' : ''}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelect(key)}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.dayBox,
                    mark !== undefined && styles.dayMarked,
                    isSelected && { backgroundColor: accent },
                  ]}
                >
                  <Text style={[styles.day, isSelected && styles.daySelected]}>{day}</Text>
                  {mark ? (
                    <Text style={[styles.mark, isSelected && styles.daySelected]}>{mark}</Text>
                  ) : null}
                </View>
                {mark === '' && <View style={[styles.dot, { backgroundColor: accent }]} />}
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.legend}>
        <View style={[styles.legendChip, { backgroundColor: accent }]}>
          <Text style={styles.legendSelected}>● 선택일</Text>
        </View>
        <View style={styles.legendChip}>
          <Text style={[styles.legendText, { color: accent }]}>● 기록일</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
    padding: 12,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  nav: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  month: { fontSize: fontSize.reason, fontWeight: weight.bold, color: colors.text },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: fontSize.caption, color: colors.textMuted, paddingVertical: 4 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3, minHeight: 40 },
  dayBox: {
    minWidth: 30,
    paddingVertical: 3,
    paddingHorizontal: 2,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  dayMarked: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  day: { fontSize: fontSize.small, fontWeight: weight.medium, color: colors.text },
  daySelected: { color: colors.textOnBrown },
  mark: { fontSize: 9, color: colors.textMuted },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
  legend: { flexDirection: 'row', gap: 6, marginTop: 8 },
  legendChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  legendSelected: { fontSize: 11, fontWeight: weight.bold, color: colors.textOnBrown },
  legendText: { fontSize: 11, fontWeight: weight.bold },
});
