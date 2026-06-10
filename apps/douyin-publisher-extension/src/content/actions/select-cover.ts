import { waitForElement, SELECTORS } from "../dom-selectors";
import { randomDelay, simulateClick } from "@/background/anti-detect";

/** 选择封面（使用默认封面或上传自定义封面） */
export async function selectCover(
  coverImageUrl?: string | null
): Promise<void> {
  try {
    const coverButton = await waitForElement(
      SELECTORS.coverSelectButton,
      5_000
    );
    simulateClick(coverButton);
    await randomDelay(1000, 3000);

    // 如果有自定义封面 URL，上传
    if (coverImageUrl) {
      const input = (await waitForElement(
        SELECTORS.coverUploadInput,
        5_000
      )) as HTMLInputElement;

      const response = await fetch(coverImageUrl);
      const blob = await response.blob();
      const file = new File([blob], "cover.jpg", { type: "image/jpeg" });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await randomDelay(1000, 2000);
    }
  } catch {
    // 封面选择是可选步骤，失败不阻断流程
    console.warn("[内容喵] 封面选择跳过");
  }
}
