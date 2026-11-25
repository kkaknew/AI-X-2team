import { Pressable, View } from 'react-native';

import type { ActivityCode } from '../logic/ActivityRecorder';
import { ACTIVITY_MENU } from './mainView';
import { Fruit, SvgIcon, treeMainSvg } from './ui';

/** 시안 열매 자리 (372x465 나무 그림 기준, 시안 메인화면 기본 67:155~67:191) */
const FRUIT_SPOTS: Record<ActivityCode, { left: number; top: number; box: number; size: number; rotate: number }> = {
  sleep: { left: 119.96, top: 46.52, box: 58.075, size: 0.85, rotate: 8 },
  meditation: { left: 204.1, top: 60.52, box: 65.809, size: 0.95, rotate: -9 },
  reading: { left: 70.33, top: 110.51, box: 65.35, size: 1, rotate: 5 },
  diary: { left: 142.36, top: 134.44, box: 69.271, size: 1.06, rotate: -5 },
  walk: { left: 232.69, top: 133.12, box: 60.617, size: 0.9, rotate: 7 },
};

export const FRUIT_TREE_W = 372;
export const FRUIT_TREE_H = 465;

/**
 * 다 자란 큰 나무와 열매 5개 (시안 메인 다 자랐을때, 나무 완성).
 * 이 나무에서 해 본 활동(earned)의 열매만 단다. 기록이 없는 활동의 열매는 그리지 않는다.
 * onPressFruit을 주면 열매를 눌러 팝업을 연다.
 */
export function FruitTree({
  width,
  earned,
  onPressFruit,
}: {
  width: number;
  earned: ActivityCode[];
  onPressFruit?: (code: ActivityCode) => void;
}) {
  const k = width / FRUIT_TREE_W;
  const height = FRUIT_TREE_H * k;
  return (
    <View style={{ width, height }}>
      <SvgIcon xml={treeMainSvg} width={width} height={height} />
      {ACTIVITY_MENU.filter(({ code }) => earned.includes(code)).map(({ code, label }) => {
        const spot = FRUIT_SPOTS[code];
        const size = 60 * spot.size * k;
        return (
          <Pressable
            key={code}
            disabled={!onPressFruit}
            accessibilityRole={onPressFruit ? 'button' : undefined}
            accessibilityLabel={`${label} 열매`}
            onPress={() => onPressFruit?.(code)}
            style={{
              position: 'absolute',
              left: (spot.left + spot.box / 2) * k - size / 2,
              top: (spot.top + spot.box / 2) * k - ((64 / 60) * size) / 2,
              transform: [{ rotate: `${spot.rotate}deg` }],
            }}
          >
            <Fruit type={code} scale={spot.size * k} />
          </Pressable>
        );
      })}
    </View>
  );
}
