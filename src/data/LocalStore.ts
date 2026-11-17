/**
 * 데이터 계층: 기기 밖으로 나가지 않는 개인 기록 저장소. (#10 [8] 일기 로컬 저장)
 *
 * 일기 본문은 여기에만 저장한다. 앱 DB(activity_logs)에는 "작성함, 몇 자"만 남긴다.
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

export interface LocalStore {
  /** 일기를 저장하고, 저장된 일기를 돌려준다 */
  saveDiary(body: string, charCount: number, writtenAt: Date): Promise<DiaryEntry>;
  /** 최근 일기부터 */
  listDiaries(limit?: number): Promise<DiaryEntry[]>;
  /** 일기 1편. 없으면 null */
  getDiary(id: number): Promise<DiaryEntry | null>;
}
