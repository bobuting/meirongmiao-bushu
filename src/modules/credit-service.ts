/**
 * 积分服务（含冻结机制）
 *
 * 冻结流程：freeze → LLM 调用 → deductFrozen（成功）或 unfreeze（失败）
 * 所有写操作使用 PG 事务保证原子性，防止积分丢失。
 */

import type { Pool, PoolClient } from "pg";
import type { CreditAccount, CreditFreeze, Resolution } from "../contracts/types.js";
import type { ICreditRepository, ICreditFreezeRepository } from "../contracts/repository-ports/credit-repository.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { AppConfigService } from "../services/config/app-config-service.js";
import type { ICreditService } from "../contracts/services.js";
import type { IAuditStore } from "../persistence/audit-store.js";
import { PgCreditRepository } from "../repositories/pg/credit-pg-repository.js";
import { PgCreditFreezeRepository } from "../repositories/pg/credit-freeze-pg-repository.js";
import { assertCondition, AppError } from "../core/errors.js";
import { getLogger } from "../core/logger/index.js";

const DAY_MS = 24 * 60 * 60_000;
const FREEZE_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟冻结超时
const log = getLogger("credit-service");

/** 事务内使用的仓库集合 */
interface TxRepos {
  credits: ICreditRepository;
  creditFreezes: ICreditFreezeRepository;
}

export class CreditService implements ICreditService {
  constructor(
    private readonly repos: { credits: ICreditRepository; creditFreezes: ICreditFreezeRepository },
    private readonly clock: IRepositoryClock,
    private readonly configService: AppConfigService,
    private readonly auditStore: IAuditStore,
    private readonly pool: Pool,
  ) {}

