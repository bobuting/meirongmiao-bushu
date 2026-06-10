/**
 * DownloadButtonV2.tsx - HTML-based 详情页下载
 * 使用版式模板系统渲染 + html2canvas 截图下载
 * 替代 Canvas 硬编码方案
 */

import React, { useRef } from "react";
import { useAppStore } from "../../../store/useAppStore";
import { rewriteToProxyUrl } from "../../../utils/fetch-video-file";
import type { PageSection } from "../../../../../src/contracts/types";
import { LayoutRenderer } from "./templates/LayoutRenderer";
import { htmlToPng, downloadBlob, stitchBlobsVertically } from "./utils/html2png";
import { DEFAULT_TEMPLATE } from "./templates/layoutTemplates";
import { getTemplateDefinition, getDefaultTemplate } from "./templates/designTemplates";
import type { SectionType } from "./templates/types";

interface DownloadButtonV2Props {
  sections: PageSection[];
  downloading?: boolean;
  onDownload?: () => void;
}

/**
 * HTML-based 详情页下载函数
 * 使用 LayoutRenderer 模板系统渲染每个 Section，然后截图合成长图
 */
export async function performHtmlBasedDownload(
  sections: PageSection[],
  token: string,
  showAlert: (title: string, detail?: string) => void,
): Promise<void> {
  const sectionsWithImages = sections.filter((s) => s.currentImageAssetId);

  if (sectionsWithImages.length === 0) {
    throw new Error("没有可下载的图片");
  }

  // 导出尺寸（电商详情页标准宽度 750px）
  const EXPORT_WIDTH = 750;
  const EXPORT_HEIGHT = 900;

  // 加载背景图片
  const backgroundImageUrls: string[] = [];
  for (const section of sectionsWithImages) {
    const proxyUrl = rewriteToProxyUrl(section.currentImageAssetId!);
    const imgResponse = await fetch(proxyUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!imgResponse.ok) {
      throw new Error(`图片下载失败: ${section.title ?? section.sectionKey}`);
    }
    const imgBlob = await imgResponse.blob();
    backgroundImageUrls.push(URL.createObjectURL(imgBlob));
  }

  // 创建隐藏渲染容器
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  container.style.width = `${EXPORT_WIDTH}px`;
  document.body.appendChild(container);

  const blobs: Blob[] = [];

  try {
    for (let i = 0; i < sectionsWithImages.length; i++) {
      const section = sectionsWithImages[i];
      const bgUrl = backgroundImageUrls[i];

      // 获取模板ID（优先使用新设计模板，fallback 到旧版式模板）
      const designTemplateId = section.displayConfig?.layoutTemplateId;
      const templateId = designTemplateId ?? DEFAULT_TEMPLATE;

      // 创建渲染器元素
      const rendererElement = document.createElement("div");
      rendererElement.style.width = `${EXPORT_WIDTH}px`;
      rendererElement.style.height = `${EXPORT_HEIGHT}px`;

      // 使用 LayoutRenderer 的 HTML 输出（React 组件的 forwardRef render）
      // 这里简化处理：直接使用模板的 HTML 结构
      const template = designTemplateId
        ? getTemplateDefinition(designTemplateId)
        : null;

      if (template) {
        // 新模板系统：构建完整 HTML
        rendererElement.innerHTML = buildTemplateHtml(
          bgUrl,
          section.title,
          section.copy,
          template,
          EXPORT_WIDTH,
          EXPORT_HEIGHT,
        );
      } else {
        // 旧版式模板系统：使用 LayoutRenderer 组件
        // 需要通过 React 渲染，这里简化为基本 HTML 结构
        rendererElement.innerHTML = buildBasicHtml(
          bgUrl,
          section.title,
          section.copy,
          templateId,
          EXPORT_WIDTH,
          EXPORT_HEIGHT,
        );
      }

      container.appendChild(rendererElement);

      // 截图（scale:2 输出 1500×1800 高清 PNG）
      const blob = await htmlToPng(rendererElement, {
        scale: 2,
        useCORS: true,
      });
      blobs.push(blob);

      container.removeChild(rendererElement);
    }

    // 合并为长图
    const finalBlob = await stitchBlobsVertically(blobs, 0);

    // 触发下载
    const filename = `detail-page-${Date.now()}.png`;
    downloadBlob(finalBlob, filename);
  } finally {
    // 清理
    document.body.removeChild(container);
    backgroundImageUrls.forEach((url) => URL.revokeObjectURL(url));
  }
}

/**
 * 构建新模板系统的 HTML
 */
