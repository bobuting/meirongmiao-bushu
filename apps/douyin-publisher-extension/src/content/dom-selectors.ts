/** 抖音创作者后台 DOM 选择器 */
export const SELECTORS = {
  /** 发布页 URL */
  publishPageUrl:
    "https://creator.douyin.com/creator-micro/content/publish",

  /** 视频上传 */
  uploadInput: 'input[type="file"][accept*="video"]',
  uploadDragArea: '[class*="upload"] [class*="drag"]',
  uploadProgress: '[class*="progress"]',
  uploadComplete: '[class*="success"]',

  /** 标题输入 */
  titleInput: '.editor-kit-editor [contenteditable="true"]',
  titleInputFallback: '[class*="title"] [contenteditable="true"]',

  /** 标签输入 */
  tagInput: '[class*="tag"] input, [class*="topic"] input',
  tagSuggestion: '[class*="tag"] [class*="item"]',

  /** 封面 */
  coverSelectButton: '[class*="cover"] [class*="select"], [class*="cover"] button',
  coverUploadInput: 'input[type="file"][accept*="image"]',

  /** 发布按钮 */
  publishButton: '[class*="publish"]:not([disabled])',
  publishButtonFallback: 'button',

  /** 成功/错误指示 */
  successIndicator: '[class*="success"], [class*="toast-success"], .ant-message-success, [data-testid="success"]',
  successText: '发布成功,已发布,提交成功',
  errorToast: '[class*="error"] [class*="toast"], [class*="toast-error"], .ant-message-error',
  errorText: '发布失败,上传失败,请重试',

  /** AI 声明选项 */
  aiDeclarationCheckbox: 'input[type="checkbox"][class*="ai"], input[type="checkbox"][id*="ai"], [class*="declaration"] input[type="checkbox"]',
  aiDeclarationText: '内容由AI生成,AI生成,人工智能',
} as const;

/** 等待元素出现 */
export function waitForElement(
  selector: string,
  timeoutMs: number = 30_000
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`等待元素超时: ${selector}`));
    }, timeoutMs);
  });
}

/** 等待元素消失 */
export function waitForElementToDisappear(
  selector: string,
  timeoutMs: number = 30_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (!existing) {
      resolve();
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (!el) {
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`等待元素消失超时: ${selector}`));
    }, timeoutMs);
  });
}

/** 检测是否在登录页 */
export function isOnLoginPage(): boolean {
  const url = window.location.href;
  return url.includes("/login") || url.includes("/passport");
}

/** 检测页面文本中的认证失败指示 */
export function detectAuthFailure(): boolean {
  const indicators = ["请先登录", "登录已过期", "请重新扫码"];
  const bodyText = document.body.innerText;
  return indicators.some((text) => bodyText.includes(text));
}
