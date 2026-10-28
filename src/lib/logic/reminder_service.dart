import '../data/push_client.dart';

/// 로직 계층: 물주기 리마인더와 시듦 경고 알림을 예약한다. (#13, #15)
class ReminderService {
  ReminderService({required this.push});

  final PushClient push;
}
