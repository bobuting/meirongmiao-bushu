import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router';
import { Layout } from '../../components/Layout';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ApiError, backendApi } from '../../services/backendApi';
import type { UserScriptRecordDto } from '../../../../src/contracts/my-library-api';
import { scriptTypeToStrategy } from '../../../../src/contracts/types';
import type { ScriptStrategyType } from '../../../../src/contracts/script.dto';
import { getStrategyTypeShortLabel } from '../../utils/strategyTypeLabels';
import { SquareReverseDeckCard } from '../square/squareReverseDeckCard';
import type { SquareReverseDeckSnapshot } from '../square/squareReverseDeckSnapshot';
import { bootstrapProject, getProjectStep1Path } from '../project-flow/projectCreationBootstrap';
import { VideoPreviewModal } from '../../components/shared/VideoPreviewModal';

// ============================================================================
// 监听 LLM 反推任务完成，自动刷新脚本列表
// ============================================================================
const LLM_REVERSE_REFRESH_KEY = 'llm_reverse_last_refresh';

function useLlmReverseRefresh(onRefresh: () => void) {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      const tasks = state.globalTaskQueue;
      const prevTasks = prevState.globalTaskQueue;
      // 检查是否有 llm_reverse 任务从 running 变为 completed
      for (const task of tasks) {
        if (task.type !== 'llm_reverse') continue;
        const prev = prevTasks.find((p) => p.id === task.id);
        if (prev?.status === 'running' && task.status === 'completed') {
          // 防止重复刷新（同一任务只刷新一次）
          const lastRefresh = sessionStorage.getItem(LLM_REVERSE_REFRESH_KEY);
          if (lastRefresh === task.id) continue;
          sessionStorage.setItem(LLM_REVERSE_REFRESH_KEY, task.id);
          refreshRef.current();
        }
      }
    });
    return unsubscribe;
  }, []);
}

// ============================================================================
// 工具函数
// ============================================================================

/** 切换选中 ID */
function toggleSelectionIds(current: string[], id: string, nextChecked?: boolean): string[] {
  const next = new Set(current);
  const checked = typeof nextChecked === "boolean" ? nextChecked : !next.has(id);
  if (checked) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return [...next];
}

