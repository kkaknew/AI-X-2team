/**
 * 데이터 계층: 기기 밖으로 나가지 않는 개인 기록 저장소. (#10 [8] 일기 로컬 저장, #12 [10] 독서 인증)
 *
 * 일기·독후감 본문은 여기에만 저장한다. 앱 DB(activity_logs)에는 "작성함, 몇 자"만 남긴다.
 * 나중에 서버 공유·동기화가 생겨도 이 저장소는 보내지 않는다. (CLAUDE.md 개인정보 원칙)
 * SQLite 구현: SqliteLocalStore.ts (앱 DB와 다른 파일 dopamine-tree-local.db)
 */

/** 일기 1편 */
export interface DiaryEntry {
  id: number;
  /** 작성 시각 (ISO 문자열) */
  writtenAt: string;
  body: string;
  charCount: number;
}

/** 독후감 1편 */
export interface ReadingEntry {
  id: number;
  /** 작성 시각 (ISO 문자열) */
  writtenAt: string;
  /** 책 제목. 안 적었으면 빈 문자열 */
  title: string;
  body: string;
  charCount: number;
}

export interface LocalStore {
  /** 일기를 저장하고, 저장된 일기를 돌려준다 */
  saveDiary(body: string, charCount: number, writtenAt: Date): Promise<DiaryEntry>;
  /** 최근 일기부터 */
  listDiaries(limit?: number): Promise<DiaryEntry[]>;
  /** 일기 1편. 없으면 null */
  getDiary(id: number): Promise<DiaryEntry | null>;
  /** 독후감을 저장하고, 저장된 독후감을 돌려준다 */
  saveReading(title: string, body: string, charCount: number, writtenAt: Date): Promise<ReadingEntry>;
  /** 최근 독후감부터 */
  listReadings(limit?: number): Promise<ReadingEntry[]>;
}
