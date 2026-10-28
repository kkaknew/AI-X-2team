import fs from 'fs';
import path from 'path';

/** 계층 규칙: 표현 → 로직 → 데이터, 한 방향으로만 의존한다. */
const root = path.join(__dirname, '..');

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

test('표현 계층은 데이터 계층을 직접 import하지 않는다', () => {
  expect(importsFrom(importsIn('presentation'), 'data')).toEqual([]);
});

test('로직 계층은 표현 계층을 import하지 않는다', () => {
  expect(importsFrom(importsIn('logic'), 'presentation')).toEqual([]);
});

test('데이터 계층은 로직·표현 계층을 import하지 않는다', () => {
  expect(importsFrom(importsIn('data'), 'logic', 'presentation')).toEqual([]);
});
