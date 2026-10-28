import type { TreeRepository } from '../data/TreeRepository';

/**
 * 로직 계층: 마지막 인증 활동 후 기준 기간이 지나면 나무를 시듦 상태로 바꾼다. (#15)
 * 물주기 엔진과 실행 시점·바뀔 이유가 달라 별도 모듈로 둔다.
 */
export class WiltingChecker {
  constructor(readonly trees: TreeRepository) {}
}
