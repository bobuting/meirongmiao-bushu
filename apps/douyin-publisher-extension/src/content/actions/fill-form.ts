import { waitForElement, SELECTORS } from "../dom-selectors";
import { randomDelay, typingDelays } from "@/background/anti-detect";

/** 逐字输入标题 */
export async function fillTitle(title: string): Promise<void> {
  const editor = await waitForElement(SELECTORS.titleInput, 10_000).catch(
    () => waitForElement(SELECTORS.titleInputFallback, 5_000)
  );

  (editor as HTMLElement).focus();
  await randomDelay(300, 800);

  // 清除已有内容
  document.execCommand("selectAll");
  document.execCommand("delete");
  await randomDelay(200, 500);

  // 逐字输入
  const delays = typingDelays(title.length);
  for (let i = 0; i < title.length; i++) {
    document.execCommand("insertText", false, title[i]);
    await randomDelay(delays[i], delays[i] * 1.5);
  }

  await randomDelay(500, 1500);
}

/** 勾选 AI 声明 checkbox */
export async function checkAiDeclaration(shouldCheck: boolean): Promise<void> {
  if (!shouldCheck) return;

  // 查找 AI 声明 checkbox
  const checkbox = document.querySelector(SELECTORS.aiDeclarationCheckbox) as HTMLInputElement | null;

  if (!checkbox) {
    // 备选方案：查找包含 AI 声明文字附近的 checkbox
    const labels = document.querySelectorAll('label, [class*="label"], [class*="option"]');
    for (const label of labels) {
      const text = label.textContent || '';
      if (SELECTORS.aiDeclarationText.split(',').some(kw => text.includes(kw))) {
        const cb = label.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        if (cb && !cb.checked) {
          cb.click();
          await randomDelay(300, 800);
          console.log("[内容喵] AI 声明已勾选（通过文字查找）");
          return;
        }
      }
    }
    console.warn("[内容喵] 未找到 AI 声明 checkbox，跳过");
    return;
  }

  if (!checkbox.checked) {
    checkbox.click();
    await randomDelay(300, 800);
    console.log("[内容喵] AI 声明已勾选");
  }
}

/** 添加话题标签 */
export async function addTags(tags: readonly string[]): Promise<void> {
  const maxTags = Math.min(tags.length, 5); // 抖音最多约 5 个话题

  for (let i = 0; i < maxTags; i++) {
    try {
      const input = (await waitForElement(
        SELECTORS.tagInput,
        5_000
      )) as HTMLInputElement;
      input.focus();
      await randomDelay(300, 600);

      const tagText = `#${tags[i]}`;
      const delays = typingDelays(tagText.length);
      for (let j = 0; j < tagText.length; j++) {
        document.execCommand("insertText", false, tagText[j]);
        await randomDelay(delays[j], delays[j] * 1.5);
      }

      // 等待推荐出现后按回车
      await randomDelay(800, 2000);
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      await randomDelay(1000, 2000);
    } catch {
      // 标签输入框可能不可见，跳过
      console.warn(`[内容喵] 标签 #${tags[i]} 输入失败，跳过`);
    }
  }
}