  /**
   * PG 事务包装器：创建事务级 repo 实例，保证操作的原子性
   */
  private async withTransaction<T>(fn: (txRepos: TxRepos) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const txRepos: TxRepos = {
        credits: new PgCreditRepository(this.pool, client),
        creditFreezes: new PgCreditFreezeRepository(this.pool, client),
      };
      const result = await fn(txRepos);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch((e) => {
        log.error({ error: e instanceof Error ? e.message : String(e) }, "ROLLBACK 失败");
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async ensureAccount(userId: string, initialBalance?: number): Promise<CreditAccount> {
    const existing = await this.repos.credits.findByUserId(userId);
    if (existing) {
      return existing;
    }
    const config = this.configService.get();
    const account: CreditAccount = {
      userId,
      balance: initialBalance ?? config.mockCreditDefault,
      expiresAt: this.clock.now() + config.creditValidityDays * DAY_MS,
    };
    await this.repos.credits.upsert(account);
    return account;
  }

  async spend(userId: string, baseCost: number, resolution: Resolution, meta?: { operation?: string; reason?: string; routeKey?: string; projectId?: string }): Promise<number> {
    const account = await this.ensureAccount(userId);
    assertCondition(this.clock.now() < account.expiresAt, 400, "CREDIT_EXPIRED", "Credit expired");

    // 直接使用传入的 baseCost 作为扣减金额（调用者已通过 creditPricingService 计算好）
    const cost = Math.ceil(baseCost);

    // 成本为 0 时跳过扣减（免费操作）
    if (cost === 0) return 0;

    // 原子扣减：单条 UPDATE 完成余额检查和扣减，避免并发竞争
    const deducted = await this.repos.credits.atomicDeduct(userId, cost);
    assertCondition(deducted > 0, 402, "INSUFFICIENT_CREDIT", "Insufficient credit");
    // 记录消费审计日志（统一格式：包含 operation 和 reason）
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: userId,
      action: "credit_spent_by_user",
      targetId: userId,
      meta: {
        amount: cost,
        baseCost,
        resolution,
        operation: meta?.operation ?? "video_export",
        reason: meta?.reason ?? "video_export",
        routeKey: meta?.routeKey ?? undefined,
        projectId: meta?.projectId ?? undefined,
      },
      createdAt: this.clock.now(),
    });
    return cost;
  }

  async updatePolicy(validityDays: number, mockDefault: number): Promise<void> {
    assertCondition(
      Number.isInteger(validityDays) && validityDays > 0,
      400,
      "CREDIT_POLICY_INVALID",
      "creditValidityDays must be a positive integer",
    );
    assertCondition(
      Number.isInteger(mockDefault) && mockDefault >= 0,
      400,
      "CREDIT_POLICY_INVALID",
      "mockCreditDefault must be a non-negative integer",
    );

    await this.configService.update({
      creditValidityDays: validityDays,
      mockCreditDefault: mockDefault,
    });

    const nextExpiry = this.clock.now() + validityDays * DAY_MS;
    const accounts = await this.repos.credits.list();
    for (const account of accounts) {
      account.expiresAt = nextExpiry;
      await this.repos.credits.upsert(account);
    }
  }

  /**
   * 冻结积分：预检余额并冻结，防止并发白嫖
   * 使用事务保证 atomicFreeze + insert 原子性
   */
  async freeze(userId: string, amount: number, meta?: { routeKey?: string; operation?: string; projectId?: string }): Promise<string> {
    assertCondition(amount > 0, 400, "INVALID_FREEZE_AMOUNT", "冻结金额必须大于 0");

    const freezeId = this.clock.generateId();
    const now = this.clock.now();

    // 检查账户是否过期
    const account = await this.ensureAccount(userId);
    assertCondition(now < account.expiresAt, 400, "CREDIT_EXPIRED", "积分账户已过期");

    // 事务：原子冻结 + 插入冻结记录
    const result = await this.withTransaction(async (txRepos) => {
      // 原子冻结：余额不足时返回 null
      const freezeResult = await txRepos.credits.atomicFreeze(userId, amount, freezeId, now + FREEZE_TIMEOUT_MS);
      if (!freezeResult) {
        return null;
      }

      // 创建冻结记录
      const freeze: CreditFreeze = {
        id: freezeId,
        userId,
        amount,
        frozenAt: now,
        expiresAt: now + FREEZE_TIMEOUT_MS,
        status: "frozen",
        routeKey: meta?.routeKey,
        operation: meta?.operation,
        projectId: meta?.projectId,
        createdAt: now,
        updatedAt: now,
      };
      await txRepos.creditFreezes.insert(freeze);
      return freezeId;
    });

    if (!result) {
      throw new AppError(402, "INSUFFICIENT_CREDIT", `积分不足（余额 ${account.balance}，需要 ${amount}），请充值后继续`);
    }

    log.info({ userId, freezeId, amount, routeKey: meta?.routeKey }, "积分冻结成功");
    return result;
  }

  /**
   * 解冻积分：退还冻结的积分（LLM 调用失败时）
   * 使用事务保证 atomicUnfreeze + update 原子性
   */
  async unfreeze(userId: string, freezeId: string): Promise<void> {
    const freeze = await this.repos.creditFreezes.findById(freezeId);
    assertCondition(freeze != null, 404, "FREEZE_NOT_FOUND", "冻结记录不存在");
    assertCondition(freeze!.status === "frozen", 400, "FREEZE_ALREADY_PROCESSED", "冻结记录已处理");
    assertCondition(freeze!.userId === userId, 403, "FREEZE_NOT_OWNER", "冻结记录不属于该用户");

    const now = this.clock.now();

    // 事务：原子解冻 + 更新状态
    await this.withTransaction(async (txRepos) => {
      await txRepos.credits.atomicUnfreeze(userId, freezeId, freeze!.amount);
      await txRepos.creditFreezes.update(freezeId, {
        status: "refunded",
        updatedAt: now,
      });
    });

    log.info({ userId, freezeId, amount: freeze!.amount }, "积分解冻成功");
  }

  /**
   * 扣减冻结积分：LLM 调用成功后扣减实际成本，退还差额
   * 使用事务保证 atomicDeductFrozen + update 原子性
   */
  async deductFrozen(userId: string, freezeId: string, actualCost: number): Promise<number> {
    const freeze = await this.repos.creditFreezes.findById(freezeId);
    assertCondition(freeze != null, 404, "FREEZE_NOT_FOUND", "冻结记录不存在");
    assertCondition(freeze!.status === "frozen", 400, "FREEZE_ALREADY_PROCESSED", "冻结记录已处理");
    assertCondition(freeze!.userId === userId, 403, "FREEZE_NOT_OWNER", "冻结记录不属于该用户");
    assertCondition(actualCost >= 0, 400, "INVALID_ACTUAL_COST", "实际扣减成本必须为非负数");
    assertCondition(actualCost <= freeze!.amount, 400, "COST_EXCEEDS_FREEZE", `实际成本 ${actualCost} 超过冻结金额 ${freeze!.amount}`);

    const now = this.clock.now();

    // 事务：原子扣减 + 更新状态
    const { refunded } = await this.withTransaction(async (txRepos) => {
      const deductResult = await txRepos.credits.atomicDeductFrozen(userId, freezeId, freeze!.amount, actualCost);
      await txRepos.creditFreezes.update(freezeId, {
        status: "deducted",
        actualCost,
        refundedAmount: deductResult.refunded,
        updatedAt: now,
      });
      return deductResult;
    });

    // 记录消费审计日志
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: userId,
      action: "credit_spent_by_user",
      targetId: userId,
      meta: {
        amount: actualCost,
        frozenAmount: freeze!.amount,
        refunded,
        operation: freeze!.operation ?? "llm_generation",
        routeKey: freeze!.routeKey,
        projectId: freeze!.projectId,
      },
      createdAt: now,
    });

    log.info({ userId, freezeId, actualCost, refunded, routeKey: freeze!.routeKey }, "冻结积分扣减成功");
    return actualCost;
  }

  /**
   * 清理过期冻结记录：超时自动解冻
   * 每条记录独立事务处理，失败不影响其他记录
   */
  async cleanupExpiredFreezes(): Promise<number> {
    const expiredFreezes = await this.repos.creditFreezes.findExpired();
    let cleanedCount = 0;

    for (const freeze of expiredFreezes) {
      try {
        // 重新检查状态（防止并发 cleanup 重复处理）
        const current = await this.repos.creditFreezes.findById(freeze.id);
        if (!current || current.status !== "frozen") continue;

        await this.withTransaction(async (txRepos) => {
          await txRepos.credits.atomicUnfreeze(freeze.userId, freeze.id, freeze.amount);
          await txRepos.creditFreezes.update(freeze.id, {
            status: "expired",
            updatedAt: this.clock.now(),
          });
        });

        cleanedCount++;
        log.warn({ userId: freeze.userId, freezeId: freeze.id, amount: freeze.amount }, "过期冻结记录已自动解冻");
      } catch (error) {
        log.error({ err: error, freezeId: freeze.id }, "过期冻结记录解冻失败");
      }
    }

    return cleanedCount;
  }
}
