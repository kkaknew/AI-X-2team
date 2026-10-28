import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/**
 * 계층 규칙: 표현 → 로직 → 데이터, 한 방향으로만 의존한다.
 * Node.js 내장 테스트 러너로 실행한다 (`npm test`, src 폴더에서).
 */
const root = process.cwd();

function importsIn(layer: string): string[] {
  const dir = path.join(root, layer);
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(ts|tsx)$/.test(name))
    .flatMap((name) => fs.readFileSync(path.join(dir, name), 'utf8').split('\n'))
    .filter((line) => /^\s*import\b/.test(line));
}

const importsFrom = (lines: string[], ...layers: string[]) =>
  lines.filter((line) => layers.some((layer) => line.includes(`../${layer}/`)));

test('검사 대상 폴더가 모두 있다', () => {
  for (const layer of ['presentation', 'logic', 'data']) {
    assert.ok(fs.existsSync(path.join(root, layer)), `${layer} 폴더가 없습니다`);
  }
});

test('표현 계층은 데이터 계층을 직접 import하지 않는다', () => {
  assert.deepEqual(importsFrom(importsIn('presentation'), 'data'), []);
});

test('로직 계층은 표현 계층을 import하지 않는다', () => {
  assert.deepEqual(importsFrom(importsIn('logic'), 'presentation'), []);
});

test('데이터 계층은 로직·표현 계층을 import하지 않는다', () => {
  assert.deepEqual(importsFrom(importsIn('data'), 'logic', 'presentation'), []);
});
