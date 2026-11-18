import type { PushClient } from '../data/PushClient';
import type { ReminderRepository, ReminderSetting } from '../data/ReminderRepository';

export type { ReminderSetting };

/**
 * 로직 계층: 물주기 리마인더. (#15 [13] 물주기 리마인더)
 * 완료 조건: 사용자가 설정한 시각에 푸시 알림이 온다.
 *
 * - 설정(시각, 켜짐 여부)은 ReminderRepository(reminders 테이블)에 저장한다.
 * - 알림은 PushClient로 매일 그 시각에 오도록 기기에 예약한다. 서버는 쓰지 않는다.
 * - 앱을 켤 때 restore()로 저장된 설정대로 다시 예약한다 (앱 재설치·업데이트 뒤에도 맞게).
 * 시듦 경고 알림(#17)도 나중에 여기에 붙이면 된다.
 */

/** 처음 설정 화면을 열었을 때 보여줄 기본값. 저장하기 전에는 알림이 오지 않는다 */
export const DEFAULT_REMINDER: ReminderSetting = { time: '21:00', enabled: false };

/** 예약할 때 쓰는 알림 id. 같은 id로 다시 예약하면 앞의 것이 바뀐다 */
export const WATERING_REMINDER_ID = 'watering-reminder';

export const REMINDER_TITLE = '🌱 오늘 나무에 물 주셨나요?';
export const REMINDER_BODY = '산책·일기·명상·독서·수면 중 하나를 기록하고 물을 주세요.';

/** 알림 권한이 없어 켤 수 없을 때 */
export class NotificationPermissionError extends Error {
  constructor() {
    super('알림 권한이 꺼져 있어요. 휴대폰 설정 → 앱 → 알림에서 허용해 주세요');
    this.name = 'NotificationPermissionError';
  }
}

/** "HH:MM"을 시·분으로. 형식이 틀리면 null. 한 자리 시(9:05)도 받는다 */
export function parseReminderTime(text: string): { hour: number; minute: number } | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(text);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

const pad = (n: number) => String(n).padStart(2, '0');

export class ReminderService {
  readonly push: PushClient;
  private readonly repo: ReminderRepository;

  constructor(deps: { push: PushClient; repo: ReminderRepository }) {
    this.push = deps.push;
    this.repo = deps.repo;
  }

  /** 지금 설정. 저장한 적 없으면 기본값(꺼짐) */
  async getSetting(): Promise<ReminderSetting> {
    return (await this.repo.getWateringReminder()) ?? DEFAULT_REMINDER;
  }

  /**
   * 설정을 저장하고 알림을 예약(켜짐) 또는 취소(꺼짐)한다. 저장된 설정을 돌려준다.
   * 시각 형식이 틀리면 Error, 켜려는데 알림 권한이 없으면 NotificationPermissionError.
   * 권한이 없으면 저장도 하지 않는다 (켜졌다고 보이는데 알림이 안 오는 일이 없게).
   */
  async update(time: string, enabled: boolean): Promise<ReminderSetting> {
    const parsed = parseReminderTime(time);
    if (!parsed) throw new Error('시각을 21:00처럼 "시:분" 형식으로 입력해 주세요');
    const setting: ReminderSetting = { time: `${pad(parsed.hour)}:${pad(parsed.minute)}`, enabled };

    if (enabled) {
      if (!(await this.push.requestPermission())) throw new NotificationPermissionError();
      await this.push.scheduleDaily({
        id: WATERING_REMINDER_ID,
        ...parsed,
        title: REMINDER_TITLE,
        body: REMINDER_BODY,
      });
    } else {
      await this.push.cancel(WATERING_REMINDER_ID);
    }
    await this.repo.saveWateringReminder(setting);
    return setting;
  }

  /**
   * 앱을 켤 때 저장된 설정대로 알림을 다시 예약한다.
   * 권한을 새로 묻지는 않는다 (앱을 켜자마자 권한 창이 뜨지 않게). 권한이 없으면 예약하지 않는다.
   */
  async restore(): Promise<void> {
    const saved = await this.repo.getWateringReminder();
    if (!saved || !saved.enabled) return;
    const parsed = parseReminderTime(saved.time);
    if (!parsed) return;
    if (!(await this.push.hasPermission())) return;
    await this.push.scheduleDaily({
      id: WATERING_REMINDER_ID,
      ...parsed,
      title: REMINDER_TITLE,
      body: REMINDER_BODY,
    });
  }
}
