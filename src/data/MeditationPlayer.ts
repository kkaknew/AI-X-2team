/**
 * 데이터 계층: 명상 음악 재생. (#11 [9] 명상 인증)
 *
 * 로직 계층(MeditationSession)은 이 인터페이스만 안다. 실제 구현은 ExpoMeditationPlayer.
 * 어떤 곡인지, 어떤 재생 라이브러리를 쓰는지는 구현 안에 숨긴다.
 * "끝까지 들었으면 인정" 같은 인증 규칙은 여기 두지 않는다. (ActivityVerifier)
 */
export interface MeditationPlayer {
  /** 곡 출처 표기. 라이선스(CC BY)상 앱 안에 보여줘야 한다 */
  readonly credit: string;
  /**
   * 정해진 음악을 처음부터 재생한다. 끝까지 재생되면 onEnd를 한 번 부른다.
   * @returns 곡 길이(초)
   */
  play(onEnd: () => void): Promise<{ durationSec: number }>;
  /** 재생을 멈춘다. 멈춘 뒤에는 onEnd를 부르지 않는다. 이미 멈췄으면 아무 일도 하지 않는다. */
  stop(): Promise<void>;
}