/** 将 UserScriptRecordDto 转换为 SquareReverseDeckCard 所需的快照数据 */
function buildDeckSnapshotFromScriptRecord(item: UserScriptRecordDto): SquareReverseDeckSnapshot {
  const payload = item.payload as Record<string, unknown> | undefined;
  const videoAnalysis = payload?.video_analysis as Record<string, unknown> | undefined;

  // 提取视频链接和真人判断
  const videoUrl = videoAnalysis?.sourceOssUrl as string | null | undefined;
  const coverUrl = videoAnalysis?.coverUrl as string | null | undefined;
  const onScreenPresence = payload?.on_screen_presence as Record<string, unknown> | undefined;
  const hasRealPerson = onScreenPresence?.has_real_person as boolean | null | undefined;
  const exposureLevel = onScreenPresence?.exposure_level as string | null | undefined;
  const personDetails = onScreenPresence?.person_details as Array<{ screen_time_ratio?: number }> | undefined;
  const screenTimeRatio = personDetails?.[0]?.screen_time_ratio ?? null;

  // 脚本正文：优先使用 payload.content，其次 summary，最后 notes
  const rawContent = payload?.content;
  const rawSummary = videoAnalysis?.summary;
  const contentText = (rawContent && typeof rawContent === "string" && rawContent.trim())
    ? rawContent.trim()
    : "";
  const scriptText = contentText
    || ((rawSummary && typeof rawSummary === "string" && rawSummary.trim())
      ? rawSummary.trim()
      : (item.notes ?? "").trim());

  // 从 payload.shots 构建分镜帧数据
  const rawShots = payload?.shots;
  const frames: SquareReverseDeckSnapshot["frames"] = [];
  if (Array.isArray(rawShots)) {
    for (const shot of rawShots) {
      const s = shot as Record<string, unknown>;
      const visual = s.visual as Record<string, unknown> | undefined;
      const scene = visual?.scene as Record<string, unknown> | undefined;
      const visualCue = typeof scene?.environment === "string" ? scene.environment : "";
      frames.push({
        index: (s.index as number) ?? 0,
        title: typeof s.shot_type === "string" ? s.shot_type : "",
        narration: typeof s.description === "string" ? s.description : "",
        visualCue,
      });
    }
  }

  // 从 payload 构造分析 sections
  const sections: SquareReverseDeckSnapshot["sections"] = [];
  let order = 1;
  const pushSection = (title: string, value: unknown) => {
    const str = typeof value === "string" ? value.trim() : "";
    if (str) {
      sections.push({ order: order++, title, content: str });
    }
  };
  pushSection("脚本正文", scriptText);
  if (videoAnalysis) {
    pushSection("主题", videoAnalysis.theme);
    pushSection("视频风格", videoAnalysis.video_style);
    pushSection("目标受众", videoAnalysis.target_audience);
    pushSection("概要", videoAnalysis.summary);
  }
  pushSection("情感分析", payload?.emotion_detail);
  pushSection("画面分析", payload?.on_screen_presence);
  pushSection("剪辑分析", payload?.editing_analysis);

  return {
    updatedAt: item.updatedAt,
    title: item.title,
    sourceTitle: null,
    sourceUrl: null,
    libraryScriptId: item.id ?? null,
    keywords: [...item.tags],
    scriptText,
    sections,
    frames,
    segments: frames.length > 0
      ? frames.map((frame) => ({
          time: frame.index > 0 ? `${Math.max(0, frame.index - 1) * 3}-${frame.index * 3}s` : "--",
          title: frame.title || `镜头 ${frame.index || 1}`,
          content: frame.narration || frame.visualCue || "",
          visualCue: frame.visualCue || frame.narration || "",
        }))
      : [],
    videoUrl: videoUrl ?? null,
    coverUrl: coverUrl ?? null,
    hasRealPerson: hasRealPerson ?? null,
    exposureLevel: exposureLevel ?? null,
    screenTimeRatio: screenTimeRatio ?? null,
    strategyType: item.type != null ? scriptTypeToStrategy(item.type as import('../../../../src/contracts/types').ScriptTypeValue) : null,
  };
}

/** 来源标签映射 */
const SOURCE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  reverse: { label: "反推", color: "text-orange-700", bg: "bg-orange-50 border-orange-100" },
  hot_trend: { label: "热榜", color: "text-rose-700", bg: "bg-rose-50 border-rose-100" },
  manual: { label: "手动", color: "text-sky-700", bg: "bg-sky-50 border-sky-100" },
  project_sync: { label: "项目同步", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
};

function resolveSourceConfig(source: string) {
  return SOURCE_CONFIG[source] ?? { label: source, color: "text-gray-700", bg: "bg-gray-50 border-gray-100" };
}

/** 友好日期 */
function formatRelativeDate(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const now = Date.now();
  const diffMs = now - value;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}小时前`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}天前`;
  return date.toISOString().slice(0, 10);
}

/** 提取脚本摘要 */
function extractSummary(item: UserScriptRecordDto): string {
  const payload = item.payload as Record<string, unknown> | undefined;
  const videoAnalysis = payload?.video_analysis as Record<string, unknown> | undefined;
  const rawSummary = videoAnalysis?.summary;
  if (rawSummary && typeof rawSummary === "string" && rawSummary.trim()) {
    return rawSummary.trim();
  }
  return item.notes ?? "";
}

/** 解析时间阈值 */
const resolveTimeThreshold = (range: "all" | "4h" | "12h" | "24h" | "7d"): number => {
  const now = Date.now();
  if (range === "4h") return now - 4 * 60 * 60 * 1000;
  if (range === "12h") return now - 12 * 60 * 60 * 1000;
  if (range === "24h") return now - 24 * 60 * 60 * 1000;
  if (range === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  return 0;
};

const TIME_RANGE_OPTIONS: Array<{ value: "all" | "4h" | "12h" | "24h" | "7d"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "24h", label: "24小时" },
  { value: "7d", label: "7天" },
  { value: "4h", label: "4小时" },
  { value: "12h", label: "12小时" },
];

// ============================================================================
// 子组件
// ============================================================================

