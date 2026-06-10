import type { PublishJob, ProgressReport } from "@/shared/types";
import type { ExtMessage } from "@/shared/messages";
import { isOnLoginPage, SELECTORS } from "./dom-selectors";
import { uploadVideo } from "./actions/upload-video";
import { fillTitle, addTags, checkAiDeclaration } from "./actions/fill-form";
import { selectCover } from "./actions/select-cover";
import { clickPublish } from "./actions/publish";
import { randomDelay } from "@/background/anti-detect";

/** 当前执行中的任务 ID */
let activeJobId: string | null = null;

/** 上报进度到 background worker */
function reportProgress(stage: ProgressReport["stage"], message: string): void {
  if (!activeJobId) return;
  chrome.runtime.sendMessage({
    type: "PUBLISH_PROGRESS",
    payload: { jobId: activeJobId, stage, message },
  } satisfies ExtMessage);
}

/** 从页面 DOM 提取用户昵称和 UID */
function extractUserInfo(): { nickname: string; uid: string } | null {
  const nicknameEl = document.querySelector('[class^="name-"]') ||
    document.querySelector('[class*="nickname"]') ||
    document.querySelector('[class*="userName"]') ||
    document.querySelector('[class*="user-name"]');

  const uidMatch = document.cookie.match(/uid_tt=([^;]+)/);

  if (nicknameEl?.textContent) {
    return {
      nickname: nicknameEl.textContent.trim(),
      uid: uidMatch?.[1] ?? "",
    };
  }

  const titleMatch = document.title.match(/(.+)的创作者中心/);
  if (titleMatch) {
    return {
      nickname: titleMatch[1].trim(),
      uid: uidMatch?.[1] ?? "",
    };
  }

  return null;
}

/** 等待昵称元素出现 */
function waitForNickname(maxWaitMs: number = 5000): Promise<{ nickname: string; uid: string } | null> {
  return new Promise((resolve) => {
    const immediate = extractUserInfo();
    if (immediate) {
      resolve(immediate);
      return;
    }

    const startTime = Date.now();
    const observer = new MutationObserver(() => {
      const info = extractUserInfo();
      if (info) {
        observer.disconnect();
        resolve(info);
      } else if (Date.now() - startTime > maxWaitMs) {
        observer.disconnect();
        resolve(null);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(extractUserInfo());
    }, maxWaitMs);
  });
}

/** 监听来自 background 的消息 */
chrome.runtime.onMessage.addListener((message: ExtMessage, _sender, sendResponse) => {
  if (message.type === "GET_USER_INFO") {
    waitForNickname(5000).then(sendResponse);
    return true;
  }

  if (message.type === "EXECUTE_PUBLISH") {
    const { job } = message.payload as { job: PublishJob };
    executePublishFlow(job)
      .then((result) => {
        sendResponse({ success: true, result });
      })
      .catch((error) => {
        const msg = error instanceof Error ? error.message : "未知错误";
        sendResponse({ success: false, error: msg });
      });
    return true;
  }

  return false;
});

/** 完整发布流程 */
async function executePublishFlow(
  job: PublishJob
): Promise<void> {
  activeJobId = job.id;
  const { input } = job;

  if (isOnLoginPage()) {
    chrome.runtime.sendMessage({
      type: "PUBLISH_FAILED",
      payload: { jobId: job.id, error: "登录已过期" },
    } satisfies ExtMessage);
    return;
  }

  try {
    // 阶段 1：上传视频（直接从 OSS URL 下载）
    reportProgress("uploading", "正在上传视频...");
    await uploadVideo(input.videoUrl);

    await randomDelay(2000, 5000);

    reportProgress("processing", "等待视频处理...");
    await randomDelay(5000, 15000);

    // 阶段 2：填写标题
    reportProgress("filling_form", "正在填写标题...");
    await fillTitle(input.title);

    // 阶段 3：添加标签
    if (input.tags.length > 0) {
      await addTags(input.tags);
    }

    await randomDelay(1000, 3000);

    // 阶段 4：选择封面
    reportProgress("selecting_cover", "正在选择封面...");
    await selectCover(input.coverImageUrl);

    await randomDelay(1000, 2000);

    // 阶段 5：勾选 AI 声明（如果需要）
    if (input.aiGeneratedDeclaration) {
      reportProgress("filling_form", "正在勾选 AI 声明...");
      await checkAiDeclaration(true);
      await randomDelay(500, 1000);
    }

    // 阶段 6：点击发布
    reportProgress("publishing", "正在发布...");
    const result = await clickPublish();

    if (result.success) {
      reportProgress("confirming", "发布成功");
      chrome.runtime.sendMessage({
        type: "PUBLISH_COMPLETE",
        payload: { jobId: job.id, result: { ok: true, message: result.message, douyinItemId: null } },
      } satisfies ExtMessage);
    } else {
      chrome.runtime.sendMessage({
        type: "PUBLISH_FAILED",
        payload: { jobId: job.id, error: result.message },
      } satisfies ExtMessage);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "发布流程异常";
    chrome.runtime.sendMessage({
      type: "PUBLISH_FAILED",
      payload: { jobId: job.id, error: msg },
    } satisfies ExtMessage);
  }
}
