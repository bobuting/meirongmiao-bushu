import React, { useEffect, useMemo, useState } from "react";
import {
  type ScriptCandidateViewModel,
} from "./step3ScriptCandidatesController";
import { resolveStep3ScriptBasicInfo } from "./step3ScriptBasicInfoExtractor";
import type { Step3LoadingStates, LoadingState } from "./step3-workspace/useStep3ScriptJobs";
import type { ScriptType } from "./step3-workspace/useStep3ScriptJobs";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { useAppStore } from "../../store/useAppStore";
import { GlobalTaskType, TaskStatus } from "../../components/layout/taskQueueConfig";
import { getStrategyTypeLabel, STRATEGY_TYPE_LABELS, STRATEGY_TYPE_MATERIAL_ICONS } from "../../utils/strategyTypeLabels";

interface Step3StructuredScriptCandidatesPanelProps {
  candidates: ScriptCandidateViewModel[];
  selectedCandidateId: string | null;
  /** 项目 ID（用于判断改写任务状态） */
  projectId?: string;
  /** 是否已锁定（有确认的脚本） */
  isConfirmed?: boolean;
  initialLoading?: boolean;
  /** 反推脚本改写中状态（需要显示遮罩） */
  reverseRewriting?: boolean;
  /** 是否为反推项目（反推项目隐藏策略进度条、脚本库按钮、刷新推荐按钮） */
  isReverse?: boolean;
  forceLocked?: boolean;
  unlockLoading?: boolean;
  refreshLoading?: boolean;
  isAdmin?: boolean;
  /** 三阶段加载状态（库存/视频/实时/智能） */
  loadingState?: Step3LoadingStates;
  /** 已加载候选数量 */
  availableCount?: number;
  onPickCandidate: (candidate: ScriptCandidateViewModel, startRect?: DOMRect) => void;
  onRefreshCandidates?: () => void;
  onAdminUnlockCandidate?: () => void;
  /** 骨架卡片数量（默认 2） */
  skeletonCount?: number;
  /** 最小化到广场 */
  onMinimizeToSquare?: () => void;
  /** 重新生成单个策略类型 */
  onRetryType?: (type: ScriptType) => void;
  /** 可用的策略列表（根据角色年龄动态过滤） */
  availableStrategies?: ScriptType[];
}

function resolveStep3CandidateSourceDisplayLabel(candidate: ScriptCandidateViewModel): string {
  return getStrategyTypeLabel(candidate.strategyType);
}

function resolveStep3RatingLabel(candidate: ScriptCandidateViewModel): string {
  const taggedRating =
    (candidate.tags ?? [])
      .map((tag) => String(tag ?? "").trim())
      .find((tag) => tag.startsWith("推荐评级:"))
      ?.slice("推荐评级:".length)
      .trim() ?? "";
  if (taggedRating) {
    return taggedRating;
  }
  if (candidate.suitability === "high") {
    return "推荐";
  }
  if (candidate.suitability === "medium") {
    return "可尝试";
  }
  if (candidate.suitability === "low") {
    return "谨慎";
  }
  return candidate.source === "premium" ? "成品库推荐" : "待评估";
}

