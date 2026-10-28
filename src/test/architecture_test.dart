import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 계층 규칙: 표현 → 로직 → 데이터, 한 방향으로만 의존한다.
List<String> importsIn(String dir) {
  return Directory(dir)
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'))
      .expand((f) => f.readAsLinesSync())
      .where((line) => line.startsWith('import '))
      .toList();
}

void main() {
  test('표현 계층은 데이터 계층을 직접 import하지 않는다', () {
    expect(importsIn('lib/presentation').where((l) => l.contains('data/')), isEmpty);
  });

  test('로직 계층은 표현 계층을 import하지 않는다', () {
    expect(importsIn('lib/logic').where((l) => l.contains('presentation/')), isEmpty);
  });

  test('데이터 계층은 로직·표현 계층을 import하지 않는다', () {
    expect(
      importsIn('lib/data')
          .where((l) => l.contains('logic/') || l.contains('presentation/')),
      isEmpty,
    );
  });
}
