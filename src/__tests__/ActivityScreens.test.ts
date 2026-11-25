import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import type { WalkProgress, WalkSummary } from '../data/LocationRepository.ts';
import type { ActivityCode } from '../data/schema.ts';
import { pendingMigrations } from '../data/schema.ts';
import { ActivityRecorder } from '../logic/ActivityRecorder.ts';
import { ActivityVerifier } from '../logic/ActivityVerifier.ts';
import {
  clock,
  dotDate,
  fromWheel,
  km,
  resultView,
  toWheel,
  wheelLabel,
  writingCounter,
} from '../presentation/activityView.ts';

/**
 * Figma 시안 활동 화면 5개 (산책·명상·일기·독서·수면)와 그 상태들
 * 화면이 쓰는 글자·결과 모양과, 화면을 위해 ActivityRecorder에 더한 함수를 확인한다.
 */
function loadActivityTypeFromDb() {
  const db = new DatabaseSync(':memory:');
  for (const m of pendingMigrations(0)) db.exec(m.sql);
  const rows = db.prepare('SELECT code, rule, water_reward FROM activity_types').all() as {
    code: ActivityCode;
    rule: string;
    water_reward: number;
  }[];
  db.close();
  const types = new Map(rows.map((r) => [r.code, { rule: r.rule, waterReward: r.water_reward }]));
  return async (code: ActivityCode) => {
    const type = types.get(code);
    if (!type) throw new Error(`no activity type: ${code}`);
    return type;
  };
}

class FakeLocation {
  walking = false;
  stopped = 0;
  async startWalk(_onProgress?: (p: WalkProgress) => void) {
    this.walking = true;
  }
  async stopWalk(): Promise<WalkSummary> {
    this.walking = false;
    this.stopped++;
    return { distanceM: 1500, durationSec: 1500, startedAt: '', endedAt: '' };
  }
  isWalking() {
    return this.walking;
  }
}

function setup() {
  const location = new FakeLocation();
  const watered: number[] = [];
  const recorder = new ActivityRecorder({
    verifier: new ActivityVerifier(),
    loadActivityType: loadActivityTypeFromDb(),
    water: async ({ waterReward }) => {
      watered.push(waterReward);
      return { waterGiven: waterReward };
    },
    location,
  });
  return { recorder, location, watered };
}

describe('기록 결과를 시안 모양으로', () => {
  test('인증되고 물을 받으면 "오늘 ○○ 기록이 올라갔어요!"', () => {
    assert.deepEqual(resultView('walk', { verified: true, reasons: [], waterGiven: 3 }), {
      kind: 'success',
      message: '오늘 산책 기록이 올라갔어요!',
    });
    assert.equal((resultView('meditation', { verified: true, reasons: [], waterGiven: 1 }) as { message: string }).message, '오늘 명상 기록이 올라갔어요!');
  });

  test('인증되지 않으면 실패 카드에 이유를 그대로', () => {
    assert.deepEqual(
      resultView('meditation', { verified: false, reasons: ['명상 중에 화면을 조작했어요'], waterGiven: 0 }),
      { kind: 'failure', reasons: ['명상 중에 화면을 조작했어요'] },
    );
  });

  test('하루 한 번으로 물 0이면 하루 한 번 안내', () => {
    const notice = '오늘은 이미 일기로 물을 받았어요. 일기는 저장했고, 물은 내일 다시 받을 수 있어요';
    assert.deepEqual(resultView('diary', { verified: true, reasons: [], waterGiven: 0, notice }), {
      kind: 'notice',
      text: notice,
    });
  });

  test('독후감 200자 미만으로 저장만 됐으면 실패 카드가 아니라 안내', () => {
    const notice = '독후감은 저장했어요. 200자 이상 쓰면 인증되고 물을 받아요';
    assert.equal(
      resultView('reading', { verified: false, reasons: ['독후감이 200자보다 짧아요 (90자)'], waterGiven: 0, notice }).kind,
      'notice',
    );
  });
});

describe('글자 수 표시', () => {
  test('일기는 글자 수만 ("126자")', () => {
    assert.deepEqual(writingCounter(126, 1), { text: '126자', hint: null });
  });

  test('독후감은 "90 / 200자"와 남은 글자, 채우면 안내가 바뀐다', () => {
    assert.deepEqual(writingCounter(90, 200), { text: '90 / 200자', hint: '110자 더 쓰면 인증돼요' });
    assert.deepEqual(writingCounter(229, 200), { text: '229 / 200자', hint: '인증 기준을 채웠어요' });
  });
});

describe('수면 시각 휠', () => {
  test('"23:30"은 오후 11:30, "07:00"은 오전 7:00', () => {
    assert.deepEqual(toWheel('23:30'), { meridiem: '오후', hour: 11, minute: 30 });
    assert.deepEqual(toWheel('07:00'), { meridiem: '오전', hour: 7, minute: 0 });
    assert.equal(wheelLabel(toWheel('23:30')), '11:30');
  });

  test('자정·정오는 12시', () => {
    assert.deepEqual(toWheel('00:10'), { meridiem: '오전', hour: 12, minute: 10 });
    assert.deepEqual(toWheel('12:40'), { meridiem: '오후', hour: 12, minute: 40 });
  });

  test('휠 값을 기록 형식("HH:MM")으로 되돌린다', () => {
    for (const t of ['23:30', '07:00', '00:10', '12:40', '06:50']) assert.equal(fromWheel(toWheel(t)), t);
  });

  test('분은 10분 단위로 맞춘다', () => {
    assert.equal(toWheel('07:04').minute, 0);
    assert.equal(toWheel('07:06').minute, 10);
    assert.equal(toWheel('07:58').minute, 50);
  });
});

describe('표시 형식', () => {
  test('경과 시간·거리·날짜', () => {
    assert.equal(clock(754), '12:34');
    assert.equal(km(1200), '1.20km');
    assert.equal(dotDate(new Date(2026, 9, 27)), '2026.10.27');
  });
});

describe('화면을 위해 ActivityRecorder에 더한 것', () => {
  test('독후감 인증 기준 글자 수는 판정 규칙(DB)에서 읽는다 (200), 일기는 1', async () => {
    const { recorder } = setup();
    assert.equal(await recorder.writingGoal('reading'), 200);
    assert.equal(await recorder.writingGoal('diary'), 1);
  });

  test('수면 미리 판정: 7시간이면 인증 가능, 6시간 30분이면 안 됨 (기록·물주기는 하지 않는다)', async () => {
    const { recorder, watered } = setup();
    assert.equal((await recorder.previewSleep(420)).verified, true);
    assert.deepEqual((await recorder.previewSleep(390)).reasons, ['수면 시간이 7시간보다 짧아요 (6시간 30분)']);
    assert.deepEqual(watered, []);
  });

  test('산책 포기: 기록·물주기 없이 위치 수집만 멈춘다', async () => {
    const { recorder, location, watered } = setup();
    await recorder.startWalk();
    await recorder.cancelWalk();
    assert.equal(recorder.currentWalk(), null);
    assert.equal(location.stopped, 1);
    assert.deepEqual(watered, []);
  });

  test('산책 중이 아니면 포기해도 아무 일도 없다', async () => {
    const { recorder, location } = setup();
    await recorder.cancelWalk();
    assert.equal(location.stopped, 0);
  });
});
