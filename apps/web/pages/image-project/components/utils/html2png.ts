/**
 * html2png.ts - HTML截图工具
 * 将HTML元素渲染为PNG图片
 */

import html2canvas from 'html2canvas';

/**
 * 截图配置选项
 */
interface HtmlToPngOptions {
  scale?: number;           // 缩放比例（默认2，高清输出）
  backgroundColor?: string;  // 背景颜色
  useCORS?: boolean;        // 是否使用CORS加载图片
  logging?: boolean;        // 是否开启日志
}

/**
 * 将HTML元素截图为PNG Blob
 */
export async function htmlToPng(
  element: HTMLElement,
  options?: HtmlToPngOptions
): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: options?.scale ?? 2,
    backgroundColor: options?.backgroundColor ?? null,
    useCORS: options?.useCORS ?? true,
    logging: options?.logging ?? false,
    allowTaint: true,
    imageTimeout: 15000,
  });

  // 转换为Blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Canvas toBlob failed'));
      }
    }, 'image/png', 1.0);
  });
}

/**
 * 将HTML元素截图为PNG Base64
 */
export async function htmlToBase64(
  element: HTMLElement,
  options?: HtmlToPngOptions
): Promise<string> {
  const canvas = await html2canvas(element, {
    scale: options?.scale ?? 2,
    backgroundColor: options?.backgroundColor ?? null,
    useCORS: options?.useCORS ?? true,
    logging: options?.logging ?? false,
    allowTaint: true,
    imageTimeout: 15000,
  });

  return canvas.toDataURL('image/png', 1.0);
}

/**
 * 触发下载Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 触发下载Base64
 */
export function downloadBase64(base64: string, filename: string): void {
  const link = document.createElement('a');
  link.href = base64;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 合并多个Blob为长图（垂直拼接）
 */
export async function stitchBlobsVertically(
  blobs: Blob[],
  gap: number = 0
): Promise<Blob> {
  // 加载所有图片
  const images: HTMLImageElement[] = [];
  for (const blob of blobs) {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
    images.push(img);
  }

  // 计算总尺寸
  const maxWidth = Math.max(...images.map(img => img.width));
  const totalHeight = images.reduce((sum, img) => sum + img.height, 0)
    + gap * (images.length - 1);

  // 创建合并Canvas
  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d')!;

  // 绘制所有图片
  let offsetY = 0;
  for (const img of images) {
    ctx.drawImage(img, 0, offsetY, img.width, img.height);
    offsetY += img.height + gap;
    URL.revokeObjectURL(img.src);
  }

  // 转换为Blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Canvas toBlob failed'));
      }
    }, 'image/png', 1.0);
  });
}