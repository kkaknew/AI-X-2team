import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { DailyNotification, PushClient } from './PushClient';

/**
 * 데이터 계층: PushClient의 expo-notifications 구현. (#15, #17)
 * 서버를 거치지 않는 기기 로컬 알림만 쓴다. 푸시 토큰은 받지 않는다.
 */

/** 안드로이드 알림 채널 (설정 → 알림에 이 이름으로 보인다) */
const CHANNEL_ID = 'reminders';

// 앱을 켜 둔 상태에서도 알림이 화면 위에 뜨게 한다
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export class ExpoPushClient implements PushClient {
  private channelReady: Promise<void> | null = null;

  private ensureChannel(): Promise<void> {
    if (Platform.OS !== 'android') return Promise.resolve();
    this.channelReady ??= Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: '물주기 알림',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).then(() => undefined);
    return this.channelReady;
  }

  async hasPermission(): Promise<boolean> {
    return (await Notifications.getPermissionsAsync()).granted;
  }

  async requestPermission(): Promise<boolean> {
    await this.ensureChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  }

  async scheduleDaily({ id, hour, minute, title, body }: DailyNotification): Promise<void> {
    await this.ensureChannel();
    await Notifications.cancelScheduledNotificationAsync(id);
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: CHANNEL_ID,
      },
    });
  }

  async scheduleOnce(id: string, at: Date, title: string, body: string): Promise<void> {
    await this.ensureChannel();
    await Notifications.cancelScheduledNotificationAsync(id);
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        channelId: CHANNEL_ID,
      },
    });
  }

  async cancel(id: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(id);
  }
}
