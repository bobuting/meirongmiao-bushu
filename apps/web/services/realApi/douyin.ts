/**
 * realApi/douyin.ts - 抖音集成相关 API 实现
 */

import { request } from "../backendApi.request";

export interface RealDouyinApi {
  getDouyinPublishStatus(): Promise<{ enabled: boolean }>;
  getDouyinAuthStatus(token: string): Promise<{
    hasValidCookie: boolean;
    status: "none" | "pending" | "authenticated" | "expired";
    username: string | null;
    expiresAt: number | null;
    updatedAt: number | null;
  }>;
  getDouyinRemoteLoginStatus(token: string): Promise<{
    enabled: boolean;
    activeSessions: number;
  }>;
  generateDouyinQRCode(token: string): Promise<{
    sessionId: string;
    qrCodeUrl: string;
    qrUpdatedAt: number | null;
    expiresAt: number;
  }>;
  checkDouyinScanStatus(token: string, sessionId: string): Promise<{
    qrCodeUrl: string;
    qrUpdatedAt: number | null;
    status: "pending" | "scanned" | "confirmed" | "timeout" | "error";
    errorMessage: string | null;
    expiresAt: number;
    username?: string;
  }>;
  createDouyinRemoteSession(token: string): Promise<{
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
    sessionId: string;
    port: number;
    url: string;
  }>;
  getDouyinRemoteSession(token: string, sessionId: string): Promise<{
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
    sessionId: string;
    port: number;
    url: string;
  }>;
  closeDouyinRemoteSession(token: string, sessionId: string): Promise<{ ok: boolean }>;
  clearDouyinCookie(token: string): Promise<{ ok: boolean }>;
  publishToDouyin(
    token: string,
    projectId: string,
    payload: {
      title: string;
      tags: string[];
      videoFilePath: string;
      coverImagePath?: string | null;
      linkUrl?: string | null;
      productLink?: string | null;
      productTitle?: string | null;
      aiGeneratedDeclaration?: boolean;
      publishDate?: number;
    },
  ): Promise<{ jobId: string; status: string }>;
  getPublishJob(
    token: string,
    projectId: string,
    jobId: string,
  ): Promise<{
    id: string;
    status: string;
    progressMessage: string | null;
    progressStage: string | null;
    logTail: string[] | null;
    result: { ok: boolean; message: string; errorDetail: string | null; screenshotUrl?: string | null } | null;
  }>;
  getPublishJobs(
    token: string,
    projectId: string,
  ): Promise<Array<{
    id: string;
    status: string;
    douyinVideoId: string | null;
    createdAt: number;
    result: { ok: boolean; message: string; errorDetail: string | null } | null;
  }>>;

  // ── 扩展发布 API（独立于服务端自动化） ──

  /** 查询扩展绑定的抖音账号列表 */
  extListAccounts(token: string): Promise<Array<{
    id: string;
    label: string;
    douyinUid: string | null;
    status: string;
    lastVerifiedAt: number | null;
    createdAt: number;
  }>>;

  /** 注册新的扩展账号 */
  extRegisterAccount(token: string, label: string): Promise<{
    id: string;
    label: string;
    status: string;
  }>;

  /** 删除扩展账号 */
  extRemoveAccount(token: string, accountId: string): Promise<{ ok: boolean }>;

  /** 创建扩展发布任务 */
  extCreatePublishJob(
    token: string,
    payload: {
      projectId: string;
      accountId: string;
      videoUrl: string;
      title: string;
      tags?: string[];
      coverImageUrl?: string;
      publishDate?: number;
    }
  ): Promise<{ jobId: string }>;

  /** 查询扩展发布任务列表 */
  extListPublishJobs(token: string): Promise<Array<{
    id: string;
    projectId: string;
    accountId: string;
    status: string;
    stage: string | null;
    createdAt: number;
  }>>;

  /** 扩展轮询：获取下一个待执行任务 */
  extPollNextJob(token: string): Promise<{
    id: string;
    accountId: string;
    input: {
      videoUrl: string;
      title: string;
      tags: string[];
      coverImageUrl: string | null;
      publishDate: number;
    };
  } | null>;

  /** 扩展认领任务 */
  extClaimJob(token: string, jobId: string): Promise<{ claimed: boolean }>;

  /** 扩展上报进度 */
  extReportProgress(token: string, jobId: string, progress: {
    stage: string;
    message: string;
    progress?: number;
  }): Promise<{ ok: boolean }>;

  /** 扩展完成任务 */
  extCompleteJob(token: string, jobId: string, result: {
    ok: boolean;
    message: string;
    douyinItemId?: string;
  }): Promise<{ ok: boolean }>;

  /** 扩展失败 */
  extFailJob(token: string, jobId: string, error: {
    code: string;
    message: string;
  }): Promise<{ ok: boolean }>;
}

