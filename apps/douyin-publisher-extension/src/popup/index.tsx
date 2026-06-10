import { listAccounts, addAccount, syncAccountsFromBackend } from "@/background/cookie-manager";
import { STORAGE_KEYS } from "@/shared/constants";
import type { BoundAccount } from "@/shared/types";

const accountSection = document.getElementById("accountSection")!;
const addAccountBtn = document.getElementById("addAccountBtn") as HTMLButtonElement;
const openOptionsBtn = document.getElementById("openOptionsBtn")!;
const connectionStatus = document.getElementById("connectionStatus")!;
const jobStatus = document.getElementById("jobStatus")!;
const jobStage = document.getElementById("jobStage")!;
const jobMessage = document.getElementById("jobMessage")!;
const addAccountStatus = document.getElementById("addAccountStatus")!;
const syncAccountsBtn = document.getElementById("syncAccountsBtn") as HTMLButtonElement;
const syncAccountsStatus = document.getElementById("syncAccountsStatus")!;

/** 渲染账号列表 */
async function renderAccounts(): Promise<void> {
  const accounts = await listAccounts();

  if (accounts.length === 0) {
    accountSection.innerHTML = '<div class="empty-state">暂无绑定账号</div>';
    return;
  }

  accountSection.innerHTML = accounts
    .map(
      (a: BoundAccount) => `
    <div class="account-item">
      <span class="label">${a.label || a.id.slice(0, 8)}</span>
      <span class="status ${a.status}">${
        a.status === "active"
          ? "已登录"
          : a.status === "expired"
          ? "已过期"
          : "待登录"
      }</span>
    </div>
  `
    )
    .join("");
}

/** 检查后端连接状态 */
async function checkConnection(): Promise<void> {
  const [configResult, tokenResult] = await Promise.all([
    chrome.storage.local.get(STORAGE_KEYS.BACKEND_CONFIG),
    chrome.storage.local.get(STORAGE_KEYS.AUTH_TOKEN),
  ]);
  const config = configResult[STORAGE_KEYS.BACKEND_CONFIG] as { apiBaseUrl?: string } | undefined;
  const token = tokenResult[STORAGE_KEYS.AUTH_TOKEN] as string | undefined;

  const configInfo = document.getElementById("configInfo")!;
  if (config?.apiBaseUrl && token) {
    connectionStatus.textContent = "已配置";
    connectionStatus.className = "status-badge connected";
    configInfo.innerHTML = `
      <div class="config-detail"><span class="config-label">API</span><span class="config-value">${config.apiBaseUrl}</span></div>
      <div class="config-detail"><span class="config-label">Token</span><span class="config-value">${token.slice(0, 8)}...${token.slice(-4)}</span></div>
    `;
    configInfo.style.display = "block";
  } else if (config?.apiBaseUrl) {
    connectionStatus.textContent = "未认证";
    connectionStatus.className = "status-badge disconnected";
    configInfo.innerHTML = `
      <div class="config-detail"><span class="config-label">API</span><span class="config-value">${config.apiBaseUrl}</span></div>
      <div class="config-detail"><span class="config-label">Token</span><span class="config-value config-missing">未设置</span></div>
    `;
    configInfo.style.display = "block";
  } else {
    connectionStatus.textContent = "未配置";
    connectionStatus.className = "status-badge disconnected";
    configInfo.innerHTML = `<div class="config-missing">请先在网页端点击「一键配置」</div>`;
    configInfo.style.display = "block";
  }
}

