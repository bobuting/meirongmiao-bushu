import type { IUserRepository } from "../contracts/repository-ports/user-repository.js";
import type { ICreditRepository } from "../contracts/repository-ports/credit-repository.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { AppConfigService } from "../services/config/app-config-service.js";
import type { ICreditService, IUserAdminService } from "../contracts/services.js";
import type { CreditAccount, User } from "../contracts/types.js";
import type { IAuditStore } from "../persistence/audit-store.js";
import { assertCondition } from "../core/errors.js";

function requireAdmin(actor: User): void {
  assertCondition(actor.role === "admin", 403, "FORBIDDEN", "Admin only");
}

export class UserAdminService implements IUserAdminService {
  constructor(
    private readonly repos: { users: IUserRepository; credits: ICreditRepository },
    private readonly clock: IRepositoryClock,
    private readonly configService: AppConfigService,
    private readonly creditService: ICreditService,
    private readonly auditStore: IAuditStore,
  ) {}

  async listUsers(actor: User): Promise<Array<{
    id: string;
    email: string;
    role: "admin" | "user";
    createdAt: number;
    failedAttempts: number;
    lockUntil: number | null;
    creditBalance: number;
    creditExpiresAt: number;
    companyName?: string;
  }>> {
    requireAdmin(actor);
    const allUsers = await this.repos.users.list();
    const results: Array<{
      id: string;
      email: string;
      role: "admin" | "user";
      createdAt: number;
      failedAttempts: number;
      lockUntil: number | null;
      creditBalance: number;
      creditExpiresAt: number;
      companyName?: string;
    }> = [];
    for (const user of allUsers.sort((a, b) => a.createdAt - b.createdAt)) {
      const credit = await this.creditService.ensureAccount(user.id);
      results.push({
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        failedAttempts: user.failedAttempts,
        lockUntil: user.lockUntil,
        creditBalance: credit.balance,
        creditExpiresAt: credit.expiresAt,
        companyName: user.companyName,
      });
    }
    return results;
  }

  async setUserLock(
    actor: User,
    userId: string,
    locked: boolean,
  ): Promise<{ id: string; lockUntil: number | null; failedAttempts: number }> {
    requireAdmin(actor);
    const user = await this.repos.users.findById(userId);
    assertCondition(Boolean(user), 404, "NOT_FOUND", "User not found");
    const target = user as User;
    if (locked) {
      target.failedAttempts = this.configService.get().lockoutAttempts;
      target.lockUntil = this.clock.now() + this.configService.get().lockoutMinutes * 60_000;
    } else {
      target.failedAttempts = 0;
      target.lockUntil = null;
    }
    await this.repos.users.upsert(target);
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: actor.id,
      action: locked ? "user_locked_by_admin" : "user_unlocked_by_admin",
      targetId: target.id,
      createdAt: this.clock.now(),
    });
    return {
      id: target.id,
      lockUntil: target.lockUntil,
      failedAttempts: target.failedAttempts,
    };
  }

  async adjustCredits(actor: User, userId: string, delta: number, reason: string): Promise<CreditAccount> {
    requireAdmin(actor);
    const user = await this.repos.users.findById(userId);
    assertCondition(Boolean(user), 404, "NOT_FOUND", "用户不存在");
    assertCondition(Number.isFinite(delta), 400, "DELTA_INVALID", "调整金额无效");
    const account = await this.creditService.ensureAccount(userId);
    const truncatedDelta = Math.trunc(delta);
    // 使用 atomicAdd 进行原子增加，避免并发竞争
    const newBalance = await this.repos.credits.atomicAdd(userId, truncatedDelta);
    assertCondition(newBalance >= 0, 400, "CREDIT_NEGATIVE", "积分余额不能为负数");
    // 持久化审计日志后返回最新账户状态
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: actor.id,
      action: "credit_adjusted_by_admin",
      targetId: userId,
      meta: {
        delta: truncatedDelta,
        reason,
      },
      createdAt: this.clock.now(),
    });
    const updatedAccount = await this.repos.credits.findByUserId(userId);
    return updatedAccount ?? { ...account, balance: newBalance };
  }
}
