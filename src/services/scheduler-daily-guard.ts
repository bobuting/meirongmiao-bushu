/**
 * 每日调度器分布式锁服务
 * 使用 PostgreSQL Advisory Lock 防止多进程并发执行同一调度任务
 *
 * 原理：
 * - pg_try_advisory_lock 是非阻塞的原子操作，只有一个进程能获取锁
 * - 锁 ID 由「调度器名称 hash + 当天日期」生成，每天自动变化
 * - session 级锁在进程崩溃或连接断开时自动释放
 */

import type { Pool } from "pg";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("scheduler-daily-guard");

/** 调度器名称常量，统一管理 */
export const SCHEDULER_NAMES = {
  CREATOR_DISCOVERY: "creator_discovery",
  TEMPLATE_AUTO_PUBLISH: "template_auto_publish",
  AESTHETIC_LIBRARY: "aesthetic_library",
  SCENE_LIBRARY: "scene_library",
  HOT_TREND_DAILY: "hot_trend_daily",
  VIDEO_MUSIC_SYNC: "video_music_sync",
  DELETED_DATA_CLEANUP: "deleted_data_cleanup",
  ERROR_LOG_CLEANUP: "error_log_cleanup",
  EMOTION_ARCHETYPE_LIBRARY: "emotion_archetype_library",
  EMOTION_ARCHETYPE_EXTRACTION: "emotion_archetype_extraction",
} as const;

export type SchedulerName = (typeof SCHEDULER_NAMES)[keyof typeof SCHEDULER_NAMES];

export class SchedulerDailyGuard {
  constructor(private readonly pool: Pool) {}

  /**
   * 尝试获取当日执行锁
   * @returns lockId（用于释放锁），如果获取失败返回 null
   */
  async tryAcquire(schedulerName: SchedulerName): Promise<number | null> {
    const lockId = this.generateLockId(schedulerName);
    const result = await this.pool.query("SELECT pg_try_advisory_lock($1) as acquired", [lockId]);

    if (result.rows[0].acquired) {
      log.info({ schedulerName, lockId }, "获取调度器执行锁成功");
      return lockId;
    }

    log.info({ schedulerName, lockId }, "其他进程正在执行，跳过");
    return null;
  }

  /** 释放执行锁 */
  async release(lockId: number): Promise<void> {
    await this.pool.query("SELECT pg_advisory_unlock($1)", [lockId]);
    log.info({ lockId }, "释放调度器执行锁");
  }

  /**
   * 生成基于「调度器名称 + 当天日期」的锁 ID
   * 保证同一天、同一调度器的锁 ID 一致，不同天自动变化
   *
   * PostgreSQL Advisory Lock 要求 int4 范围 [-2147483648, 2147483647]
   * 使用年份后2位 + 月日 + 名称hash，确保不超过 int4 上限
   */
  private generateLockId(name: SchedulerName): number {
    const now = new Date();
    // 格式：YYMMDD（6位数字，最大 991231 = 99年12月31日）
    const dateNum = (now.getFullYear() % 100) * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

    // 名称hash到1-999范围（3位数字）
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    const nameNum = (Math.abs(hash) % 999) + 1;

    // 最终：YYMMDD * 1000 + 名称hash = 最大 991231000 + 999 = 99,123,1999 ≈ 9.9亿 < int4上限
    return dateNum * 1000 + nameNum;
  }
}
