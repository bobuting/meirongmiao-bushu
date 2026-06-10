import { TaskRunner } from "./task-runner";
import { ApiClient } from "./api-client";
import { listAccounts, addAccount, saveAccounts, detectAndSaveLogin, getAccount } from "./cookie-manager";
import { isExtMessage, type ExtMessage } from "@/shared/messages";
import { STORAGE_KEYS } from "@/shared/constants";
import type { BackendConfig, ProgressReport, PublishJobResult, BoundAccount } from "@/shared/types";

/** Service Worker 入口 */
const api = new ApiClient();
const taskRunner = new TaskRunner(api);

chrome.runtime.onInstalled.addListener(() => {
  console.log("[内容喵] 扩展已安装");
  void initBackendConfig();
});

/** 保存 pending 账号的登录标签页 ID（持久化存储） */
async function savePendingLoginTabId(accountId: string, tabId: number): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PENDING_LOGIN_TABIDS);
  const map = (result[STORAGE_KEYS.PENDING_LOGIN_TABIDS] as Record<string, number>) ?? {};
  map[accountId] = tabId;
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_LOGIN_TABIDS]: map });
}

/** 获取并删除 pending 账号的登录标签页 ID */
async function getAndClearPendingLoginTabId(accountId: string): Promise<number | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PENDING_LOGIN_TABIDS);
  const map = result[STORAGE_KEYS.PENDING_LOGIN_TABIDS] as Record<string, number> | undefined;
  if (!map || !map[accountId]) return null;
  const tabId = map[accountId];
  delete map[accountId];
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_LOGIN_TABIDS]: map });
  return tabId;
}

/** 初始化后端配置 */
async function initBackendConfig(): Promise<void> {
  const configResult = await chrome.storage.local.get(STORAGE_KEYS.BACKEND_CONFIG);
  const config = configResult[STORAGE_KEYS.BACKEND_CONFIG] as BackendConfig | undefined;
  if (config?.apiBaseUrl) {
    api.setBaseUrl(config.apiBaseUrl);
  }

  const tokenResult = await chrome.storage.local.get(STORAGE_KEYS.AUTH_TOKEN);
  const token = tokenResult[STORAGE_KEYS.AUTH_TOKEN] as string | undefined;
  if (token) {
    api.setToken(token);
  }

  void taskRunner.start();
}

/** 响应扩展内部消息 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("[内容喵] 收到消息:", JSON.stringify(message));
  if (!isExtMessage(message)) {
    console.log("[内容喵] 消息不是 ExtMessage 类型，跳过");
    return;
  }

  switch (message.type) {
    case "PING":
      sendResponse({ type: "PONG" });
      break;
    case "REGISTER_ACCOUNT":
      console.log("[内容喵] 处理注册账号:", message.payload);
      void handleRegisterAccount(message.payload as { label: string }, sendResponse);
      return true;
    case "ADD_ACCOUNT":
      console.log("[内容喵] 处理添加账号:", message.payload);
      void handleAddAccount(message.payload as { label: string }, sendResponse, false);
      return true;
    case "ADD_ACCOUNT_WITH_LOGOUT":
      console.log("[内容喵] 处理退出并添加账号:", message.payload);
      void handleAddAccount(message.payload as { label: string }, sendResponse, true);
      return true;
    case "GET_STATUS":
      void handleGetStatus(sendResponse);
      return true;
    case "PUBLISH_PROGRESS":
      handlePublishProgress(message.payload as ProgressReport);
      sendResponse({ type: "PONG" });
      break;
    case "PUBLISH_COMPLETE":
      void handlePublishComplete(message.payload as { jobId: string; result: PublishJobResult });
      sendResponse({ type: "PONG" });
      break;
    case "PUBLISH_FAILED":
      void handlePublishFailed(message.payload as { jobId: string; error: string });
      sendResponse({ type: "PONG" });
      break;
    default:
      break;
  }
});

/** 响应外部消息（neirongmiao 网页发来的） */
chrome.runtime.onMessageExternal.addListener(
  (message, _sender, sendResponse) => {
    console.log("[内容喵] 收到外部消息:", JSON.stringify(message));
    if (message?.type === "PING") {
      console.log("[内容喵] 回复 PONG");
      sendResponse({ type: "PONG", installed: true });
      return;
    }

    if (message?.type === "SET_CONFIG") {
      console.log("[内容喵] 处理 SET_CONFIG:", JSON.stringify(message.payload));
      void handleSetConfig(message.payload, sendResponse);
      return true;
    }

    if (message?.type === "PUBLISH_REQUEST") {
      handlePublishRequest(sendResponse);
      return true;
    }
  }
);

