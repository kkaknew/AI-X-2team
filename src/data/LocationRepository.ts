/**
 * 데이터 계층: GPS 위치 수집, 산책 거리·시간 계산용. (#3)
 * 산책 경로 좌표는 기기 안에서만 쓰고 서버로 보내지 않는다.
 *
 * 로직 계층(ActivityVerifier)은 이 인터페이스만 안다. 실제 구현은 ExpoLocationRepository.
 * 평균 시속 7km 초과 같은 인증 규칙은 여기 두지 않는다. (#4, ActivityVerifier)
 */

/** GPS에서 받은 위치 한 점. 기기 안에서만 쓴다. */
export interface GeoPoint {
  latitude: number;
  longitude: number;
  /** 오차 반경(m). 모르면 null */
  accuracy: number | null;
  /** 위치를 잡은 시각 (ms) */
  timestamp: number;
}

/** 산책 중 화면에 보여줄 값 */
export interface WalkProgress {
  /** 지금까지 걸은 거리(m) */
  distanceM: number;
  /** 시작부터 지난 시간(초) */
  durationSec: number;
}

/**
 * 산책이 끝나면 돌려주는 결과.
 * 좌표는 들어 있지 않다. 이 값만 로직 계층으로 넘어가고, 서버에도 이것만 올라간다.
 */
export interface WalkSummary extends WalkProgress {
  /** 시작 시각 (ISO) */
  startedAt: string;
  /** 종료 시각 (ISO) */
  endedAt: string;
}

/** 위치 권한을 받지 못해 산책을 시작할 수 없을 때 */
export class LocationPermissionError extends Error {
  constructor() {
    super('위치 권한이 없어 산책을 기록할 수 없습니다');
    this.name = 'LocationPermissionError';
  }
}

export interface LocationRepository {
  /**
   * 산책 시작. 위치 권한을 묻고, 거부되면 LocationPermissionError를 던진다.
   * 위치가 들어올 때마다 onProgress로 지금까지의 거리·시간을 알려준다.
   */
  startWalk(onProgress?: (progress: WalkProgress) => void): Promise<void>;
  /** 산책 종료. 거리·시간만 돌려주고, 수집한 좌표는 버린다. */
  stopWalk(): Promise<WalkSummary>;
  isWalking(): boolean;
}
