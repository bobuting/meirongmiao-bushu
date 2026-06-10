import type {
  PublishJob,
  ProgressReport,
  PublishJobResult,
  BoundAccount,
} from "@/shared/types";
import { API_BASE_URL, API_PATH_PREFIX } from "@/shared/constants";

/** 扩展专用 HTTP 客户端 */
export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string): void {
    this.token = token;
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body) {
      headers["Content-Type"] = "application/json";
    }
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const url = this.baseUrl.endsWith(API_PATH_PREFIX)
      ? `${this.baseUrl}${path}`
      : `${this.baseUrl}${API_PATH_PREFIX}${path}`;
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  // ── 账号管理 ──

  async listAccounts(): Promise<BoundAccount[]> {
    const res = await this.request<{ data: BoundAccount[] }>(
      "GET",
      "/ext/douyin/accounts"
    );
    return res.data;
  }

  async registerAccount(id: string, label: string): Promise<BoundAccount> {
    const res = await this.request<{ data: BoundAccount }>(
      "POST",
      "/ext/douyin/accounts",
      { id, label } // 传入本地生成的 ID，确保两端一致
    );
    return res.data;
  }

  async removeAccount(accountId: string): Promise<void> {
    await this.request("DELETE", `/ext/douyin/accounts/${accountId}`);
  }

  /** 同步账号信息（昵称/UID/状态）到后端 */
  async syncAccountInfo(
    accountId: string,
    data: { label?: string; douyinUid?: string | null; status?: string }
  ): Promise<void> {
    await this.request("PATCH", `/ext/douyin/accounts/${accountId}`, data);
  }

  // ── 任务管理 ──

  async pollNextJob(): Promise<PublishJob | null> {
    const res = await this.request<{ data: PublishJob | null }>(
      "GET",
      "/ext/douyin/jobs/poll"
    );
    return res.data;
  }

  async claimJob(jobId: string): Promise<PublishJob> {
    const res = await this.request<{ data: PublishJob }>(
      "POST",
      `/ext/douyin/jobs/${jobId}/claim`
    );
    return res.data;
  }

  async reportProgress(jobId: string, progress: ProgressReport): Promise<void> {
    await this.request("POST", `/ext/douyin/jobs/${jobId}/progress`, progress);
  }

  async completeJob(jobId: string, result: PublishJobResult): Promise<void> {
    await this.request("POST", `/ext/douyin/jobs/${jobId}/complete`, result);
  }

  async failJob(
    jobId: string,
    error: { code: string; message: string }
  ): Promise<void> {
    await this.request("POST", `/ext/douyin/jobs/${jobId}/fail`, error);
  }
}
