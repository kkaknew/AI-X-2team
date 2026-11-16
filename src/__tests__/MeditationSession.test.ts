import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';

import type { MeditationPlayer } from '../data/MeditationPlayer.ts';
import { pendingMigrations } from '../data/schema.ts';
import { ActivityVerifier } from '../logic/ActivityVerifier.ts';
import type { MeditationInput } from '../logic/MeditationSession.ts';
import { MeditationSession } from '../logic/MeditationSession.ts';

/**
 * #11 [9] 명상 인증
 * 완료 조건: 정해진 클래식 음악이 끝까지 재생되는 동안 다른 조작이 없으면 인증된다.
 *           도중에 앱을 벗어나거나 화면을 조작하면 실패 처리된다.
 *
 * 음악은 가짜 재생기로 대신하고, 판정은 앱과 같은 DB 초기 데이터(activity_types.rule)로 한다.
 */
function meditationRuleFromDb(): string {
  const db = new DatabaseSync(':memory:');
  for (const m of pendingMigrations(0)) db.exec(m.sql);
  const row = db.prepare("SELECT rule FROM activity_types WHERE code = 'meditation'").get() as { rule: string };
  db.close();
  return row.rule;
}

const RULE = meditationRuleFromDb();
const verifier = new ActivityVerifier();
const judge = (input: MeditationInput) => verifier.verify(input, RULE);

/** 진짜 음악 대신 쓰는 가짜 재생기. end()를 부르면 곡이 끝까지 재생된 것으로 본다 */
class FakePlayer implements MeditationPlayer {
  readonly credit = '음악: 테스트 곡 · CC BY';
  playing = false;
  plays = 0;
  stops = 0;
  failToLoad = false;
  private onEnd: (() => void) | null = null;

  async play(onEnd: () => void) {
    if (this.failToLoad) throw new Error('명상 음악을 불러오지 못했어요');
    this.plays++;
    this.playing = true;
    this.onEnd = onEnd;
    return { durationSec: 180 };
  }
  async stop() {
    this.stops++;
    this.playing = false;
    this.onEnd = null;
  }
  end() {
    const onEnd = this.onEnd;
    this.playing = false;
    this.onEnd = null;
    onEnd?.();
  }
}

function setup() {
  const player = new FakePlayer();
  let clock = 1_000_000;
  const session = new MeditationSession({ player, now: () => clock, touchGraceMs: 500 });
  const finished: MeditationInput[] = [];
  const start = () => session.start((input) => finished.push(input));
  const wait = (ms: number) => {
    clock += ms;
  };
  return { player, session, finished, start, wait };
}

describe('음악이 끝까지 재생되면', () => {
  test('조작 없이 끝까지 들으면 인증된다', async () => {
    const { player, finished, start, wait } = setup();
    await start();
    wait(180_000);
    player.end();
    assert.equal(finished.length, 1);
    assert.deepEqual(finished[0], { type: 'meditation', fullyPlayed: true, touched: false, leftApp: false });
    assert.deepEqual(judge(finished[0]), { verified: true, reasons: [] });
  });

  test('시작하면 곡 길이를 알려준다 (남은 시간 표시용)', async () => {
    const { session, start } = setup();
    const state = await start();
    assert.equal(state.durationSec, 180);
    assert.deepEqual(session.current(), state);
  });

  test('화면에 보여줄 음악 출처 표기를 알려준다 (CC BY 라이선스)', () => {
    const { session } = setup();
    assert.equal(session.credit(), '음악: 테스트 곡 · CC BY');
  });

  test('끝나면 진행 중인 명상이 없어진다', async () => {
    const { player, session, start } = setup();
    await start();
    player.end();
    assert.equal(session.current(), null);
  });
});

