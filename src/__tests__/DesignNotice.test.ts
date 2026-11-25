import assert from 'node:assert/strict';
import { test } from 'node:test';

import { splitNotice } from '../presentation/ui/notice.ts';

/**
 * 시안의 "하루 한 번 안내"는 제목 + 설명 두 줄이다.
 * 앱의 안내 문구(ActivityRecorder의 notice)를 첫 문장과 나머지로 나눠 넣는다.
 */
test('첫 문장은 제목, 나머지는 설명이 된다', () => {
  assert.deepEqual(
    splitNotice('오늘은 이미 일기로 물을 받았어요. 일기는 저장했고, 물은 내일 다시 받을 수 있어요'),
    { title: '오늘은 이미 일기로 물을 받았어요', description: '일기는 저장했고, 물은 내일 다시 받을 수 있어요' },
  );
});

test('문장이 하나면 설명은 없다', () => {
  assert.deepEqual(splitNotice('오늘 기록이 올라갔어요'), { title: '오늘 기록이 올라갔어요', description: null });
});

test('설명이 여러 문장이어도 첫 문장만 제목이 된다', () => {
  assert.deepEqual(splitNotice('독후감은 저장했어요. 200자 이상 쓰면 인증돼요. 물도 받아요'), {
    title: '독후감은 저장했어요',
    description: '200자 이상 쓰면 인증돼요. 물도 받아요',
  });
});
