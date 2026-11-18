import type { ActivityCode } from './schema';

/**
 * 데이터 계층: 기기 SQLite의 activity_logs 접근. (#4, #13)
 * DB 종류(지금은 SQLite)는 구현 안에 숨긴다. 나중에 서버로 바꿔도 로직 계층은 그대로다.
 * SQLite 구현: SqliteActivityRepository.ts
 *
 * 원본(GPS 좌표, 일기·독후감 본문)은 여기 저장하지 않는다. 거리·시간·글자 수 같은 결과만 남긴다.
 */

/** 새로 저장할 활동 기록 1건 */
export interface NewActivityLog {
  type: ActivityCode;
  /** 시작 시각 (ISO). 수면이면 잠든 시각 */
  startedAt: string;
  /** 끝난 시각 (ISO). 수면이면 일어난 시각 */
  endedAt: string | null;
  durationMin: number | null;
  distanceM?: number | null;
  charCount?: number | null;
  verified: boolean;
  /** 이 기록으로 나무에 준 물 */
  waterGiven: number;
}

/** 저장된 활동 기록 1건 (activity_logs 1행) */
export interface ActivityLog extends NewActivityLog {
  id: number;
}

export interface ActivityRepository {
  /** 기록 1건을 저장하고 id를 돌려준다. 지금 키우는 나무에 연결된다. */
  addLog(log: NewActivityLog): Promise<number>;
  /** 같은 종류의 기록 중 [startedAt, endedAt) 구간과 시간이 겹치는 것 */
  findOverlapping(type: ActivityCode, startedAt: string, endedAt: string): Promise<ActivityLog[]>;
  /** 같은 종류의 최근 기록 (최근 것부터) */
  recentLogs(type: ActivityCode, limit: number): Promise<ActivityLog[]>;
  /** 모든 종류의 기록 중 시작 시각이 [from, to) 안에 있는 것 (오래된 것부터). 기록 조회(#14)용 */
  logsBetween(from: string, to: string): Promise<ActivityLog[]>;
}
