/**
 * 扩展配置 API
 */

import { useAppStore } from "../../store/useAppStore";

const API_BASE = "/neirongmiao/api";

/**
 * 生成扩展认证 Token
 */
export async function generateExtensionToken(): Promise<{
  token: string;
  expiresAt: number;
  apiBaseUrl: string;
}> {
  const authToken = useAppStore.getState().token;
  if (!authToken) {
    throw new Error("请先登录");
  }

  const response = await fetch(`${API_BASE}/ext/douyin/config/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("生成扩展 Token 失败");
  }

  const data = await response.json();
  return data.data;
}

/**
 * 配置扩展
 * 通过 chrome.runtime.sendMessage 发送配置给扩展
 */
export async function configureExtension(payload: {
  apiBaseUrl: string;
  authToken: string;
}): Promise<boolean> {
  const EXTENSION_ID = "dikegddngchhpdagjbijgngnflddojkc";

  try {
    const response = await new Promise<{ success: boolean }>((resolve, reject) => {
      chrome.runtime.sendMessage(
        EXTENSION_ID,
        {
          type: "SET_CONFIG",
          payload,
        },
        (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res);
          }
        }
      );
    });

    return response.success;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 提供明确的用户提示
    if (errorMessage.includes("message port closed")) {
      throw new Error(
        "Chrome 扩展未响应，可能原因：\n" +
        "1. 扩展未安装，请前往 chrome://extensions/ 检查\n" +
        "2. 扩展 ID 不正确（当前: dikegddngchhpdagjbijgngnflddojkc）\n" +
        "3. 扩展未启用或未正确监听消息"
      );
    }

    throw new Error(`配置扩展失败: ${errorMessage}`);
  }
}