// 添加账号（由 background 处理，避免弹窗关闭导致中断）
addAccountBtn.addEventListener("click", async () => {
  addAccountBtn.disabled = true;
  addAccountBtn.textContent = "添加中...";
  addAccountStatus.style.display = "none";

  try {
    const label = `账号 ${(await listAccounts()).length + 1}`;
    console.log("[内容喵 Popup] 请求添加账号:", label);

    const resp = await new Promise<{ success: boolean; error?: string; needLogout?: boolean; existingLabel?: string }>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "ADD_ACCOUNT", payload: { label } },
        (res) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(res ?? { success: false, error: "无响应" });
          }
        }
      );
    });

    if (resp.success) {
      addAccountStatus.textContent = "账号已添加，请在打开的抖音页面登录";
      addAccountStatus.className = "config-info";
      addAccountStatus.style.display = "block";
    } else if (resp.needLogout) {
      // 显示确认对话框：退出当前账号并继续
      addAccountStatus.innerHTML = `
        <span>当前已登录「${resp.existingLabel ?? "未知"}」</span>
        <div style="margin-top:8px;display:flex;gap:8px;">
          <button id="confirmLogoutBtn" style="flex:1;padding:6px 12px;border:none;border-radius:6px;background:#fe2c55;color:#fff;font-weight:bold;cursor:pointer;font-size:12px;">
            退出并继续
          </button>
          <button id="cancelLogoutBtn" style="flex:1;padding:6px 12px;border:1px solid #ddd;border-radius:6px;background:#fff;color:#666;cursor:pointer;font-size:12px;">
            取消
          </button>
        </div>
      `;
      addAccountStatus.className = "config-info";
      addAccountStatus.style.cssText = "display:block; color: #dc2626;";

      // 绑定按钮事件
      document.getElementById("confirmLogoutBtn")?.addEventListener("click", async () => {
        addAccountStatus.innerHTML = "正在退出并添加...";
        addAccountStatus.style.color = "#2563eb";
        try {
          const retryResp = await new Promise<{ success: boolean; error?: string }>((resolve) => {
            chrome.runtime.sendMessage(
              { type: "ADD_ACCOUNT_WITH_LOGOUT", payload: { label } },
              (res) => {
                if (chrome.runtime.lastError) {
                  resolve({ success: false, error: chrome.runtime.lastError.message });
                } else {
                  resolve(res ?? { success: false, error: "无响应" });
                }
              }
            );
          });
          if (retryResp.success) {
            addAccountStatus.textContent = "已退出并添加新账号，请在抖音页面登录新号";
            addAccountStatus.style.color = "#16a34a";
          } else {
            addAccountStatus.textContent = `添加失败: ${retryResp.error ?? "未知错误"}`;
            addAccountStatus.style.color = "#dc2626";
          }
          await renderAccounts();
        } catch (err) {
          addAccountStatus.textContent = `操作失败: ${err instanceof Error ? err.message : String(err)}`;
          addAccountStatus.style.color = "#dc2626";
        }
      });

      document.getElementById("cancelLogoutBtn")?.addEventListener("click", () => {
        addAccountStatus.style.display = "none";
      });
    } else {
      addAccountStatus.textContent = `添加失败: ${resp.error ?? "未知错误"}`;
      addAccountStatus.className = "config-info";
      addAccountStatus.style.cssText = "display:block; color: #dc2626;";
    }

    await renderAccounts();
  } catch (error) {
    addAccountStatus.textContent = `添加失败: ${error instanceof Error ? error.message : String(error)}`;
    addAccountStatus.className = "config-info";
    addAccountStatus.style.cssText = "display:block; color: #dc2626;";
  } finally {
    addAccountBtn.disabled = false;
    addAccountBtn.textContent = "添加抖音账号";
  }
});

// 打开选项页
openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// 同步账号（从后端 API）
syncAccountsBtn.addEventListener("click", async () => {
  syncAccountsBtn.disabled = true;
  syncAccountsBtn.textContent = "同步中...";
  syncAccountsStatus.style.display = "none";

  try {
    // 获取配置和 token
    const [configResult, tokenResult] = await Promise.all([
      chrome.storage.local.get(STORAGE_KEYS.BACKEND_CONFIG),
      chrome.storage.local.get(STORAGE_KEYS.AUTH_TOKEN),
    ]);
    const config = configResult[STORAGE_KEYS.BACKEND_CONFIG] as { apiBaseUrl?: string } | undefined;
    const token = tokenResult[STORAGE_KEYS.AUTH_TOKEN] as string | undefined;

    if (!config?.apiBaseUrl || !token) {
      syncAccountsStatus.textContent = "请先在网页端点击「一键配置」";
      syncAccountsStatus.className = "config-info";
      syncAccountsStatus.style.cssText = "display:block; color: #d97706;";
      return;
    }

    // 从后端同步账号
    const syncedAccounts = await syncAccountsFromBackend(config.apiBaseUrl, token);

    // 更新显示
    await renderAccounts();

    syncAccountsStatus.textContent = `已同步 ${syncedAccounts.length} 个账号`;
    syncAccountsStatus.className = "config-info";
    syncAccountsStatus.style.cssText = "display:block; color: #16a34a;";
  } catch (error) {
    syncAccountsStatus.textContent = `同步失败: ${error instanceof Error ? error.message : String(error)}`;
    syncAccountsStatus.className = "config-info";
    syncAccountsStatus.style.cssText = "display:block; color: #dc2626;";
  } finally {
    syncAccountsBtn.disabled = false;
    syncAccountsBtn.textContent = "同步账号（从网页端）";
  }
});

// 监听进度更新
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PUBLISH_PROGRESS") {
    jobStatus.style.display = "block";
    jobStage.textContent = message.payload.stage;
    jobMessage.textContent = message.payload.message;
  }
  if (
    message.type === "PUBLISH_COMPLETE" ||
    message.type === "PUBLISH_FAILED"
  ) {
    setTimeout(() => {
      jobStatus.style.display = "none";
    }, 3000);
  }
});

// 初始化
renderAccounts();
checkConnection();
