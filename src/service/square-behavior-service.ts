/**
 * 广场行为追踪服务
 * 负责记录用户在广场中的浏览和点击行为，并异步触发偏好更新
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { AppError } from "../core/errors.js";
import { getLogger } from "../core/logger/index.js";
import {
  PgSquareBehaviorLogRepository,
  type SquareBehaviorLog,
  type ItemType,
  type BehaviorType,
} from "../repositories/pg/square-behavior-log-pg-repository.js";
import { UserPreferenceService } from "./user-preference-service.js";

const log = getLogger("square-behavior-service");

// ============================================================================
// 类型定义
// ============================================================================

/** 行为追踪输入参数 */
export interface TrackBehaviorInput {
  userId: string;
  itemId: string;
  itemType: ItemType;
  itemCategory: string; // 模板/作品使用服装分类，热榜使用来源平台名称
  behaviorType: BehaviorType;
  sessionId?: string;
}

/** 批量行为追踪输入参数 */
export interface TrackBehaviorBatchInput {
  userId: string;
  items: Array<{
    itemId: string;
    itemType: ItemType;
    itemCategory: string; // 模板/作品使用服装分类，热榜使用来源平台名称
    behaviorType: BehaviorType;
  }>;
  sessionId?: string;
}

/** 行为追踪结果 */
export interface TrackBehaviorResult {
  success: boolean;
  logId?: string;
}

/** 批量行为追踪结果 */
export interface TrackBehaviorBatchResult {
  success: boolean;
  count: number;
}

/** 日志清理结果 */
export interface CleanupResult {
  success: boolean;
  deletedCount: number;
}

// ============================================================================
// 常量定义
// ============================================================================

/** 日志保留天数（默认 30 天） */
const DEFAULT_RETENTION_DAYS = 30;

/** 有效内容类型列表 */
const VALID_ITEM_TYPES: ItemType[] = ["template", "hot_trend", "user_work"];

/** 有效行为类型列表 */
const VALID_BEHAVIOR_TYPES: BehaviorType[] = ["view", "click"];

// ============================================================================
// 服务接口
// ============================================================================

/**
 * 广场行为追踪服务接口
 */
export interface ISquareBehaviorService {
  /** 记录单个用户行为 */
  trackBehavior(input: TrackBehaviorInput): Promise<TrackBehaviorResult>;

  /** 批量记录用户行为 */
  trackBehaviorBatch(input: TrackBehaviorBatchInput): Promise<TrackBehaviorBatchResult>;

  /** 清理过期日志 */
  cleanupOldLogs(retentionDays?: number): Promise<CleanupResult>;
}

// ============================================================================
// 服务实现
// ============================================================================

/**
 * 广场行为追踪服务实现
 *
 * 功能：
 * 1. 记录用户浏览和点击行为
 * 2. 批量记录行为（提高性能）
 * 3. 清理过期日志
 * 4. 异步触发偏好更新（不阻塞响应）
 */
export class SquareBehaviorService implements ISquareBehaviorService {
  private behaviorLogRepo: PgSquareBehaviorLogRepository;
  private preferenceService: UserPreferenceService;

  constructor(pool: Pool) {
    this.behaviorLogRepo = new PgSquareBehaviorLogRepository(pool);
    this.preferenceService = new UserPreferenceService(pool);
  }

  /**
   * 记录单个用户行为
   * 写入行为日志，并异步触发偏好更新
   */
  async trackBehavior(input: TrackBehaviorInput): Promise<TrackBehaviorResult> {
    // 参数校验
    const validationError = this.validateInput(input);
    if (validationError) {
      throw new AppError(400, "VALIDATION_ERROR", validationError);
    }

    // 构建行为日志实体
    const logId = randomUUID();
    const log: SquareBehaviorLog = {
      id: logId,
      userId: input.userId,
      itemId: input.itemId,
      itemType: input.itemType,
      itemCategory: input.itemCategory,
      behaviorType: input.behaviorType,
      sessionId: input.sessionId,
      createdAt: Date.now(),
    };

    // 写入数据库（使用 batchInsert 处理单个记录）
    await this.behaviorLogRepo.batchInsert([log]);

    // 异步触发偏好更新（不阻塞响应）
    this.triggerPreferenceUpdate(input.userId);

    return { success: true, logId };
  }