/** 处理配置设置 */
async function handleSetConfig(
  payload: { apiBaseUrl?: string; authToken?: string },
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    if (payload.apiBaseUrl) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.BACKEND_CONFIG]: { apiBaseUrl: payload.apiBaseUrl },
      });
      api.setBaseUrl(payload.apiBaseUrl);
    }

    if (payload.authToken) {
      await chrome.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: payload.authToken });
      api.setToken(payload.authToken);
    }

    sendResponse({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "未知错误";
    sendResponse({ success: false, error: msg });
  }
}

/** 处理发布请求：触发即时轮询 */
function handlePublishRequest(
  sendResponse: (response: unknown) => void
): void {
  try {
    taskRunner.triggerImmediatePoll();
    sendResponse({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "未知错误";
    sendResponse({ success: false, error: msg });
  }
}

/** 处理进度上报 — 使用 payload 中的 jobId */
function handlePublishProgress(payload: ProgressReport): void {
  if (!payload.jobId) return;

  void api.reportProgress(payload.jobId, payload).catch((error) => {
    console.error("[内容喵] 上报进度失败:", error);
  });
}

/** 处理发布完成 — 释放任务锁 */
async function handlePublishComplete(
  payload: { jobId: string; result: PublishJobResult }
): Promise<void> {
  try {
    await api.completeJob(payload.jobId, {
      ok: payload.result.ok,
      message: payload.result.message,
      douyinItemId: payload.result.douyinItemId ?? null,
    });
  } catch (error) {
    console.error("[内容喵] 完成任务失败:", error);
  } finally {
    void taskRunner.clearJob(payload.jobId);
  }
}

/** 处理发布失败 — 释放任务锁 */
async function handlePublishFailed(
  payload: { jobId: string; error: string }
): Promise<void> {
  try {
    await api.failJob(payload.jobId, {
      code: "EXECUTION_ERROR",
      message: payload.error,
    });
  } catch (error) {
    console.error("[内容喵] 失败任务上报失败:", error);
  } finally {
    void taskRunner.clearJob(payload.jobId);
  }
}

/** 获取后端配置 */
export async function getBackendConfig(): Promise<BackendConfig | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.BACKEND_CONFIG);
  return (result[STORAGE_KEYS.BACKEND_CONFIG] as BackendConfig) ?? null;
}

/** 获取认证 Token */
export async function getAuthToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.AUTH_TOKEN);
  return (result[STORAGE_KEYS.AUTH_TOKEN] as string) ?? null;
}

