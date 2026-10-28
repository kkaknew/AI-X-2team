import 'package:flutter/material.dart';

import 'presentation/activity_screen.dart';
import 'presentation/history_screen.dart';
import 'presentation/tree_screen.dart';

void main() {
  runApp(const DopamineTreeApp());
}

class DopamineTreeApp extends StatelessWidget {
  const DopamineTreeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '도파민 나무',
      theme: ThemeData(colorSchemeSeed: Colors.green, useMaterial3: true),
      home: const HomeShell(),
    );
  }
}

/// 하단 탭으로 세 화면을 오가는 뼈대.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _screens = <Widget>[
    TreeScreen(),
    ActivityScreen(),
    HistoryScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(child: _screens[_index]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.park_outlined), label: '나무'),
          NavigationDestination(icon: Icon(Icons.add_task), label: '활동 기록'),
          NavigationDestination(icon: Icon(Icons.bar_chart), label: '기록 조회'),
        ],
      ),
    );
  }
}
