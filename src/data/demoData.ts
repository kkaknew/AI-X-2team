import type { SqlDatabase } from './SqliteTreeRepository';

/**
 * 데이터 계층: 개발·시연용 체험 기록. (화면 확인용, 실제 사용자 기능 아님)
 *
 * App.tsx가 개발 중(__DEV__)에만 "내 기록" 화면에 버튼으로 붙인다. 배포 앱에는 나오지 않는다.
 * - seedDemoData: 지난 2주치 산책·명상·일기·독후감·수면 기록을 넣고, 지금 나무를 다 자란 상태로 만든다.
 *   완성한 나무 1그루도 넣는다. 열매 5개, 달력, 책장, 기록 조회가 모두 채워진다.
 * - resetAllData: 활동 기록·나무·일기·독후감을 모두 지우고 새 씨앗 하나만 남긴다. (알림 설정은 그대로)
 * - setWater: 지금 나무의 물을 원하는 값으로 맞춘다 (단계 확인용)
 * - makeWilted: 지금 나무를 바로 시든 상태로 만든다 (시듦 화면 확인용)
 *
 * 앱 DB(app)와 개인 기록 DB(local)를 모두 건드린다. 둘 다 이 기기 안에만 있다.
 */

const USER_ID = 1;

/** 휴대폰 시간대로 daysAgo일 전 hour:minute */
function at(now: Date, daysAgo: number, hour: number, minute = 0): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute);
}

const DIARIES = [
  '퇴근길에 한 정거장 먼저 내려서 천천히 걸었다. 바람이 선선해서 머릿속이 맑아졌다.',
  '오늘은 일이 많았지만 저녁에 따뜻한 차를 마시며 하루를 정리했다. 내일은 조금 더 일찍 자야지.',
  '친구와 오랜만에 통화를 했다. 별 이야기 아니었는데도 마음이 가벼워졌다.',
  '아침에 명상을 하고 시작하니 하루가 덜 급하게 느껴졌다.',
  '비가 와서 산책을 못 했다. 대신 창가에서 책을 조금 읽었다.',
  '오랜만에 방 정리를 했다. 공간이 정돈되니 생각도 정돈되는 느낌이다.',
  '점심을 천천히 먹으려고 노력했다. 작은 일인데 기분이 좋았다.',
];

const BOOKS: { title: string; body: string }[] = [
  {
    title: '어린 왕자',
    body:
      '가장 중요한 것은 눈에 보이지 않는다는 말이 오래 남았다. 바쁘게 지내다 보면 정작 소중한 것을 놓치기 쉬운데, ' +
      '오늘은 잠깐 멈춰서 곁에 있는 사람들을 떠올렸다. 내일은 먼저 연락해 보려고 한다. 책장을 덮고 나니 마음이 한결 따뜻해졌다. ' +
      '다음에는 장미 이야기 부분을 다시 천천히 읽어 보고 싶다. 이 책은 어른이 되어서도 몇 번이고 다시 꺼내 읽게 될 것 같다. ' +
      '읽을 때마다 다른 문장이 마음에 남을 것이다.',
  },
  {
    title: '아주 작은 습관의 힘',
    body:
      '큰 목표보다 매일 1%씩 나아지는 작은 습관이 결국 큰 차이를 만든다는 이야기였다. 나무에 매일 물을 주는 것처럼, ' +
      '산책 10분이나 일기 몇 줄도 쌓이면 달라질 거라고 생각했다. 습관을 눈에 보이게 만들고, 쉽게 만들고, ' +
      '만족스럽게 만들라는 부분을 따라 해 보려고 한다. 오늘부터 잠들기 전에 휴대폰 대신 책을 두기로 했다. ' +
      '작은 변화라도 기록해 두면 나중에 얼마나 달라졌는지 볼 수 있을 것 같다.',
  },
  {
    title: '미움받을 용기',
    body:
      '다른 사람의 기대에 맞추려고 애쓰지 않아도 된다는 말이 위로가 되었다. 과제를 분리하라는 개념이 특히 기억에 남는다. ' +
      '내가 바꿀 수 있는 것과 없는 것을 구분하니 마음이 조금 편해졌다. 대화 형식이라 읽기 쉬웠고, ' +
      '읽는 내내 나에게 질문을 던지는 느낌이었다. 한 번 더 천천히 읽으면서 밑줄을 그어 보고 싶다. ' +
      '지금 행복해지기로 마음먹는 것도 용기라는 말이 오래 남았다.',
  },
];

