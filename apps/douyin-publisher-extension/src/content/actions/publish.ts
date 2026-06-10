import { waitForElement, SELECTORS, isOnLoginPage } from "../dom-selectors";
import { randomDelay, simulateClick, simulateMouseMove } from "@/background/anti-detect";

/** 点击发布按钮并等待确认 */
export async function clickPublish(): Promise<{ success: boolean; message: string }> {
  // 检测是否被重定向到登录页
  if (isOnLoginPage()) {
    return { success: false, message: "登录已过期，请重新登录" };
  }

  // 找到发布按钮
  const publishBtn = await findPublishButton();
  if (!publishBtn) {
    return { success: false, message: "未找到发布按钮" };
  }

  // 模拟鼠标移动到按钮并点击
  await simulateMouseMove(publishBtn);
  await randomDelay(300, 800);
  simulateClick(publishBtn);

  // 等待发布结果（最多 60 秒）
  const startTime = Date.now();
  const timeout = 60_000;

  while (Date.now() - startTime < timeout) {
    await randomDelay(1000, 2000);

    // 1. 检查 URL 是否跳转到管理页面（发布成功后会跳转）
    if (window.location.href.includes("/content/manage")) {
      return { success: true, message: "发布成功（已跳转到管理页）" };
    }

    // 2. 检查成功提示元素
    const successEl = document.querySelector(SELECTORS.successIndicator);
    if (successEl && successEl.textContent) {
      return { success: true, message: "发布成功" };
    }

    // 3. 检查页面文字是否包含成功关键词
    const bodyText = document.body.innerText;
    const successKeywords = SELECTORS.successText.split(",");
    if (successKeywords.some((kw) => bodyText.includes(kw))) {
      return { success: true, message: "发布成功" };
    }

    // 4. 检查错误提示
    const errorEl = document.querySelector(SELECTORS.errorToast);
    if (errorEl && errorEl.textContent) {
      return { success: false, message: `发布失败: ${errorEl.textContent}` };
    }

    // 5. 检查错误文字关键词
    const errorKeywords = SELECTORS.errorText.split(",");
    const foundError = errorKeywords.find((kw) => bodyText.includes(kw));
    if (foundError) {
      return { success: false, message: `发布失败: ${foundError}` };
    }
  }

  // 超时，状态不确定
  return { success: false, message: "发布状态不确定，请手动确认" };
}

/** 查找发布按钮 */
async function findPublishButton(): Promise<Element | null> {
  try {
    return await waitForElement(SELECTORS.publishButton, 10_000);
  } catch {
    // 备选方案：查找包含"发布"文字的按钮
    const buttons = document.querySelectorAll(SELECTORS.publishButtonFallback);
    for (const btn of buttons) {
      if (btn.textContent?.trim().includes("发布")) {
        return btn;
      }
    }
    return null;
  }
}
