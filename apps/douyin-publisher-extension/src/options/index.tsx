import {
  listAccounts,
  removeAccount,
  detectAndSaveLogin,
} from "@/background/cookie-manager";
import { STORAGE_KEYS, API_BASE_URL, API_PATH_PREFIX } from "@/shared/constants";
import type { BoundAccount } from "@/shared/types";

/** 删除后端账号 */
async function removeBackendAccount(accountId: string): Promise<void> {
  const [configResult, tokenResult] = await Promise.all([
    chrome.storage.local.get(STORAGE_KEYS.BACKEND_CONFIG),
    chrome.storage.local.get(STORAGE_KEYS.AUTH_TOKEN),
  ]);
  const config = configResult[STORAGE_KEYS.BACKEND_CONFIG] as { apiBaseUrl?: string } | undefined;
  const token = tokenResult[STORAGE_KEYS.AUTH_TOKEN] as string | undefined;

  if (!config?.apiBaseUrl || !token) {
    console.warn("[内容喵 Options] 未配置 API 或 Token，跳过后端删除");
    return;
  }

  const url = config.apiBaseUrl.endsWith(API_PATH_PREFIX)
    ? `${config.apiBaseUrl}/ext/douyin/accounts/${accountId}`
    : `${config.apiBaseUrl}${API_PATH_PREFIX}/ext/douyin/accounts/${accountId}`;

  await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

const accountList = document.getElementById("accountList")!;
const addAccountBtn = document.getElementById("addAccountBtn")!;
const apiUrlInput = document.getElementById("apiUrl") as HTMLInputElement;
const authTokenInput = document.getElementById("authToken") as HTMLInputElement;
const saveConfigBtn = document.getElementById("saveConfigBtn")!;

/** 渲染账号列表 */
async function renderAccounts(): Promise<void> {
  const accounts = await listAccounts();

  if (accounts.length === 0) {
    accountList.innerHTML =
      '<div class="empty-state">暂无绑定账号，点击下方按钮添加</div>';
    return;
  }

  accountList.innerHTML = accounts
    .map(
      (a: BoundAccount) => `
    <div class="account-item">
      <div class="account-info">
        <div class="label">${a.label || a.id.slice(0, 8)}</div>
        <div class="meta">
          ${a.douyinUid ? `UID: ${a.douyinUid}` : ""}
          ·
          ${
            a.status === "active"
              ? "已登录"
              : a.status === "expired"
              ? "已过期"
              : "待登录"
          }
        </div>
      </div>
      <button class="btn btn-danger" data-account-id="${a.id}">删除</button>
    </div>
  `
    )
    .join("");

  // 绑定删除事件
  accountList.querySelectorAll(".btn-danger").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const accountId = (e.target as HTMLElement).dataset.accountId!;
      if (confirm("确定要删除该账号吗？")) {
        await removeAccount(accountId);
        await removeBackendAccount(accountId); // 同步删除后端账号
        await renderAccounts();
      }
    });
  });
}

/** 加载已保存的配置 */
async function loadConfig(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.BACKEND_CONFIG);
  const config = result[STORAGE_KEYS.BACKEND_CONFIG];
  if (config) {
    apiUrlInput.value = (config as { apiBaseUrl: string }).apiBaseUrl;
  } else {
    apiUrlInput.value = API_BASE_URL;
  }

  const tokenResult = await chrome.storage.local.get(STORAGE_KEYS.AUTH_TOKEN);
  if (tokenResult[STORAGE_KEYS.AUTH_TOKEN]) {
    authTokenInput.value = "(已保存)";
  }
}

// 添加账号
addAccountBtn.addEventListener("click", async () => {
  const accounts = await listAccounts();
  const label = `抖音账号 ${accounts.length + 1}`;

  // 生成临时 ID 并打开登录页
  const id = crypto.randomUUID();
  const now = Date.now();
  const account: BoundAccount = {
    id,
    label,
    douyinUid: null,
    status: "pending",
    lastVerifiedAt: 0,
    createdAt: now,
  };

  accounts.push(account);
  const { saveAccounts } = await import("@/background/cookie-manager");
  await saveAccounts(accounts);

  // 打开抖音登录页
  await chrome.tabs.create({ url: "https://creator.douyin.com" });

  // 提示用户
  alert("请在打开的页面中登录抖音，登录成功后 Cookie 会自动保存");

  // 定时检测登录状态
  const checkInterval = setInterval(async () => {
    const detected = await detectAndSaveLogin(id);
    if (detected) {
      clearInterval(checkInterval);
      await renderAccounts();
    }
  }, 3000);

  // 60 秒超时
  setTimeout(() => clearInterval(checkInterval), 60_000);
});

// 保存配置
saveConfigBtn.addEventListener("click", async () => {
  const apiBaseUrl = apiUrlInput.value.trim() || API_BASE_URL;
  const token = authTokenInput.value.trim();

  await chrome.storage.local.set({
    [STORAGE_KEYS.BACKEND_CONFIG]: { apiBaseUrl },
  });

  if (token && token !== "(已保存)") {
    await chrome.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: token });
  }

  alert("配置已保存");
});

// 初始化
renderAccounts();
loadConfig();
