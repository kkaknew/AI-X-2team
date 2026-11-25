import { StyleSheet, View } from 'react-native';

import type { ActivityCode, ActivityRecorder } from '../logic/ActivityRecorder';
import type { MeditationSession } from '../logic/MeditationSession';
import MeditationScreen from './activity/MeditationScreen';
import SleepScreen from './activity/SleepScreen';
import WalkScreen from './activity/WalkScreen';
import WritingScreen from './activity/WritingScreen';
import { colors, Loading } from './ui';

export interface ActivityScreenProps {
  /** 메인 화면에서 고른 활동 */
  activity: ActivityCode;
  /** DB를 여는 동안은 null */
  recorder: ActivityRecorder | null;
  /** 명상 음악 재생과 조작 감지 (#11) */
  meditation: MeditationSession;
  /** 메인으로 돌아가기 (X, 확인 창의 종료·포기, 뒤로 가기) */
  onClose: () => void;
}

/**
 * 표현 계층: 활동 기록 화면 (#8 [6]을 Figma 시안대로 활동 5개 화면으로 나눔)
 * 산책·명상·일기·독서·수면 화면 중 하나를 연다. 화면마다 activity/ 폴더에 있다.
 *
 * 인증 기준(거리, 글자 수, 시간 등)은 화면이 모른다. ActivityRecorder·판정기가 정하고,
 * 화면은 결과(verified, reasons, notice)만 보여준다.
 * 일기·독후감 본문은 ActivityRecorder가 기기 안 개인 기록 DB에만 저장한다 (#10, #12).
 */
export default function ActivityScreen({ activity, recorder, meditation, onClose }: ActivityScreenProps) {
  if (!recorder) {
    return (
      <View style={styles.loading}>
        <Loading />
      </View>
    );
  }
  switch (activity) {
    case 'walk':
      return <WalkScreen recorder={recorder} onClose={onClose} />;
    case 'meditation':
      return <MeditationScreen recorder={recorder} meditation={meditation} onClose={onClose} />;
    case 'diary':
    case 'reading':
      return <WritingScreen key={activity} type={activity} recorder={recorder} onClose={onClose} />;
    case 'sleep':
      return <SleepScreen recorder={recorder} onClose={onClose} />;
  }
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
