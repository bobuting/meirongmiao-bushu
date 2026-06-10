import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from 'react-router';
import { Button } from "../../../components/ui/Button";
import { useAppStore } from "../../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { useProjectState } from "../../../hooks/useProjectState";
import { FullScreenLoading } from "../../../components/shared/FullScreenLoading";
import { VideoPreviewModal } from "../../../components/shared/VideoPreviewModal";
import { ApiError, backendApi } from "../../../services/backendApi";
import { getOssThumbnailUrl } from "../../../utils/ossImage";
import {
  PROJECT_FLOW_MEDIA_CHROME_Z_CLASS,
  PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS,
} from "../projectFlowMediaLayerGuard";
import { runStep5DeliveryAction, type Step5DeliveryActionApi } from "./step5DeliveryActionController";
import {
  normalizeStep5TitleCandidates,
  resolveStep5DeliveryPayload,
  stripProjectNamePrefixFromStep5Title,
} from "./step5ResultConsumptionContract";
import { Step5DouyinPublishPanel } from "./step5DouyinPublishPanel";
import { ExtensionInstallGuideModal } from "./ExtensionInstallGuideModal";
import { useDouyinExtension } from "../../../hooks/useDouyinExtension";
import { useAlert } from "../../../components/ui/ConfirmDialog";
import { generateExtensionToken, configureExtension } from "../../../services/realApi/extension-config";
import type { ExtDouyinAccount } from "./step5DouyinPublishPanel";
import {
  buildStep5SquarePublishFeedback,
} from "./step5SquarePublishCategory";
import type { SquarePublishCategory } from "../../../../../src/contracts/square-publish-category";
import { adaptStep1RolePresetCards, resolveStep1RolePresetCardById } from "../../../../../src/modules/step1-role-preset-adapter";
import {
  ProjectFlowHistorySidebar,
  type StoryboardFrame,
  type VideoClipItem,
  StepContentHeader,
} from "../../../components/project-flow";
import { isStatusBeyond } from "../../../../../src/contracts/types";
import type { ProjectStatus } from "../../../../../src/contracts/types";
import { useStep5Data } from "./useStep5Data";
import { Step5FinalVideoStrip, type Step5FinalVideoItem } from "./step5FinalVideoStrip";
import { realProjectsApi } from "../../../services/realApi";

interface DeliveryTitleItem {
  id: number;
  text: string;
  type: string;
}

interface Step5CoverCandidate {
  id: string;
  url: string;
}

const STEP5_EMPTY_TITLE_PLACEHOLDER = "成片标题待补充";

function buildDeliveryTitleItems(
  titleCandidates: readonly string[],
  projectName: string | null | undefined,
): DeliveryTitleItem[] {
  const normalizedCandidates = normalizeStep5TitleCandidates(titleCandidates, projectName);
  const fallback = normalizedCandidates.length > 0 ? normalizedCandidates : [STEP5_EMPTY_TITLE_PLACEHOLDER];
  return fallback.map((text, index) => ({
    id: index + 1,
    text,
    type: index === 0 ? "主推荐" : "备选标题",
  }));
}

function isStep5PublishTitleReady(title: string | null | undefined): boolean {
  const normalized = String(title ?? "").trim();
  return normalized.length > 0 && normalized !== STEP5_EMPTY_TITLE_PLACEHOLDER;
}

function isVideoUrl(url: string): boolean {
  const plain = url.split("?")[0] ?? "";
  return /\.(mp4|mov|webm|m4v)$/i.test(plain);
}

function normalizeAspectRatioCss(input: string | null | undefined): string {
  const raw = String(input ?? "").trim();
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) {
    return "9 / 16";
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "9 / 16";
  }
  return `${width} / ${height}`;
}

function dedupeNonEmptyUrls(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}

function triggerBrowserDownload(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function formatStep5Timestamp(value: number | null | undefined): string {
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return "--";
  }
  return new Date(Number(value)).toLocaleString();
}

