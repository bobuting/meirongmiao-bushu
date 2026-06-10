import type { BoundAccount, DouyinCookie } from "@/shared/types";
import {
  STORAGE_KEYS,
  DOUYIN_DOMAIN,
  AUTH_COOKIE_NAMES,
} from "@/shared/constants";

/** 账号存储：增删改查 */
export async function listAccounts(): Promise<BoundAccount[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ACCOUNTS);
  return (result[STORAGE_KEYS.ACCOUNTS] as BoundAccount[]) ?? [];
}

export async function saveAccounts(accounts: BoundAccount[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.ACCOUNTS]: accounts });
}

export async function getAccount(
  accountId: string
): Promise<BoundAccount | null> {
  const accounts = await listAccounts();
  return accounts.find((a) => a.id === accountId) ?? null;
}

export async function addAccount(
  label: string
): Promise<{ account: BoundAccount; tabId: number }> {
  const id = crypto.randomUUID();
  const now = Date.now();

  // 如果浏览器已有抖音登录 Cookie，保存为第一个账号
  const alreadyLoggedIn = await hasAuthCookies();
  let status: BoundAccount["status"] = "pending";

  if (alreadyLoggedIn) {
    status = "active";
  }

  const account: BoundAccount = {
    id,
    label,
    douyinUid: null,
    status,
    lastVerifiedAt: alreadyLoggedIn ? now : 0,
    createdAt: now,
  };

  const accounts = await listAccounts();
  accounts.push(account);
  await saveAccounts(accounts);

  if (alreadyLoggedIn) {
    // 浏览器已登录 → 直接保存当前 Cookie 到此账号
    const cookies = await exportCookies();
    await saveCookiesForAccount(id, cookies);
  }

  // 打开抖音创作者页面
  const tab = await chrome.tabs.create({
    url: "https://creator.douyin.com",
  });

  return { account, tabId: tab.id! };
}

export async function removeAccount(accountId: string): Promise<void> {
  const accounts = await listAccounts();
  const filtered = accounts.filter((a) => a.id !== accountId);

  // 清除该账号的 Cookie 存储
  await chrome.storage.local.remove(`cookies_${accountId}`);
  await saveAccounts(filtered);
}

export async function updateAccountStatus(
  accountId: string,
  status: BoundAccount["status"]
): Promise<void> {
  const accounts = await listAccounts();
  const idx = accounts.findIndex((a) => a.id === accountId);
  if (idx === -1) return;

  const updated: BoundAccount = { ...accounts[idx], status, updatedAt: Date.now() };
  accounts[idx] = updated;
  await saveAccounts(accounts);
}

/** 导出当前浏览器的抖音 Cookie */
export async function exportCookies(): Promise<DouyinCookie[]> {
  const cookies = await chrome.cookies.getAll({ domain: DOUYIN_DOMAIN });
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite as DouyinCookie["sameSite"],
    expirationDate: c.expirationDate,
  }));
}

/** 将 Cookie 组保存到指定账号 */
export async function saveCookiesForAccount(
  accountId: string,
  cookies: DouyinCookie[]
): Promise<void> {
  await chrome.storage.local.set({ [`cookies_${accountId}`]: cookies });
}

/** 读取指定账号的 Cookie 组 */
export async function loadCookiesForAccount(
  accountId: string
): Promise<DouyinCookie[]> {
  const result = await chrome.storage.local.get(`cookies_${accountId}`);
  return (result[`cookies_${accountId}`] as DouyinCookie[]) ?? [];
}

/** 清除浏览器中所有抖音 Cookie */
async function clearDouyinCookies(): Promise<void> {
  const cookies = await chrome.cookies.getAll({ domain: DOUYIN_DOMAIN });
  for (const cookie of cookies) {
    await chrome.cookies.remove({
      url: `https://${cookie.domain.replace(/^\./, "")}${cookie.path}`,
      name: cookie.name,
    });
  }
}

/** 切换到指定账号：先注入新 Cookie 再清除旧的（避免中途失败丢登录态） */
export async function switchToAccount(accountId: string): Promise<boolean> {
  const cookies = await loadCookiesForAccount(accountId);
  if (cookies.length === 0) return false;

  // 先注入目标账号的 Cookie（覆盖同名旧值）
  for (const cookie of cookies) {
    await chrome.cookies.set({
      url: `https://${cookie.domain.replace(/^\./, "")}${cookie.path}`,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      expirationDate: cookie.expirationDate,
    });
  }

  // 注入成功后再清除不属于目标账号的多余 Cookie
  const injectedNames = new Set(cookies.map((c) => c.name));
  const current = await chrome.cookies.getAll({ domain: DOUYIN_DOMAIN });
  for (const c of current) {
    if (!injectedNames.has(c.name)) {
      await chrome.cookies.remove({
        url: `https://${c.domain.replace(/^\./, "")}${c.path}`,
        name: c.name,
      });
    }
  }

  return true;
}

/** 检查当前浏览器是否有有效的抖音登录 Cookie */
export async function hasAuthCookies(): Promise<boolean> {
  const cookies = await chrome.cookies.getAll({ domain: DOUYIN_DOMAIN });
  const cookieNames = new Set(cookies.map((c) => c.name));
  return AUTH_COOKIE_NAMES.every((name) => cookieNames.has(name));
}

/** 检测登录成功并保存 Cookie */
export async function detectAndSaveLogin(
  accountId: string
): Promise<boolean> {
  const hasAuth = await hasAuthCookies();
  if (!hasAuth) return false;

  const cookies = await exportCookies();
  await saveCookiesForAccount(accountId, cookies);
  await updateAccountStatus(accountId, "active");

  return true;
}

/** 从后端 API 同步账号列表（与 Step5 保持一致） */
export async function syncAccountsFromBackend(
  apiBaseUrl: string,
  authToken: string
): Promise<BoundAccount[]> {
  const response = await fetch(`${apiBaseUrl}/ext/douyin/accounts`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`API 错误: ${response.status}`);
  }

  const data = await response.json();
  if (data.code !== "SUCCESS") {
    throw new Error(data.message || "同步失败");
  }

  const backendAccounts = data.data as Array<{
    id: string;
    label: string;
    douyinUid: string | null;
    status: "active" | "expired" | "pending" | "revoked";
    lastVerifiedAt: number | null;
    createdAt: number;
  }>;

  // 转换为 BoundAccount 格式
  const convertedAccounts: BoundAccount[] = backendAccounts.map((a) => ({
    id: a.id,
    label: a.label,
    douyinUid: a.douyinUid,
    status: a.status,
    lastVerifiedAt: a.lastVerifiedAt,
    createdAt: a.createdAt,
  }));

  // 保存到本地存储（保持插件离线可用）
  await saveAccounts(convertedAccounts);

  return convertedAccounts;
}