/** 处理注册账号（本地创建 + 后端同步） */
async function handleRegisterAccount(
  payload: { label: string },
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    console.log("[内容喵] handleRegisterAccount 开始, label:", payload.label);
    const id = crypto.randomUUID();
    const now = Date.now();
    const account: BoundAccount = {
      id,
      label: payload.label,
      douyinUid: null,
      status: "pending",
      lastVerifiedAt: 0,
      createdAt: now,
    };
    const accounts = await listAccounts();
    accounts.push(account);
    await saveAccounts(accounts);
    console.log("[内容喵] 本地账号已创建:", id);

    const result = await api.registerAccount(id, payload.label);
    console.log("[内容喵] handleRegisterAccount 成功:", JSON.stringify(result));
    sendResponse({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("[内容喵] handleRegisterAccount 失败:", msg);
    sendResponse({ success: false, error: msg });
  }
}

/** 处理添加账号（本地创建 + Cookie 检测 + 打开抖音 + 后端同步） */
async function handleAddAccount(
  payload: { label: string },
  sendResponse: (response: unknown) => void,
  forceLogout: boolean
): Promise<void> {
  try {
    console.log("[内容喵] handleAddAccount 开始, label:", payload.label);

    const currentCookies = await chrome.cookies.getAll({ domain: ".douyin.com" });
    const currentSessionId = currentCookies.find(c => c.name === "sessionid");

    if (currentSessionId) {
      const accounts = await listAccounts();

      if (forceLogout) {
        console.log("[内容喵] 用户确认退出，清除抖音 Cookie");
        for (const cookie of currentCookies) {
          await chrome.cookies.remove({
            url: `https://${cookie.domain.replace(/^\./, "")}${cookie.path}`,
            name: cookie.name,
          });
        }
      } else {
        for (const acct of accounts) {
          const savedCookiesResult = await chrome.storage.local.get(`cookies_${acct.id}`);
          const savedCookies = savedCookiesResult[`cookies_${acct.id}`] as Array<{ name: string; value: string }> | undefined;

          if (savedCookies?.some(c => c.name === "sessionid" && c.value === currentSessionId.value)) {
            console.log("[内容喵] 当前登录已绑定账号:", acct.label, "状态:", acct.status);
            sendResponse({
              success: false,
              needLogout: true,
              existingLabel: acct.label,
              error: `当前浏览器已登录「${acct.label}」`
            });
            return;
          }
        }

        console.log("[内容喵] 浏览器有登录态但未绑定账号，可添加新账号");
      }
    }

    const { account, tabId } = await addAccount(payload.label);
    console.log("[内容喵] 本地账号已创建:", account.id, "状态:", account.status, "tabId:", tabId);

    if (account.status === "pending" && tabId) {
      await savePendingLoginTabId(account.id, tabId);
    }

    if (account.status === "active" && tabId) {
      await new Promise<void>((resolve) => {
        const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
          if (updatedTabId === tabId && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 15000);
      });

      try {
        const userInfo = await chrome.tabs.sendMessage(tabId, { type: "GET_USER_INFO" });
        console.log("[内容喵] Content Script 返回用户信息:", userInfo);
        if (userInfo?.nickname) {
          await updateAccountNickname(account.id, userInfo.nickname, userInfo.uid);
        }
      } catch (msgError) {
        console.warn("[内容喵] 发送消息失败:", msgError instanceof Error ? msgError.message : String(msgError));
      }
    }

    try {
      const result = await api.registerAccount(account.id, payload.label);
      console.log("[内容喵] 后端注册成功:", JSON.stringify(result));

      const latestAccount = await getAccount(account.id);
      if (latestAccount) {
        const syncData: { label?: string; douyinUid?: string | null; status?: string } = {};
        if (latestAccount.label !== payload.label) {
          syncData.label = latestAccount.label;
        }
        if (latestAccount.douyinUid) {
          syncData.douyinUid = latestAccount.douyinUid;
        }
        if (latestAccount.status !== "pending") {
          syncData.status = latestAccount.status;
        }
        if (Object.keys(syncData).length > 0) {
          await api.syncAccountInfo(account.id, syncData);
          console.log("[内容喵] 后端账号信息同步成功:", JSON.stringify(syncData));
        }
      }
    } catch (backendError) {
      const msg = backendError instanceof Error ? backendError.message : "未知错误";
      console.warn("[内容喵] 后端同步失败（不影响本地）:", msg);
    }

    if (account.status === "active" && tabId) {
      try {
        await chrome.tabs.remove(tabId);
        console.log("[内容喵] 已关闭抖音页面，用户可返回 Step5");
      } catch (e) {
        console.warn("[内容喵] 关闭标签页失败:", e instanceof Error ? e.message : String(e));
      }
    }

    sendResponse({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error("[内容喵] handleAddAccount 失败:", msg);
    sendResponse({ success: false, error: msg });
  }
}

/** 处理状态查询（返回真实账号列表） */
async function handleGetStatus(
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    const accounts = await listAccounts();
    sendResponse({
      type: "STATUS_RESPONSE",
      payload: {
        isRunning: taskRunner.isRunning,
        currentJobId: taskRunner.activeJobId,
        accounts: accounts.map((a) => ({
          id: a.id,
          label: a.label,
          douyinUid: a.douyinUid,
          status: a.status,
          lastVerifiedAt: a.lastVerifiedAt,
          createdAt: a.createdAt,
        })),
      },
    });
  } catch (error) {
    sendResponse({
      type: "STATUS_RESPONSE",
      payload: { isRunning: false, currentJobId: null, accounts: [] },
    });
  }
}

export { taskRunner };

// ── 抖音用户信息获取 ──

async function fetchDouyinUserInfo(_accountId: string): Promise<{ nickname: string; uid: string } | null> {
  let tab = (await chrome.tabs.query({ url: "https://creator.douyin.com/*" }))[0];

  if (!tab) {
    tab = await chrome.tabs.create({
      url: "https://creator.douyin.com/creator-micro/homepage",
      active: false,
    });
    await new Promise<void>((resolve) => {
      const listener = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
        if (tabId === tab!.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 10000);
    });
  }

  if (!tab?.id) return null;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_USER_INFO" });
    console.log("[内容喵] Content Script 返回用户信息:", response);
    return response;
  } catch (error) {
    console.warn("[内容喵] 获取抖音用户信息失败:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function updateAccountNickname(accountId: string, nickname: string, douyinUid: string): Promise<void> {
  const accounts = await listAccounts();
  const idx = accounts.findIndex((a) => a.id === accountId);
  if (idx === -1) return;

  accounts[idx] = {
    ...accounts[idx],
    label: nickname,
    douyinUid,
    updatedAt: Date.now(),
  } as import("@/shared/types").BoundAccount;
  await saveAccounts(accounts);
  console.log(`[内容喵] 账号昵称已更新: ${nickname} (${douyinUid})`);
}

// ── 登录检测：监听抖音 Cookie 变化 ──

let loginDetectTimer: ReturnType<typeof setTimeout> | null = null;

chrome.cookies.onChanged.addListener((changeInfo) => {
  if (!changeInfo.cookie.domain.includes("douyin.com")) return;
  if (changeInfo.removed) return;

  if (loginDetectTimer) clearTimeout(loginDetectTimer);
  loginDetectTimer = setTimeout(async () => {
    try {
      const accounts = await listAccounts();
      const pendingAccounts = accounts.filter((a) => a.status === "pending");

      for (const account of pendingAccounts) {
        const detected = await detectAndSaveLogin(account.id);
        if (detected) {
          console.log(`[内容喵] 账号 ${account.label} 登录成功`);
          const userInfo = await fetchDouyinUserInfo(account.id);
          if (userInfo) {
            await updateAccountNickname(account.id, userInfo.nickname, userInfo.uid);
            console.log(`[内容喵] 昵称已更新: ${userInfo.nickname}`);
          }
          const tokenResult = await chrome.storage.local.get(STORAGE_KEYS.AUTH_TOKEN);
          const hasToken = !!tokenResult[STORAGE_KEYS.AUTH_TOKEN];
          if (!hasToken) {
            console.warn("[内容喵] 未配置认证 Token，无法同步到后端");
            continue;
          }
          try {
            const latestAcct = await getAccount(account.id);
            await api.syncAccountInfo(account.id, {
              label: latestAcct?.label,
              douyinUid: latestAcct?.douyinUid ?? null,
              status: "active",
            });
            console.log("[内容喵] 后端账号状态已同步为 active，昵称:", latestAcct?.label);
          } catch (e) {
            console.warn("[内容喵] 同步后端失败:", e instanceof Error ? e.message : String(e));
          }

          const loginTabId = await getAndClearPendingLoginTabId(account.id);
          if (loginTabId) {
            try {
              await chrome.tabs.remove(loginTabId);
              console.log("[内容喵] 已关闭抖音登录页");
            } catch (e) {
              console.warn("[内容喵] 关闭标签页失败:", e instanceof Error ? e.message : String(e));
            }
          }
        }
      }
    } catch (error) {
      console.error("[内容喵] 登录检测失败:", error);
    }
  }, 1000);
});
