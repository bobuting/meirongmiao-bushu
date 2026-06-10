import { useState, useEffect, useCallback } from "react";

/** 扩展 ID（基于 manifest.json 中的 key 计算） */
const EXTENSION_ID = "dikegddngchhpdagjbijgngnflddojkc";

/** 扩展状态 */
export interface ExtensionStatus {
  installed: boolean;
  version: string | null;
  configured: boolean; // 是否已配置 Token
}

/** 发布进度 */
export interface PublishProgress {
  jobId: string;
  stage: string;
  message: string;
  progress?: number;
}

/** 自动配置扩展（发送 Token） */
async function autoConfigureExtension(token: string): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.runtime) return false;

  const apiBaseUrl = window.location.origin + "/neirongmiao/api";

  try {
    const response = await new Promise<{ success: boolean }>((resolve, reject) => {
      chrome.runtime.sendMessage(
        EXTENSION_ID,
        {
          type: "SET_CONFIG",
          payload: { apiBaseUrl, authToken: token },
        },
        (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res ?? { success: false });
          }
        }
      );
    });
    return response.success;
  } catch {
    return false;
  }
}

/**
 * 检测扩展是否已安装并自动配置
 * 通过 chrome.runtime.sendMessage PING 扩展
 */
export function useDouyinExtension() {
  const [status, setStatus] = useState<ExtensionStatus>({
    installed: false,
    version: null,
    configured: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState<PublishProgress | null>(null);

  // 检测扩展并自动配置
  const checkExtension = useCallback(async () => {
    if (typeof chrome === "undefined" || !chrome.runtime) {
      setStatus({ installed: false, version: null, configured: false });
      setIsLoading(false);
      return;
    }

    try {
      const response = await new Promise<{ installed: boolean; version?: string }>(
        (resolve, reject) => {
          chrome.runtime.sendMessage(EXTENSION_ID, { type: "PING" }, (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          });
        }
      );

      const installed = response.installed ?? false;

      // 自动配置：如果扩展已安装且有登录 Token
      let configured = false;
      if (installed) {
        const token = localStorage.getItem("token");
        if (token) {
          configured = await autoConfigureExtension(token);
        }
      }

      setStatus({
        installed,
        version: response.version ?? null,
        configured,
      });
    } catch {
      setStatus({ installed: false, version: null, configured: false });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 监听扩展发来的进度消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.source !== "neirongmiao-extension") return;

      if (event.data.type === "PUBLISH_PROGRESS") {
        setProgress(event.data.payload);
      }
      if (
        event.data.type === "PUBLISH_COMPLETE" ||
        event.data.type === "PUBLISH_FAILED"
      ) {
        setTimeout(() => setProgress(null), 3000);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // setProgress 是 useState setter，稳定引用；事件监听只需挂载一次

  // 初始检测
  useEffect(() => {
    checkExtension();
  }, [checkExtension]);

  // 发送发布请求给扩展
  const requestPublish = useCallback(
    async (payload: { projectId: string; jobId: string; accountId: string }) => {
      if (!status.installed) {
        throw new Error("扩展未安装");
      }

      return new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          EXTENSION_ID,
          { type: "PUBLISH_REQUEST", payload },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response?.error) {
              reject(new Error(response.error));
            } else {
              resolve();
            }
          }
        );
      });
    },
    [status.installed]
  );

  return {
    status,
    isLoading,
    progress,
    requestPublish,
    refresh: checkExtension,
  };
}

/** 获取 Chrome 扩展商店安装链接 */
export function getExtensionInstallUrl() {
  return `https://chrome.google.com/webstore/detail/${EXTENSION_ID}`;
}
