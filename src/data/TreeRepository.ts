/**
 * 데이터 계층: 기기 SQLite의 trees, growth_stages 접근. (#4, #7)
 * DB 종류(지금은 SQLite)는 구현 안에 숨긴다. 로직 계층은 이 인터페이스만 안다.
 * SQLite 구현: SqliteTreeRepository.ts
 */

export type TreeStatus = 'growing' | 'wilted' | 'completed';

/** 나무 1그루의 현재 상태 (trees 테이블 1행) */
export interface TreeState {
  id: number;
  stageId: number;
  waterTotal: number;
  status: TreeStatus;
  /** 마지막으로 물을 받은 시각 (ISO 문자열). 아직 없으면 null */
  lastWateredAt: string | null;
}

/** 성장 단계 1개 (growth_stages 테이블 1행) */
export interface GrowthStage {
  id: number;
  name: string;
  /** 이 단계가 되는 데 필요한 누적 물의 양 */
  waterRequired: number;
}

/** 물을 준 뒤 저장할 값 */
export interface WateringUpdate {
  stageId: number;
  waterTotal: number;
  lastWateredAt: string;
}

export interface TreeRepository {
  /** 지금 키우고 있는 나무 (완료되지 않은 가장 최근 나무). 없으면 null */
  getActiveTree(): Promise<TreeState | null>;
  /** 모든 성장 단계 */
  getStages(): Promise<GrowthStage[]>;
  /** 물을 준 결과를 저장한다 */
  saveWatering(treeId: number, update: WateringUpdate): Promise<void>;
}
