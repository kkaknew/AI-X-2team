import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { GeoPoint } from '../data/LocationRepository.ts';
import { MAX_ACCURACY_M, WalkTracker, distanceBetween } from '../data/WalkTracker.ts';

/**
 * #3 GPS 산책 기록: 위치를 받아 거리·시간을 계산하고, 결과에 좌표가 남지 않는지 확인한다.
 * `npm test` (src 폴더에서)
 */

/** 위도 1도의 거리(m). 지구 반지름 6,371km 기준 */
const METERS_PER_DEGREE_LAT = (2 * Math.PI * 6_371_000) / 360;

const START = Date.parse('2026-11-02T09:00:00+09:00');
const ORIGIN = { latitude: 37.3, longitude: 126.85 };

/** 출발점에서 북쪽으로 meters만큼 간 위치 */
function north(meters: number, secondsAfterStart: number, accuracy: number | null = 5): GeoPoint {
  return {
    latitude: ORIGIN.latitude + meters / METERS_PER_DEGREE_LAT,
    longitude: ORIGIN.longitude,
    accuracy,
    timestamp: START + secondsAfterStart * 1000,
  };
}

describe('거리 계산', () => {
  test('위도 0.01도는 약 1.11km다', () => {
    const d = distanceBetween(ORIGIN, { latitude: ORIGIN.latitude + 0.01, longitude: ORIGIN.longitude });
    assert.ok(Math.abs(d - 1111.95) < 0.1, `${d}`);
  });

  test('같은 위치면 0, 순서를 바꿔도 같다', () => {
    const a = { latitude: 37.5665, longitude: 126.978 };
    const b = { latitude: 37.5547, longitude: 126.9707 };
    assert.equal(distanceBetween(a, a), 0);
    assert.equal(distanceBetween(a, b), distanceBetween(b, a));
  });
});

describe('산책 시작~종료', () => {
  test('10m씩 100번 걸으면 약 1km, 시간은 시작부터 종료까지', () => {
    const tracker = new WalkTracker(START);
    for (let i = 0; i <= 100; i++) tracker.addPoint(north(i * 10, i * 9));

    const summary = tracker.finish(START + 15 * 60 * 1000);
    assert.equal(summary.distanceM, 1000);
    assert.equal(summary.durationSec, 15 * 60);
    assert.equal(summary.startedAt, '2026-11-02T00:00:00.000Z');
    assert.equal(summary.endedAt, '2026-11-02T00:15:00.000Z');
  });

  test('산책 중에도 지금까지의 거리·시간을 볼 수 있다', () => {
    const tracker = new WalkTracker(START);
    tracker.addPoint(north(0, 0));
    tracker.addPoint(north(50, 30));
    assert.deepEqual(tracker.progress(START + 40_000), { distanceM: 50, durationSec: 40 });
  });

  test('위치를 하나도 못 받으면 거리 0', () => {
    const summary = new WalkTracker(START).finish(START + 60_000);
    assert.equal(summary.distanceM, 0);
    assert.equal(summary.durationSec, 60);
  });
});

describe('GPS 오차 거르기', () => {
  test('오차가 큰 위치는 거리에 넣지 않는다', () => {
    const tracker = new WalkTracker(START);
    tracker.addPoint(north(0, 0));
    assert.equal(tracker.addPoint(north(500, 10, MAX_ACCURACY_M + 1)), false);
    tracker.addPoint(north(20, 20));
    assert.equal(tracker.finish(START + 30_000).distanceM, 20);
  });

  test('제자리에서 GPS가 흔들려도 거리가 쌓이지 않는다', () => {
    const tracker = new WalkTracker(START);
    for (let i = 0; i < 60; i++) tracker.addPoint(north(i % 2 === 0 ? 2 : -2, i));
    assert.equal(tracker.finish(START + 60_000).distanceM, 0);
  });

  test('1m씩 천천히 걸어도 거리가 빠지지 않는다', () => {
    const tracker = new WalkTracker(START);
    for (let i = 0; i <= 100; i++) tracker.addPoint(north(i, i * 2));
    const { distanceM } = tracker.finish(START + 200_000);
    assert.ok(distanceM >= 95 && distanceM <= 100, `${distanceM}`);
  });

  test('시작 전에 저장돼 있던 옛 위치는 무시한다', () => {
    const tracker = new WalkTracker(START);
    // 5분 전 2km 떨어진 곳(예: 집)의 위치가 먼저 들어온 경우
    assert.equal(tracker.addPoint(north(-2000, -5 * 60)), false);
    tracker.addPoint(north(0, 1));
    tracker.addPoint(north(30, 20));
    assert.equal(tracker.finish(START + 30_000).distanceM, 30);
  });

  test('시각이 거꾸로 온 위치는 무시한다', () => {
    const tracker = new WalkTracker(START);
    tracker.addPoint(north(0, 10));
    assert.equal(tracker.addPoint(north(100, 5)), false);
  });
});

describe('좌표는 서버로 보내지 않는다', () => {
  test('종료 결과에는 거리·시간만 있고 좌표가 없다', () => {
    const tracker = new WalkTracker(START);
    tracker.addPoint(north(0, 0));
    tracker.addPoint(north(100, 60));
    const summary = tracker.finish(START + 60_000);

    assert.deepEqual(Object.keys(summary).sort(), ['distanceM', 'durationSec', 'endedAt', 'startedAt']);
    const json = JSON.stringify(summary);
    assert.ok(!json.includes('37.3') && !json.includes('126.85'), json);
  });

  test('종료한 뒤에는 위치를 더 받지 않는다', () => {
    const tracker = new WalkTracker(START);
    tracker.finish(START + 1000);
    assert.equal(tracker.addPoint(north(10, 2)), false);
  });
});
