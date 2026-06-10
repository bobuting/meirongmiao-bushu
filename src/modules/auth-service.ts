import type { IUserRepository, ISessionRepository } from "../contracts/repository-ports/user-repository.js";
import type { IRepositoryClock } from "../contracts/repository-ports/common.js";
import type { Role, User } from "../contracts/types.js";
import type { IAuthService } from "../contracts/services.js";
import type { IAuditStore } from "../persistence/audit-store.js";
import type { AppConfigService } from "../services/config/app-config-service.js";
import { AppError, assertCondition } from "../core/errors.js";
import { hashPassword, verifyPassword } from "../core/security.js";

export class AuthService implements IAuthService {
  constructor(
    private readonly users: IUserRepository,
    private readonly sessions: ISessionRepository,
    private readonly clock: IRepositoryClock,
    private readonly configService: AppConfigService,
    private readonly auditStore: IAuditStore,
  ) {}

  async register(email: string, password: string, role: Role = "user"): Promise<User> {
    const normalized = email.trim().toLowerCase();
    assertCondition(normalized.length >= 4, 400, "USERNAME_INVALID", "用户名至少4个字符");
    assertCondition(password.length >= 6, 400, "PASSWORD_WEAK", "密码长度不足，至少6个字符");
    const existingByEmail = await this.users.findByEmail(normalized);
    assertCondition(
      !existingByEmail,
      409,
      "USERNAME_EXISTS",
      "用户名已存在",
    );

    const user: User = {
      id: this.clock.generateId(),
      email: normalized,
      passwordHash: hashPassword(password),
      role,
      createdAt: this.clock.now(),
      failedAttempts: 0,
      lockUntil: null,
    };
    await this.users.upsert(user);
    return user;
  }

  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.users.findByEmail(normalized);
    assertCondition(Boolean(user), 401, "LOGIN_FAILED", "邮箱或密码错误");
    const existing = user as User;

    const now = this.clock.now();
    if (existing.lockUntil && existing.lockUntil <= now) {
      // 锁定窗口结束；在处理新尝试前重置失败状态
      existing.failedAttempts = 0;
      existing.lockUntil = null;
      const unlockLogId = this.clock.generateId();
      this.auditStore.insertAuditLog({
        id: unlockLogId,
        actorUserId: existing.id,
        action: "account_unlock_auto",
        targetId: existing.id,
        createdAt: now,
      });
    }
    if (existing.lockUntil && existing.lockUntil > now) {
      throw new AppError(423, "ACCOUNT_LOCKED", "账户已被锁定，请稍后再试");
    }

    if (!verifyPassword(password, existing.passwordHash)) {
      existing.failedAttempts += 1;
      const config = this.configService.get();
      if (existing.failedAttempts >= config.lockoutAttempts) {
        existing.lockUntil = now + config.lockoutMinutes * 60_000;
        this.auditStore.insertAuditLog({
          id: this.clock.generateId(),
          actorUserId: existing.id,
          action: "account_locked",
          targetId: existing.id,
          meta: {
            lockUntil: existing.lockUntil,
          },
          createdAt: now,
        });
      }
      await this.users.upsert(existing);
      throw new AppError(401, "LOGIN_FAILED", "邮箱或密码错误");
    }

    existing.failedAttempts = 0;
    existing.lockUntil = null;
    await this.users.upsert(existing);
    const token = this.clock.generateId();
    const config = this.configService.get();
    const expiresAt = now + config.sessionTtlHours * 60 * 60 * 1000;
    await this.sessions.upsert({
      token,
      userId: existing.id,
      createdAt: now,
      expiresAt,
    });
    return { token, user: existing };
  }

  async requireUser(token: string): Promise<User> {
    const session = await this.sessions.findByToken(token);
    assertCondition(Boolean(session), 401, "UNAUTHORIZED", "未授权，请先登录");
    if (!session) throw new AppError(401, "UNAUTHORIZED", "未授权，请先登录"); // TS narrowing
    // 检查会话是否过期
    if (session.expiresAt <= this.clock.now()) {
      await this.sessions.delete(token);
      throw new AppError(401, "SESSION_EXPIRED", "登录已过期，请重新登录");
    }
    // 距过期时间不足阈值时自动续期，避免用户操作中被踢出
    const config = this.configService.get();
    const autoRenewThreshold = this.clock.now() + config.sessionAutoRenewMinutesBeforeExpiry * 60_000;
    if (session.expiresAt <= autoRenewThreshold) {
      const newExpiresAt = this.clock.now() + config.sessionTtlHours * 60 * 60 * 1000;
      await this.sessions.upsert({
        token,
        userId: session.userId,
        createdAt: session.createdAt,
        expiresAt: newExpiresAt,
      });
    }
    const user = await this.users.findById(session.userId);
    assertCondition(Boolean(user), 401, "UNAUTHORIZED", "未授权，请先登录");
    return user as User;
  }

  async logout(token: string): Promise<void> {
    await this.sessions.delete(token);
  }

  /** 通过用户 ID 直接获取用户（用于扩展 Token 认证） */
  async requireUserById(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    assertCondition(Boolean(user), 401, "UNAUTHORIZED", "未授权，请先登录");
    return user as User;
  }

  forgotPasswordPlaceholder(): { message: string } {
    return { message: "请联系管理员处理密码找回" };
  }

  async changePassword(user: User, currentPassword: string, nextPassword: string): Promise<{ updatedAt: number }> {
    assertCondition(verifyPassword(currentPassword, user.passwordHash), 401, "LOGIN_FAILED", "当前密码不正确");
    assertCondition(nextPassword.length >= 6, 400, "PASSWORD_WEAK", "密码长度不足，至少6个字符");
    const updatedAt = this.clock.now();
    user.passwordHash = hashPassword(nextPassword);
    await this.users.upsert(user);
    this.auditStore.insertAuditLog({
      id: this.clock.generateId(),
      actorUserId: user.id,
      action: "password_changed",
      targetId: user.id,
      createdAt: updatedAt,
    });
    return { updatedAt };
  }
}
