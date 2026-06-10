import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  DouyinPublishRequest,
  DouyinPublishResult,
  PublishJob,
} from "../contracts/douyin-publish-contract.js";
import { resolveRuntimeConfig } from "../core/runtime-config.js";
import { resolveObjectStorageLocalRoot } from "../storage/runtime.js";
import { getLogger } from "../core/logger/index.js";
import { AppError } from "../core/errors.js";
import { BridgeProcessManager } from "./bridge-process-manager.js";
import { DouyinPublishHistoryStore } from "./douyin-publish-history-store.js";

const logger = getLogger("douyin-publish-service");

export interface DouyinPublishServiceConfig {
  enabled: boolean;
  socialAutoUploadDir: string;
  cookieDir: string;
  pythonBin: string;
  bridgeScriptPath: string;
  stagingDir: string;
  timeoutMs: number;
  downloadTimeoutMs: number; // 视频下载超时时间
  historyStorePath?: string;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_LOG_TAIL = 20;

function normalizeDirectory(input: string | undefined, fallback: string): string {
  const trimmed = typeof input === "string" ? input.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeOptionalPath(input: string | null | undefined): string | null {
  const trimmed = typeof input === "string" ? input.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function resolveMediaExtension(source: string, fallback: string): string {
  const plain = source.split("?")[0] ?? "";
  const extension = extname(plain).toLowerCase();
  return extension.length > 0 ? extension : fallback;
}

export class DouyinPublishService {
  private readonly jobs = new Map<string, PublishJob>();
  private readonly config: DouyinPublishServiceConfig;
  private readonly processManager: BridgeProcessManager;
  private readonly historyStore: DouyinPublishHistoryStore;

  constructor(config: Partial<DouyinPublishServiceConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      socialAutoUploadDir: (config.socialAutoUploadDir ?? "").trim(),
      cookieDir: normalizeDirectory(config.cookieDir, resolve("data/douyin-cookies")),
      pythonBin: config.pythonBin ?? "python",
      bridgeScriptPath: config.bridgeScriptPath ?? resolve("scripts/douyin_publish_bridge.py"),
      stagingDir: normalizeDirectory(config.stagingDir, resolve("data/publish-staging")),
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      downloadTimeoutMs: config.downloadTimeoutMs ?? 300_000, // 默认 300 秒
      historyStorePath: config.historyStorePath,
    };
    this.processManager = new BridgeProcessManager();
    this.historyStore = new DouyinPublishHistoryStore(this.config.historyStorePath);
    // Ensure cookie directory exists
    if (!existsSync(this.config.cookieDir)) {
      mkdirSync(this.config.cookieDir, { recursive: true });
    }
  }

  /** Call on service shutdown to kill all active publish processes. */
  async shutdown(): Promise<void> {
    await this.processManager.shutdown();
  }

  private getUserCookiePath(userId: string): string {
    return join(this.config.cookieDir, `user-${userId}.json`);
  }

  hasUserCookie(userId: string): boolean {
    return existsSync(this.getUserCookiePath(userId));
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  getJob(jobId: string): PublishJob | null {
    return this.jobs.get(jobId) ?? this.historyStore.get(jobId);
  }

  /** C3: List all jobs for a given project, newest first. */
  listJobs(projectId: string, userId: string): PublishJob[] {
    const merged = new Map<string, PublishJob>();
    for (const job of this.historyStore.list(projectId, userId)) {
      merged.set(job.id, job);
    }
    for (const job of this.jobs.values()) {
      if (job.projectId === projectId && job.userId === userId) {
        merged.set(job.id, job);
      }
    }
    return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async publish(request: DouyinPublishRequest): Promise<PublishJob> {
    if (!this.config.enabled) {
      throw new AppError(503, "SERVICE_DISABLED", "Douyin publish is not enabled. Set DOUYIN_PUBLISH_ENABLED=true.");
    }

    const jobId = randomUUID();
    const now = Date.now();
    const job: PublishJob = {
      id: jobId,
      projectId: request.projectId,
      userId: request.userId,
      platform: "douyin",
      status: "pending",
      progressStage: "queued",
      progressMessage: "发布任务已创建，等待执行",
      logTail: [],
      request,
      result: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(jobId, job);
    this.historyStore.upsert(job);

    // Fire and forget — run the Python process asynchronously
    this.executePublish(job).catch((err) => {
      logger.error({ err, jobId }, "[douyin-publish] Unhandled error for job");
    });

    return job;
  }

  private async executePublish(job: PublishJob): Promise<void> {
    this.updateJob(job.id, {
      status: "running",
      progressStage: "preparing",
      progressMessage: "正在准备发布素材和账号环境",
    });

    const userCookiePath = this.getUserCookiePath(job.request.userId);
    if (!existsSync(userCookiePath)) {
      job.result = {
        ok: false,
        platform: "douyin",
        message: "\u8bf7\u5148\u626b\u7801\u7ed1\u5b9a\u6296\u97f3\u8d26\u53f7",
        errorDetail: null,
        screenshotUrl: null,
      };
      this.updateJob(job.id, {
        status: "failed",
        progressStage: "failed",
        progressMessage: "未找到可用的抖音登录 Cookie，请先扫码登录",
      });
      return;
    }

    const temporaryFiles: string[] = [];
    try {
      const stagedVideo = await this.materializeInputFile(job.request.videoFilePath, ".mp4");
      if (stagedVideo.isTemporary) {
        temporaryFiles.push(stagedVideo.filePath);
      }
      const stagedCover = normalizeOptionalPath(job.request.coverImagePath)
        ? await this.materializeInputFile(job.request.coverImagePath!, ".png")
        : null;
      if (stagedCover?.isTemporary) {
        temporaryFiles.push(stagedCover.filePath);
      }
      const bridgeParams = JSON.stringify({
        job_id: job.id,
        staging_dir: this.config.stagingDir,
        video_path: stagedVideo.filePath,
        title: job.request.title,
        tags: job.request.tags,
        account_file: userCookiePath,
        thumbnail_path: stagedCover?.filePath ?? null,
        publish_date: job.request.publishDate,
        social_auto_upload_dir: this.config.socialAutoUploadDir,
        link_url: job.request.linkUrl,
        product_link: job.request.productLink,
        product_title: job.request.productTitle,
        ai_generated_declaration: job.request.aiGeneratedDeclaration,
      });
      const result = await this.spawnBridge(job.id, bridgeParams);
      job.result = {
        ok: result.ok,
        platform: "douyin",
        message: result.message ?? "",
        errorDetail: result.errorDetail ?? null,
        screenshotUrl: result.screenshotUrl ?? null,
      };
      this.updateJob(job.id, {
        status: result.ok ? "success" : "failed",
        progressStage: result.ok ? "completed" : "failed",
        progressMessage: result.message ?? (result.ok ? "抖音发布成功" : "抖音发布失败"),
      });
    } catch (err) {
      job.result = {
        ok: false,
        platform: "douyin",
        message: err instanceof Error ? err.message : String(err),
        errorDetail: null,
        screenshotUrl: null,
      };
      this.updateJob(job.id, {
        status: "failed",
        progressStage: "failed",
        progressMessage: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await Promise.all(
        temporaryFiles.map(async (filePath) => {
          try {
            await unlink(filePath);
          } catch {
            // Ignore staging cleanup failures.
          }
        }),
      );
    }
  }

  private updateJob(
    jobId: string,
    patch: Partial<Pick<PublishJob, "status" | "progressStage" | "progressMessage">>,
  ): void {
    const job = this.jobs.get(jobId);
    if (job) {
      if (patch.status) {
        job.status = patch.status;
      }
      if (patch.progressStage !== undefined) {
        job.progressStage = patch.progressStage;
      }
      if (patch.progressMessage !== undefined) {
        job.progressMessage = patch.progressMessage;
      }
      job.updatedAt = Date.now();
      this.historyStore.upsert(job);
    }
  }

  private appendJobLog(jobId: string, rawLine: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }
    const line = rawLine.trim();
    if (!line) {
      return;
    }
    if (job.logTail[job.logTail.length - 1] !== line) {
      job.logTail = [...job.logTail.slice(-(MAX_LOG_TAIL - 1)), line];
    }
    job.updatedAt = Date.now();
    this.historyStore.upsert(job);
  }

  private async spawnBridge(jobId: string, jsonParams: string): Promise<DouyinPublishResult> {
    const result = await this.processManager.spawn({
      id: jobId,
      pythonBin: this.config.pythonBin,
      scriptPath: this.config.bridgeScriptPath,
      args: [jsonParams],
      timeoutMs: this.config.timeoutMs,
      onProgress: (event) => {
        this.updateJob(jobId, {
          progressStage: event.stage?.trim() || undefined,
          progressMessage: event.message?.trim() || undefined,
        });
        if (event.message?.trim()) {
          this.appendJobLog(jobId, event.message.trim());
        }
      },
      onLog: (line) => {
        this.appendJobLog(jobId, line);
        this.updateJob(jobId, { progressMessage: line });
      },
      onTimeout: () => {
        this.updateJob(jobId, {
          status: "failed",
          progressStage: "timeout",
          progressMessage: "发布超时，正在终止后台浏览器进程",
        });
      },
    });

    if (result.timedOut) {
      // B2: Check if bridge saved a timeout screenshot
      const screenshotUrl = this.findTimeoutScreenshot(jobId);
      return {
        ok: false,
        platform: "douyin",
        message: "发布超时",
        errorDetail: null,
        screenshotUrl,
      };
    }

    try {
      const match = result.stdout.match(/\{[\s\S]*\}\s*$/);
      return JSON.parse((match ? match[0] : result.stdout).trim()) as DouyinPublishResult;
    } catch {
      throw new AppError(
        502,
        "BRIDGE_OUTPUT_PARSE_FAILED",
        `Bridge returned non-JSON output (exit code ${result.exitCode}): ${result.stdout.trim().slice(0, 500)}`,
      );
    }
  }

  /**
   * B2: Look for a timeout screenshot saved by the Python bridge.
   * Convention: bridge saves to staging dir as `screenshot-{jobId}.png`.
   */
  private findTimeoutScreenshot(jobId: string): string | null {
    const screenshotPath = join(this.config.stagingDir, `screenshot-${jobId}.png`);
    if (existsSync(screenshotPath)) {
      // Return as a path that the frontend can fetch via the staging endpoint
      return `/publish-staging/screenshot-${jobId}.png`;
    }
    return null;
  }

  ensureStagingDir(): string {
    const dir = this.config.stagingDir;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  async stageFile(content: Buffer, filename: string): Promise<string> {
    const dir = this.ensureStagingDir();
    const filePath = join(dir, `${randomUUID()}-${filename}`);
    await writeFile(filePath, content);
    return filePath;
  }

  private resolveLocalStoragePath(url: string): string | null {
    const runtime = resolveRuntimeConfig(process.env);
    if (runtime.objectStorage.driver !== "local") {
      return null;
    }
    let pathname = url.trim();
    if (!pathname) {
      return null;
    }
    if (isHttpUrl(pathname)) {
      try {
        pathname = new URL(pathname).pathname;
      } catch {
        return null;
      }
    }
    const publicBase = runtime.objectStorage.publicBase;
    if (!pathname.startsWith(`${publicBase}/`)) {
      return null;
    }
    const relativePath = decodeURIComponent(pathname.slice(publicBase.length + 1));
    if (!relativePath) {
      return null;
    }
    const localRoot = resolveObjectStorageLocalRoot(runtime.objectStorage.localDir ?? undefined);
    const absolutePath = resolve(join(localRoot, relativePath));
    if (!absolutePath.startsWith(localRoot)) {
      return null;
    }
    return absolutePath;
  }

  private resolveFetchUrl(rawUrl: string): string | null {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return null;
    }
    if (isHttpUrl(trimmed)) {
      return trimmed;
    }
    if (/^[a-zA-Z]:[\\/]/.test(trimmed) || /^file:\/\//i.test(trimmed)) {
      return null;
    }
    const runtime = resolveRuntimeConfig(process.env);
    const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed.replace(/^\.?\//, "")}`;
    return `${runtime.server.internalBaseUrl}${normalizedPath}`;
  }

  private async materializeInputFile(
    sourcePath: string,
    fallbackExtension: string,
  ): Promise<{ filePath: string; isTemporary: boolean }> {
    const trimmed = sourcePath.trim();
    if (!trimmed) {
      throw new AppError(400, "MISSING_FILE_PATH", "Missing input file path");
    }
    if (existsSync(trimmed)) {
      return {
        filePath: trimmed,
        isTemporary: false,
      };
    }
    const localStoragePath = this.resolveLocalStoragePath(trimmed);
    if (localStoragePath && existsSync(localStoragePath)) {
      return {
        filePath: localStoragePath,
        isTemporary: false,
      };
    }
    const fetchUrl = this.resolveFetchUrl(trimmed);
    if (!fetchUrl) {
      throw new AppError(400, "INVALID_SOURCE_PATH", `无法解析为本地文件或可下载地址: ${trimmed}`);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.downloadTimeoutMs);
    try {
      const response = await fetch(fetchUrl, {
        method: "GET",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new AppError(502, "DOWNLOAD_FAILED", `下载资源失败: HTTP ${response.status} ${response.statusText}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength < 1) {
        throw new AppError(502, "EMPTY_DOWNLOAD", "下载的资源为空");
      }
      const stagedPath = join(
        this.ensureStagingDir(),
        `${randomUUID()}${resolveMediaExtension(trimmed, fallbackExtension)}`,
      );
      await writeFile(stagedPath, bytes);
      return {
        filePath: stagedPath,
        isTemporary: true,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
