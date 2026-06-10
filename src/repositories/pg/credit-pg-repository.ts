/**
 * 积分 PG 仓库
 * 主键是 user_id，不是 id
 * 由于主键不是 id，不继承 PgBaseRepository/PgSoftDeletableRepository
 * 手动实现伪删除支持
 */

import type { Pool, PoolClient } from "pg";
import type { CreditAccount } from "../../contracts/types.js";
import type { ICreditRepository } from "../../contracts/repository-ports/credit-repository.js";
import { nrm } from "./base-pg-repository.js";

export class PgCreditRepository implements ICreditRepository {
  private readonly table = nrm("credits");

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  /** 事务时用 client，否则用 pool */
  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  /** 伪删除：设置 deleted_at 和 deleted_by */
  async softDelete(userId: string, deletedBy: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.table} SET deleted_at = $2, deleted_by = $3 WHERE user_id = $1`,
      [userId, Date.now(), deletedBy],
    );
  }

  /** 恢复：清除 deleted_at 和 deleted_by */
  async restore(userId: string): Promise<void> {
    await this.queryClient.query(
      `UPDATE ${this.table} SET deleted_at = NULL, deleted_by = NULL WHERE user_id = $1`,
      [userId],
    );
  }

  /** 物理删除：真正删除数据 */
  async hardDelete(userId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.table} WHERE user_id = $1`,
      [userId],
    );
  }

  async findByUserId(userId: string): Promise<CreditAccount | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [userId],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      userId: row.user_id as string,
      balance: row.balance as number,
      expiresAt: row.expires_at as number,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    };
  }

  async list(): Promise<CreditAccount[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE deleted_at IS NULL`,
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      userId: row.user_id as string,
      balance: row.balance as number,
      expiresAt: row.expires_at as number,
      deletedAt: row.deleted_at as number | null,
      deletedBy: row.deleted_by as string | null,
    }));
  }

  async upsert(account: CreditAccount): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.table} (user_id, balance, expires_at, deleted_at, deleted_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         balance = EXCLUDED.balance,
         expires_at = EXCLUDED.expires_at,
         deleted_at = EXCLUDED.deleted_at,
         deleted_by = EXCLUDED.deleted_by`,
      [account.userId, account.balance, account.expiresAt, account.deletedAt ?? null, account.deletedBy ?? null],
    );
  }

  async delete(userId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.table} WHERE user_id = $1`,
      [userId],
    );
  }

  /**
   * 原子扣减积分：在单条 UPDATE 中完成余额检查和扣减
   * 返回实际扣减的金额，若余额不足则返回 0
   */
  async atomicDeduct(userId: string, amount: number): Promise<number> {
    const result = await this.queryClient.query(
      `UPDATE ${this.table} SET balance = balance - $2
       WHERE user_id = $1 AND balance >= $2 AND deleted_at IS NULL
       RETURNING balance`,
      [userId, amount],
    );
    if (result.rows.length === 0) return 0;
    return amount;
  }

  /**
   * 原子增加积分：在单条 UPDATE 中完成余额增加
   * 返回调整后的余额
   */
  async atomicAdd(userId: string, amount: number): Promise<number> {
    const result = await this.queryClient.query(
      `UPDATE ${this.table} SET balance = balance + $1
       WHERE user_id = $2 AND deleted_at IS NULL
       RETURNING balance`,
      [amount, userId],
    );
    if (result.rows.length === 0) {
      // 账户不存在时创建
      const account: CreditAccount = {
        userId,
        balance: amount,
        expiresAt: Date.now() + 365 * 24 * 60 * 60_000,
      };
      await this.upsert(account);
      return amount;
    }
    return result.rows[0].balance as number;
  }

  /**
   * 原子冻结积分：在单条 UPDATE 中同时扣减 balance 和增加 frozen_balance
   * 返回冻结记录ID，若余额不足则返回 null
   * 注意：冻结记录需要单独插入到 nrm_credit_freezes 表
   */
  async atomicFreeze(userId: string, amount: number, freezeId: string, expiresAt: number): Promise<string | null> {
    const result = await this.queryClient.query(
      `UPDATE ${this.table} SET balance = balance - $2, frozen_balance = frozen_balance + $2
       WHERE user_id = $1 AND balance >= $2 AND deleted_at IS NULL
       RETURNING balance, frozen_balance`,
      [userId, amount],
    );
    if (result.rows.length === 0) return null;
    return freezeId;
  }

  /**
   * 原子解冻积分：扣减 frozen_balance 并退还到 balance
   * 返回解冻金额
   */
  async atomicUnfreeze(userId: string, freezeId: string, amount: number): Promise<number> {
    const result = await this.queryClient.query(
      `UPDATE ${this.table} SET balance = balance + $2, frozen_balance = frozen_balance - $2
       WHERE user_id = $1 AND frozen_balance >= $2 AND deleted_at IS NULL
       RETURNING balance, frozen_balance`,
      [userId, amount],
    );
    if (result.rows.length === 0) return 0;
    return amount;
  }

  /**
   * 原子扣减冻结积分：从 frozen_balance 扣减实际成本，退还差额到 balance
   * 返回 { deducted, refunded }
   */
  async atomicDeductFrozen(userId: string, freezeId: string, frozenAmount: number, actualCost: number): Promise<{ deducted: number; refunded: number }> {
    const refunded = frozenAmount - actualCost;
    if (refunded > 0) {
      const result = await this.queryClient.query(
        `UPDATE ${this.table} SET balance = balance + $2, frozen_balance = frozen_balance - $3
         WHERE user_id = $1 AND frozen_balance >= $3 AND deleted_at IS NULL
         RETURNING balance, frozen_balance`,
        [userId, refunded, frozenAmount],
      );
      if (result.rows.length === 0) {
        // frozen_balance 不够，可能数据异常，只扣减 frozen_balance
        await this.queryClient.query(
          `UPDATE ${this.table} SET frozen_balance = frozen_balance - $2
           WHERE user_id = $1 AND deleted_at IS NULL`,
          [userId, frozenAmount],
        );
        return { deducted: actualCost, refunded: 0 };
      }
    } else {
      // 无退款，只扣减 frozen_balance
      await this.queryClient.query(
        `UPDATE ${this.table} SET frozen_balance = frozen_balance - $2
         WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId, frozenAmount],
      );
    }
    return { deducted: actualCost, refunded };
  }
}
