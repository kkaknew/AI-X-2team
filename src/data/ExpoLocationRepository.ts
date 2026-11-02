import * as Location from 'expo-location';

import {
  LocationPermissionError,
  type LocationRepository,
  type WalkProgress,
  type WalkSummary,
} from './LocationRepository';
import { WalkTracker } from './WalkTracker';

/**
 * 데이터 계층: LocationRepository를 expo-location으로 구현한다. (#3)
 *
 * - 앱이 화면에 떠 있는 동안(포그라운드)만 위치를 받는다.
 *   화면이 꺼지거나 다른 앱으로 가면 그동안은 기록되지 않는다.
 *   백그라운드 위치 권한은 ETHICS.md "팀에서 더 논의할 것"이 정해진 뒤에 추가한다.
 * - 좌표는 WalkTracker 안에서만 쓰고, 종료하면 거리·시간만 남긴다.
 */

const WATCH_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.High,
  /** 5m 이상 움직였을 때만 새 위치를 받는다 */
  distanceInterval: 5,
  /** 안드로이드: 최소 2초 간격 */
  timeInterval: 2000,
};

export class ExpoLocationRepository implements LocationRepository {
  private tracker: WalkTracker | null = null;
  private subscription: Location.LocationSubscription | null = null;
  private starting = false;

  isWalking(): boolean {
    return this.tracker !== null;
  }

  async startWalk(onProgress?: (progress: WalkProgress) => void): Promise<void> {
    if (this.tracker !== null || this.starting) {
      throw new Error('이미 산책 중입니다');
    }
    this.starting = true;
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) throw new LocationPermissionError();

      const tracker = new WalkTracker(Date.now());
      this.tracker = tracker;
      let subscription: Location.LocationSubscription;
      try {
        subscription = await Location.watchPositionAsync(WATCH_OPTIONS, (location) => {
          tracker.addPoint({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            timestamp: location.timestamp,
          });
          onProgress?.(tracker.progress(Date.now()));
        });
      } catch (error) {
        if (this.tracker === tracker) this.tracker = null;
        throw error;
      }

      if (this.tracker === tracker) {
        this.subscription = subscription;
      } else {
        // 위치 수신을 켜는 사이에 stopWalk()가 먼저 불렸다
        subscription.remove();
      }
    } finally {
      this.starting = false;
    }
  }

  async stopWalk(): Promise<WalkSummary> {
    const tracker = this.tracker;
    if (tracker === null) throw new Error('산책 중이 아닙니다');

    this.subscription?.remove();
    this.subscription = null;
    this.tracker = null;
    return tracker.finish(Date.now());
  }
}
