import type { ActivityRepository } from '../data/ActivityRepository';

/** 로직 계층: 일·주간 활동 횟수와 받은 물의 양을 집계한다. (#12) */
export class StatsService {
  constructor(readonly activities: ActivityRepository) {}
}