describe('도중에 화면을 조작하면 실패', () => {
  test('재생 중에 화면을 만지면 인증되지 않는다', async () => {
    const { player, session, finished, start, wait } = setup();
    await start();
    wait(60_000);
    session.touch();
    player.end();
    assert.equal(finished[0].touched, true);
    assert.deepEqual(judge(finished[0]).reasons, ['명상 중에 화면을 조작했어요']);
  });

  test('시작 버튼을 누른 직후의 터치는 세지 않는다', async () => {
    const { player, session, finished, start, wait } = setup();
    await start();
    wait(200);
    session.touch();
    player.end();
    assert.equal(judge(finished[0]).verified, true);
  });

  test('명상 중이 아닐 때의 터치는 다음 명상에 영향이 없다', async () => {
    const { player, session, finished, start, wait } = setup();
    session.touch();
    await start();
    wait(1000);
    player.end();
    session.touch();
    assert.equal(finished[0].touched, false);
  });
});

describe('도중에 앱을 벗어나면 실패', () => {
  test('다른 앱으로 나갔다 돌아오면 인증되지 않는다', async () => {
    const { player, session, finished, start } = setup();
    await start();
    session.appStateChanged('background');
    session.appStateChanged('active');
    player.end();
    assert.equal(finished[0].leftApp, true);
    assert.deepEqual(judge(finished[0]).reasons, ['명상 중에 앱을 벗어났어요']);
  });

  test('알림창을 내리는 등 잠깐 비활성(inactive)이 돼도 벗어난 것으로 본다', async () => {
    const { player, session, finished, start } = setup();
    await start();
    session.appStateChanged('inactive');
    player.end();
    assert.equal(judge(finished[0]).verified, false);
  });

  test('화면 조작과 앱 이탈이 둘 다 있으면 이유를 둘 다 알려준다', async () => {
    const { player, session, finished, start, wait } = setup();
    await start();
    wait(10_000);
    session.touch();
    session.appStateChanged('background');
    player.end();
    assert.deepEqual(judge(finished[0]).reasons, ['명상 중에 화면을 조작했어요', '명상 중에 앱을 벗어났어요']);
  });
});

describe('중간에 그만두기·취소', () => {
  test('그만두면 음악이 멈추고, 끝까지 듣지 못해 인증되지 않는다', async () => {
    const { player, session, finished, start } = setup();
    await start();
    const input = await session.giveUp();
    assert.ok(input);
    assert.equal(player.playing, false);
    assert.deepEqual(judge(input).reasons, ['음악이 끝까지 재생되지 않았어요']);
    assert.equal(finished.length, 0, '음악 끝 알림은 오지 않는다');
  });

  test('화면을 떠나 취소하면 음악이 멈추고 아무것도 기록되지 않는다', async () => {
    const { player, session, finished, start } = setup();
    await start();
    await session.cancel();
    player.end(); // 늦게 온 끝 알림
    assert.equal(player.playing, false);
    assert.equal(finished.length, 0);
    assert.equal(session.current(), null);
  });

  test('진행 중이 아닐 때 그만두면 null', async () => {
    const { session } = setup();
    assert.equal(await session.giveUp(), null);
  });

  test('명상 중에 또 시작할 수 없다', async () => {
    const { start } = setup();
    await start();
    await assert.rejects(start(), /이미 명상 중입니다/);
  });

  test('한 번 끝난 뒤에는 다시 시작할 수 있고, 이전 기록은 섞이지 않는다', async () => {
    const { player, session, finished, start, wait } = setup();
    await start();
    wait(10_000);
    session.touch();
    player.end();
    await start();
    player.end();
    assert.equal(finished.length, 2);
    assert.equal(finished[0].touched, true);
    assert.equal(finished[1].touched, false);
    assert.equal(judge(finished[1]).verified, true);
  });

  test('음악을 불러오지 못하면 시작되지 않는다', async () => {
    const { player, session, start } = setup();
    player.failToLoad = true;
    await assert.rejects(start(), /음악을 불러오지 못했어요/);
    assert.equal(session.current(), null);
  });
});