export const realDouyinApi: RealDouyinApi = {
  getDouyinPublishStatus() {
    return request<{ enabled: boolean }>("GET", "/douyin-publish/status");
  },

  getDouyinAuthStatus(token: string) {
    return request<{
      hasValidCookie: boolean;
      status: "none" | "pending" | "authenticated" | "expired";
      username: string | null;
      expiresAt: number | null;
      updatedAt: number | null;
    }>("GET", "/douyin/auth/status", { token });
  },

  getDouyinRemoteLoginStatus(token: string) {
    return request<{
      enabled: boolean;
      activeSessions: number;
    }>("GET", "/douyin/auth/remote-login/status", { token });
  },

  generateDouyinQRCode(token: string) {
    return request<{
      sessionId: string;
      qrCodeUrl: string;
      qrUpdatedAt: number | null;
      expiresAt: number;
    }>("POST", "/douyin/auth/qr-code", { token });
  },

  checkDouyinScanStatus(token: string, sessionId: string) {
    return request<{
      qrCodeUrl: string;
      qrUpdatedAt: number | null;
      status: "pending" | "scanned" | "confirmed" | "timeout" | "error";
      errorMessage: string | null;
      expiresAt: number;
      username?: string;
    }>("GET", `/douyin/auth/status/${sessionId}`, { token });
  },

  createDouyinRemoteSession(token: string) {
    return request<{
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
      sessionId: string;
      port: number;
      url: string;
    }>("POST", "/douyin/auth/remote-session", { token });
  },

  getDouyinRemoteSession(token: string, sessionId: string) {
    return request<{
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
      sessionId: string;
      port: number;
      url: string;
    }>("GET", `/douyin/remote-session/${sessionId}`, { token });
  },

  closeDouyinRemoteSession(token: string, sessionId: string) {
    return request<{ ok: boolean }>("DELETE", `/douyin/remote-session/${sessionId}`, { token });
  },

  clearDouyinCookie(token: string) {
    return request<{ ok: boolean }>("DELETE", "/douyin/auth/cookie", { token });
  },

  publishToDouyin(
    token: string,
    projectId: string,
    payload: {
      title: string;
      tags: string[];
      videoFilePath: string;
      coverImagePath?: string | null;
      linkUrl?: string | null;
      productLink?: string | null;
      productTitle?: string | null;
      aiGeneratedDeclaration?: boolean;
      publishDate?: number;
    },
  ) {
    return request<{ jobId: string; status: string }>("POST", `/projects/${projectId}/publish-to-douyin`, {
      token,
      body: payload,
    });
  },

  getPublishJob(token: string, projectId: string, jobId: string) {
    return request<{
      id: string;
      status: string;
      progressMessage: string | null;
      progressStage: string | null;
      logTail: string[] | null;
      result: { ok: boolean; message: string; errorDetail: string | null; screenshotUrl?: string | null } | null;
    }>("GET", `/projects/${projectId}/publish-jobs/${jobId}`, { token });
  },

  getPublishJobs(token: string, projectId: string) {
    return request<Array<{
      id: string;
      status: string;
      douyinVideoId: string | null;
      createdAt: number;
      result: { ok: boolean; message: string; errorDetail: string | null } | null;
    }>>("GET", `/projects/${projectId}/publish-jobs`, { token });
  },

  // ── 扩展发布 API 实现 ──

  extListAccounts(token: string) {
    return request<Array<{
      id: string;
      label: string;
      douyinUid: string | null;
      status: string;
      lastVerifiedAt: number | null;
      createdAt: number;
    }>>("GET", "/ext/douyin/accounts", { token });
  },

  extRegisterAccount(token: string, label: string) {
    return request<{
      id: string;
      label: string;
      status: string;
    }>("POST", "/ext/douyin/accounts", { token, body: { label } });
  },

  extRemoveAccount(token: string, accountId: string) {
    return request<{ ok: boolean }>("DELETE", `/ext/douyin/accounts/${accountId}`, { token });
  },

  extCreatePublishJob(
    token: string,
    payload: {
      projectId: string;
      accountId: string;
      videoUrl: string;
      title: string;
      tags?: string[];
      coverImageUrl?: string;
      publishDate?: number;
    }
  ) {
    return request<{ jobId: string }>("POST", "/ext/douyin/publish", { token, body: payload });
  },

  extListPublishJobs(token: string) {
    return request<Array<{
      id: string;
      projectId: string;
      accountId: string;
      status: string;
      stage: string | null;
      createdAt: number;
    }>>("GET", "/ext/douyin/jobs", { token });
  },

  extPollNextJob(token: string) {
    return request<{
      id: string;
      accountId: string;
      input: {
        videoUrl: string;
        title: string;
        tags: string[];
        coverImageUrl: string | null;
        publishDate: number;
      };
    } | null>("GET", "/ext/douyin/jobs/poll", { token });
  },

  extClaimJob(token: string, jobId: string) {
    return request<{ claimed: boolean }>("POST", `/ext/douyin/jobs/${jobId}/claim`, { token });
  },

  extReportProgress(token: string, jobId: string, progress: {
    stage: string;
    message: string;
    progress?: number;
  }) {
    return request<{ ok: boolean }>("POST", `/ext/douyin/jobs/${jobId}/progress`, { token, body: progress });
  },

  extCompleteJob(token: string, jobId: string, result: {
    ok: boolean;
    message: string;
    douyinItemId?: string;
  }) {
    return request<{ ok: boolean }>("POST", `/ext/douyin/jobs/${jobId}/complete`, { token, body: result });
  },

  extFailJob(token: string, jobId: string, error: {
    code: string;
    message: string;
  }) {
    return request<{ ok: boolean }>("POST", `/ext/douyin/jobs/${jobId}/fail`, { token, body: error });
  },
};