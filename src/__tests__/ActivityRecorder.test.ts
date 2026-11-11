import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import type { WalkProgress, WalkSummary } from '../data/LocationRepository.ts';
import type { ActivityCode } from '../data/schema.ts';
import { pendingMigrations } from '../data/schema.ts';
import { ActivityRecorder, sleepDurationMin } from '../logic/ActivityRecorder.ts';
import { ActivityVerifier } from '../logic/ActivityVerifier.ts';

/**
 * #8 [6] 활동 기록 화면이 쓰는 ActivityRecorder
 * 완료 조건: 활동 5종을 선택해 기록할 수 있고, 인증 성공·실패 결과가 화면에 표시된다.
 * 화면 자체는 휴대폰에서 확인하고, 여기서는 화면이 받는 판정 결과를 검사한다.
 */
type ActivityType = { rule: string; waterReward: number };

function loadActivityTypeFromDb(): (code: ActivityCode) => Promise<ActivityType> {
  const db = new DatabaseSync(':memory:');
  for (const m of pendingMigrations(0)) db.exec(m.sql);
  const rows = db.prepare('SELECT code, rule, water_reward FROM activity_types').all() as {
    code: ActivityCode;
    rule: string;
    water_reward: number;
  }[];
  db.close();
  const types = new Map(rows.map((r) => [r.code, { rule: r.rule, waterReward: r.water_reward }]));
  return async (code) => {
    const type = types.get(code);
    if (!type) throw new Error(`no activity type: ${code}`);
    return type;
  };
}

/** GPS 대신 쓰는 가짜 위치 저장소 */
class FakeLocation {
  walking = false;
  private onProgress?: (p: WalkProgress) => void;
  private progress: WalkProgress = { distanceM: 0, durationSec: 0 };
  denyPermission = false;

  async startWalk(onProgress?: (p: WalkProgress) => void) {
    if (this.denyPermission) throw new Error('위치 권한이 없어 산책을 기록할 수 없습니다');
    this.walking = true;
    this.onProgress = onProgress;
  }
  move(p: WalkProgress) {
    this.progress = p;
    this.onProgress?.(p);
  }
  async stopWalk(): Promise<WalkSummary> {
    this.walking = false;
    return { ...this.progress, startedAt: '', endedAt: '' };
  }
  isWalking() {
    return this.walking;
  }
}

function setup() {
  const location = new FakeLocation();
  /** 물주기에 들어온 값 */
  const watered: { verified: boolean; waterReward: number }[] = [];
  const recorder = new ActivityRecorder({
    verifier: new ActivityVerifier(),
    loadActivityType: loadActivityTypeFromDb(),
    water: async (input) => {
      watered.push(input);
      return { waterGiven: input.waterReward };
    },
    location,
    now: () => 1_000_000,
  });
  return { recorder, location, watered };
}

describe('활동 5종 기록', () => {
  test('일기: 쓰면 인증, 비어 있으면 실패', async () => {
    const { recorder } = setup();
    assert.equal((await recorder.record({ type: 'diary', charCount: 10 })).verified, true);
    const fail = await recorder.record({ type: 'diary', charCount: 0 });
    assert.equal(fail.verified, false);
    assert.ok(fail.reasons.length > 0);
  });

  test('독서: 200자 이상이면 인증', async () => {
    const { recorder } = setup();
    assert.equal((await recorder.record({ type: 'reading', charCount: 200 })).verified, true);
    assert.equal((await recorder.record({ type: 'reading', charCount: 199 })).verified, false);
  });

  test('수면: 7시간 이상이면 인증', async () => {
    const { recorder } = setup();
    assert.equal((await recorder.record({ type: 'sleep', durationMin: 420 })).verified, true);
    assert.equal((await recorder.record({ type: 'sleep', durationMin: 300 })).verified, false);
  });

  test('명상: 끝까지, 조작 없이 하면 인증', async () => {
    const { recorder } = setup();
    const base = { type: 'meditation' as const, fullyPlayed: true, touched: false, leftApp: false };
    assert.equal((await recorder.record(base)).verified, true);
    assert.equal((await recorder.record({ ...base, touched: true })).verified, false);
    assert.equal((await recorder.record({ ...base, fullyPlayed: false })).verified, false);
  });

  test('산책: 시작 → 진행 상황 → 종료 후 판정', async () => {
    const { recorder, location } = setup();
    const seen: number[] = [];
    recorder.watchWalk((w) => seen.push(w.distanceM));

    await recorder.startWalk();
    assert.deepEqual(recorder.currentWalk(), { startedAt: 1_000_000, distanceM: 0 });
    location.move({ distanceM: 500, durationSec: 600 });
    location.move({ distanceM: 1500, durationSec: 1500 });
    assert.deepEqual(seen, [500, 1500]);

    const done = await recorder.finishWalk();
    assert.equal(done.result.verified, true);
    assert.equal(done.distanceM, 1500);
    assert.equal(recorder.currentWalk(), null);
  });

  test('산책: 평균 시속 7km 초과면 실패 결과가 나온다', async () => {
    const { recorder, location } = setup();
    await recorder.startWalk();
    location.move({ distanceM: 10_000, durationSec: 1800 }); // 20km/h
    const done = await recorder.finishWalk();
    assert.equal(done.result.verified, false);
    assert.ok(done.result.reasons.some((r) => r.includes('7km')));
  });

  test('산책: 위치 권한이 없으면 에러가 나고 산책 중 상태가 남지 않는다', async () => {
    const { recorder, location } = setup();
    location.denyPermission = true;
    await assert.rejects(recorder.startWalk(), /위치 권한/);
    assert.equal(recorder.currentWalk(), null);
  });
});

describe('인증되면 물을 준다', () => {
  test('인증된 활동은 그 활동의 보상만큼 물을 준다 (독서 3)', async () => {
    const { recorder, watered } = setup();
    const r = await recorder.record({ type: 'reading', charCount: 250 });
    assert.equal(r.verified, true);
    assert.equal(r.waterGiven, 3);
    assert.deepEqual(watered, [{ verified: true, waterReward: 3 }]);
  });

  test('인증되지 않으면 물을 주지 않는다', async () => {
    const { recorder, watered } = setup();
    const r = await recorder.record({ type: 'reading', charCount: 10 });
    assert.equal(r.verified, false);
    assert.equal(r.waterGiven, 0);
    assert.deepEqual(watered, []);
  });

  test('물주기가 연결되지 않았으면 판정만 한다', async () => {
    const recorder = new ActivityRecorder({
      verifier: new ActivityVerifier(),
      loadActivityType: loadActivityTypeFromDb(),
      location: new FakeLocation(),
    });
    const r = await recorder.record({ type: 'diary', charCount: 5 });
    assert.equal(r.verified, true);
    assert.equal(r.waterGiven, 0);
  });
});

describe('sleepDurationMin', () => {
  test('자정을 넘기면 다음 날로 계산한다', () => {
    assert.equal(sleepDurationMin('23:30', '07:00'), 450);
    assert.equal(sleepDurationMin('01:00', '08:15'), 435);
  });
  test('형식이 틀리거나 같은 시각이면 null', () => {
    assert.equal(sleepDurationMin('25:00', '07:00'), null);
    assert.equal(sleepDurationMin('11시', '07:00'), null);
    assert.equal(sleepDurationMin('07:00', '07:00'), null);
  });
});
