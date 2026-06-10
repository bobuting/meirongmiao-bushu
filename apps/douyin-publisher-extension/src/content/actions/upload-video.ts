import { waitForElement, SELECTORS } from "../dom-selectors";
import { randomDelay } from "@/background/anti-detect";

/** 从 OSS URL 下载视频并上传到抖音发布页 */
export async function uploadVideo(videoUrl: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  let response: Response;
  try {
    response = await fetch(videoUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`视频下载失败: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const file = new File([blob], "video.mp4", { type: "video/mp4" });

  const input = (await waitForElement(
    SELECTORS.uploadInput,
    15_000
  )) as HTMLInputElement;

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;

  input.dispatchEvent(new Event("change", { bubbles: true }));

  await randomDelay(2000, 4000);
  await waitForElement(SELECTORS.uploadComplete, 600_000);
}
