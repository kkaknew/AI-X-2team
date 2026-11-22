/**
 * 데이터 계층: 기기 로컬 알림 예약. (#15 [13] 물주기 리마인더, #17 시듦 경고)
 * 서버 푸시가 아니라 휴대폰 안에서 예약하는 로컬 알림이다 (CLAUDE.md "데이터 저장" 참고).
 * 알림 서비스 종류(지금은 expo-notifications)는 구현(ExpoPushClient.ts) 안에 숨긴다.
 */

/** 매일 같은 시각에 오는 알림 1개 */
export interface DailyNotification {
  /** 같은 id로 다시 예약하면 앞의 것을 바꾼다 */
  id: string;
  hour: number;
  minute: number;
  title: string;
  body: string;
}

export interface PushClient {
  /** 이미 알림 권한이 있는가 (묻지 않는다) */
  hasPermission(): Promise<boolean>;
  /** 알림 권한을 확인하고, 없으면 사용자에게 묻는다. 허용되면 true */
  requestPermission(): Promise<boolean>;
  /** 매일 같은 시각 알림을 예약한다. 같은 id가 있으면 바꾼다 */
  scheduleDaily(notification: DailyNotification): Promise<void>;
  /** at 시각에 한 번만 오는 알림을 예약한다. 같은 id가 있으면 바꾼다 (#17 시듦 경고) */
  scheduleOnce(id: string, at: Date, title: string, body: string): Promise<void>;
  /** 예약한 알림을 취소한다. 없으면 아무것도 하지 않는다 */

  cancel(id: string): Promise<void>;
}
