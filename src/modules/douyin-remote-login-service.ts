import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { BridgeProcessManager } from "./bridge-process-manager.js";
import { writeDouyinCookieMetadata } from "./douyin-cookie-metadata.js";

export interface DouyinRemoteLoginSession {
  id: string;
  userId: string;
  remoteLoginUrl: string;
  status: "starting" | "ready" | "challenge_required" | "confirmed" | "timeout" | "error";
  errorMessage: string | null;
  challengeText: string | null;
  createdAt: number;
  expiresAt: number;
  bindPort: number | null;
  displayNum: number | null;
}

export interface DouyinRemoteLoginServiceConfig {
  enabled: boolean;
  cookieDir: string;
  pythonBin: string;
  bridgeScriptPath: string;
  xpraBin: string;
  chromeBin?: string;
  bindHost: string;
  publicUrlTemplate: string;
  portStart: number;
  portEnd: number;
  displayStart: number;
  displayEnd: number;
  sessionTimeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const READY_WAIT_MS = 15 * 1000;
const READY_POLL_MS = 300;

function normalizeDirectory(input: string | undefined, fallback: string): string {
  const trimmed = typeof input === "string" ? input.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

export class DouyinRemoteLoginService {
  private readonly config: DouyinRemoteLoginServiceConfig;
  private readonly sessionDir: string;
  private readonly sessions = new Map<string, DouyinRemoteLoginSession>();
  private readonly processManager: BridgeProcessManager;

  constructor(config: Partial<DouyinRemoteLoginServiceConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      cookieDir: normalizeDirectory(config.cookieDir, resolve("data/douyin-cookies")),
      pythonBin: config.pythonBin ?? "python",
      bridgeScriptPath: config.bridgeScriptPath ?? resolve("scripts/douyin_remote_login_bridge.py"),
      xpraBin: config.xpraBin ?? "xpra",
      chromeBin: config.chromeBin,
      bindHost: config.bindHost?.trim() || "127.0.0.1",
      publicUrlTemplate: config.publicUrlTemplate?.trim() || "",
      portStart: config.portStart ?? 14500,
      portEnd: config.portEnd ?? 14599,
      displayStart: config.displayStart ?? 100,
      displayEnd: config.displayEnd ?? 199,
      sessionTimeoutMs: config.sessionTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
    this.sessionDir = resolve("data/douyin-remote-login-sessions");
    this.processManager = new BridgeProcessManager();
    if (!existsSync(this.config.cookieDir)) {
      mkdirSync(this.config.cookieDir, { recursive: true });
    }
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  get isEnabled(): boolean {
    return (
      this.config.enabled &&
      this.config.publicUrlTemplate.trim().length > 0 &&
      this.config.xpraBin.trim().length > 0
    );
  }

  async shutdown(): Promise<void> {
    await this.processManager.shutdown();
  }

  private getUserCookiePath(userId: string): string {
    return join(this.config.cookieDir, `user-${userId}.json`);
  }

  private getSessionStatePath(sessionId: string): string {
    return join(this.sessionDir, `${sessionId}.json`);
  }

  private writeSessionState(session: DouyinRemoteLoginSession): void {
    writeFileSync(
      this.getSessionStatePath(session.id),
      JSON.stringify(
        {
          sessionId: session.id,
          userId: session.userId,
          remoteLoginUrl: session.remoteLoginUrl,
          status: session.status,
          errorMessage: session.errorMessage,
          challengeText: session.challengeText,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          bindPort: session.bindPort,
          displayNum: session.displayNum,
        },
        null,
        2,
      ),
    );
  }

  private syncSessionFromDisk(session: DouyinRemoteLoginSession): DouyinRemoteLoginSession {
    const statePath = this.getSessionStatePath(session.id);
    if (!existsSync(statePath)) {
      return session;
    }
    try {
      const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Record<string, unknown>;
      const statusRaw = typeof parsed.status === "string" ? parsed.status.trim() : "";
      const nextStatus: DouyinRemoteLoginSession["status"] =
        statusRaw === "ready" ||
        statusRaw === "challenge_required" ||
        statusRaw === "confirmed" ||
        statusRaw === "timeout" ||
        statusRaw === "error"
          ? statusRaw
          : "starting";
      const remoteLoginUrl =
        typeof parsed.remoteLoginUrl === "string" && parsed.remoteLoginUrl.trim().length > 0
          ? parsed.remoteLoginUrl.trim()
          : session.remoteLoginUrl;
      const errorMessage =
        typeof parsed.errorMessage === "string" && parsed.errorMessage.trim().length > 0
          ? parsed.errorMessage.trim()
          : null;
      const challengeText =
        typeof parsed.challengeText === "string" && parsed.challengeText.trim().length > 0
          ? parsed.challengeText.trim()
          : null;
      const bindPortRaw = Number(parsed.bindPort);
      const displayNumRaw = Number(parsed.displayNum);
      session.remoteLoginUrl = remoteLoginUrl;
      session.status = nextStatus;
      session.errorMessage = errorMessage;
      session.challengeText = challengeText;
      session.bindPort = Number.isFinite(bindPortRaw) ? Math.floor(bindPortRaw) : session.bindPort;
      session.displayNum = Number.isFinite(displayNumRaw) ? Math.floor(displayNumRaw) : session.displayNum;
      return session;
    } catch {
      return session;
    }
  }

  private syncSessionFromCookie(session: DouyinRemoteLoginSession): void {
    const cookiePath = this.getUserCookiePath(session.userId);
    if (!existsSync(cookiePath)) {
      return;
    }
    try {
      const stats = statSync(cookiePath);
      if (stats.mtimeMs >= session.createdAt && session.status !== "confirmed") {
        writeDouyinCookieMetadata(cookiePath, {
          source: "remote",
          status: "authenticated",
          verifiedAt: Math.floor(stats.mtimeMs),
          updatedAt: Math.floor(stats.mtimeMs),
        });
        session.status = "confirmed";
        session.errorMessage = null;
        session.challengeText = null;
        this.writeSessionState(session);
      }
    } catch {
      // Ignore cookie stat failures.
    }
  }

  private findFreePort(): number {
    const used = new Set<number>(
      [...this.sessions.values()]
        .map((session) => session.bindPort)
        .filter((value): value is number => typeof value === "number"),
    );
    for (let port = this.config.portStart; port <= this.config.portEnd; port += 1) {
      if (!used.has(port)) {
        return port;
      }
    }
    throw new Error("没有可用的 xpra 端口，请扩大 DOUYIN_REMOTE_LOGIN_PORT 范围");
  }

  private findFreeDisplay(): number {
    const used = new Set<number>(
      [...this.sessions.values()]
        .map((session) => session.displayNum)
        .filter((value): value is number => typeof value === "number"),
    );
    for (let display = this.config.displayStart; display <= this.config.displayEnd; display += 1) {
      if (!used.has(display)) {
        return display;
      }
    }
    throw new Error("没有可用的 xpra display，请扩大 DOUYIN_REMOTE_LOGIN_DISPLAY 范围");
  }

  private async waitForReady(session: DouyinRemoteLoginSession): Promise<DouyinRemoteLoginSession> {
    const deadline = Date.now() + READY_WAIT_MS;
    while (Date.now() < deadline) {
      this.syncSessionFromDisk(session);
      if (
        session.status === "ready" ||
        session.status === "challenge_required" ||
        session.status === "confirmed" ||
        session.status === "error"
      ) {
        return session;
      }
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
    }
    return session;
  }

  async clearUserSessions(userId: string): Promise<void> {
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
        } catch {
          // Ignore cleanup failure.
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
          const sessionId = file.replace(/\.json$/, "");
          await this.processManager.kill(sessionId);
          this.sessions.delete(sessionId);
          unlinkSync(filePath);
        } catch {
          // Ignore malformed session files.
        }
      }
    } catch {
      // Ignore directory read failures.
    }
  }

