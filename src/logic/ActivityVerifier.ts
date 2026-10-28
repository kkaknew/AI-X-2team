import type { LocalStore } from '../data/LocalStore';
import type { LocationRepository } from '../data/LocationRepository';

/**
 * 로직 계층: 활동별 완료 조건 판정. (#4, #9, #10)
 * 산책 거리·속도, 명상 중 조작 여부, 독후감 분량 같은 규칙은 이 모듈 안에 숨긴다.
 * 화면과 물주기 엔진은 규칙을 몰라도 된다.
 */
export class ActivityVerifier {
  constructor(
    readonly location: LocationRepository,
    readonly localStore: LocalStore,
  ) {}
}
