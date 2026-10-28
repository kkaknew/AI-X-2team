import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:dopamine_tree/main.dart';

void main() {
  testWidgets('앱이 실행되고 하단 탭 3개가 보인다', (tester) async {
    await tester.pumpWidget(const DopamineTreeApp());

    expect(find.text('나무'), findsWidgets);
    expect(find.text('활동 기록'), findsWidgets);
    expect(find.text('기록 조회'), findsWidgets);
  });

  testWidgets('탭을 누르면 해당 화면으로 바뀐다', (tester) async {
    await tester.pumpWidget(const DopamineTreeApp());

    expect(find.text('나무 화면'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.add_task));
    await tester.pumpAndSettle();
    expect(find.text('활동 기록 화면'), findsOneWidget);
  });
}
