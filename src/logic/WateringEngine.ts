import type { ActivityRepository } from '../data/ActivityRepository';
import type { TreeRepository } from '../data/TreeRepository';

/**
 * 로직 계층: 인증된 활동 1건당 물을 지급하고 성장 단계를 올린다. (#5, #14)
 * 어떤 활동이었는지, 데이터가 어디서 왔는지는 알 필요가 없다.
 */
export class WateringEngine {
  constructor(
    readonly trees: TreeRepository,
    readonly activities: ActivityRepository,
  ) {}
}