function buildTemplateHtml(
  backgroundImage: string,
  title: string | null,
  copy: string | null,
  template: ReturnType<typeof getTemplateDefinition>,
  width: number,
  height: number,
): string {
  if (!template) return "";

  const { layout, designElements, colorScheme } = template;

  // 遮罩层样式
  const overlayStyle = layout.overlay.type !== "none"
    ? `background: ${layout.overlay.type === "gradient"
      ? `linear-gradient(to top, transparent, ${layout.overlay.color})`
      : layout.overlay.color}; opacity: ${layout.overlay.opacity};`
    : "";

  // 文字区域样式
  const textAreaStyle = `
    position: absolute;
    text-align: ${layout.typography.textAlign};
    max-width: ${layout.rhythm.maxWidth}px;
    padding: ${layout.rhythm.paddingY}px ${layout.rhythm.paddingX}px;
    ${layout.position.vertical === "center"
      ? "top: 50%; transform: translateY(-50%);"
      : layout.position.vertical === "bottom"
        ? `bottom: ${layout.position.offset?.bottom ?? 0};`
        : `top: ${layout.position.offset?.top ?? 20}px;`}
    ${layout.position.horizontal === "center"
      ? "left: 50%; transform: translateX(-50%);"
      : layout.position.horizontal === "right"
        ? `right: ${layout.position.offset?.right ?? 24}px;`
        : `left: ${layout.position.offset?.left ?? 24}px;`}
  `;

  // 标题样式
  const titleColor = layout.typography.title.colorMode === "white"
    ? "#ffffff"
    : layout.typography.title.customColor ?? "#000000";
  const titleStyle = `
    font-size: ${layout.typography.title.fontSize}px;
    font-weight: ${layout.typography.title.fontWeight};
    letter-spacing: ${layout.typography.title.letterSpacing}em;
    color: ${titleColor};
    margin: 0;
  `;

  // 文案样式
  const copyColor = layout.typography.copy.colorMode === "white"
    ? "#ffffff"
    : layout.typography.copy.customColor ?? "#000000";
  const copyStyle = `
    font-size: ${layout.typography.copy.fontSize}px;
    font-weight: ${layout.typography.copy.fontWeight};
    letter-spacing: ${layout.typography.copy.letterSpacing}em;
    opacity: ${layout.typography.copy.opacity};
    color: ${copyColor};
    margin: 0;
  `;

  return `
    <div style="width: ${width}px; height: ${height}px; background-image: url(${backgroundImage}); background-size: cover; background-position: center; position: relative; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;">
      ${overlayStyle ? `<div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; ${overlayStyle}"></div>` : ""}
      ${title || copy ? `<div style="${textAreaStyle}">
        ${title ? `<h2 style="${titleStyle}">${title}</h2>` : ""}
        ${copy ? `<p style="${copyStyle}">${copy}</p>` : ""}
      </div>` : ""}
    </div>
  `;
}

/**
 * 构建旧版式模板的基本 HTML（fallback）
 */
function buildBasicHtml(
  backgroundImage: string,
  title: string | null,
  copy: string | null,
  templateId: string,
  width: number,
  height: number,
): string {
  // 基本的底部渐变遮罩 + 文字布局
  return `
    <div style="width: ${width}px; height: ${height}px; background-image: url(${backgroundImage}); background-size: cover; background-position: center; position: relative; overflow: hidden;">
      <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 24px; background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);">
        ${title ? `<h2 style="font-size: 20px; font-weight: 600; color: #ffffff; margin: 0 0 8px 0;">${title}</h2>` : ""}
        ${copy ? `<p style="font-size: 14px; color: rgba(255,255,255,0.8); margin: 0;">${copy}</p>` : ""}
      </div>
    </div>
  `;
}

/**
 * HTML-based 详情页下载组件（用于直接渲染）
 */
export const DownloadButtonV2: React.FC<DownloadButtonV2Props> = ({
  sections,
  downloading,
  onDownload,
}) => {
  const token = useAppStore((state) => state.token);
  const rendererRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  return (
    <div>
      {/* 隐藏的渲染区域：用于 htmlToPng 截图 */}
      <div
        style={{
          position: "absolute",
          left: "-9999px",
          top: "-9999px",
          width: "750px",
        }}
      >
        {sections.map((section) => {
          if (!section.currentImageAssetId) return null;

          // 获取版式模板ID（优先新设计模板）
          const designTemplateId = section.displayConfig?.layoutTemplateId;
          const templateId = designTemplateId ?? DEFAULT_TEMPLATE;

          // 获取背景图URL
          const bgUrl = rewriteToProxyUrl(section.currentImageAssetId);

          return (
            <LayoutRenderer
              key={section.sectionKey}
              ref={(el) => {
                if (el) {
                  rendererRefs.current.set(section.sectionKey, el);
                }
              }}
              backgroundImage={bgUrl}
              title={section.title}
              copy={section.copy}
              templateId={templateId}
              designTemplateId={designTemplateId}
              width={750}
              height={900}
            />
          );
        })}
      </div>
    </div>
  );
};

