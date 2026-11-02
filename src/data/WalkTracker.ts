import type { GeoPoint, WalkProgress, WalkSummary } from './LocationRepository';

/**
 * 데이터 계층: 산책 중 들어오는 GPS 위치로 거리·시간을 계산한다. (#3)
 *
 * 좌표는 직전 위치 하나만 메모리에 들고 있다가, finish()에서 버린다.
 * 경로 전체를 저장하지 않으므로 기기에도 서버에도 경로가 남지 않는다.
 *
 * GPS 오차를 거르는 기준(아래 상수)은 "위치가 믿을 만한가"에 대한 것이다.
 * "이 산책을 인정할까"(시속 7km 등)는 ActivityVerifier(#4)가 정한다.
 */

/** 오차 반경이 이보다 큰 위치는 버린다 (m) */
export const MAX_ACCURACY_M = 30;

/** 직전에 쓴 위치에서 이만큼도 안 움직였으면 제자리 흔들림으로 보고 거리에 더하지 않는다 (m) */
export const MIN_STEP_M = 5;

/**
 * 시작 시각보다 이만큼 이전에 잡힌 위치는 버린다 (ms).
 * 시작 직후 예전에 저장된 위치(예: 집)가 먼저 들어와 거리가 크게 늘어나는 것을 막는다.
 * 휴대폰 시계와 GPS 시각이 조금 다를 수 있어서 30초는 봐준다.
 */
export const STALE_POINT_MS = 30_000;

const EARTH_RADIUS_M = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** 두 위치 사이의 거리(m). 지구를 구로 보는 하버사인 공식 */
export function distanceBetween(
  a: Pick<GeoPoint, 'latitude' | 'longitude'>,
  b: Pick<GeoPoint, 'latitude' | 'longitude'>,
): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export class WalkTracker {
  private readonly startedAt: number;
  private last: GeoPoint | null = null;
  private meters = 0;
  private finished = false;

  /** @param startedAt 산책 시작 시각 (ms, Date.now()) */
  constructor(startedAt: number) {
    this.startedAt = startedAt;
  }

  /** 위치 한 점을 넣는다. 거리 계산에 썼으면 true, 버렸으면 false */
  addPoint(point: GeoPoint): boolean {
    if (this.finished) return false;
    if (point.accuracy !== null && point.accuracy > MAX_ACCURACY_M) return false;
    if (point.timestamp < this.startedAt - STALE_POINT_MS) return false;
    if (this.last !== null && point.timestamp <= this.last.timestamp) return false;

    if (this.last === null) {
      this.last = point;
      return true;
    }

    const step = distanceBetween(this.last, point);
    if (step < MIN_STEP_M) return false;

    this.meters += step;
    this.last = point;
    return true;
  }

  /** @param now 현재 시각 (ms) */
  progress(now: number): WalkProgress {
    return {
      distanceM: Math.round(this.meters),
      durationSec: Math.max(0, Math.round((now - this.startedAt) / 1000)),
    };
  }

  /** 산책을 끝내고 결과를 돌려준다. 들고 있던 좌표는 버린다. */
  finish(endedAt: number): WalkSummary {
    const summary: WalkSummary = {
      startedAt: new Date(this.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      ...this.progress(endedAt),
    };
    this.finished = true;
    this.last = null;
    return summary;
  }
}