function extractDouyinVideoId(sourceUrl: string | null | undefined): string | null {
  const raw = String(sourceUrl ?? "").trim();
  if (!raw) {
    return null;
  }
  return (
    raw.match(/\/video\/(\d{10,24})(?:[/?#]|$)/i)?.[1] ??
    raw.match(/[?&](?:item_id|aweme_id|group_id|vid)=(\d{10,24})(?:[&#]|$)/i)?.[1] ??
    null
  );
}

function buildDouyinEmbedUrl(videoId: string | null): string | null {
  if (!videoId) {
    return null;
  }
  return `https://open.douyin.com/player/video?vid=${encodeURIComponent(videoId)}&autoplay=0`;
}

/**
 * 判断 URL 是否为可播放的视频直链（非抖音嵌入 URL）
 * 匹配 .mp4/.webm/.ogg 等视频扩展名，或阿里云 OSS 等对象存储域名
 */
function isDirectVideoUrl(sourceUrl: string | null | undefined): boolean {
  const raw = String(sourceUrl ?? "").trim();
  if (!raw.startsWith("http")) return false;
  // 已识别为抖音 URL 的不算直链
  if (extractDouyinVideoId(raw)) return false;
  // 常见视频扩展名
  if (/\.(mp4|webm|ogg|m3u8)(\?|#|$)/i.test(raw)) return true;
  // 阿里云 OSS 域名（不含抖音路径）
  if (/\.oss-cn-[a-z]+\.aliyuncs\.com/i.test(raw)) return true;
  return false;
}

function normalizeStep3SummaryText(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function resolveStep3ScriptStyle(candidate: ScriptCandidateViewModel, fallback: string): string {
  // 忽略策略类型标签和通用标签
  const ignored = new Set([
    ...Object.values(STRATEGY_TYPE_LABELS), // 所有策略类型标签
    "成品库推荐",
    "热榜导向",
    "快节奏",
    "节奏递进",
    "故事润色",
  ]);
  const styleTags = Array.from(
    new Set(
      (candidate.tags ?? [])
        .map((tag) => String(tag ?? "").trim())
        .filter((tag) => tag.length > 0 && !ignored.has(tag) && !tag.startsWith("推荐评级:")),
    ),
  );
  return styleTags.slice(0, 2).join("、") || fallback || "通用风格";
}

function extractReasonValue(reasons: readonly string[], pattern: RegExp): string | null {
  const matched = reasons.find((reason) => pattern.test(reason));
  if (!matched) {
    return null;
  }
  const value = matched.split(/[：:]/u).slice(1).join("：").replace(/[。；;]+$/u, "").trim();
  return value || matched.replace(/[。；;]+$/u, "").trim();
}

function resolveStep3MatchDescription(candidate: ScriptCandidateViewModel): string {
  const reasons = Array.isArray(candidate.matchReasons)
    ? candidate.matchReasons.map((item) => String(item ?? "").trim()).filter((item) => item.length > 0)
    : [];
  const parts: string[] = [];

  const styleValue = extractReasonValue(reasons, /角色风格|风格/u);
  const outfitValue = extractReasonValue(reasons, /服饰锚点|服装|单品/u);
  const genderValue = extractReasonValue(reasons, /性别/u);
  const viewValue = extractReasonValue(reasons, /视角|五视图/u);
  const sceneValue = extractReasonValue(reasons, /场景/u);

  if (styleValue) {
    parts.push(`风格匹配：${styleValue}`);
  }
  if (outfitValue) {
    parts.push(`服饰匹配：${outfitValue}`);
  }
  if (genderValue) {
    parts.push(`性别匹配：${genderValue.replace(/表述/u, "").trim()}`);
  }
  if (viewValue) {
    parts.push(`视角匹配：${viewValue}`);
  }
  if (sceneValue) {
    parts.push(`场景匹配：${sceneValue}`);
  }

  if (parts.length > 0) {
    return parts.slice(0, 3).join("；");
  }

  if (reasons.some((reason) => /命中较弱|兜底排序/u.test(reason))) {
    return "整体匹配：热榜相关性较高，个性化命中偏弱";
  }
  if (candidate.suitability === "high") {
    return "整体匹配：角色风格与场景方向较一致";
  }
  if (candidate.suitability === "medium") {
    return "整体匹配：主题方向可用，建议继续润色";
  }
  return candidate.source === "premium" ? "整体匹配：站内成片语义可直接复用" : "整体匹配：热榜方向可参考";
}

function resolveStep3MediaEmptyLabel(candidate: ScriptCandidateViewModel): string {
  if (candidate.strategyType === "library") {
    return "站内成品库预览";
  }
  return `${getStrategyTypeLabel(candidate.strategyType)}暂无原视频`;
}

/** 五步骤加载进度配置（从统一标签映射表生成） */
const STEP3_LOADING_STEPS = [
  { key: "library" as const, label: STRATEGY_TYPE_LABELS.library, icon: STRATEGY_TYPE_MATERIAL_ICONS.library },
  { key: "video" as const, label: STRATEGY_TYPE_LABELS.video, icon: STRATEGY_TYPE_MATERIAL_ICONS.video },
  { key: "realtime" as const, label: STRATEGY_TYPE_LABELS.realtime, icon: STRATEGY_TYPE_MATERIAL_ICONS.realtime },
  { key: "effectiveness" as const, label: STRATEGY_TYPE_LABELS.effectiveness, icon: STRATEGY_TYPE_MATERIAL_ICONS.effectiveness },
  { key: "custom" as const, label: STRATEGY_TYPE_LABELS.custom, icon: STRATEGY_TYPE_MATERIAL_ICONS.custom },
  { key: "fashion" as const, label: STRATEGY_TYPE_LABELS.fashion, icon: STRATEGY_TYPE_MATERIAL_ICONS.fashion },
  { key: "emotion_archetype" as const, label: STRATEGY_TYPE_LABELS.emotion_archetype, icon: STRATEGY_TYPE_MATERIAL_ICONS.emotion_archetype },
  { key: "aesthetic" as const, label: STRATEGY_TYPE_LABELS.aesthetic, icon: STRATEGY_TYPE_MATERIAL_ICONS.aesthetic },
  { key: "product_showcase" as const, label: STRATEGY_TYPE_LABELS.product_showcase, icon: STRATEGY_TYPE_MATERIAL_ICONS.product_showcase },
  { key: "story_theme" as const, label: STRATEGY_TYPE_LABELS.story_theme, icon: STRATEGY_TYPE_MATERIAL_ICONS.story_theme },
  { key: "resonance" as const, label: STRATEGY_TYPE_LABELS.resonance, icon: STRATEGY_TYPE_MATERIAL_ICONS.resonance },
];

/** 获取策略状态指示 */
function getStrategyStatusInfo(status: LoadingState): {
  icon: string;
  label: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  showSpinner: boolean;
} {
  switch (status) {
    case "done":
      return { icon: "check_circle", label: "已完成", textColor: "text-emerald-700", bgColor: "bg-emerald-50", borderColor: "border-emerald-200", showSpinner: false };
    case "loading":
      return { icon: "autorenew", label: "生成中", textColor: "text-sky-700", bgColor: "bg-sky-50", borderColor: "border-sky-200", showSpinner: true };
    case "error":
      return { icon: "error_outline", label: "异常", textColor: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200", showSpinner: false };
    default:
      return { icon: "schedule", label: "等待中", textColor: "text-gray-400", bgColor: "bg-gray-50", borderColor: "border-gray-200", showSpinner: false };
  }
}

function buildStep3EmbedFitStyle(mode: "card" | "modal"): React.CSSProperties {
  if (mode === "modal") {
    return {
      width: "82%",
      height: "82%",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%) scale(1.24)",
      transformOrigin: "center center",
    };
  }
  return {
    width: "182%",
    height: "182%",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%) scale(0.68)",
    transformOrigin: "center center",
  };
}

function buildStep3CandidatePages(candidates: readonly ScriptCandidateViewModel[]): Array<Array<ScriptCandidateViewModel | null>> {
  const pages: Array<Array<ScriptCandidateViewModel | null>> = [];
  for (let index = 0; index < candidates.length; index += 2) {
    const page = candidates.slice(index, index + 2);
    if (page.length === 1) {
      pages.push([page[0], null]);
      continue;
    }
    pages.push([page[0], page[1]]);
  }
  return pages.length > 0 ? pages : [[null, null]];
}

function renderStep3FallbackCard(label: string) {
  return (
    <div className="aspect-square w-full rounded-[32px] border border-[#d1cbc4]/30 bg-white p-8 shadow-[0_24px_48px_rgba(45,51,53,0.04)]">
      <div className="flex h-full flex-col">
        <div className="mb-6">
          <div className="mb-3 flex gap-3">
            <div className="h-5 w-24 rounded bg-[#f0ede8]" />
            <div className="h-5 w-20 rounded bg-[#fceee9]" />
          </div>
          <div className="h-10 w-3/4 rounded bg-[#f0ede8]" />
        </div>
        <div className="flex min-h-0 flex-1 gap-6">
          <div className="flex-1">
            <div className="h-44 rounded-2xl bg-[#f5f3ef]" />
            <div className="mt-4 h-32 rounded-2xl bg-[#f5f3ef]" />
          </div>
          <div className="flex w-[180px] shrink-0 items-center justify-center">
            <div className="aspect-[9/16] w-full rounded-[24px] bg-[#f0ede8]" />
          </div>
        </div>
        <div className="mt-6 h-16 rounded-xl bg-[#f5f3ef]" />
        <div className="mt-3 text-center text-xs text-[#8d8d8d]">{label}</div>
      </div>
    </div>
  );
}

export const Step3StructuredScriptCandidatesPanel: React.FC<Step3StructuredScriptCandidatesPanelProps> = ({
  candidates,
  selectedCandidateId,
  projectId,
  isConfirmed = false,
  initialLoading = false,
  reverseRewriting = false,
  isReverse = false,
  skeletonCount = 2,
  forceLocked = false,
  unlockLoading: _unlockLoading = false,
  refreshLoading = false,
  isAdmin = false,
  loadingState,
  availableCount: _availableCount = 0,
  onPickCandidate,
  onRefreshCandidates,
  onAdminUnlockCandidate: _onAdminUnlockCandidate,
  onMinimizeToSquare,
  onRetryType,
  availableStrategies,
}) => {
  const { confirm } = useConfirm();
  const activeCandidateId = selectedCandidateId ?? null;
  const isLocked = forceLocked || isConfirmed;
  const fallbackSkeletonColumns = Array.from({ length: skeletonCount }, (_, i) => `候选 ${String.fromCharCode(65 + i)}`);
  const candidatePages = useMemo(() => buildStep3CandidatePages(candidates), [candidates]);
  const [pageIndex, setPageIndex] = useState(0);
  const [previewModal, setPreviewModal] = useState<{
    title: string;
    iframeSrc: string | null;
    videoSrc: string | null;
    sourceUrl: string | null;
  } | null>(null);

  // 直接从 globalTaskQueue 判断是否有运行中的改写任务
  const globalTaskQueue = useAppStore((s) => s.globalTaskQueue);
  const hasRunningReverseRewriteJob = useMemo(() => {
    if (!projectId) return false;
    const job = globalTaskQueue.find(
      (j) => j.projectId === projectId && j.type === GlobalTaskType.STEP3_REVERSE_REWRITE && (j.status === TaskStatus.PENDING || j.status === TaskStatus.RUNNING)
    );
    return !!job;
  }, [globalTaskQueue, projectId]);

  // 判断是否显示遮罩（第一条脚本出来后就消失）
  const showOverlay = useMemo(() => {
    // 有脚本数据时不显示遮罩，让用户能看到已生成的脚本
    if (candidates.length > 0) return false;
    if (!loadingState) return false;
    // 只检查可用策略是否在加载中（不可用策略始终为 idle）
    if (!availableStrategies || availableStrategies.length === 0) return false;
    return availableStrategies.some((key) => loadingState[key] === "loading");
  }, [loadingState, candidates.length, availableStrategies]);

  // 判断是否显示进度条
  // - 锁定前：一直显示
  // - 锁定后：如果有策略正在生成中，继续显示；全部完成后才隐藏
  const showProgressBar = useMemo(() => {
    if (!loadingState) return false;
    if (isReverse) return false; // 反推项目不通过策略生成脚本
    if (!availableStrategies || availableStrategies.length === 0) return false;

    // 锁定前一直显示
    if (!isLocked) return true;

    // 锁定后：检查是否有策略正在生成中
    const hasLoading = availableStrategies.some((key) => loadingState[key] === "loading");
    return hasLoading;
  }, [loadingState, isLocked, isReverse, availableStrategies]);

  // 判断是否有策略正在生成中（用于按钮图标旋转，与进度条显示分离）
  const hasAnyLoading = useMemo(() => {
    if (!loadingState) return false;
    if (!availableStrategies || availableStrategies.length === 0) return false;
    return availableStrategies.some((key) => loadingState[key] === "loading");
  }, [loadingState, availableStrategies]);

  // 最终判断是否显示改写中遮罩
  const showReverseRewritingOverlay = reverseRewriting || hasRunningReverseRewriteJob;

  // 监听页面数量变化，调整页码
  useEffect(() => {
    setPageIndex((current) => {
      const maxIndex = Math.max(0, candidatePages.length - 1);
      return Math.min(current, maxIndex);
    });
  }, [candidatePages.length]);

  const visiblePage = candidatePages[pageIndex] ?? [null, null];
  const showPager = candidatePages.length > 1;

  return (
    <div id="step3-script-candidates" className="relative rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* 脚本生成/反推改写加载遮罩（第一条脚本出来后就消失） */}
      {(initialLoading || showOverlay || showReverseRewritingOverlay) && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/80 backdrop-blur-sm">
          {/* 旋转时钟图标 */}
          <div className="relative mb-4 flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
            <span className="material-icons-round text-3xl text-orange-500">schedule</span>
          </div>
          <div className="text-sm font-semibold text-gray-700">
            {showReverseRewritingOverlay ? "正在改写脚本..." : refreshLoading ? "正在刷新推荐脚本..." : "正在生成脚本候选..."}
          </div>
          <div className="mt-1 text-xs text-gray-400">
            {showReverseRewritingOverlay ? "AI 正在根据项目信息改写脚本，请稍候" : "AI 正在分析热榜、场景与角色匹配，请稍候"}
          </div>
          <div className="mt-1 text-xs text-amber-500">
            ⏱ {showReverseRewritingOverlay ? "脚本改写通常需要 1-3 分钟" : "脚本生成通常需要 2-5 分钟"}
          </div>
          {/* 加载进度指示器 */}
          {!showReverseRewritingOverlay && loadingState && availableStrategies && availableStrategies.length > 0 && (
            <div className="mt-4 flex items-center gap-3 rounded-full bg-white px-4 py-2 shadow-sm border border-gray-100">
              {STEP3_LOADING_STEPS
                .filter((step) => availableStrategies.includes(step.key))
                .map((step, index, filteredSteps) => {
                  const status = loadingState[step.key] ?? "idle";
                  const info = getStrategyStatusInfo(status);
                  return (
                    <React.Fragment key={step.key}>
                      {index > 0 && <div className="h-3 w-px bg-gray-200" />}
                      <div className="flex items-center gap-1.5">
                        <span className={`material-icons-round text-xs ${info.showSpinner ? "animate-spin text-sky-500" : status === "done" ? "text-emerald-500" : status === "error" ? "text-red-500" : "text-gray-300"}`}>
                          {info.icon}
                        </span>
                        <span className="text-[11px] font-medium text-gray-500">{step.label}</span>
                      </div>
                    </React.Fragment>
                  );
                })}
            </div>
          )}
          {onMinimizeToSquare && (
            <button
              type="button"
              onClick={onMinimizeToSquare}
              className="mt-4 px-4 py-2 text-sm text-sky-600 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors flex items-center gap-2"
            >
              <span className="material-icons-round text-base">launch</span>
              后台生成，先逛逛
            </button>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isLocked ? (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-active shadow-lg shadow-primary/20">
                <span className="material-icons-round text-xl text-white">check_circle</span>
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-gray-900">已确认脚本</h3>
                <p className="text-xs text-gray-500 mt-0.5">脚本已锁定，可继续编辑分镜</p>
              </div>
            </>
          ) : (
            <h3 className="font-display text-xl font-bold text-gray-900">推荐脚本选择 ✨</h3>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isReverse && onRefreshCandidates ? (
            <button
              type="button"
              onClick={onRefreshCandidates}
              disabled={isLocked || refreshLoading || hasAnyLoading}
              title={isLocked ? "当前已锁定，需管理员解锁后才能刷新推荐" : hasAnyLoading ? "正在生成中，请等待完成后再刷新" : "重新触发 Step3 推荐生成"}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-all ${
                isLocked || refreshLoading || hasAnyLoading
                  ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300"
                  : "border-[#d1cbc4]/30 bg-white text-[#2d3335] shadow-sm hover:border-primary/40 hover:text-primary hover:shadow-md active:scale-95"
              }`}
            >
              <span className={`material-icons-round text-base ${refreshLoading || hasAnyLoading ? "animate-spin" : ""}`}>
                auto_awesome
              </span>
              刷新推荐
            </button>
          ) : null}
        </div>
      </div>

      {/* 策略生成进度条：有候选后仍展示，告知用户哪些策略还在生成 */}
      {showProgressBar && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-sm text-primary">auto_awesome</span>
              <span className="text-sm font-semibold text-gray-800">脚本生成进度</span>
            </div>
            <div className="flex items-center gap-3">
              {loadingState && availableStrategies && availableStrategies.length > 0 && (
                <>
                  {(() => {
                    // 只计算可用策略的状态
                    const availableKeys = new Set(availableStrategies);
                    const relevantStates = Object.entries(loadingState)
                      .filter(([key]) => availableKeys.has(key as ScriptType))
                      .map(([, s]) => s);
                    const counts = relevantStates.reduce((acc, s) => {
                      if (s === "done") acc.done++;
                      else if (s === "loading") acc.loading++;
                      return acc;
                    }, { done: 0, loading: 0, total: availableStrategies.length });
                    return (
                      <span className="text-xs text-gray-400">
                        {counts.done}/{counts.total} 已完成{counts.loading > 0 ? `，${counts.loading} 项生成中` : ""}
                      </span>
                    );
                  })()}
                </>
              )}
            </div>
          </div>

          {/* 整体进度条 */}
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
            {loadingState && availableStrategies && availableStrategies.length > 0 && (
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${(availableStrategies.filter(key => loadingState[key] === "done").length / availableStrategies.length) * 100}%`
                }}
              />
            )}
          </div>

          {/* 各策略状态卡片：done/error 可点击重新生成 */}
          {loadingState && availableStrategies && availableStrategies.length > 0 && (
            <div className="grid grid-cols-6 gap-2">
              {STEP3_LOADING_STEPS
                .filter((step) => availableStrategies.includes(step.key))
                .map((step) => {
                  const status = loadingState[step.key] ?? "idle";
                  const info = getStrategyStatusInfo(status);
                  const clickable = (status === "done" || status === "error") && !isLocked && onRetryType;
                  return (
                    <div
                      key={step.key}
                      className={`rounded-lg px-3 py-2.5 border flex items-center gap-2.5 transition-all ${info.bgColor} ${info.borderColor} ${clickable ? "cursor-pointer hover:shadow-sm hover:scale-[1.03] active:scale-[0.98]" : ""}`}
                      title={clickable ? "点击重新生成" : undefined}
                      onClick={clickable ? () => {
                        const message = status === "error"
                          ? `「${step.label}」生成失败，是否重新生成？`
                          : `重新生成「${step.label}」的推荐脚本？`;
                        void confirm(message, "重新生成").then((ok) => {
                          if (ok) onRetryType(step.key);
                        });
                      } : undefined}
                    >
                      <span
                        className={`material-icons-round text-base ${
                          info.showSpinner ? "animate-spin text-sky-500" : status === "done" ? "text-emerald-500" : status === "error" ? "text-red-500" : "text-gray-300"
                        }`}
                      >
                        {info.icon}
                      </span>
                      <div className="min-w-0">
                        <div className={`text-xs font-semibold truncate ${info.textColor}`}>{step.label}</div>
                        <div className="text-[10px] text-gray-400">{clickable ? "点击重新生成" : info.label}</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <div className={showPager ? "pr-20" : ""}>
          {candidates.length < 1 ? (
            <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
              {fallbackSkeletonColumns.map((label) => (
                <React.Fragment key={label}>{renderStep3FallbackCard(label)}</React.Fragment>
              ))}
            </div>
          ) : (
            <div className={`grid gap-8 ${isReverse ? "grid-cols-1 mt-4" : isLocked ? "grid-cols-1 max-w-4xl mx-auto mt-4" : "grid-cols-1 xl:grid-cols-2"}`}>
              {visiblePage.map((candidate, slotIndex) => {
                if (!candidate) {
                  return <div key={`step3-empty-slot-${slotIndex}`} className="w-full opacity-0 pointer-events-none" />;
                }

                const basicInfo = resolveStep3ScriptBasicInfo({
                  title: candidate.title,
                  subtitle: candidate.subtitle ?? undefined,
                  preview: candidate.preview ?? "",
                  content: candidate.content,
                  tags: candidate.tags,
                });
                const isLockedCurrentCandidate = isLocked && activeCandidateId === candidate.id;
                // 锁定状态下，所有卡片都禁用点击（回灌由后端状态控制）
                const cardDisabled = isLocked;
                // 当前卡片是否被选中（非锁定状态）
                const isSelectedCandidate = activeCandidateId === candidate.id && !isLocked;
                const sceneSettings = new Map(basicInfo.sceneSettings.map((item) => [item.label, item.value]));
                // 优先使用候选的独立字段，其次从 content 解析
                const mainScene = candidate.mainScene ?? sceneSettings.get("主场景") ?? "未标注";
                const time = candidate.timeOfDay ?? sceneSettings.get("时间") ?? "未标注";
                const weather = candidate.weather ?? sceneSettings.get("天气") ?? "未标注";
                const ambience = candidate.atmosphere ?? sceneSettings.get("氛围") ?? "未标注";
                const scriptStyle = candidate.scriptStyle ?? resolveStep3ScriptStyle(candidate, basicInfo.videoTheme);
                const _ratingLabel = resolveStep3RatingLabel(candidate);
                const matchDescription = resolveStep3MatchDescription(candidate);
                // 只使用 summary 字段
                const summaryText =
                  normalizeStep3SummaryText(candidate.summary) ||
                  "暂无脚本摘要";
                const sourceLabel = resolveStep3CandidateSourceDisplayLabel(candidate);
                const videoId = extractDouyinVideoId(candidate.sourceUrl);
                const iframeSrc = buildDouyinEmbedUrl(videoId);
                // 视频直链（OSS .mp4 等），用 <video> 标签播放
                const videoSrc = !iframeSrc && isDirectVideoUrl(candidate.sourceUrl) ? (candidate.sourceUrl ?? null) : null;
                const _rankLabel =
                  Number.isFinite(candidate.rank) && Number(candidate.rank) > 0 ? `Top ${Math.floor(Number(candidate.rank))}` : "未排序";
                const infoRows = [
                  { label: "主场景", value: mainScene, labelClassName: "text-[#2d3335]", valueClassName: "" },
                  { label: "时间", value: time, labelClassName: "text-[#2d3335]", valueClassName: "" },
                  { label: "天气", value: weather, labelClassName: "text-[#2d3335]", valueClassName: "" },
                  { label: "氛围", value: ambience, labelClassName: "text-[#2d3335]", valueClassName: "" },
                  { label: "脚本风格", value: scriptStyle, labelClassName: "text-[#2d3335]", valueClassName: "" },
                  { label: "匹配度", value: matchDescription, labelClassName: "text-[#2d3335]", valueClassName: "" },
                ];

                return (
                  <article
                    key={candidate.id}
                    role="button"
                    tabIndex={cardDisabled ? -1 : 0}
                    data-testid={`step3-structured-script-card-${candidate.id}`}
                    onClick={(e) => {
                      if (!cardDisabled) {
                        const el = e.currentTarget as HTMLElement;
                        // 卡片先动一下：缩放+阴影脉冲
                        el.animate([
                          { outline: "0px solid rgba(230,140,25,0)", transform: "scale(1)" },
                          { outline: "8px solid rgba(230,140,25,0.45)", transform: "scale(1.015)" },
                          { outline: "0px solid rgba(230,140,25,0)", transform: "scale(1)" },
                        ], { duration: 500, easing: "ease-out" });
                        const rect = el.getBoundingClientRect();
                        onPickCandidate(candidate, rect);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (cardDisabled) {
                        return;
                      }
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                        onPickCandidate(candidate, rect);
                      }
                    }}
                    className={`relative h-[560px] w-full overflow-hidden rounded-[32px] border p-8 text-left transition-all ${
                      isLockedCurrentCandidate
                        ? "border-primary/30 shadow-[0_20px_40px_rgba(230,140,25,0.10)]"
                        : activeCandidateId === candidate.id
                          ? "border-primary shadow-[0_24px_48px_rgba(230,140,25,0.12)]"
                          : "border-[#d1cbc4]/30 shadow-[0_24px_48px_rgba(45,51,53,0.04)]"
                    } ${cardDisabled && !isLockedCurrentCandidate ? "cursor-not-allowed opacity-70" : cardDisabled ? "" : "cursor-pointer hover:shadow-[0_24px_48px_rgba(45,51,53,0.07)]"}`}
                    style={isLockedCurrentCandidate ? { background: "linear-gradient(to bottom right, rgba(230,140,25,0.04), white, rgba(230,140,25,0.02))" } : activeCandidateId === candidate.id ? { backgroundColor: "#fffbf5" } : { backgroundColor: "#ffffff" }}
                  >
                    <div className="flex h-full flex-col">
                      {/* 锁定状态顶部渐隐光晕 */}
                      {isLockedCurrentCandidate && (
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[32px]" style={{ background: "linear-gradient(to bottom, rgba(230,140,25,0.07), transparent)" }} />
                      )}
                      <div className="mb-6">
                        <div className="flex items-center gap-3">
                          <h4 className="font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[#1a1a1a] xl:text-[28px] line-clamp-1 flex-1">
                            {candidate.title}
                          </h4>
                          {isLockedCurrentCandidate && (
                            <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5">
                              <span className="material-icons-round text-sm text-primary">lock</span>
                              <span className="text-xs font-semibold text-primary">已锁定</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col gap-4">
                        {/* 脚本信息 + 缩小视频并排 */}
                        <div className="flex gap-5">
                          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                            <div className="mb-3 flex items-center gap-3 text-[#1a1a1a]">
                              <span className="material-icons-round text-[22px] text-primary">description</span>
                              <h5 className="text-[15px] font-bold leading-none">【脚本信息】</h5>
                            </div>
                            <ul className="space-y-1.5 text-[13px] leading-[1.72] text-[#5a5a5a]">
                              {infoRows.map((row) => (
                                <li key={row.label} className="flex items-center gap-2" title={`${row.label}：${row.value}`}>
                                  <span className={`w-[74px] shrink-0 font-semibold ${row.labelClassName}`}>{row.label}:</span>
                                  <span className={`min-w-0 flex-1 truncate ${row.valueClassName}`} title={row.value}>
                                    {row.value}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* 缩小视频 */}
                          <div
                            className="flex w-[120px] shrink-0 items-start justify-end"
                            onClick={(event) => event.stopPropagation()}
                            onDoubleClick={(event) => event.stopPropagation()}
                          >
                            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[18px] bg-[#ece6df] shadow-[0_12px_24px_rgba(45,51,53,0.08)]">
                              {iframeSrc ? (
                                <div className="absolute inset-0 overflow-hidden bg-black">
                                  <iframe
                                    title={`${candidate.title} 抖音视频`}
                                    src={iframeSrc}
                                    className="absolute border-0"
                                    style={buildStep3EmbedFitStyle("card")}
                                    frameBorder="0"
                                    referrerPolicy="unsafe-url"
                                    allow="autoplay; fullscreen"
                                    allowFullScreen
                                    scrolling="no"
                                  />
                                </div>
                              ) : videoSrc ? (
                                <video
                                  src={videoSrc}
                                  className="absolute inset-0 h-full w-full object-cover"
                                  muted
                                  playsInline
                                  preload="metadata"
                                  poster=""
                                />
                              ) : (
                                <div className="absolute inset-0 bg-gradient-to-b from-[#f5e0b8] via-[#f7f4ef] to-[#ebd2a2]" />
                              )}
                              {(iframeSrc || videoSrc) ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setPreviewModal({
                                      title: candidate.title,
                                      iframeSrc,
                                      videoSrc,
                                      sourceUrl: candidate.sourceUrl ?? null,
                                    });
                                  }}
                                  className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white shadow-sm backdrop-blur-sm transition hover:bg-black/60"
                                  title="放大预览"
                                  aria-label="放大预览"
                                >
                                  <span className="material-icons-round text-[14px]">fullscreen</span>
                                </button>
                              ) : (
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/92 shadow-[0_10px_20px_rgba(45,51,53,0.16)]">
                                    <span className="material-icons-round text-[22px] text-primary">play_arrow</span>
                                  </div>
                                </div>
                              )}
                              {!iframeSrc && !videoSrc ? (
                                <div className="pointer-events-none absolute inset-x-2 bottom-3 text-center text-[9px] font-medium leading-4 text-[#6b6b6b]">
                                  {resolveStep3MediaEmptyLabel(candidate)}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* 脚本摘要 — 全宽 */}
                        <div className="min-h-0 overflow-hidden">
                          <div className="mb-2 flex items-center gap-3 text-[#1a1a1a]">
                            <span className="text-[21px] leading-none">📖</span>
                            <h5 className="text-[15px] font-bold leading-none">【脚本摘要】</h5>
                          </div>
                          <p className="overflow-hidden text-[13px] leading-[1.72] text-[#5a5a5a] line-clamp-3">
                            {summaryText}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 border-t border-[#f0ede8] pt-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                              <span className="material-icons-round rounded-md bg-[#f0ede8] p-1 text-sm text-[#6b6b6b]">schedule</span>
                              <div>
                                <p className="text-[10px] font-bold uppercase leading-none text-[#8d8d8d]">时长</p>
                                <p className="mt-1 text-xs font-bold text-[#2d3335]">
                                  {candidate.structuredCard.durationSec}s / {candidate.structuredCard.storyboardCount} 镜
                                </p>
                              </div>
                            </div>
                            <div className="hidden items-center gap-2 xl:flex">
                              <span className="material-icons-round rounded-md bg-[#f0ede8] p-1 text-sm text-[#6b6b6b]">inventory_2</span>
                              <div>
                                <p className="text-[10px] font-bold uppercase leading-none text-[#8d8d8d]">来源</p>
                                <p className="mt-1 text-xs font-bold text-[#2d3335]">{sourceLabel}</p>
                              </div>
                            </div>
                          </div>
                          {isLockedCurrentCandidate || isSelectedCandidate ? (
                            <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-primary-active px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20" title={isLockedCurrentCandidate ? "已锁定脚本" : "已选用此脚本"}>
                              <span className="material-icons-round text-lg">check_circle</span>
                              <span>已确认选用</span>
                            </div>
                          ) : (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!cardDisabled) {
                                // 脚本卡片轮廓脉冲动画
                                const card = event.currentTarget.closest('article') as HTMLElement;
                                if (card) {
                                  card.animate([
                                    { outline: "0px solid rgba(230,140,25,0)", transform: "scale(1)" },
                                    { outline: "8px solid rgba(230,140,25,0.45)", transform: "scale(1.015)" },
                                    { outline: "0px solid rgba(230,140,25,0)", transform: "scale(1)" },
                                  ], { duration: 500, easing: "ease-out" });
                                }
                                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                                onPickCandidate(candidate, rect);
                              }
                            }}
                            disabled={cardDisabled}
                            className={`whitespace-nowrap rounded-full px-8 py-2.5 text-sm font-bold text-white transition-all ${
                              cardDisabled
                                ? "bg-gray-400 cursor-not-allowed"
                                : "bg-primary hover:shadow-lg hover:shadow-primary/20 active:scale-95"
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            选用此脚本
                          </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {showPager ? (
          <div className="absolute right-2 top-1/2 hidden -translate-y-1/2 flex-col items-center gap-4 xl:flex">
            <button
              type="button"
              aria-label="上一页脚本"
              onClick={() => setPageIndex((current) => (current - 1 + candidatePages.length) % candidatePages.length)}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-[#d1cbc4]/20 bg-white text-[#2d3335] shadow-[0_18px_30px_rgba(45,51,53,0.08)] transition-all hover:bg-primary hover:text-white"
            >
              <span className="material-icons-round">expand_less</span>
            </button>
            <div className="flex flex-col items-center gap-2 rounded-full border border-[#d1cbc4]/10 bg-white/70 px-4 py-4 backdrop-blur-sm">
              {candidatePages.map((_, index) => (
                <div
                  key={`step3-page-dot-${index}`}
                  className={`rounded-full transition-all ${
                    index === pageIndex ? "h-2.5 w-2.5 bg-primary" : "h-1.5 w-1.5 bg-[#d1cbc4]"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label="下一页脚本"
              onClick={() => setPageIndex((current) => (current + 1) % candidatePages.length)}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-[#d1cbc4]/20 bg-white text-[#2d3335] shadow-[0_18px_30px_rgba(45,51,53,0.08)] transition-all hover:bg-primary hover:text-white"
            >
              <span className="material-icons-round">expand_more</span>
            </button>
          </div>
        ) : null}
      </div>

      {previewModal ? (
        previewModal.videoSrc ? (
          /* 视频直链 — 广场风格全屏播放 */
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setPreviewModal(null)}
          >
            <div className="relative flex max-h-[90vh] flex-col items-center" onClick={(e) => e.stopPropagation()}>
              {/* 关闭按钮 */}
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="absolute -top-10 right-0 z-10 p-2 text-white/80 transition-colors hover:text-white"
                aria-label="关闭视频预览"
                title="关闭"
              >
                <span className="material-icons-round text-2xl">close</span>
              </button>
              {/* 视频 — 原始比例，最大高度限制 */}
              <video
                src={previewModal.videoSrc}
                controls
                autoPlay
                playsInline
                className="block max-h-[90vh] rounded-lg shadow-2xl"
              />
              {/* 标题栏 — 独立于视频下方，不遮挡 controls */}
              <div className="mt-3 flex items-center bg-gray-900/80 px-3 py-2.5 backdrop-blur-sm" style={{ minWidth: 0 }}>
                <p className="line-clamp-2 text-sm font-medium leading-relaxed text-white/90">{previewModal.title}</p>
              </div>
            </div>
          </div>
        ) : (
          /* 抖音 iframe / 无视频 — 原弹窗 */
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div className="relative flex max-h-[94vh] w-full max-w-[760px] rounded-[28px] bg-[#111111] p-5 shadow-2xl">
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/20"
                aria-label="关闭视频预览"
                title="关闭"
              >
                <span className="material-icons-round">close</span>
              </button>

              <div className="flex w-full flex-col items-center">
                <div className="mb-4 w-full pr-10 text-center text-[28px] font-bold tracking-[-0.02em] text-white">
                  {previewModal.title}
                </div>
                <div className="relative mx-auto aspect-[9/16] max-h-[80vh] w-full max-w-[430px] overflow-hidden rounded-[28px] bg-black shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
                  {previewModal.iframeSrc ? (
                    <iframe
                      title={`${previewModal.title} 放大预览`}
                      src={previewModal.iframeSrc}
                      className="absolute border-0"
                      style={buildStep3EmbedFitStyle("modal")}
                      frameBorder="0"
                      referrerPolicy="unsafe-url"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                      scrolling="no"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-b from-[#f5e0b8] via-[#f7f4ef] to-[#ebd2a2]" />
                  )}
                </div>

                <div className="mt-5 flex w-full max-w-[430px] flex-col gap-3">
                  {previewModal.sourceUrl ? (
                    <button
                      type="button"
                      onClick={() => {
                        window.open(previewModal.sourceUrl ?? "", "_blank", "noopener,noreferrer");
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-full border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white transition hover:bg-white/16"
                    >
                      打开原视频
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setPreviewModal(null)}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-white transition hover:brightness-105"
                  >
                    关闭预览
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
};