export const Step5DeliveryShellRoute: React.FC = () => {
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  const { token, pushTaskNotification } = useAppStore(useShallow((state) => ({ token: state.token, pushTaskNotification: state.pushTaskNotification })));
  const { projectData, workflow, isInitialLoading, updateProjectData, setStep5DeliveryPayload, batchUpdateWorkflow } = useProjectState(urlProjectId);

  // 使用新 hook 一次性加载所有数据，避免重复请求和无限循环
  const step5Data = useStep5Data(token, urlProjectId ?? null);
  const {
    projectId,
    projectName,
    projectStatus,
    finalVideoUrl,
    clipVideoUrls,
    durationSec,
    videoCoverImageUrl,
    coverCandidates: step5CoverCandidates,
    titleCandidates: step5TitleCandidates,
    publishTitle: savedPublishTitle,
    squarePublishCategory: hookSquarePublishCategory,
    step1SelectedRoleDirection: hookStep1SelectedRoleDirection,
    isLoading: step5DataLoading,
    error: step5DataError,
  } = step5Data;

  // 构建 deliveryPayload 结构（向后兼容）
  const deliveryPayload = useMemo(() => {
    if (!projectId) return null;
    return {
      projectId,
      scriptId: null,
      finalVideoUrl,
      clipVideoUrls,
      videoCoverImageUrl,
      titleCandidates: step5TitleCandidates,
      squarePublishCategory: hookSquarePublishCategory,
      sourceStep: "step4" as const,
      durationSec,
    };
  }, [projectId, finalVideoUrl, clipVideoUrls, videoCoverImageUrl, step5TitleCandidates, hookSquarePublishCategory, durationSec]);

  // Step5 锁定状态：项目已发布
  const step5Locked = projectData.projectStatus === "PUBLISHED";

  const [titles, setTitles] = useState<DeliveryTitleItem[]>([]);
  const [selectedTitleId, setSelectedTitleId] = useState<number | null>(null);
  // 同步 titles 状态：当 hook 数据加载完成后更新
  useEffect(() => {
    if (step5TitleCandidates && step5TitleCandidates.length > 0) {
      const newTitles = buildDeliveryTitleItems(step5TitleCandidates, projectName);
      setTitles(newTitles);

      // 如果有已保存的标题，优先使用
      if (savedPublishTitle && savedPublishTitle.trim().length > 0) {
        // 查找已保存标题是否在候选列表中
        const savedIndex = newTitles.findIndex(t => t.text === savedPublishTitle);
        if (savedIndex >= 0) {
          setSelectedTitleId(newTitles[savedIndex]!.id);
        } else {
          // 已保存标题不在候选列表中，添加到列表首位
          const customTitle = { id: 0, text: savedPublishTitle, type: "用户选择" };
          setTitles([customTitle, ...newTitles.map((t, i) => ({ ...t, id: i + 1 }))]);
          setSelectedTitleId(0);
        }
      } else {
        setSelectedTitleId((prev) => {
          // 如果当前选中的标题还在新列表中，保持选择
          if (prev !== null && newTitles.some((t) => t.id === prev)) {
            return prev;
          }
          return newTitles[0]?.id ?? null;
        });
      }
    }
  }, [step5TitleCandidates, projectName, savedPublishTitle]);
  const [isTitleListExpanded, setIsTitleListExpanded] = useState(false);
  // 编辑状态：null 表示不在编辑模式，否则为正在编辑的标题 id
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewSequenceIndex, setPreviewSequenceIndex] = useState(0);
  // 封面从 Step4 传递，只读展示
  const selectedCoverImage = (deliveryPayload?.videoCoverImageUrl ?? "").trim();
  const [douyinPanelOpen, setDouyinPanelOpen] = useState(true);
  const [douyinTags, setDouyinTags] = useState("");
  const [douyinLinkUrl, setDouyinLinkUrl] = useState("");
  const [douyinProductLink, setDouyinProductLink] = useState("");
  const [douyinProductTitle, setDouyinProductTitle] = useState("");
  const [douyinScheduleMode, setDouyinScheduleMode] = useState<"now" | "scheduled">("now");
  const [douyinScheduleDate, setDouyinScheduleDate] = useState("");
  const [douyinScheduleTime, setDouyinScheduleTime] = useState("");
  const [douyinUploadCover, setDouyinUploadCover] = useState(false);
  const [douyinAiGeneratedDeclaration, setDouyinAiGeneratedDeclaration] = useState(true);
  const [douyinPublishJobId, setDouyinPublishJobId] = useState<string | null>(null);
  const [douyinPublishStatus, setDouyinPublishStatus] = useState<string | null>(null);
  const [douyinPublishMessage, setDouyinPublishMessage] = useState<string | null>(null);
  const [douyinPublishDetail, setDouyinPublishDetail] = useState<string | null>(null);
  const [douyinPublishScreenshot, setDouyinPublishScreenshot] = useState<string | null>(null);
  const [douyinPublishLogs, setDouyinPublishLogs] = useState<string[]>([]);
  const [douyinPublishHistory, setDouyinPublishHistory] = useState<
    Array<{
      id: string;
      status: string;
      createdAt: number;
      result: { ok: boolean; message: string; errorDetail: string | null; screenshotUrl?: string | null } | null;
    }>
  >([]);
  const [showPublishHistory, setShowPublishHistory] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [videoQrLoading, setVideoQrLoading] = useState(true);
  const [extensionInstallModalOpen, setExtensionInstallModalOpen] = useState(false);

  // 扩展账号管理
  const [extAccounts, setExtAccounts] = useState<ExtDouyinAccount[]>([]);
  const [selectedExtAccountId, setSelectedExtAccountId] = useState<string | null>(null);

  // 使用扩展检测 hook
  const { status: extensionStatus, refresh: extensionRefresh } = useDouyinExtension();
  const douyinExtensionInstalled = extensionStatus.installed;

  // 弹窗提示
  const { alert } = useAlert();

  const douyinPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const douyinPollStartRef = useRef<number>(0);
  const douyinPollErrorCountRef = useRef(0);

  // videoCharacters 由 useProjectState 统一加载

  // ========== GlobalTimer 集成 ==========
  const { showGlobalLoading, hideGlobalLoading } = useAppStore(useShallow((state) => ({ showGlobalLoading: state.showGlobalLoading, hideGlobalLoading: state.hideGlobalLoading })));
  const prevStep5LoadingCountRef = useRef(0);
  useEffect(() => {
    const shouldShowTimer = isSubmitting;
    if (shouldShowTimer && prevStep5LoadingCountRef.current === 0) {
      showGlobalLoading();
    } else if (!shouldShowTimer && prevStep5LoadingCountRef.current > 0) {
      hideGlobalLoading();
    }
    prevStep5LoadingCountRef.current = shouldShowTimer ? 1 : 0;
  }, [isSubmitting, showGlobalLoading, hideGlobalLoading]);

  const selectedTitle = useMemo(
    () =>
      selectedTitleId
        ? titles.find((title) => title.id === selectedTitleId)?.text
        : titles[0]?.text ?? STEP5_EMPTY_TITLE_PLACEHOLDER,
    [selectedTitleId, titles],
  );
  const otherTitles = useMemo(
    () => titles.filter((title) => title.id !== selectedTitleId),
    [selectedTitleId, titles],
  );
  const hasPublishTitle = useMemo(() => isStep5PublishTitleReady(selectedTitle), [selectedTitle]);

  // 保存发布标题到后端
  const savePublishTitle = useCallback(async (title: string) => {
    if (!token || !urlProjectId) return;
    try {
      await realProjectsApi.updatePublishTitle(token, urlProjectId, title.trim() || null);
    } catch (error) {
      console.error("[Step5] 保存发布标题失败:", error);
    }
  }, [token, urlProjectId]);

  // 预览比例固定为 9:16
  const step4PreviewRatio = "9:16";
  const previewAspectRatioCss = useMemo(() => normalizeAspectRatioCss(step4PreviewRatio), []);

  // 从 useStep5Data 获取的数据构建封面候选
  const coverCandidates = useMemo<Step5CoverCandidate[]>(() => {
    const scriptSceneUrls = Array.isArray(workflow.script)
      ? workflow.script
          .map((segment, index) => {
            const sceneImageUrl =
              segment && typeof segment === "object" && !Array.isArray(segment)
                ? String((segment as { sceneImageUrl?: unknown }).sceneImageUrl ?? "").trim()
                : "";
            return {
              sceneImageUrl,
              sceneIndex: index,
            };
          })
          .filter((item) => item.sceneImageUrl.length > 0)
      : [];
    const handoffFrameUrls = ((workflow.step4Step3HandoffPayload as { frames?: Array<{ imageUrl?: string }> } | null)?.frames ?? [])
      .map((frame, index) => {
        const imageUrl = typeof frame.imageUrl === "string" ? frame.imageUrl.trim() : "";
        return {
          imageUrl,
          sceneIndex: index,
        };
      })
      .filter((item) => item.imageUrl.length > 0);
    const fallbackCover = (deliveryPayload?.videoCoverImageUrl ?? "").trim();
    const baseOrderedUrls = dedupeNonEmptyUrls([
      ...scriptSceneUrls.map((item) => item.sceneImageUrl),
      ...handoffFrameUrls.map((item) => item.imageUrl),
    ]);
    const orderedUrls = fallbackCover.length > 0 && !baseOrderedUrls.includes(fallbackCover)
      ? [...baseOrderedUrls, fallbackCover]
      : baseOrderedUrls;
    return orderedUrls.map((url, index) => ({
      id: `cover-${index + 1}`,
      url,
    }));
  }, [deliveryPayload?.videoCoverImageUrl, workflow.script, workflow.step4Step3HandoffPayload]);
  const clipVideoUrlsKey = clipVideoUrls.join("|");
  const currentClipPreviewUrl = clipVideoUrls[previewSequenceIndex] ?? clipVideoUrls[0] ?? "";
  // 扩展模式：扩展已安装 + 选中了账号 + 账号状态 active
  const selectedAccountActive = selectedExtAccountId
    ? extAccounts.find((a) => a.id === selectedExtAccountId)?.status === "active"
    : false;
  const douyinReadyToPublish = douyinExtensionInstalled && selectedAccountActive;

  // ========== 历史侧边栏数据 ==========

  // 成片历史数据
  const [finalVideos, setFinalVideos] = useState<Step5FinalVideoItem[]>([]);

  // 加载成片历史
  useEffect(() => {
    if (!token || !urlProjectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/neirongmiao/api/projects/${urlProjectId}/final-videos?limit=15`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.success && Array.isArray(data.videos)) {
          setFinalVideos(data.videos);
        }
      } catch {
        // 获取失败不影响主流程
      }
    })();
    return () => { cancelled = true; };
  }, [token, urlProjectId]);

  // 当前预览的成片 URL（优先用户选择，其次 finalVideoUrl）
  const [selectedFinalVideoUrl, setSelectedFinalVideoUrl] = useState<string | null>(null);
  const previewMediaUrl = selectedFinalVideoUrl || finalVideoUrl?.trim() || deliveryPayload?.finalVideoUrl?.trim() || "";

  // 图片预览模态框状态
  const [imagePreview, setImagePreview] = useState<{
    frames: StoryboardFrame[];
    currentIndex: number;
  } | null>(null);

  // 视频预览模态框状态
  const [videoPreview, setVideoPreview] = useState<{
    clips: VideoClipItem[];
    currentIndex: number;
  } | null>(null);

  // 转换视频预览数据格式
  const videoPreviewItems = useMemo(() => {
    if (!videoPreview) return [];
    return videoPreview.clips.map((clip) => ({
      url: clip.thumbnailUrl ?? '',
      title: clip.title,
    }));
  }, [videoPreview]);

  // 图片预览切换
  const handleImagePreviewPrev = useCallback(() => {
    if (!imagePreview) return;
    const newIndex = imagePreview.currentIndex > 0
      ? imagePreview.currentIndex - 1
      : imagePreview.frames.length - 1;
    setImagePreview({ ...imagePreview, currentIndex: newIndex });
  }, [imagePreview]);

  const handleImagePreviewNext = useCallback(() => {
    if (!imagePreview) return;
    const newIndex = imagePreview.currentIndex < imagePreview.frames.length - 1
      ? imagePreview.currentIndex + 1
      : 0;
    setImagePreview({ ...imagePreview, currentIndex: newIndex });
  }, [imagePreview]);

  // 键盘事件监听（仅处理图片预览，视频预览键盘事件由组件内部处理）
  useEffect(() => {
    if (!imagePreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        handleImagePreviewPrev();
      } else if (e.key === "ArrowRight") {
        handleImagePreviewNext();
      } else if (e.key === "Escape") {
        setImagePreview(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imagePreview, handleImagePreviewPrev, handleImagePreviewNext]);

  // Step1 角色预设卡片（已废弃 workflow，保留空实现）
  const step1RoleDirectionCards = useMemo(
    () => adaptStep1RolePresetCards([]),
    [],
  );

  // step1SelectedRoleDirection 来自 step5Data hook
  const step1SelectedRoleDirection = hookStep1SelectedRoleDirection;
  const resolvedRoleDirection = useMemo(
    () => step1SelectedRoleDirection,
    [step1SelectedRoleDirection],
  );

  // 创作广场标签根据 Step1 角色性别和年龄自动计算，不可手动更改
  const computedSquarePublishCategory = hookSquarePublishCategory;
  const resolvedSquarePublishCategory = computedSquarePublishCategory;

  // 有效的角色方向（用于 UI 显示）
  const effectiveRoleDirection = step1SelectedRoleDirection;

  // 发布阻塞消息（基于标题和自动计算的创作广场标签）
  const publishBlockedMessage = useMemo(() => {
    if (!hasPublishTitle && !resolvedSquarePublishCategory) {
      return "请先确认交付标题并设置创作广场标签，再提交站内审核发布。";
    }
    if (!hasPublishTitle) {
      return "请先确认交付标题，再提交站内审核发布。";
    }
    if (!resolvedSquarePublishCategory) {
      return "请先在 Step1 设置角色性别和年龄，再提交站内审核发布。";
    }
    return null;
  }, [hasPublishTitle, resolvedSquarePublishCategory]);

  const canPublishToSquare = Boolean(deliveryPayload) && hasPublishTitle && Boolean(resolvedSquarePublishCategory);

  // ========== 结束历史侧边栏数据 ==========

  useEffect(() => {
    setPreviewSequenceIndex(0);
  }, [clipVideoUrlsKey]);

  // 同步自动计算的创作广场标签到 projectData
  useEffect(() => {
    if (!computedSquarePublishCategory || !deliveryPayload) {
      return;
    }
    const currentCategory = deliveryPayload.squarePublishCategory ?? null;
    if (computedSquarePublishCategory === currentCategory) {
      return;
    }
    setStep5DeliveryPayload({
      ...deliveryPayload,
      squarePublishCategory: computedSquarePublishCategory,
    } as typeof workflow.step5DeliveryPayload);
  }, [computedSquarePublishCategory, deliveryPayload, workflow.step5DeliveryPayload, setStep5DeliveryPayload]);



  const stopDouyinPoll = useCallback(() => {
    if (douyinPollRef.current) {
      clearInterval(douyinPollRef.current);
      douyinPollRef.current = null;
    }
  }, []);

  /** 从扩展账号 API 加载已绑定的抖音账号 */
  const refreshExtAccounts = useCallback(async () => {
    if (!token || !douyinExtensionInstalled) return;
    try {
      const res = await fetch("/neirongmiao/api/ext/douyin/accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.code === "SUCCESS" && Array.isArray(data.data)) {
        const accounts = data.data as ExtDouyinAccount[];
        setExtAccounts(accounts);
        // 自动选中第一个 active 账号（仅当未选中时）
        setSelectedExtAccountId((prev) => {
          if (prev) return prev;
          const firstActive = accounts.find((a) => a.status === "active");
          return firstActive?.id ?? null;
        });
      }
    } catch {
      // 获取失败不影响主流程
    }
  }, [token, douyinExtensionInstalled]);

  const refreshDouyinPublishHistory = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/neirongmiao/api/ext/douyin/jobs", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.code === "SUCCESS" && Array.isArray(data.data)) {
        setDouyinPublishHistory(
          data.data.map((job: { id: string; status: string; createdAt: number; result: unknown; error: unknown }) => ({
            id: job.id,
            status: job.status,
            createdAt: job.createdAt,
            result: job.result as { ok: boolean; message: string; errorDetail: string | null } | null,
          })),
        );
      }
    } catch {
      // 获取失败不影响主流程
    }
  }, [token]);

  // 扩展安装后自动加载账号列表
  useEffect(() => {
    if (douyinExtensionInstalled && douyinPanelOpen) {
      void Promise.all([refreshExtAccounts(), refreshDouyinPublishHistory()]);
    }
  }, [douyinExtensionInstalled, douyinPanelOpen, refreshExtAccounts, refreshDouyinPublishHistory]);

  // 页面可见性变化时自动刷新账号列表（用户从抖音页面切回来）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && douyinExtensionInstalled) {
        void refreshExtAccounts();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [douyinExtensionInstalled, refreshExtAccounts]);

  if (!projectData.projectId) {
    return <Navigate to="/projects" replace />;
  }

  const handleFinish = async (action: "publish" | "download") => {
    if (!token || !deliveryPayload) {
      setFeedback("当前缺少 Step4 交付载荷，请返回上一步重新进入。");
      return;
    }
    if (action === "publish" && publishBlockedMessage) {
      setFeedback(publishBlockedMessage);
      return;
    }
    try {
      setIsSubmitting(true);
      setFeedback(null);
      const payloadForAction = {
        ...deliveryPayload,
        videoCoverImageUrl: selectedCoverImage || deliveryPayload.videoCoverImageUrl,
        squarePublishCategory: computedSquarePublishCategory,
      };
      const result = await runStep5DeliveryAction({
        action,
        api: backendApi as unknown as Step5DeliveryActionApi,
        token: token ?? '',
        projectId: projectData.projectId ?? '',
        projectName: projectData.projectName ?? null,
        scriptId: projectData.activeScriptId,
        payload: payloadForAction,
        step4MusicPayload: (workflow.step4MusicPayload as { musics: Array<{ id: string; title?: string; audioUrl?: string }>; selectedMusicId: string | null } | null) ?? { musics: [], selectedMusicId: null },
        updateWorkflow: batchUpdateWorkflow,
        updateProjectData,
        pushTaskNotification,
        publishTitle: selectedTitle,
        squarePublishCategory: computedSquarePublishCategory,
      });
      setFeedback(result.message);
      if (action === "download") {
        const downloadUrl = result.exportUrl.trim();
        if (downloadUrl) {
          triggerBrowserDownload(downloadUrl, `${projectData.projectName || "final-video"}.mp4`);
        }
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "导出/发布失败，请稍后重试";
      setFeedback(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoToFission = () => {
    const pid = projectData.projectId ?? urlProjectId;
    navigate(`/create/${pid}/step6`);
  };

  const pollDouyinPublishJob = useCallback(
    async (jobId: string) => {
      if (!token) return;

      // 超过 5 分钟自动停止轮询
      if (Date.now() - douyinPollStartRef.current > 5 * 60 * 1000) {
        setDouyinPublishMessage((prev) => prev || "发布超时，请检查扩展状态");
        stopDouyinPoll();
        return;
      }

      // 连续失败超过 10 次自动停止
      if (douyinPollErrorCountRef.current >= 10) {
        setDouyinPublishMessage((prev) => prev || "网络异常，请检查连接后重试");
        stopDouyinPoll();
        return;
      }

      try {
        const res = await fetch(`/neirongmiao/api/ext/douyin/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.code !== "SUCCESS") return;

        douyinPollErrorCountRef.current = 0;

        const job = data.data as {
          id: string;
          status: string;
          stage: string | null;
          result: { ok: boolean; message: string } | null;
          error: { code: string; message: string } | null;
        };

        setDouyinPublishStatus(job.status);
        setDouyinPublishMessage(job.result?.message ?? job.error?.message ?? job.stage ?? null);
        setDouyinPublishDetail(job.error?.message ?? null);
        setDouyinPublishScreenshot(null);
        setDouyinPublishLogs([]);
        if (job.status === "completed" || job.status === "failed" || job.status === "expired") {
          stopDouyinPoll();
          void refreshDouyinPublishHistory();
        }
      } catch {
        douyinPollErrorCountRef.current += 1;
      }
    },
    [refreshDouyinPublishHistory, stopDouyinPoll, token],
  );

  const startDouyinPoll = useCallback(
    (jobId: string) => {
      stopDouyinPoll();
      douyinPollStartRef.current = Date.now();
      douyinPollErrorCountRef.current = 0;
      void pollDouyinPublishJob(jobId);
      douyinPollRef.current = setInterval(() => {
        void pollDouyinPublishJob(jobId);
      }, 3000);
    },
    [pollDouyinPublishJob, stopDouyinPoll],
  );

  const handleConfigExtension = async () => {
    try {
      // 生成扩展 Token
      const { token: extToken, apiBaseUrl } = await generateExtensionToken();

      // 发送配置给扩展
      const success = await configureExtension({
        apiBaseUrl,
        authToken: extToken,
      });

      if (success) {
        await alert("扩展配置成功，请刷新扩展 Popup 查看状态", "配置成功");
        // 刷新扩展检测状态
        extensionRefresh();
      } else {
        await alert("扩展配置失败，请手动在扩展选项页配置", "配置失败");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "配置扩展失败";
      await alert(message, "配置失败");
    }
  };

  const handlePublishToDouyin = async () => {
    if (!token || !deliveryPayload) {
      setFeedback("当前缺少 Step4 交付载荷，请返回上一步重新进入。");
      return;
    }
    if (!selectedExtAccountId) {
      setFeedback("请先选择一个抖音账号");
      return;
    }
    try {
      setIsSubmitting(true);
      setFeedback(null);
      setDouyinPublishStatus(null);
      setDouyinPublishMessage(null);
      setDouyinPublishDetail(null);
      setDouyinPublishScreenshot(null);
      setDouyinPublishLogs([]);

      const tags = douyinTags
        .split(/[,，\s]+/)
        .map((t) => t.replace(/^#/, "").trim())
        .filter((t) => t.length > 0);

      const publishTitle = stripProjectNamePrefixFromStep5Title(
        selectedTitle ?? "",
        projectData.projectName ?? null,
      ).slice(0, 30);

      // 使用扩展发布 API
      const res = await fetch("/neirongmiao/api/ext/douyin/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: projectData.projectId,
          accountId: selectedExtAccountId,
          videoUrl: deliveryPayload.finalVideoUrl || deliveryPayload.clipVideoUrls?.[0] || "",
          title: publishTitle.length > 0 ? publishTitle : "成片标题待补充",
          tags,
          coverImageUrl: douyinUploadCover ? (deliveryPayload.videoCoverImageUrl ?? null) : null,
          publishDate:
            douyinScheduleMode === "scheduled" && douyinScheduleDate && douyinScheduleTime
              ? new Date(`${douyinScheduleDate}T${douyinScheduleTime}`).getTime()
              : 0,
        }),
      });

      const data = await res.json();
      if (data.code !== "SUCCESS") {
        throw new Error(data.message || "创建发布任务失败");
      }

      const jobId = data.data.jobId;
      setFeedback("发布任务已创建，扩展将自动执行发布");
      setDouyinPublishJobId(jobId);
      setDouyinPublishStatus("pending");
      startDouyinPoll(jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "抖音发布失败，请稍后重试";
      setFeedback(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    return () => {
      stopDouyinPoll();
    };
  }, [stopDouyinPoll]);

  // 数据加载中，显示全屏 loading
  if (isInitialLoading || step5DataLoading) {
    return <FullScreenLoading />;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto bg-[#fdfbf7] lg:flex-row lg:overflow-hidden">
      {/* 左侧历史侧边栏 */}
      <ProjectFlowHistorySidebar
        currentStep={5}
        projectId={urlProjectId || projectData.projectId}
        onImagePreview={(frames, currentIndex) => setImagePreview({ frames, currentIndex })}
        onVideoPreview={(clips, currentIndex) => setVideoPreview({ clips, currentIndex })}
      >
        {/* Step5 反馈与警告 */}
        {feedback ? <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mt-3">{feedback}</p> : null}
        {!deliveryPayload ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
            当前缺少 Step4 交付载荷，请返回上一步重新完成合成入口。
          </p>
        ) : null}

        <div className="flex-1 lg:overflow-y-auto p-6 space-y-8">
          {/* 标题确认区域 - 紧凑折叠样式 */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <span className="material-icons-round text-primary text-base">title</span>标题确认
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">必填</span>
              </label>
              <button
                className="text-xs text-primary flex items-center gap-1"
                onClick={() =>
                  setTitles(buildDeliveryTitleItems(deliveryPayload?.titleCandidates ?? [], projectData.projectName))
                }
              >
                <span className="material-icons-round text-[10px]">refresh</span>恢复推荐
              </button>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
              {/* 选中项 - 始终显示 */}
              <div className="p-3 bg-white flex items-center justify-between gap-2 group">
                {editingTitleId !== null ? (
                  <div className="flex-1 flex items-center gap-2">
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                      rows={2}
                      autoFocus
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const trimmedValue = editValue.trim();
                        setTitles((current) =>
                          current.map((item) =>
                            item.id === editingTitleId ? { ...item, text: trimmedValue || item.text } : item
                          )
                        );
                        setEditingTitleId(null);
                        // 保存到后端
                        if (trimmedValue) {
                          void savePublishTitle(trimmedValue);
                        }
                      }}
                      className="text-xs text-white bg-primary hover:bg-primary-hover px-2 py-1 rounded font-bold"
                    >
                      保存
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTitleId(null);
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 bg-gray-100 rounded"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-800 font-medium flex-1 line-clamp-2">
                      {selectedTitle}
                    </p>
                    <span className="material-icons-round text-primary text-base">check_circle</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTitleId(selectedTitleId);
                        setEditValue(selectedTitle ?? '');
                      }}
                      className="p-1 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-full"
                      title="编辑标题"
                    >
                      <span className="material-icons-round text-sm">edit</span>
                    </button>
                  </>
                )}
              </div>

              {/* 展开/收起按钮 */}
              {otherTitles.length > 0 && (
                <button
                  className="w-full px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 flex items-center gap-1.5 border-t border-gray-200"
                  onClick={() => setIsTitleListExpanded(!isTitleListExpanded)}
                >
                  <span className="material-icons-round text-sm">
                    {isTitleListExpanded ? "expand_less" : "expand_more"}
                  </span>
                  {isTitleListExpanded ? "收起" : `展开其他候选项 (${otherTitles.length})`}
                </button>
              )}

              {/* 其他候选项列表 */}
              {isTitleListExpanded && otherTitles.length > 0 && (
                <div className="border-t border-gray-200">
                  {otherTitles.map((title) => (
                    <div
                      key={title.id}
                      onClick={() => {
                        setSelectedTitleId(title.id);
                        // 保存到后端
                        void savePublishTitle(title.text);
                      }}
                      className="px-3 py-2 text-sm text-gray-700 hover:bg-white hover:text-primary cursor-pointer truncate border-b border-gray-100 last:border-b-0"
                    >
                      {title.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 创作广场标签（根据 Step1 角色性别和年龄自动设置，只读展示） */}
          <div>
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-4">
              <span className="material-icons-round text-primary text-base">sell</span>创作广场标签
              <span className="text-xs text-gray-400 font-normal">（根据 Step1 角色自动设置）</span>
            </label>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              {computedSquarePublishCategory ? (
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-primary bg-primary/10 px-4 py-2 text-sm font-bold text-primary">
                    {computedSquarePublishCategory}
                  </span>
                  <span className="text-xs text-gray-500">
                    {effectiveRoleDirection?.gender === "female"
                      ? effectiveRoleDirection?.age && effectiveRoleDirection.age <= 17
                        ? "女性角色，17岁及以下 → 女童装"
                        : "女性角色，18岁及以上 → 女装"
                      : effectiveRoleDirection?.gender === "male"
                        ? effectiveRoleDirection?.age && effectiveRoleDirection.age <= 17
                          ? "男性角色，17岁及以下 → 男童装"
                          : "男性角色，18岁及以上 → 男装"
                        : "角色性别未知"}
                  </span>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  无法自动确定分类标签。请在 Step1 设置角色性别和年龄。
                </div>
              )}
              <p className="mt-3 text-xs text-gray-500">
                {buildStep5SquarePublishFeedback(computedSquarePublishCategory)}
              </p>
            </div>
          </div>
        </div>
      </ProjectFlowHistorySidebar>

      <div className="flex-1 flex flex-col min-h-0 bg-[#fdfbf7]">
        <StepContentHeader stepNumber={5} title="交付发布" icon="publish" subtitle="确认标题、广场分类、背景音乐与成片导出。" badges={step5Locked ? <span className="inline-flex items-center gap-1 text-amber-600"><span className="material-icons-round text-sm">lock</span>已锁定</span> : undefined} />
      <div className="flex-1 overflow-y-auto px-6 py-8 pb-96 lg:px-8 lg:pb-[calc(11rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-[960px]">
          <div className="min-w-0 space-y-6">
            <div>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">成片预览</p>
                  <p className="mt-2 text-sm text-gray-500">优先展示最终导出视频；若尚未导出，则回退到 Step4 片段或封面。</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleFinish("download")}
                  disabled={isSubmitting || !previewMediaUrl}
                  className="shrink-0"
                >
                  <span className="material-icons-round text-sm mr-1 align-middle">download</span>
                  <span className="hidden sm:inline">下载成片</span>
                </Button>
              </div>
              {/* 视频预览 + 分享引导 + 裂变引导 并排布局，整体居中 */}
              <div className="flex items-center justify-center gap-12">
                {/* 左侧：分享引导 — 与裂变同风格 */}
                <div className="hidden lg:flex flex-col items-center justify-center w-[220px] shrink-0 gap-5">
                  {/* 分享传播动画区域 */}
                  <div className="relative w-[180px] h-[200px]">
                    {/* 中心分享图标 */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                      <div className="relative">
                        {/* 分享圆形背景 */}
                        <div className="w-[56px] h-[56px] rounded-full bg-gradient-to-br from-blue-500/80 to-cyan-500/80 flex items-center justify-center shadow-lg shadow-blue-500/30">
                          <span className="material-icons-round text-white text-2xl">share</span>
                        </div>
                        {/* 多层脉冲波纹 */}
                        <div className="absolute inset-0 rounded-full border-2 border-blue-400/50 animate-ping" style={{ animationDuration: '2s' }} />
                        <div className="absolute -inset-3 rounded-full border border-blue-300/30 animate-ping" style={{ animationDuration: '3s' }} />
                      </div>
                    </div>

                    {/* 发散光线 */}
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 180 200" fill="none">
                      <line x1="90" y1="100" x2="30" y2="40" stroke="url(#share-grad)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
                      <line x1="90" y1="100" x2="150" y2="40" stroke="url(#share-grad)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
                      <line x1="90" y1="100" x2="20" y2="100" stroke="url(#share-grad)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
                      <line x1="90" y1="100" x2="160" y2="100" stroke="url(#share-grad)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
                      <line x1="90" y1="100" x2="40" y2="160" stroke="url(#share-grad)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
                      <line x1="90" y1="100" x2="140" y2="160" stroke="url(#share-grad)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
                      <defs>
                        <linearGradient id="share-grad" x1="90" y1="100" x2="160" y2="40">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                    </svg>

                    {/* 小传播节点们 — 扇形分布 */}
                    <div className="absolute left-[15px] top-[35px] w-[36px] h-[36px] rounded-full bg-blue-50 border border-blue-300/70 flex items-center justify-center shadow-sm animate-[fadeInSlide_0.6s_0.1s_both]">
                      <span className="material-icons-round text-blue-500 text-sm">person</span>
                    </div>
                    <div className="absolute left-[130px] top-[35px] w-[36px] h-[36px] rounded-full bg-blue-50 border border-blue-300/70 flex items-center justify-center shadow-sm animate-[fadeInSlide_0.6s_0.2s_both]">
                      <span className="material-icons-round text-blue-500 text-sm">person</span>
                    </div>
                    <div className="absolute left-[5px] top-[90px] w-[32px] h-[32px] rounded-full bg-blue-100/70 border border-blue-200/60 flex items-center justify-center animate-[fadeInSlide_0.6s_0.35s_both]">
                      <span className="material-icons-round text-blue-400 text-xs">visibility</span>
                    </div>
                    <div className="absolute left-[145px] top-[90px] w-[32px] h-[32px] rounded-full bg-blue-100/70 border border-blue-200/60 flex items-center justify-center animate-[fadeInSlide_0.6s_0.5s_both]">
                      <span className="material-icons-round text-blue-400 text-xs">visibility</span>
                    </div>
                    <div className="absolute left-[25px] top-[155px] w-[28px] h-[28px] rounded-full bg-blue-100/50 border border-blue-200/40 flex items-center justify-center animate-[fadeInSlide_0.6s_0.65s_both]">
                      <span className="material-icons-round text-blue-300/70 text-xs">thumb_up</span>
                    </div>
                    <div className="absolute left-[125px] top-[155px] w-[28px] h-[28px] rounded-full bg-blue-100/50 border border-blue-200/40 flex items-center justify-center animate-[fadeInSlide_0.6s_0.8s_both]">
                      <span className="material-icons-round text-blue-300/70 text-xs">favorite</span>
                    </div>
                    {/* 中心连接点 */}
                    <div className="absolute left-1/2 top-[185px] -translate-x-1/2 w-[24px] h-[24px] rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-300/30 flex items-center justify-center animate-[fadeInSlide_0.6s_1s_both]">
                      <span className="material-icons-round text-blue-400/60 text-xs">more_horiz</span>
                    </div>
                  </div>

                  {/* 分享按钮 */}
                  <button
                    type="button"
                    onClick={() => {
                      setShareModalOpen(true);
                      setShareLinkCopied(false);
                    }}
                    className="px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold text-base shadow-lg shadow-blue-500/30 hover:from-blue-600 hover:to-cyan-600 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 transition-all duration-200 flex items-center gap-2"
                  >
                    <span className="material-icons-round text-xl">share</span>
                    分享作品
                    <span className="material-icons-round text-lg">arrow_forward</span>
                  </button>

                  <p className="text-[11px] text-gray-400 text-center">生成链接分享给好友 · 可选</p>
                </div>

                {/* 中间：视频预览 */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200 transform transition-transform duration-500 shrink-0">
                  <div className="mx-auto max-w-[320px] p-5">
                    {/* 主视频区域 */}
                    <div className="bg-black relative overflow-hidden rounded-[28px]" style={{ aspectRatio: previewAspectRatioCss }}>
                      {previewMediaUrl ? (
                        <div className="relative h-full w-full mx-auto">
                          <video
                            src={previewMediaUrl}
                            controls
                            className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} w-full h-full object-contain`}
                          />
                          {/* 主视频徽标 */}
                          <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} left-2 top-2 rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-white shadow-lg`}>
                            成片预览
                          </div>
                        </div>
                      ) : currentClipPreviewUrl ? (
                        <div className="relative h-full w-full mx-auto">
                          <video
                            key={`${currentClipPreviewUrl}-${previewSequenceIndex}`}
                            src={currentClipPreviewUrl}
                            controls
                            className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} w-full h-full object-contain`}
                            onEnded={() => {
                              if (clipVideoUrls.length < 2) {
                                return;
                              }
                              setPreviewSequenceIndex((current) => (current + 1) % clipVideoUrls.length);
                            }}
                          />
                          <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white`}>
                            片段 {previewSequenceIndex + 1} / {clipVideoUrls.length}
                          </div>
                        </div>
                      ) : videoCoverImageUrl ? (
                        <div className="relative h-full w-full mx-auto">
                          <img src={getOssThumbnailUrl(videoCoverImageUrl, 400)} className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} w-full h-full object-contain`}  loading="lazy" />
                        </div>
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-sm text-white/80">
                          Step4 片段预览将在这里顺序播放
                        </div>
                      )}
                      <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} top-0 inset-x-0 p-3 bg-gradient-to-b from-black/80 to-transparent text-left pointer-events-none`}>
                        <p className="text-white font-bold text-sm line-clamp-2">{selectedTitle}</p>
                      </div>
                    </div>

                    {/* 成片历史缩略图条 */}
                    <Step5FinalVideoStrip
                      videos={finalVideos}
                      currentVideoUrl={previewMediaUrl || null}
                      onSelectVideo={setSelectedFinalVideoUrl}
                    />
                  </div>
                </div>

                {/* 右侧：裂变引导 — 无框，夸张视觉效果 */}
                <div className="hidden lg:flex flex-col items-center justify-center w-[260px] shrink-0 gap-5">
                  {/* 裂变爆发动画区域 */}
                  <div className="relative w-[230px] h-[200px]">
                    {/* 源视频（大手机）— 中心偏左 */}
                    <div className="absolute left-[10px] top-[50px] z-10">
                      <div className="relative">
                        <div className="w-[50px] h-[88px] rounded-xl border-2 border-gray-400 bg-gradient-to-b from-gray-100 to-gray-200 flex items-center justify-center shadow-lg">
                          <span className="material-icons-round text-gray-500 text-2xl">play_circle</span>
                        </div>
                        {/* 多层脉冲波纹 */}
                        <div className="absolute inset-0 rounded-xl border-2 border-orange-400/50 animate-ping" style={{ animationDuration: '1.5s' }} />
                        <div className="absolute -inset-2 rounded-2xl border border-orange-300/20 animate-ping" style={{ animationDuration: '2.5s' }} />
                      </div>
                    </div>

                    {/* 发散光线 */}
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 230 200" fill="none">
                      <line x1="70" y1="95" x2="130" y2="30" stroke="url(#fission-grad)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
                      <line x1="70" y1="95" x2="155" y2="60" stroke="url(#fission-grad)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
                      <line x1="70" y1="95" x2="165" y2="100" stroke="url(#fission-grad)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
                      <line x1="70" y1="95" x2="140" y2="145" stroke="url(#fission-grad)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
                      <line x1="70" y1="95" x2="110" y2="175" stroke="url(#fission-grad)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
                      <defs>
                        <linearGradient id="fission-grad" x1="70" y1="95" x2="165" y2="60">
                          <stop offset="0%" stopColor="#f97316" stopOpacity="0.8" />
                          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                    </svg>

                    {/* 小手机们 — 扇形爆开分布 */}
                    <div className="absolute left-[125px] top-[15px] w-[34px] h-[24px] rounded-lg bg-orange-50 border border-orange-300/70 flex items-center justify-center shadow-sm animate-[fadeInSlide_0.6s_0.1s_both]">
                      <span className="text-orange-500 text-[10px]">▶</span>
                    </div>
                    <div className="absolute left-[150px] top-[45px] w-[34px] h-[24px] rounded-lg bg-orange-50 border border-orange-300/70 flex items-center justify-center shadow-sm animate-[fadeInSlide_0.6s_0.2s_both]">
                      <span className="text-orange-500 text-[10px]">▶</span>
                    </div>
                    <div className="absolute left-[155px] top-[85px] w-[34px] h-[24px] rounded-lg bg-orange-50 border border-orange-300/70 flex items-center justify-center shadow-sm animate-[fadeInSlide_0.6s_0.35s_both]">
                      <span className="text-orange-500 text-[10px]">▶</span>
                    </div>
                    <div className="absolute left-[140px] top-[130px] w-[34px] h-[24px] rounded-lg bg-orange-50 border border-orange-300/70 flex items-center justify-center shadow-sm animate-[fadeInSlide_0.6s_0.5s_both]">
                      <span className="text-orange-500 text-[10px]">▶</span>
                    </div>
                    <div className="absolute left-[105px] top-[162px] w-[34px] h-[24px] rounded-lg bg-orange-50 border border-orange-300/70 flex items-center justify-center shadow-sm animate-[fadeInSlide_0.6s_0.65s_both]">
                      <span className="text-orange-500 text-[10px]">▶</span>
                    </div>
                    {/* 第二圈更淡的幽灵小手机 */}
                    <div className="absolute left-[195px] top-[30px] w-[28px] h-[20px] rounded-md bg-orange-100/50 border border-orange-200/40 flex items-center justify-center animate-[fadeInSlide_0.6s_0.8s_both]">
                      <span className="text-orange-300/60 text-[8px]">▶</span>
                    </div>
                    <div className="absolute left-[200px] top-[75px] w-[28px] h-[20px] rounded-md bg-orange-100/50 border border-orange-200/40 flex items-center justify-center animate-[fadeInSlide_0.6s_0.9s_both]">
                      <span className="text-orange-300/60 text-[8px]">▶</span>
                    </div>
                    <div className="absolute left-[185px] top-[130px] w-[28px] h-[20px] rounded-md bg-orange-100/50 border border-orange-200/40 flex items-center justify-center animate-[fadeInSlide_0.6s_1.0s_both]">
                      <span className="text-orange-300/60 text-[8px]">▶</span>
                    </div>
                  </div>

                  {/* 裂变按钮 */}
                  <button
                    type="button"
                    onClick={handleGoToFission}
                    className="px-6 py-3 rounded-2xl bg-gradient-to-r from-primary to-orange-500 text-white font-bold text-base shadow-lg shadow-primary/30 hover:from-primary-hover hover:to-orange-600 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 transition-all duration-200 flex items-center gap-2"
                  >
                    <span className="material-icons-round text-xl">auto_awesome</span>
                    一键裂变
                    <span className="material-icons-round text-lg">arrow_forward</span>
                  </button>

                  <p className="text-[11px] text-gray-400 text-center">一条视频变多条不同风格 · 可选</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">发布前确认</p>
                  <p className="mt-2 text-sm text-gray-600">标题和广场标签为必选项；背景音乐可选，不会阻塞发布。</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2 text-[11px] font-semibold">
                  <span className={`rounded-full px-3 py-1 ${hasPublishTitle ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    标题{hasPublishTitle ? "已确认" : "必填"}
                  </span>
                  <span className={`rounded-full px-3 py-1 ${computedSquarePublishCategory ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    标签{computedSquarePublishCategory ? "已设置" : "需设置"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">音乐可选</span>
                </div>
              </div>
              {publishBlockedMessage ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {publishBlockedMessage}
                </div>
              ) : null}
            </div>

            {/* 抖音发布面板 */}
              <Step5DouyinPublishPanel
                extensionInstalled={douyinExtensionInstalled}
                panelOpen={douyinPanelOpen}
                onToggleOpen={() => setDouyinPanelOpen((current) => !current)}
                accounts={extAccounts}
                selectedAccountId={selectedExtAccountId}
                onSelectedAccountChange={setSelectedExtAccountId}
                readyToPublish={douyinReadyToPublish}
                onConfigExtension={() => void handleConfigExtension()}
                tags={douyinTags}
                onTagsChange={setDouyinTags}
                linkUrl={douyinLinkUrl}
                onLinkUrlChange={setDouyinLinkUrl}
                productLink={douyinProductLink}
                onProductLinkChange={setDouyinProductLink}
                productTitle={douyinProductTitle}
                onProductTitleChange={setDouyinProductTitle}
                scheduleMode={douyinScheduleMode}
                onScheduleModeChange={setDouyinScheduleMode}
                scheduleDate={douyinScheduleDate}
                onScheduleDateChange={setDouyinScheduleDate}
                scheduleTime={douyinScheduleTime}
                onScheduleTimeChange={setDouyinScheduleTime}
                uploadCover={douyinUploadCover}
                onUploadCoverChange={setDouyinUploadCover}
                aiGeneratedDeclaration={douyinAiGeneratedDeclaration}
                onAiGeneratedDeclarationChange={setDouyinAiGeneratedDeclaration}
                publishStatus={douyinPublishStatus}
                publishMessage={douyinPublishMessage}
                publishJobId={douyinPublishJobId}
                publishDetail={douyinPublishDetail}
                publishLogs={douyinPublishLogs}
                publishScreenshot={douyinPublishScreenshot}
                isSubmitting={isSubmitting}
                hasDeliveryPayload={Boolean(deliveryPayload)}
                onPublish={() => void handlePublishToDouyin()}
                showPublishHistory={showPublishHistory}
                onTogglePublishHistory={() => {
                  setShowPublishHistory((current) => !current);
                  if (!showPublishHistory) {
                    void refreshDouyinPublishHistory();
                  }
                }}
                publishHistory={douyinPublishHistory}
                formatTimestamp={formatStep5Timestamp}
                onInstallExtension={() => setExtensionInstallModalOpen(true)}
              />
          </div>
        </div>
      </div>

      {/* 图片预览模态框 */}
      {imagePreview && imagePreview.frames.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setImagePreview(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              className="absolute -top-10 right-0 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
              onClick={() => setImagePreview(null)}
            >
              <span className="material-icons-round text-2xl">close</span>
            </button>

            {/* 图片标题 */}
            <div className="text-center text-white/80 text-sm mb-3">
              {imagePreview.frames[imagePreview.currentIndex]?.title ?? `图片 ${imagePreview.currentIndex + 1}`}
              <span className="ml-2 text-white/60">
                ({imagePreview.currentIndex + 1} / {imagePreview.frames.length})
              </span>
            </div>

            {/* 图片容器 */}
            <div className="relative flex items-center justify-center">
              {/* 左箭头 */}
              {imagePreview.frames.length > 1 && (
                <button
                  className="absolute -left-12 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors z-10"
                  onClick={handleImagePreviewPrev}
                >
                  <span className="material-icons-round text-3xl">chevron_left</span>
                </button>
              )}

              {/* 图片 */}
              <img
                src={imagePreview.frames[imagePreview.currentIndex]?.imageUrl ?? ""}
                alt={imagePreview.frames[imagePreview.currentIndex]?.title ?? "预览图片"}
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              />

              {/* 右箭头 */}
              {imagePreview.frames.length > 1 && (
                <button
                  className="absolute -right-12 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors z-10"
                  onClick={handleImagePreviewNext}
                >
                  <span className="material-icons-round text-3xl">chevron_right</span>
                </button>
              )}
            </div>

            {/* 底部提示 */}
            <div className="text-center text-white/60 text-xs mt-3">
              使用键盘 ← → 键切换图片，ESC 键关闭
            </div>
          </div>
        </div>
      )}

      {/* 视频播放模态框 */}
      <VideoPreviewModal
        isOpen={!!videoPreview && videoPreview.clips.length > 0}
        videos={videoPreviewItems}
        currentIndex={videoPreview?.currentIndex ?? 0}
        onIndexChange={(index) => {
          if (videoPreview) {
            setVideoPreview({ ...videoPreview, currentIndex: index });
          }
        }}
        onClose={() => setVideoPreview(null)}
      />

      {/* 分享链接弹窗 */}
      {shareModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[backdrop-fade-in_0.2s_ease-out]"
          onClick={() => setShareModalOpen(false)}
        >
          <div
            className="relative w-[420px] max-w-[90vw] bg-white rounded-2xl shadow-2xl overflow-hidden animate-[fade-in-scale_0.3s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶部装饰条 */}
            <div className="h-2 bg-gradient-to-r from-blue-500 to-cyan-500" />

            {/* 关闭按钮 */}
            <button
              onClick={() => setShareModalOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
            >
              <span className="material-icons-round text-gray-500 text-lg">close</span>
            </button>

            {/* 内容区 */}
            <div className="p-6">
              {/* 标题 */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <span className="material-icons-round text-white text-xl">share</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">分享作品</h3>
                  <p className="text-sm text-gray-500">将成片视频分享给好友观看</p>
                </div>
              </div>

              {/* 提示文案 */}
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 mb-4">
                <div className="flex items-start gap-3">
                  <span className="material-icons-round text-blue-500 text-lg">info</span>
                  <div className="flex-1">
                    <p className="text-sm text-blue-800 font-medium mb-1">公开分享链接</p>
                    <p className="text-xs text-blue-600/80">无需登录即可观看，包含成片视频和裂变作品</p>
                  </div>
                </div>
              </div>

              {/* 链接区域 */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-gray-700 mb-2 block">分享链接</label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/share/${projectData.projectId}`}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 font-mono focus:outline-none focus:border-blue-300"
                  />
                  {/* 复制按钮 */}
                  <button
                    onClick={() => {
                      const shareUrl = `${window.location.origin}/share/${projectData.projectId}`;
                      navigator.clipboard.writeText(shareUrl);
                      setShareLinkCopied(true);
                      setTimeout(() => setShareLinkCopied(false), 2000);
                    }}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      shareLinkCopied
                        ? 'bg-emerald-500 text-white'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                  >
                    {shareLinkCopied ? (
                      <span className="flex items-center gap-1">
                        <span className="material-icons-round text-sm">check</span>
                        已复制
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <span className="material-icons-round text-sm">content_copy</span>
                        复制
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* 二维码区域 - 优雅玻璃态设计 */}
              <div className="mb-5">
                {/* 分隔线 */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                  <span className="text-xs text-gray-400 font-medium">或扫码分享</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                </div>

                {/* 二维码卡片容器 */}
                <div className="flex items-center justify-center gap-6 p-5 rounded-2xl bg-gradient-to-br from-blue-50/80 to-cyan-50/60 border border-blue-100/50 relative overflow-hidden">
                  {/* 背景光效 */}
                  <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-gradient-radial from-blue-200/30 to-transparent blur-2xl" />
                  <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-gradient-radial from-cyan-200/20 to-transparent blur-xl" />

                  {/* 二维码图片 */}
                  <div className="relative group">
                    {/* 光晕边框 */}
                    <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-blue-400/40 to-cyan-400/30 blur-sm opacity-70 group-hover:opacity-100 group-hover:blur-md transition-all duration-500" />
                    {/* 白色底卡片 */}
                    <div className="relative w-[120px] h-[120px] bg-white rounded-xl shadow-lg shadow-blue-100/50 p-3 flex items-center justify-center">
                      {videoQrLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white rounded-xl">
                          <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                        </div>
                      )}
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/share/${projectData.projectId}`)}&bgcolor=ffffff&color=1e40af&margin=0`}
                        alt="分享二维码"
                        className={`w-full h-full object-contain rounded-md transition-opacity duration-300 ${videoQrLoading ? "opacity-0" : "opacity-100"}`}
                        onLoad={() => setVideoQrLoading(false)}
                      />
                    </div>
                  </div>

                  {/* 右侧说明文字 */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20">
                        <span className="material-icons-round text-white text-lg">qr_code_2</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-800">手机扫码</span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">打开微信或相机<br/>扫描二维码分享</p>
                  </div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShareModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-colors"
                >
                  关闭
                </button>
                <button
                  onClick={() => {
                    const shareUrl = `${window.location.origin}/share/${projectData.projectId}`;
                    navigator.clipboard.writeText(shareUrl);
                    setShareLinkCopied(true);
                    // 打开分享页面预览
                    window.open(shareUrl, '_blank');
                  }}
                  className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-icons-round text-lg">open_in_new</span>
                  打开预览
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 底部操作栏 */}
      <div className="fixed bottom-6 left-0 right-0 lg:left-[400px] z-40 flex justify-center pointer-events-none">
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl px-3 py-2.5 shadow-xl shadow-gray-200/50 pointer-events-auto flex items-center gap-2 max-w-[90%] md:max-w-none">
          {/* 返回上一步 */}
          <Button variant="ghost" onClick={() => { const pid = projectData.projectId ?? urlProjectId; navigate(`/create/${pid}/step4`); }} className="rounded-xl px-3 text-gray-500 hover:text-gray-900 hover:bg-gray-50 whitespace-nowrap shrink-0">
            <span className="material-icons-round text-lg">arrow_back</span>
            <span className="hidden md:inline ml-1">上一步</span>
          </Button>

          <div className="h-5 w-px bg-gray-200" />

          {/* 提示文案 */}
          <div className="text-[10px] text-gray-400 font-medium px-1 whitespace-nowrap hidden sm:flex items-center gap-1">
            标题/标签必填，音乐可选
          </div>

          <div className="h-5 w-px bg-gray-200 hidden sm:block" />

          {/* 发布作品 — 主操作：primary 渐变 */}
          <Button onClick={() => void handleFinish("publish")} className="rounded-xl px-5 bg-gradient-to-r from-primary to-orange-500 hover:from-primary-hover hover:to-orange-600 text-white shadow-md shadow-primary/25 whitespace-nowrap shrink-0 transition-transform animate-pulse-scale" disabled={isSubmitting || !canPublishToSquare}>
            <span className="hidden sm:inline">发布作品</span>
            <span className="material-icons-round text-base sm:ml-1">rocket_launch</span>
          </Button>

        </div>
      </div>

      {/* 扩展安装教程弹窗 */}
      <ExtensionInstallGuideModal
        isOpen={extensionInstallModalOpen}
        onClose={() => setExtensionInstallModalOpen(false)}
        downloadUrl="/neirongmiao/api/ext/douyin/download"
      />
      </div>
    </div>
  );
};