  async createSession(userId: string): Promise<DouyinRemoteLoginSession> {
    if (!this.isEnabled) {
      throw new Error("Douyin remote login is not enabled");
    }
    await this.clearUserSessions(userId);

    const sessionId = randomUUID();
    const bindPort = this.findFreePort();
    const displayNum = this.findFreeDisplay();
    const now = Date.now();
    const remoteLoginUrl = this.config.publicUrlTemplate
      .replace(/\{sessionId\}/g, sessionId)
      .replace(/\{port\}/g, String(bindPort))
      .replace(/\{display\}/g, String(displayNum));
    const session: DouyinRemoteLoginSession = {
      id: sessionId,
      userId,
      remoteLoginUrl,
      status: "starting",
      errorMessage: null,
      challengeText: null,
      createdAt: now,
      expiresAt: now + this.config.sessionTimeoutMs,
      bindPort,
      displayNum,
    };
    this.sessions.set(sessionId, session);
    this.writeSessionState(session);

    try {
      this.processManager.spawnDetached({
        id: sessionId,
        pythonBin: this.config.pythonBin,
        scriptPath: this.config.bridgeScriptPath,
        args: [
          "--session-file",
          this.getSessionStatePath(sessionId),
          "--cookie-file",
          this.getUserCookiePath(userId),
          "--xpra-bin",
          this.config.xpraBin,
          "--bind-host",
          this.config.bindHost,
          "--bind-port",
          String(bindPort),
          "--display-num",
          String(displayNum),
          "--public-url-template",
          this.config.publicUrlTemplate,
          "--timeout-ms",
          String(this.config.sessionTimeoutMs),
          ...(this.config.chromeBin?.trim() ? ["--chrome-bin", this.config.chromeBin.trim()] : []),
        ],
        timeoutMs: this.config.sessionTimeoutMs,
        onTimeout: () => {
          session.status = "timeout";
          session.errorMessage = "远程登录会话超时";
          this.writeSessionState(session);
        },
      });
      await this.waitForReady(session);
      if (session.status === "error") {
        throw new Error(session.errorMessage ?? "远程登录会话创建失败");
      }
    } catch (error) {
      session.status = "error";
      session.errorMessage = error instanceof Error ? error.message : String(error);
      this.writeSessionState(session);
      await this.processManager.kill(sessionId);
      throw new Error(session.errorMessage ?? "远程登录会话创建失败");
    }

    return session;
  }

  getSession(sessionId: string): DouyinRemoteLoginSession | null {
    const session = this.sessions.get(sessionId) ?? null;
    if (!session) {
      return null;
    }
    this.syncSessionFromDisk(session);
    this.syncSessionFromCookie(session);
    return session;
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.processManager.kill(sessionId);
    this.sessions.delete(sessionId);
    const statePath = this.getSessionStatePath(sessionId);
    if (existsSync(statePath)) {
      try {
        unlinkSync(statePath);
      } catch {
        // Ignore cleanup failure.
      }
    }
  }
}