/** 空状态 */
function EmptyState({ isLoading }: { isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <span className="material-icons-round text-2xl text-primary animate-pulse">sync</span>
        </div>
        <p className="text-sm font-medium text-gray-400">正在加载脚本库...</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100">
        <span className="material-icons-round text-3xl text-gray-300">description</span>
      </div>
      <p className="text-base font-semibold text-gray-400">暂无脚本数据</p>
      <p className="mt-1 text-sm text-gray-300">通过视频反推或项目创作来积累脚本</p>
    </div>
  );
}

/** 错误状态 */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
        <span className="material-icons-round text-3xl text-red-300">cloud_off</span>
      </div>
      <p className="text-base font-semibold text-gray-500">加载失败</p>
      <p className="mt-1 text-sm text-gray-400">请检查网络后重试</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-xl bg-primary/10 px-5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20"
      >
        重新加载
      </button>
    </div>
  );
}

// ============================================================================
// 主页面组件
// ============================================================================

export const ReverseScript: React.FC = () => {
  const { token } = useAppStore(useShallow((state) => ({ token: state.token })));
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm } = useConfirm();

  // 从导航状态获取 libraryScriptId（toast 点击携带）
  const navLibraryScriptId = (location.state as { libraryScriptId?: string } | undefined)?.libraryScriptId;

  // 反馈消息
  const [feedback, setFeedback] = useState<string | null>(null);

  // 筛选状态
  const [myScriptSearch, setMyScriptSearch] = useState("");
  const [myScriptTimeRange, setMyScriptTimeRange] = useState<"all" | "4h" | "12h" | "24h" | "7d">("all");
  const [myScriptLabel, setMyScriptLabel] = useState<string>("all");

  // 选中状态
  const [selectedMyLibraryScriptIds, setSelectedMyLibraryScriptIds] = useState<string[]>([]);

  // 详情弹窗
  const [deckSnapshot, setDeckSnapshot] = useState<SquareReverseDeckSnapshot | null>(null);

  // 视频预览弹窗
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoPreviewTitle, setVideoPreviewTitle] = useState<string>("");

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 21;

  // 筛选条件变化时重置页码
  useEffect(() => { setCurrentPage(1); }, [myScriptSearch, myScriptTimeRange, myScriptLabel]);

  // 自动清除反馈消息
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  // 我的脚本库查询
  const myLibraryScriptsQuery = useQuery({
    queryKey: ["my-library-scripts", token, currentPage, myScriptSearch, myScriptTimeRange, myScriptLabel],
    enabled: Boolean(token),
    queryFn: async () => {
      if (!token) {
        return { items: [] as readonly UserScriptRecordDto[], total: 0, page: 1, pageSize };
      }
      const params: Record<string, string | number> = { page: currentPage, pageSize };
      const keyword = myScriptSearch.trim();
      if (keyword) params.keyword = keyword;
      if (myScriptTimeRange !== "all") params.updatedAfter = resolveTimeThreshold(myScriptTimeRange);
      if (myScriptLabel !== "all") params.tags = myScriptLabel;
      return backendApi.listMyLibraryScripts(token, params);
    },
  });

  const myLibraryScriptItems: readonly UserScriptRecordDto[] = myLibraryScriptsQuery.data?.items ?? [];
  const totalCount: number = myLibraryScriptsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // 监听 LLM 反推任务完成，自动刷新脚本列表
  useLlmReverseRefresh(() => void myLibraryScriptsQuery.refetch());

  // 标签选项（基于当前页数据）
  const myScriptLabelOptions = useMemo(() => {
    const allTags = new Set<string>();
    myLibraryScriptItems.forEach((item) => item.tags.forEach((tag) => allTags.add(tag)));
    return Array.from(allTags).sort();
  }, [myLibraryScriptItems]);

  // 脚本 ID 映射
  const myLibraryScriptById = useMemo(
    () => new Map(myLibraryScriptItems.map((item) => [item.id, item])),
    [myLibraryScriptItems],
  );

  // 自动打开反推卡片（toast 点击导航时携带 libraryScriptId）
  // 通过独立 API 获取脚本，不依赖分页列表数据
  useEffect(() => {
    if (!navLibraryScriptId || !token) return;
    let cancelled = false;
    backendApi.getMyLibraryScript(token, navLibraryScriptId)
      .then((script) => {
        if (cancelled || !script) return;
        setDeckSnapshot(buildDeckSnapshotFromScriptRecord(script));
        // 清除导航 state，防止刷新后重复打开
        navigate(location.pathname, { replace: true, state: {} });
        // 刷新列表以便新脚本出现在列表中
        myLibraryScriptsQuery.refetch();
      })
      .catch((err) => {
        console.error('[ReverseScript] 获取脚本失败:', err);
        setFeedback("未找到对应的反推脚本");
      });
    return () => { cancelled = true; };
  }, [navLibraryScriptId, token]);

  // 删除单条
  const handleDelete = async (id: string) => {
    if (!token) return;
    const confirmed = await confirm('确定删除该脚本吗？此操作无法撤销。', '删除确认');
    if (!confirmed) return;
    try {
      setFeedback(null);
      await backendApi.deleteLibraryScript(token, id);
      setSelectedMyLibraryScriptIds((current: string[]) => current.filter((item: string) => item !== id));
      await myLibraryScriptsQuery.refetch();
      if (deckSnapshot && deckSnapshot.title === myLibraryScriptById.get(id)?.title) {
        setDeckSnapshot(null);
      }
      setFeedback("已删除");
    } catch (error) {
      setFeedback(error instanceof ApiError ? error.message : '删除失败');
    }
  };

  // 批量删除
  const handleDeleteLibraryBatch = async (ids?: string[]) => {
    if (!token) return;
    const targetIds = (ids ?? selectedMyLibraryScriptIds).filter(Boolean);
    if (targetIds.length < 1) return;
    const confirmed = await confirm(`确定批量删除 ${targetIds.length} 条脚本吗？此操作无法撤销。`, '批量删除确认');
    if (!confirmed) return;
    try {
      setFeedback(null);
      await backendApi.deleteLibraryScripts(token, targetIds);
      setSelectedMyLibraryScriptIds((current: string[]) => current.filter((id: string) => !targetIds.includes(id)));
      await myLibraryScriptsQuery.refetch();
      setFeedback(`已删除 ${targetIds.length} 条脚本`);
    } catch (error) {
      setFeedback(error instanceof ApiError ? error.message : "批量删除失败");
    }
  };

  // 打开详情（按需加载分镜数据）
  const openMyLibraryScriptPreview = async (itemId: string) => {
    if (!token) return;
    try {
      const script = await backendApi.getMyLibraryScript(token, itemId);
      if (!script) {
        setFeedback("未找到对应的脚本内容");
        return;
      }
      setDeckSnapshot(buildDeckSnapshotFromScriptRecord(script));
    } catch (err) {
      console.error("[ReverseScript] 获取脚本详情失败:", err);
      setFeedback("获取脚本详情失败");
    }
  };

  // 投入创作：从 Step1 开始完整创作流程
  const handleSendToStep1 = useCallback(() => {
    if (!deckSnapshot) return;
    if (!token) return;

    // 无分镜数据时不允许投入创作
    if (!deckSnapshot.segments || deckSnapshot.segments.length === 0) {
      void confirm('该脚本缺少分镜数据，无法投入创作。\n\n请先通过反推生成分镜，或选择其他脚本。', '无法投入创作');
      return;
    }

    // 判断是否有真人、露出程度、出镜时长
    // if (deckSnapshot.hasRealPerson !== true) {
    //   void confirm(
    //     '该视频未检测到真人，无法投入创作。\n\n服装搭配功能需要真人模特展示，建议选择包含真人模特的视频进行反推。',
    //     '无法投入创作'
    //   );
    //   return;
    // }
    // if (deckSnapshot.exposureLevel === '低') {
    //   void confirm(
    //     '该视频真人露出程度过低，无法投入创作。\n\n服装搭配功能需要完整展示服装效果，建议选择人物露出程度较高的视频。',
    //     '无法投入创作'
    //   );
    //   return;
    // }
    // if (!deckSnapshot.screenTimeRatio || deckSnapshot.screenTimeRatio < 0.7) {
    //   void confirm(
    //     '该视频真人出镜时长不足，无法投入创作。\n\n服装搭配功能需要足够的展示时间，建议选择人物出镜时长占比大于70%的视频。',
    //     '无法投入创作'
    //   );
    //   return;
    // }

    void (async () => {
      try {
        const created = await bootstrapProject({
          token,
          projectName: `反推项目-${new Date().toLocaleString("zh-CN")}`,
          projectFlowKind: "reverse",
          reverseScriptId: deckSnapshot.libraryScriptId,
          projectDataPatch: {
            pendingReverseDeckScript: {
              libraryScriptId: deckSnapshot.libraryScriptId,
              title: deckSnapshot.title || "反推脚本",
              summary: deckSnapshot.scriptText || "暂无摘要内容",
              segments: deckSnapshot.segments ?? [],
            },
          },
        });
        navigate(getProjectStep1Path(created.id, "video"));
      } catch (e) {
        console.error("[ReverseScript] 创建项目失败:", e);
      }
    })();
  }, [navigate, deckSnapshot, token, confirm]);

  const hasSelection = selectedMyLibraryScriptIds.length > 0;

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-hidden bg-[#fafafa]">
        {/* ========== 详情弹窗 ========== */}
        {deckSnapshot && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setDeckSnapshot(null)}
          >
            <div className="pointer-events-auto w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <SquareReverseDeckCard
                snapshot={deckSnapshot}
                onSendToStep3={handleSendToStep1}
                onClose={() => setDeckSnapshot(null)}
              />
            </div>
          </div>
        )}

        {/* ========== 反馈 Toast ========== */}
        {feedback && (
          <div className="fixed top-6 left-1/2 z-[70] -translate-x-1/2 animate-fade-in">
            <div className="flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-xl">
              <span className="material-icons-round text-base text-emerald-400">check_circle</span>
              {feedback}
            </div>
          </div>
        )}

        {/* ========== 页面头部 ========== */}
        <div className="relative overflow-hidden bg-gradient-to-br from-orange-50/60 via-amber-50/30 to-white shrink-0">
          {/* 装饰：柔和光晕 + 几何点缀 */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-primary/6 blur-3xl" />
            <div className="absolute left-1/3 -top-8 h-40 w-40 rounded-full bg-amber-200/15 blur-2xl" />
            <div className="absolute -bottom-6 right-1/4 h-32 w-32 rounded-full bg-orange-100/20 blur-2xl" />
            {/* 右上角小圆点装饰 */}
            <div className="absolute right-12 top-6 grid grid-cols-3 gap-2 opacity-20">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="h-1.5 w-1.5 rounded-full bg-primary/60" />
              ))}
            </div>
          </div>

          <div className="relative mx-auto max-w-7xl px-6 pt-8 pb-7 lg:px-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3.5">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-orange-400 shadow-lg shadow-primary/15">
                    <span className="material-icons-round text-2xl text-white">auto_stories</span>
                  </span>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">脚本中心</h1>
                    <p className="mt-0.5 text-sm text-gray-500">管理与复用你的创作脚本素材</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 shadow-sm border border-gray-100">
                    <span className="material-icons-round text-xs text-primary">folder_special</span>
                    <span className="text-xs font-semibold text-gray-600">{totalCount} 条脚本</span>
                  </div>
                  {hasSelection && (
                    <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 border border-primary/15">
                      <span className="material-icons-round text-xs text-primary">check_circle</span>
                      <span className="text-xs font-semibold text-primary">已选 {selectedMyLibraryScriptIds.length} 条</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 搜索框 */}
              <div className="hidden w-80 md:block">
                <div className="relative">
                  <span className="material-icons-round absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-gray-400">search</span>
                  <input
                    value={myScriptSearch}
                    onChange={(event) => { setMyScriptSearch(event.target.value); setCurrentPage(1); }}
                    placeholder="搜索标题、摘要、标签..."
                    className="w-full rounded-2xl border border-gray-200/80 bg-white/80 py-2.5 pl-11 pr-4 text-sm text-gray-800 placeholder-gray-400 outline-none shadow-sm backdrop-blur-sm transition focus:border-primary/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08),0_2px_8px_rgba(0,0,0,0.04)]"
                  />
                  {myScriptSearch && (
                    <button
                      type="button"
                      onClick={() => { setMyScriptSearch(""); setCurrentPage(1); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <span className="material-icons-round text-base">close</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ========== 工具栏 ========== */}
        <div className="shrink-0 border-b border-gray-200/60 bg-white/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-3 lg:px-10">
            {/* 左侧：时间 + 标签筛选 */}
            <div className="flex items-center gap-2">
              {/* 时间范围药丸 */}
              <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-0.5">
                {TIME_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setMyScriptTimeRange(opt.value); setCurrentPage(1); }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      myScriptTimeRange === opt.value
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* 标签筛选 */}
              {myScriptLabelOptions.length > 0 && (
                <div className="relative">
                  <select
                    value={myScriptLabel}
                    onChange={(event) => setMyScriptLabel(event.target.value)}
                    className="appearance-none rounded-xl border border-gray-200 bg-white py-1.5 pl-3 pr-8 text-xs font-semibold text-gray-700 outline-none transition focus:border-primary/40"
                  >
                    <option value="all">全部标签</option>
                    {myScriptLabelOptions.map((label) => (
                      <option key={label} value={label}>{label}</option>
                    ))}
                  </select>
                  <span className="material-icons-round absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">expand_more</span>
                </div>
              )}

              {/* 移动端搜索 */}
              <div className="md:hidden">
                <input
                  value={myScriptSearch}
                  onChange={(event) => { setMyScriptSearch(event.target.value); setCurrentPage(1); }}
                  placeholder="搜索..."
                  className="w-32 rounded-xl border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-primary/40"
                />
              </div>
            </div>

            {/* 右侧：操作按钮 */}
            <div className="flex items-center gap-2">
              {/* 批量操作（选中时显示） */}
              {hasSelection ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedMyLibraryScriptIds(myLibraryScriptItems.map((item) => item.id))}
                    className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                  >
                    全选当前
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMyLibraryScriptIds([])}
                    className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                  >
                    取消选中
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteLibraryBatch()}
                    className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
                  >
                    删除 ({selectedMyLibraryScriptIds.length})
                  </button>
                </>
              ) : null}

              {/* 刷新 */}
              <button
                type="button"
                onClick={() => void myLibraryScriptsQuery.refetch()}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                title="刷新"
              >
                <span className={`material-icons-round text-base ${myLibraryScriptsQuery.isFetching ? "animate-spin" : ""}`}>
                  refresh
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* ========== 内容区域 ========== */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-6 pb-12 pt-6 lg:px-10">
          {/* 错误状态 */}
          {myLibraryScriptsQuery.isError ? (
            <ErrorState onRetry={() => void myLibraryScriptsQuery.refetch()} />
          ) : myLibraryScriptItems.length === 0 ? (
            <EmptyState isLoading={myLibraryScriptsQuery.isLoading || myLibraryScriptsQuery.isFetching} />
          ) : (
            <>
              {/* 脚本卡片网格 */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {myLibraryScriptItems.map((item) => {
                  const sourceConf = resolveSourceConfig(item.source);
                  const strategyType = item.type != null ? scriptTypeToStrategy(item.type as import('../../../../src/contracts/types').ScriptTypeValue) : null;
                  const checked = selectedMyLibraryScriptIds.includes(item.id);
                  const summary = extractSummary(item);
                  const payload = item.payload as Record<string, unknown> | undefined;
                  const videoAnalysis = payload?.video_analysis as Record<string, unknown> | undefined;
                  const videoUrl = videoAnalysis?.sourceOssUrl as string | null | undefined;

                  return (
                    <div
                      key={item.id}
                      className={`group relative flex flex-col rounded-2xl border bg-white p-0 transition-all duration-200 hover:-translate-y-0.5 ${
                        checked
                          ? "border-primary/40 shadow-[0_0_0_3px_rgba(249,115,22,0.1),0_4px_16px_rgba(0,0,0,0.06)]"
                          : "border-gray-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
                      }`}
                    >
                      {/* 顶部：来源标签 + 原视频按钮 + 选中框 */}
                      <div className="flex items-center justify-between px-5 pt-4 pb-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${sourceConf.bg} ${sourceConf.color}`}>
                            {sourceConf.label}
                          </span>
                          {strategyType && (
                            <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-bold bg-violet-50 border-violet-100 text-violet-700">
                              {getStrategyTypeShortLabel(strategyType as ScriptStrategyType)}
                            </span>
                          )}
                          {videoUrl && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setVideoPreviewUrl(videoUrl);
                                setVideoPreviewTitle(item.title);
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600 transition hover:bg-gray-100"
                              title="预览原视频"
                            >
                              <span className="material-icons-round text-sm">play_circle</span>
                              原视频
                            </button>
                          )}
                        </div>
                        <label className="flex cursor-pointer items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setSelectedMyLibraryScriptIds((current) =>
                                toggleSelectionIds(current, item.id, event.target.checked),
                              )
                            }
                            className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary/30 focus:ring-offset-0"
                          />
                        </label>
                      </div>

                      {/* 标题 */}
                      <div className="px-5 pt-2 pb-1">
                        <h3
                          className="text-[15px] font-bold leading-snug text-gray-900 line-clamp-1 cursor-pointer transition hover:text-primary"
                          onClick={() => openMyLibraryScriptPreview(item.id)}
                          title={item.title}
                        >
                          {item.title}
                        </h3>
                      </div>

                      {/* 摘要 */}
                      <div className="px-5 pt-1 pb-3 flex-1 min-h-0">
                        <p className="text-[13px] leading-[20px] text-gray-500 line-clamp-3">
                          {summary || "暂无摘要"}
                        </p>
                      </div>

                      {/* 标签 */}
                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 border-t border-gray-100 px-5 py-2.5">
                          {item.tags.slice(0, 4).map((tag, index) => (
                            <span
                              key={`${item.id}-tag-${index}`}
                              className="rounded-md bg-gray-100/80 px-2 py-0.5 text-[10px] font-medium text-gray-500"
                            >
                              {tag}
                            </span>
                          ))}
                          {item.tags.length > 4 && (
                            <span className="text-[10px] text-gray-400">+{item.tags.length - 4}</span>
                          )}
                        </div>
                      )}

                      {/* 底部：日期 + 操作 */}
                      <div className="flex items-center justify-between border-t border-gray-100 px-5 py-2.5">
                        <span className="text-[11px] text-gray-400">{formatRelativeDate(item.updatedAt)}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openMyLibraryScriptPreview(item.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-primary/10 hover:text-primary"
                            title="查看详情"
                          >
                            <span className="material-icons-round text-[15px]">visibility</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(item.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                            title="删除"
                          >
                            <span className="material-icons-round text-[15px]">delete_outline</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ========== 分页 ========== */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="flex h-9 items-center gap-1 rounded-xl border border-gray-200 px-4 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="material-icons-round text-sm">chevron_left</span>
                    上一页
                  </button>

                  {/* 页码指示 */}
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      // 计算显示的页码（当前页居中）
                      let page: number;
                      if (totalPages <= 5) {
                        page = i + 1;
                      } else if (currentPage <= 3) {
                        page = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        page = totalPages - 4 + i;
                      } else {
                        page = currentPage - 2 + i;
                      }
                      const isActive = page === currentPage;
                      return (
                        <button
                          key={page}
                          type="button"
                          onClick={() => setCurrentPage(page)}
                          className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold transition ${
                            isActive
                              ? "bg-primary text-white shadow-md shadow-primary/20"
                              : "text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="flex h-9 items-center gap-1 rounded-xl border border-gray-200 px-4 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一页
                    <span className="material-icons-round text-sm">chevron_right</span>
                  </button>

                  <span className="ml-3 text-xs text-gray-400">
                    共 {totalCount} 条
                  </span>
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </div>

      {/* 视频预览弹窗 */}
      {videoPreviewUrl && (
        <VideoPreviewModal
          isOpen={!!videoPreviewUrl}
          videos={[{ url: videoPreviewUrl, title: videoPreviewTitle }]}
          currentIndex={0}
          onIndexChange={() => {}}
          onClose={() => {
            setVideoPreviewUrl(null);
            setVideoPreviewTitle("");
          }}
        />
      )}
    </Layout>
  );
};
