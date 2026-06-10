import {
  existsSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DouyinUserCookie,
  DouyinScanSession,
  DouyinAuthStatus,
} from "../contracts/douyin-auth-contract.js";
import { BridgeProcessManager } from "./bridge-process-manager.js";
import {
  getDouyinCookieMetaPath,
  inferDouyinCookieExpiry,
  readDouyinCookieMetadata,
  writeDouyinCookieMetadata,
  type DouyinCookieAuthSource,
} from "./douyin-cookie-metadata.js";
import { getLogger } from "../core/logger/index.js";

const log = getLogger("douyin-auth");

export interface DouyinAuthServiceConfig {
  enabled: boolean;
  cookieDir: string;
  pythonBin: string;
  qrBridgeScriptPath: string;
  sessionTimeoutMs: number;
  qrHeadless: boolean;
}

const DEFAULT_SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const QR_READY_WAIT_MS = 15 * 1000;
const QR_READY_POLL_MS = 300;
const ACCOUNT_ID_STORAGE_KEY_PATTERN =
  /(?:publish_form_cache|quick_fill_guide|creator_content_publish_async_tip|ai_gen_cover_tip|dual_cover_setting_tips)[:_](\d{5,})$/;

function normalizeDirectory(input: string | undefined, fallback: string): string {
  const trimmed = typeof input === "string" ? input.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

export class DouyinAuthService {
  private readonly config: DouyinAuthServiceConfig;
  private readonly sessions = new Map<string, DouyinScanSession>();
  private readonly userCookies = new Map<string, DouyinUserCookie>();
  private readonly sessionDir: string;
  private readonly processManager: BridgeProcessManager;

  constructor(config: Partial<DouyinAuthServiceConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      cookieDir: normalizeDirectory(config.cookieDir, resolve("data/douyin-cookies")),
      pythonBin: config.pythonBin ?? "python3",
      qrBridgeScriptPath: config.qrBridgeScriptPath ?? resolve("scripts/douyin_qr_bridge.py"),
      sessionTimeoutMs: config.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS,
      qrHeadless: config.qrHeadless ?? true,
    };
    this.sessionDir = resolve("data/douyin-qr-sessions");
    this.processManager = new BridgeProcessManager();
    // Ensure cookie directory exists
    if (!existsSync(this.config.cookieDir)) {
      mkdirSync(this.config.cookieDir, { recursive: true });
    }
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
    }
    this.loadExistingCookies();
  }

  /** Call on service shutdown to kill all active QR processes. */
  async shutdown(): Promise<void> {
    await this.processManager.shutdown();
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  private loadExistingCookies(): void {
    // Load existing cookie files from disk
    try {
      const files = readdirSync(this.config.cookieDir);
      for (const file of files) {
        if (
          file.startsWith("user-") &&
          file.endsWith(".json") &&
          !file.endsWith(".session.json") &&
          !file.endsWith(".meta.json")
        ) {
          const userId = file.slice(5, -5); // Remove "user-" prefix and ".json" suffix
          const filePath = join(this.config.cookieDir, file);
          const stats = statSync(filePath);
          this.userCookies.set(
            userId,
            this.buildUserCookieRecord(userId, filePath, stats.birthtime.getTime(), stats.mtime.getTime()),
          );
        }
      }
    } catch (error) {
      log.warn({ err: error }, "清理过期会话目录失败");
    }
  }

  private buildUserCookieRecord(
    userId: string,
    cookiePath: string,
    createdAt = Date.now(),
    updatedAt = Date.now(),
  ): DouyinUserCookie {
    const metadata = readDouyinCookieMetadata(cookiePath);
    const expiresAt = inferDouyinCookieExpiry(cookiePath);
    return {
      id: randomUUID(),
      userId,
      accountFilePath: cookiePath,
      status: metadata?.status === "pending" ? "pending" : "authenticated",
      expiresAt,
      createdAt,
      updatedAt,
    };
  }

  private saveUserCookie(
    userId: string,
    cookieData: unknown,
    options?: { source?: DouyinCookieAuthSource; status?: "pending" | "authenticated"; verifiedAt?: number | null },
  ): DouyinUserCookie {
    const cookiePath = this.getUserCookiePath(userId);
    writeFileSync(cookiePath, JSON.stringify(cookieData, null, 2));
    const now = Date.now();
    writeDouyinCookieMetadata(cookiePath, {
      source: options?.source ?? "import",
      status: options?.status ?? "pending",
      verifiedAt: options?.verifiedAt ?? null,
      updatedAt: now,
    });
    const cookie = this.buildUserCookieRecord(userId, cookiePath, now, now);
    this.userCookies.set(userId, cookie);
    return cookie;
  }

  private getUserCookiePath(userId: string): string {
    return join(this.config.cookieDir, `user-${userId}.json`);
  }

  private markUserCookieAuthenticated(userId: string, source: Exclude<DouyinCookieAuthSource, "import">): void {
    const cookiePath = this.getUserCookiePath(userId);
    if (!existsSync(cookiePath)) {
      return;
    }
    const now = Date.now();
    writeDouyinCookieMetadata(cookiePath, {
      source,
      status: "authenticated",
      verifiedAt: now,
      updatedAt: now,
    });
    const existing = this.userCookies.get(userId);
    this.userCookies.set(
      userId,
      this.buildUserCookieRecord(userId, cookiePath, existing?.createdAt ?? now, now),
    );
  }

  private getSessionStatePath(sessionId: string): string {
    return join(this.sessionDir, `${sessionId}.json`);
  }

  private writeSessionState(session: DouyinScanSession): void {
    writeFileSync(
      this.getSessionStatePath(session.id),
      JSON.stringify(
        {
          sessionId: session.id,
          userId: session.userId,
          qrCodeUrl: session.qrCodeUrl,
          qrUpdatedAt: session.qrUpdatedAt,
          status: session.status,
          errorMessage: session.errorMessage,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
        },
        null,
        2,
      ),
    );
  }

  private syncSessionFromDisk(session: DouyinScanSession): DouyinScanSession {
    const statePath = this.getSessionStatePath(session.id);
    if (!existsSync(statePath)) {
      return session;
    }
    try {
      const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Record<string, unknown>;
      const qrCodeUrl = typeof parsed.qrCodeUrl === "string" ? parsed.qrCodeUrl.trim() : "";
      const qrUpdatedAtRaw = Number(parsed.qrUpdatedAt);
      const qrUpdatedAt = Number.isFinite(qrUpdatedAtRaw) && qrUpdatedAtRaw > 0 ? Math.floor(qrUpdatedAtRaw) : null;
      const statusRaw = typeof parsed.status === "string" ? parsed.status.trim() : "";
      const status: DouyinScanSession["status"] =
        statusRaw === "scanned" ||
        statusRaw === "confirmed" ||
        statusRaw === "timeout" ||
        statusRaw === "error"
          ? statusRaw
          : "pending";
      const errorMessage =
        typeof parsed.errorMessage === "string" && parsed.errorMessage.trim().length > 0
          ? parsed.errorMessage.trim()
          : null;
      session.qrCodeUrl = qrCodeUrl || session.qrCodeUrl;
      session.qrUpdatedAt = qrUpdatedAt ?? session.qrUpdatedAt;
      session.status = status;
      session.errorMessage = errorMessage;
      return session;
    } catch (error) {
      log.warn({ err: error, sessionId: session.id }, "更新会话状态失败");
      return session;
    }
  }

  private refreshUserCookieFromDisk(userId: string): DouyinUserCookie | null {
    const cookiePath = this.getUserCookiePath(userId);
    if (!existsSync(cookiePath)) {
      this.userCookies.delete(userId);
      return null;
    }
    try {
      const stats = statSync(cookiePath);
      const existing = this.userCookies.get(userId);
      const cookie = this.buildUserCookieRecord(
        userId,
        cookiePath,
        existing?.createdAt ?? stats.birthtime.getTime(),
        stats.mtime.getTime(),
      );
      this.userCookies.set(userId, cookie);
      return cookie;
    } catch (error) {
      log.warn({ err: error, userId }, "读取用户 cookie 文件失败");
      return this.userCookies.get(userId) ?? null;
    }
  }

  private extractAccountLabel(cookiePath: string): string | null {
    if (!existsSync(cookiePath)) {
      return null;
    }
    try {
      const parsed = JSON.parse(readFileSync(cookiePath, "utf8")) as {
        origins?: Array<{ localStorage?: Array<{ name?: string; value?: string }> }>;
      };
      const origins = Array.isArray(parsed.origins) ? parsed.origins : [];
      for (const origin of origins) {
        const localStorage = Array.isArray(origin?.localStorage) ? origin.localStorage : [];
        for (const entry of localStorage) {
          const key = typeof entry?.name === "string" ? entry.name.trim() : "";
          const match = key.match(ACCOUNT_ID_STORAGE_KEY_PATTERN);
          if (match?.[1]) {
            return `创作者账号 ${match[1]}`;
          }
        }
      }
    } catch (error) {
      log.warn({ err: error, cookiePath }, "提取账号标签失败");
      return null;
    }
    return null;
  }

  private syncSessionFromCookie(session: DouyinScanSession): void {
    const cookie = this.refreshUserCookieFromDisk(session.userId);
    if (!cookie) {
      return;
    }
    if (cookie.updatedAt >= session.createdAt && session.status !== "confirmed") {
      this.markUserCookieAuthenticated(session.userId, "qr");
      session.status = "confirmed";
      session.errorMessage = null;
      this.writeSessionState(session);
    }
  }

  private async clearUserQrSessions(userId: string): Promise<void> {
    const sessionIds = [...this.sessions.values()]
      .filter((session) => session.userId === userId)
      .map((session) => session.id);
    for (const sessionId of sessionIds) {
      await this.processManager.kill(sessionId);
      this.sessions.delete(sessionId);
      const statePath = this.getSessionStatePath(sessionId);
      if (existsSync(statePath)) {
        try {
          unlinkSync(statePath);
        } catch (error) {
          log.warn({ err: error, sessionId }, "删除会话状态文件失败");
        }
      }
    }

    try {
      const files = readdirSync(this.sessionDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = join(this.sessionDir, file);
        try {
          const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { userId?: unknown };
          if (String(parsed.userId ?? "").trim() !== userId) {
            continue;
          }
          await this.processManager.kill(file.replace(/\.json$/, ""));
          unlinkSync(filePath);
          this.sessions.delete(file.replace(/\.json$/, ""));
        } catch (error) {
          log.warn({ err: error, file }, "处理会话文件失败");
        }
      }
    } catch (error) {
      log.warn({ err: error }, "读取会话目录失败");
    }
  }

  private async waitForQRCode(session: DouyinScanSession): Promise<DouyinScanSession> {
    const deadline = Date.now() + QR_READY_WAIT_MS;
    while (Date.now() < deadline) {
      this.syncSessionFromDisk(session);
      if (session.qrCodeUrl.trim().length > 0 || session.status === "error") {
        return session;
      }
      await new Promise((resolve) => setTimeout(resolve, QR_READY_POLL_MS));
    }
    session.status = "error";
    session.errorMessage = "二维码生成超时";
    this.writeSessionState(session);
    return session;
  }

  async generateQRCode(userId: string): Promise<DouyinScanSession> {
    if (!this.config.enabled) {
      throw new Error("Douyin auth is not enabled");
    }

    await this.clearUserQrSessions(userId);

    const sessionId = randomUUID();
    const now = Date.now();
    const session: DouyinScanSession = {
      id: sessionId,
      userId,
      qrCodeUrl: "",
      qrUpdatedAt: null,
      status: "pending",
      errorMessage: null,
      createdAt: now,
      expiresAt: now + this.config.sessionTimeoutMs,
    };
    this.sessions.set(sessionId, session);
    this.writeSessionState(session);

    try {
      this.processManager.spawnDetached({
        id: sessionId,
        pythonBin: this.config.pythonBin,
        scriptPath: this.config.qrBridgeScriptPath,
        args: [
          "generate-qr",
          "--session-file",
          this.getSessionStatePath(sessionId),
          "--cookie-file",
          this.getUserCookiePath(userId),
          "--timeout-ms",
          String(this.config.sessionTimeoutMs),
          "--headless",
          String(this.config.qrHeadless),
        ],
        timeoutMs: this.config.sessionTimeoutMs,
        onTimeout: () => {
          session.status = "timeout";
          session.errorMessage = "二维码会话超时";
          this.writeSessionState(session);
        },
      });
      await this.waitForQRCode(session);
      if (session.status === "error" || session.qrCodeUrl.trim().length < 1) {
        throw new Error(session.errorMessage ?? "二维码生成失败");
      }
    } catch (error) {
      session.status = "error";
      session.errorMessage = error instanceof Error ? error.message : String(error);
      this.writeSessionState(session);
      // Kill the bridge process if it's still alive
      await this.processManager.kill(sessionId);
    }

    return session;
  }

  getSession(sessionId: string): DouyinScanSession | null {
    const session = this.sessions.get(sessionId) ?? null;
    if (!session) {
      return null;
    }
    this.syncSessionFromDisk(session);
    this.syncSessionFromCookie(session);
    return session;
  }

  getAuthStatus(userId: string): DouyinAuthStatus {
    const activeSession = [...this.sessions.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (activeSession) {
      this.syncSessionFromDisk(activeSession);
      this.syncSessionFromCookie(activeSession);
    }
    const cookie = this.refreshUserCookieFromDisk(userId) ?? this.userCookies.get(userId);
    if (!cookie) {
      if (
        activeSession &&
        activeSession.status !== "confirmed" &&
        activeSession.status !== "timeout" &&
        activeSession.status !== "error" &&
        activeSession.expiresAt > Date.now()
      ) {
        return {
          hasValidCookie: false,
          status: "pending",
          expiresAt: activeSession.expiresAt,
          updatedAt: null,
          username: null,
        };
      }
      return {
        hasValidCookie: false,
        status: "none",
        expiresAt: null,
        updatedAt: null,
        username: null,
      };
    }

    const now = Date.now();
    const isExpired = cookie.expiresAt ? cookie.expiresAt < now : false;
    const accountLabel = this.extractAccountLabel(cookie.accountFilePath);
    const metadata = readDouyinCookieMetadata(cookie.accountFilePath);

    if (isExpired) {
      return {
        hasValidCookie: false,
        status: "expired",
        expiresAt: cookie.expiresAt,
        updatedAt: cookie.updatedAt,
        username: accountLabel,
      };
    }

    if (metadata?.status === "pending") {
      return {
        hasValidCookie: false,
        status: "pending",
        expiresAt: cookie.expiresAt,
        updatedAt: cookie.updatedAt,
        username: accountLabel,
      };
    }

    return {
      hasValidCookie: true,
      status: "authenticated",
      expiresAt: cookie.expiresAt,
      updatedAt: cookie.updatedAt,
      username: accountLabel,
    };
  }

  async clearUserCookie(userId: string): Promise<void> {
    await this.clearUserQrSessions(userId);
    const cookiePath = this.getUserCookiePath(userId);
    if (existsSync(cookiePath)) {
      unlinkSync(cookiePath);
    }
    const metaPath = getDouyinCookieMetaPath(cookiePath);
    if (existsSync(metaPath)) {
      unlinkSync(metaPath);
    }
    this.userCookies.delete(userId);
  }

  cleanupExpiredSessions(): void {
    const now = Date.now();
    // Clean in-memory sessions
    for (const [id, session] of this.sessions) {
      this.syncSessionFromDisk(session);
      if (session.expiresAt < now) {
        session.status = "timeout";
        this.writeSessionState(session);
      }
    }
    // C1: Clean session files older than 1 hour from disk
    this.cleanupStaleSessionFiles(60 * 60 * 1000);
  }

  /** C1: Remove session files older than maxAgeMs from disk. */
  private cleanupStaleSessionFiles(maxAgeMs: number): void {
    try {
      const now = Date.now();
      const files = readdirSync(this.sessionDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = join(this.sessionDir, file);
        try {
          const stats = statSync(filePath);
          if (now - stats.mtimeMs > maxAgeMs) {
            unlinkSync(filePath);
            // Also remove from in-memory map
            const sessionId = file.replace(/\.json$/, "");
            this.sessions.delete(sessionId);
          }
        } catch (error) {
          log.warn({ err: error, file }, "清理过期会话文件失败");
        }
      }
    } catch (error) {
      log.warn({ err: error }, "读取会话目录失败");
    }
  }

  /** C1: Start periodic cleanup interval. Call once at service init. */
  startPeriodicCleanup(intervalMs = 30 * 60 * 1000): ReturnType<typeof setInterval> {
    // Run once immediately on startup
    this.cleanupExpiredSessions();
    return setInterval(() => this.cleanupExpiredSessions(), intervalMs);
  }
}