  /**
   * 批量记录用户行为
   * 用于前端批量上报行为日志，提高性能
   */
  async trackBehaviorBatch(input: TrackBehaviorBatchInput): Promise<TrackBehaviorBatchResult> {
    // 参数校验
    if (!input.userId || !input.items || input.items.length === 0) {
      throw new AppError(400, "VALIDATION_ERROR", "userId and items are required");
    }

    const now = Date.now();
    const logs: SquareBehaviorLog[] = [];

    // 构建日志实体列表
    for (const item of input.items) {
      // 跳过无效数据
      if (!this.isValidItemType(item.itemType)) {
        continue;
      }
      // itemCategory 不做严格验证，允许任意字符串（热榜使用来源平台名称）
      if (!item.itemCategory) {
        continue;
      }
      if (!this.isValidBehaviorType(item.behaviorType)) {
        continue;
      }
      if (!item.itemId) {
        continue;
      }

      logs.push({
        id: randomUUID(),
        userId: input.userId,
        itemId: item.itemId,
        itemType: item.itemType,
        itemCategory: item.itemCategory,
        behaviorType: item.behaviorType,
        sessionId: input.sessionId,
        createdAt: now,
      });
    }

    // 如果没有有效日志，抛出错误
    if (logs.length === 0) {
      throw new AppError(400, "NO_VALID_ITEMS", "批量行为日志无有效条目，请检查 itemCategory/itemId/behaviorType");
    }

    // 批量写入数据库
    await this.behaviorLogRepo.batchInsert(logs);

    // 异步触发偏好更新（不阻塞响应）
    this.triggerPreferenceUpdate(input.userId);

    return { success: true, count: logs.length };
  }

  /**
   * 清理过期日志
   * 删除超过保留天数的行为日志
   */
  async cleanupOldLogs(retentionDays: number = DEFAULT_RETENTION_DAYS): Promise<CleanupResult> {
    // 参数校验
    if (retentionDays < 1) {
      retentionDays = DEFAULT_RETENTION_DAYS;
    }

    // 删除旧日志
    const deletedCount = await this.behaviorLogRepo.deleteOldLogs(retentionDays);

    return { success: true, deletedCount };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 验证输入参数
   */
  private validateInput(input: TrackBehaviorInput): string | null {
    if (!input.userId) {
      return "userId is required";
    }
    if (!input.itemId) {
      return "itemId is required";
    }
    if (!this.isValidItemType(input.itemType)) {
      return `invalid itemType: ${input.itemType}`;
    }
    // itemCategory 不做严格验证
    // 模板/作品使用服装分类（男装|女装|男童装|女童装）
    // 热榜使用来源平台名称（如 douyin-hot-hub），不做分类限制
    if (!input.itemCategory) {
      return "itemCategory is required";
    }
    if (!this.isValidBehaviorType(input.behaviorType)) {
      return `invalid behaviorType: ${input.behaviorType}`;
    }
    return null;
  }

  /**
   * 检查是否为有效的内容类型
   */
  private isValidItemType(itemType: ItemType): boolean {
    return VALID_ITEM_TYPES.includes(itemType);
  }

  /**
   * 检查是否为有效的行为类型
   */
  private isValidBehaviorType(behaviorType: BehaviorType): boolean {
    return VALID_BEHAVIOR_TYPES.includes(behaviorType);
  }

  /**
   * 异步触发偏好更新
   * 不阻塞当前请求，静默处理错误
   */
  private triggerPreferenceUpdate(userId: string): void {
    // 使用 setImmediate 确保不阻塞当前事件循环
    setImmediate(async () => {
      try {
        await this.preferenceService.updateUserPreference(userId);
      } catch (error) {
        // 静默处理错误，不影响用户体验
        log.error({ error }, "[SquareBehaviorService] Failed to update preference");
      }
    });
  }
}

// ============================================================================
// 导出
// ============================================================================

export type { ItemType, BehaviorType, SquareBehaviorLog };