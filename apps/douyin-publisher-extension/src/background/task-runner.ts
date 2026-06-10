import { ApiClient } from "./api-client";
import { switchToAccount } from "./cookie-manager";
import { POLL_INTERVAL_MS } from "@/shared/constants";
import type { PublishJob } from "@/shared/types";

/** 发送消息最大重试次数 */
const SEND_MESSAGE_RETRIES = 3;

/** 重试间隔（毫秒） */
const SEND_MESSAGE_RETRY_DELAY = 2000;

/** 带重试的 sendMessage，解决 content script 未就绪的问题 */
async function sendMessageWithRetry(
  tabId: number,
  message: { type: string; payload: unknown },
  maxRetries: number = SEND_MESSAGE_RETRIES
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, SEND_MESSAGE_RETRY_DELAY));
      }
    }
  }
  throw lastError;
}

const ACTIVE_JOB_KEY = "nrm_ext_active_job_id";

/** 任务运行器：轮询 → 认领 → 执行 → 上报 */
export class TaskRunner {
  private api: ApiClient;
  private running = false;
  private currentJobId: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(api: ApiClient) {
    this.api = api;
  }

  /** 启动轮询（先恢复上次未完成的任务锁） */
  async start(): Promise<void> {
    if (this.running) return;
    // 从 session storage 恢复上次 service worker 被杀前的任务锁
    const stored = await chrome.storage.session.get(ACTIVE_JOB_KEY);
    if (stored[ACTIVE_JOB_KEY]) {
      console.log("[内容喵] 恢复上次未释放的任务锁:", stored[ACTIVE_JOB_KEY]);
      this.currentJobId = stored[ACTIVE_JOB_KEY] as string;
    }
    this.running = true;
    void this.poll();
    this.pollTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    console.log("[内容喵] 任务轮询已启动");
  }

  /** 停止轮询 */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.log("[内容喵] 任务轮询已停止");
  }

  get isRunning(): boolean {
    return this.running;
  }

  get activeJobId(): string | null {
    return this.currentJobId;
  }

  /** 设置当前任务锁（同步写入 session storage） */
  private async lockJob(jobId: string): Promise<void> {
    this.currentJobId = jobId;
    await chrome.storage.session.set({ [ACTIVE_JOB_KEY]: jobId });
  }

  /** 任务完成后由 background/index 调用，释放任务锁 */
  async clearJob(jobId: string): Promise<void> {
    if (this.currentJobId === jobId) {
      this.currentJobId = null;
      await chrome.storage.session.remove(ACTIVE_JOB_KEY);
    }
  }

  /** 立即触发一次轮询（跳过等待间隔） */
  triggerImmediatePoll(): void {
    if (this.currentJobId) return;
    void this.poll();
  }

  private async poll(): Promise<void> {
    if (this.currentJobId) return;

    try {
      const job = await this.api.pollNextJob();
      if (!job) return;

      await this.executeJob(job);
    } catch (error) {
      console.error("[内容喵] 轮询失败:", error);
    }
  }

  private async executeJob(job: PublishJob): Promise<void> {
    // 1. 先认领任务，成功后才设锁（避免 claim 失败导致锁卡死）
    try {
      await this.api.claimJob(job.id);
    } catch (claimError) {
      console.error("[内容喵] 认领任务失败:", claimError);
      return;
    }

    await this.lockJob(job.id);

    try {
      // 2. 切换 Cookie 到目标账号
      const switched = await switchToAccount(job.accountId);
      if (!switched) {
        await this.api.failJob(job.id, {
          code: "COOKIE_NOT_FOUND",
          message: "该账号的 Cookie 不存在，请重新绑定",
        });
        await this.clearJob(job.id);
        return;
      }

      // 3. 打开或导航到抖音创作者发布页
      const tabs = await chrome.tabs.query({
        url: "https://creator.douyin.com/*",
      });

      let targetTab = tabs[0];

      if (!targetTab) {
        targetTab = await chrome.tabs.create({
          url: "https://creator.douyin.com/creator-micro/content/publish",
          active: true,
        });
      } else {
        await chrome.tabs.update(targetTab.id!, {
          url: "https://creator.douyin.com/creator-micro/content/publish",
        });
      }

      // 等待页面加载完成
      let pageLoaded = false;
      await new Promise<void>((resolve) => {
        const listener = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
          if (tabId === targetTab!.id && info.status === "complete") {
            pageLoaded = true;
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => {
          if (!pageLoaded) {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        }, 15_000);
      });

      if (!pageLoaded) {
        throw new Error("抖音创作者页面加载超时（15秒）");
      }

      // 4. 发送执行指令给 content script（带重试）
      await sendMessageWithRetry(targetTab.id!, {
        type: "EXECUTE_PUBLISH",
        payload: { job },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "未知执行错误";
      await this.api.failJob(job.id, {
        code: "EXECUTION_ERROR",
        message,
      });
      await this.clearJob(job.id);
    }
  }
}
