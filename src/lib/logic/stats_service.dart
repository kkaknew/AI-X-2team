import '../data/activity_repository.dart';

/// 로직 계층: 일·주간 활동 횟수와 받은 물의 양을 집계한다. (#12)
class StatsService {
  StatsService({required this.activities});

  final ActivityRepository activities;
}