const countChars = (text: string) => Array.from(text.trim()).length;

async function typeIds(app: SqlDatabase): Promise<Record<string, number>> {
  const rows = await app.getAllAsync<{ id: number; code: string }>('SELECT id, code FROM activity_types', []);
  return Object.fromEntries(rows.map((r) => [r.code, r.id]));
}

/** 지난 2주치 체험 기록을 넣고 지금 나무를 다 자란 상태로 만든다 */
export async function seedDemoData(app: SqlDatabase, local: SqlDatabase, now: Date = new Date()): Promise<void> {
  const ids = await typeIds(app);

  // 완성한 나무 1그루 (6주 전 심고 3주 전 완성)
  await app.runAsync(
    `INSERT INTO trees (user_id, stage_id, water_total, status, planted_at, last_watered_at, completed_at)
     VALUES (?, (SELECT id FROM growth_stages ORDER BY water_required DESC LIMIT 1), 100, 'completed', ?, ?, ?)`,
    [
      USER_ID,
      at(now, 42, 9).toISOString(),
      at(now, 21, 21).toISOString(),
      at(now, 21, 21).toISOString(),
    ],
  );

  // 지금 키우는 나무: 2주 전에 심었고 다 자랐다
  let tree = await app.getFirstAsync<{ id: number }>(
    "SELECT id FROM trees WHERE user_id = ? AND status != 'completed' ORDER BY id DESC LIMIT 1",
    [USER_ID],
  );
  if (!tree) {
    await app.runAsync("INSERT INTO trees (user_id, stage_id, status) VALUES (?, 1, 'growing')", [USER_ID]);
    tree = await app.getFirstAsync<{ id: number }>('SELECT last_insert_rowid() AS id', []);
  }
  const treeId = tree!.id;
  await app.runAsync(
    `UPDATE trees SET stage_id = (SELECT id FROM growth_stages ORDER BY water_required DESC LIMIT 1),
       water_total = 100, status = 'growing', planted_at = ?, last_watered_at = ?, completed_at = NULL
     WHERE id = ?`,
    [at(now, 14, 8).toISOString(), at(now, 0, 8).toISOString(), treeId],
  );

  /** 아직 오지 않은 시각의 기록은 넣지 않는다 (오늘 아침에 버튼을 눌러도 저녁 산책이 생기지 않게) */
  const happened = (end: Date) => end.getTime() <= now.getTime();

  const log = async (
    code: string,
    started: Date,
    fields: { ended?: Date | null; durationMin?: number | null; distanceM?: number | null; charCount?: number | null },
    verified = true,
    water = 1,
  ) => {
    if (!happened(fields.ended ?? started)) return false;
    await app.runAsync(
      `INSERT INTO activity_logs
         (user_id, tree_id, type_id, started_at, ended_at, duration_min, distance_m, char_count, verified, water_given)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        USER_ID,
        treeId,
        ids[code],
        started.toISOString(),
        fields.ended ? fields.ended.toISOString() : null,
        fields.durationMin ?? null,
        fields.distanceM ?? null,
        fields.charCount ?? null,
        verified ? 1 : 0,
        verified ? water : 0,
      ],
    );
    return true;
  };

  for (let d = 13; d >= 0; d--) {
    // 수면: 전날 밤 11시쯤 자서 아침에 일어남 (하루 한 번)
    const bed = at(now, d + 1, 23, (d * 7) % 50);
    const sleepMin = 390 + ((d * 37) % 120); // 6시간 30분 ~ 8시간 30분
    await log('sleep', bed, { ended: new Date(bed.getTime() + sleepMin * 60_000), durationMin: sleepMin }, sleepMin >= 420);

    // 산책: 이틀에 한 번
    if (d % 2 === 0) {
      const walkMin = 25 + (d % 4) * 5;
      const started = at(now, d, 19);
      await log(
        'walk',
        started,
        { ended: new Date(started.getTime() + walkMin * 60_000), durationMin: walkMin, distanceM: 1800 + d * 90 },
        true,
        3,
      );
    }

    // 명상: 거의 매일 (한 번은 중간에 화면을 만져 실패)
    if (d % 5 !== 4) await log('meditation', at(now, d, 7, 30), { durationMin: 3 }, d !== 9);

    // 일기: 매일 (오늘은 아직)
    if (d > 0) {
      const body = DIARIES[d % DIARIES.length];
      const written = at(now, d, 22, 10);
      if (!(await log('diary', written, { charCount: countChars(body) }))) continue;
      await local.runAsync('INSERT INTO diary_entries (written_at, body, char_count) VALUES (?, ?, ?)', [
        written.toISOString(),
        body,
        countChars(body),
      ]);
    }
  }

  // 독후감: 3권 (200자 이상)
  for (let i = 0; i < BOOKS.length; i++) {
    const { title, body } = BOOKS[i];
    const written = at(now, 2 + i * 4, 21);
    if (!(await log('reading', written, { charCount: countChars(body) }))) continue;
    await local.runAsync('INSERT INTO reading_entries (written_at, title, body, char_count) VALUES (?, ?, ?, ?)', [
      written.toISOString(),
      title,
      body,
      countChars(body),
    ]);
  }
}

/** 활동 기록·나무·일기·독후감을 모두 지우고 새 씨앗 하나만 심는다 (알림 설정은 그대로) */
export async function resetAllData(app: SqlDatabase, local: SqlDatabase, now: Date = new Date()): Promise<void> {
  await app.runAsync('DELETE FROM activity_logs', []);
  await app.runAsync('DELETE FROM trees', []);
  await app.runAsync(
    `INSERT INTO trees (user_id, stage_id, water_total, status, planted_at)
     VALUES (?, (SELECT id FROM growth_stages ORDER BY water_required ASC LIMIT 1), 0, 'growing', ?)`,
    [USER_ID, now.toISOString()],
  );
  await local.runAsync('DELETE FROM diary_entries', []);
  await local.runAsync('DELETE FROM reading_entries', []);
}

/**
 * 지금 키우는 나무의 물을 amount로 맞춘다 (0 이상). 단계도 그 물에 맞게 바뀌고,
 * 시들었으면 되살린다 (마지막 물 준 시각 = 지금). 활동 기록은 건드리지 않는다.
 */
export async function setWater(app: SqlDatabase, amount: number, now: Date = new Date()): Promise<void> {
  const water = Math.max(0, Math.floor(amount));
  await app.runAsync(
    `UPDATE trees
     SET water_total = ?,
         stage_id = (SELECT id FROM growth_stages WHERE water_required <= ? ORDER BY water_required DESC LIMIT 1),
         status = 'growing',
         last_watered_at = ?
     WHERE user_id = ? AND status IN ('growing', 'wilted')`,
    [water, water, now.toISOString(), USER_ID],
  );
}

/**
 * 지금 키우는 나무를 시든 상태로 만든다. 마지막 물 준 시각을 4일 전으로 돌려서
 * 앱을 다시 켜도 WiltingChecker가 그대로 시듦으로 판정한다. 물·단계·기록은 그대로.
 */
export async function makeWilted(app: SqlDatabase, now: Date = new Date()): Promise<void> {
  const longAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();
  await app.runAsync(
    `UPDATE trees
     SET status = 'wilted',
         last_watered_at = ?,
         planted_at = CASE WHEN planted_at > ? THEN ? ELSE planted_at END
     WHERE user_id = ? AND status IN ('growing', 'wilted')`,
    [longAgo, longAgo, longAgo, USER_ID],
  );
}
