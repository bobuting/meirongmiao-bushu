import type { Step5DeliveryPayload } from "../../../../../src/contracts/step5-delivery-shell-contract";
import type { SquarePublishCategory } from "../../../../../src/contracts/square-publish-category";
import { stripProjectNamePrefixFromStep5Title } from "./step5ResultConsumptionContract";

export type Step5DeliveryAction = "publish" | "download" | "publish-douyin";

const STEP5_EMPTY_TITLE_PLACEHOLDER = "成片标题待补充";

function isStep5PublishTitleReady(title: string | null | undefined): boolean {
  const normalized = String(title ?? "").trim();
  return normalized.length > 0 && normalized !== STEP5_EMPTY_TITLE_PLACEHOLDER;
}

export interface Step5DeliveryActionApi {
  /** 发布到广场（新接口） */
  publishToSquare: (
    token: string,
    projectId: string,
    squarePublishCategory?: string | null,
  ) => Promise<{ success: boolean; message: string; requestId: string | null }>;
  publishToDouyin: (
    token: string,
    projectId: string,
    payload: {
      title: string;
      tags: string[];
      videoFilePath: string;
      coverImagePath?: string | null;
      linkUrl?: string | null;
      productLink?: string | null;
      productTitle?: string | null;
      aiGeneratedDeclaration?: boolean;
      publishDate?: number;
    },
  ) => Promise<{ jobId: string; status: string }>;
  getPublishJob: (
    token: string,
    projectId: string,
    jobId: string,
  ) => Promise<{
    id: string;
    status: string;
    result: { ok: boolean; message: string; errorDetail: string | null } | null;
  }>;
}

export interface Step5DeliveryActionContext {
  action: Step5DeliveryAction;
  api: Step5DeliveryActionApi;
  token: string;
  projectId: string;
  projectName: string | null;
  scriptId: string | null;
  payload: Step5DeliveryPayload;
  step4MusicPayload?: {
    musics: Array<{ id: string; title?: string; audioUrl?: string }>;
    selectedMusicId: string | null;
  } | null;
  updateWorkflow: (patch: {
    reviewId?: string | null;
  }) => void;
  updateProjectData: (patch: {
    exportUrl?: string | null;
    projectStatus?: string | null;
  }) => void;
  pushTaskNotification: (notification: {
    category: "final-video";
    title: string;
    detail: string;
    targetPath: string;
    projectId?: string | null;
    projectName?: string | null;
    projectStatus?: string | null;
    dedupeKey?: string;
  }) => void;
  publishTitle?: string | null;
  douyinPublishTitle?: string;
  douyinPublishTags?: string[];
  douyinPublishLinkUrl?: string | null;
  douyinProductLink?: string | null;
  douyinProductTitle?: string | null;
  douyinAiGeneratedDeclaration?: boolean;
  douyinPublishDate?: number;
  douyinUploadCover?: boolean;
  squarePublishCategory?: SquarePublishCategory | null;
}

export interface Step5DeliveryActionResult {
  message: string;
  exportUrl: string;
  requestId: string | null;
  publishJobId?: string | null;
}

export async function runStep5DeliveryAction(context: Step5DeliveryActionContext): Promise<Step5DeliveryActionResult> {
  // 使用 Step4 已合并的最终视频 URL
  const exportUrl = (context.payload.finalVideoUrl ?? "").trim();

  // 校验：必须有 Step4 合成结果
  if (!exportUrl) {
    throw new Error("当前没有可发布的视频，请返回 Step4 先完成片段生成与合成。");
  }

  if (context.action === "publish") {
    if (!isStep5PublishTitleReady(context.publishTitle)) {
      throw new Error("请先确认交付标题，再提交站内审核发布。");
    }
    if (!context.squarePublishCategory) {
      throw new Error("请先选择创作广场标签，再提交站内审核发布。");
    }
  }

  context.updateProjectData({
    exportUrl,
    projectStatus: "READY_TO_PUBLISH",
  });

  let requestId: string | null = null;
  let publishJobId: string | null = null;

  // 发布到广场：调用新接口创建发布申请
  if (context.action === "publish") {
    const publishResult = await context.api.publishToSquare(
      context.token,
      context.projectId,
      context.squarePublishCategory,
    );
    if (!publishResult.success) {
      throw new Error(publishResult.message || "发布申请提交失败");
    }
    requestId = publishResult.requestId;
  }

  if (context.action === "publish-douyin") {
    const descriptionLink = context.douyinPublishLinkUrl?.trim() || null;
    const productLink = context.douyinProductLink?.trim() || null;
    const productTitle = context.douyinProductTitle?.trim().slice(0, 10) || null;
    if (productLink && !productTitle) {
      throw new Error("挂小黄车时，请先填写商品短标题。");
    }
    const publishTitle = stripProjectNamePrefixFromStep5Title(
      context.douyinPublishTitle ?? "",
      context.projectName ?? null,
    ).slice(0, 30);
    const publishResult = await context.api.publishToDouyin(
      context.token,
      context.projectId,
      {
        title: publishTitle.length > 0 ? publishTitle : "成片标题待补充",
        tags: context.douyinPublishTags ?? [],
        videoFilePath: exportUrl,
        coverImagePath: context.douyinUploadCover ? (context.payload.videoCoverImageUrl ?? null) : null,
        linkUrl: productLink ? null : descriptionLink,
        productLink,
        productTitle,
        aiGeneratedDeclaration: context.douyinAiGeneratedDeclaration ?? true,
        publishDate: context.douyinPublishDate ?? 0,
      },
    );
    publishJobId = publishResult.jobId;
  }

  const projectLabel = context.projectName || "当前项目";
  context.pushTaskNotification({
    category: "final-video",
    title: `${projectLabel} · 最终视频生成完成`,
    detail:
      context.action === "publish"
        ? "最终视频已导出并提交审核，点击前往\"我的项目\"。"
        : context.action === "publish-douyin"
          ? "最终视频已导出并提交抖音发布，点击前往\"我的项目\"。"
          : "最终视频已导出成功，点击前往\"我的项目\"。",
    targetPath: "/projects?filter=latest",
    projectId: context.projectId,
    projectName: context.projectName,
    projectStatus: "READY_TO_PUBLISH",
    dedupeKey: `final-video:${context.projectId}:${exportUrl}`,
  });
  return {
    message:
      context.action === "publish" && requestId
        ? "已提交发布申请，等待审核。"
        : context.action === "publish-douyin" && publishJobId
          ? "导出完成，抖音发布任务已创建。"
          : `导出成功：${exportUrl}`,
    exportUrl,
    requestId,
    ...(publishJobId ? { publishJobId } : {}),
  };
}