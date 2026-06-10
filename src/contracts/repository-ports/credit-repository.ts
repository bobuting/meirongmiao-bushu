import type { CreditAccount, CreditFreeze } from "../types.js";

/** 积分仓库端口 */
export interface ICreditRepository {
  findByUserId(userId: string): Promise<CreditAccount | null>;
  list(): Promise<CreditAccount[]>;
  upsert(account: CreditAccount): Promise<void>;
  delete(userId: string): Promise<void>;
  /** 原子扣减：余额不足时返回 0，否则返回扣减金额 */
  atomicDeduct(userId: string, amount: number): Promise<number>;
  /** 原子增加：返回调整后的余额 */
  atomicAdd(userId: string, amount: number): Promise<number>;
  /** 原子冻结：余额不足时返回 null，否则返回冻结记录ID */
  atomicFreeze(userId: string, amount: number, freezeId: string, expiresAt: number): Promise<string | null>;
  /** 原子解冻：返回解冻金额 */
  atomicUnfreeze(userId: string, freezeId: string, amount: number): Promise<number>;
  /** 原子扣减冻结积分：返回实际扣减金额和退还差额 */
  atomicDeductFrozen(userId: string, freezeId: string, frozenAmount: number, actualCost: number): Promise<{ deducted: number; refunded: number }>;
}

/** 积分冻结记录仓库端口 */
export interface ICreditFreezeRepository {
  findById(id: string): Promise<CreditFreeze | null>;
  findByUserId(userId: string, status?: CreditFreeze["status"]): Promise<CreditFreeze[]>;
  findExpired(): Promise<CreditFreeze[]>;
  insert(freeze: CreditFreeze): Promise<void>;
  update(id: string, updates: Partial<CreditFreeze>): Promise<void>;
}
