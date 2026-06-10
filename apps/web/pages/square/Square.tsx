import React, { useEffect, useRef, useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { Layout } from '../../components/Layout';
import { ApiError, backendApi, type ReverseParseV2ResultDto } from '../../services/backendApi';
import { getOssVideoSnapshotUrl } from '../../utils/ossImage';
import { useAppStore } from '../../store/useAppStore';
import { request } from '../../services/backendApi.request';
import { uploadFileToOss } from '../../services/ossUpload';
import { SquareReverseDeckCard } from './squareReverseDeckCard';
import { SQUARE_CATEGORY_FILTER_OPTIONS } from './squareCategoryCatalog';
import {
  resolveSquareReverseDeckTitle,
  type SquareReverseDeckSnapshot,
} from './squareReverseDeckSnapshot';
import {
  isHttpUrl,
  isLikelyDirectPlayableVideoUrl,
  isLikelyDouyinShareUrl,
  normalizeSquareReverseUrlInput,
  type SquareReverseInputMode,
  type SquareReverseRequestInputMode,
} from './squareReverseInputNormalizer';
import { resolveVideoReverseFailurePolicy } from '../../../../src/contracts/video-reverse-readiness';
import {
  clearLegacyPendingReverseJobStorage,
  recoverPendingReverseJobs,
} from '../reverse-script/reversePendingJobRecovery';
import { getSquareAggregate, trackSquareBehavior, type SquareContentItem } from '../../services/api-modules/square';
import { SquareCard } from '../../components/square/SquareCard';
import { NewProjectTypeDialog } from '../../components/layout/NewProjectTypeDialog';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { clearProjectFlowActiveSession } from '../project-flow/projectFlowActiveSession';
import type { ProjectFlowKind } from '../project-flow/projectFlowKind';
import { bootstrapProject, getProjectStep1Path } from '../project-flow/projectCreationBootstrap';
import type { ReverseStoryboardLibraryRecordDto } from '../../../../src/contracts/reverse-storyboard-library-api';
import type { LibraryScriptReverseContextDto } from '../../services/backendApi.types';
import { scriptTypeToStrategy } from '../../../../src/contracts/types';

/**
 * 视频预览弹窗组件 - 使用 memo 防止父组件重渲染影响播放
 */
interface VideoPreviewModalProps {
  url: string;
  title?: string;
  onClose: () => void;
  onReplica?: () => void;
}

const VideoPreviewModal = memo(function VideoPreviewModal({ url, title, onClose, onReplica }: VideoPreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [loadStartTime, setLoadStartTime] = useState(Date.now());
  const [loadDuration, setLoadDuration] = useState<number | null>(null);
  const posterUrl = url ? getOssVideoSnapshotUrl(url, 0, 800) : undefined;

  // 模板始终显示"一键复刻"按钮
  const shouldShowReplica = true;

  const handleLoadedMetadata = useCallback(() => {
    const dur = videoRef.current?.duration;
    if (dur && isFinite(dur)) {
      setVideoDuration(dur);
    }
  }, []);

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `0:${s.toString().padStart(2, '0')}`;
  };

  const handleLoadedData = useCallback(() => {
    const duration = Date.now() - loadStartTime;
    setLoadDuration(duration);
    console.log(`[SquareVideoPreview] 加载耗时: ${duration}ms`);
    setIsVideoLoading(false);
  }, [loadStartTime]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div className="relative inline-flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 z-10 p-2 text-white/80 hover:text-white transition-colors"
        >
          <span className="material-icons-round text-2xl">close</span>
        </button>

        {/* 视频容器 - 9:16 竖屏比例占位 */}
        <div className="relative rounded-t-lg overflow-hidden shadow-2xl" style={{ aspectRatio: '9/16', maxHeight: 'calc(90vh - 88px)' }}>
          {/* 骨架屏占位 - 封面图模糊效果 */}
          {isVideoLoading && posterUrl && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center"
              style={{
                backgroundImage: `url(${posterUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(20px)',
                transform: 'scale(1.1)', // 模糊边缘扩展，避免白边
              }}
            >
              {/* 加载指示器覆盖层 */}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <span className="material-icons-round text-5xl text-white/60 animate-pulse">play_circle_outline</span>
                  <div className="flex items-center gap-2 px-4 py-2 bg-black/60 rounded-full backdrop-blur-sm">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-spin"></div>
                    <span className="text-white/90 text-sm font-medium">
                      {loadDuration !== null ? `${(loadDuration / 1000).toFixed(1)}s` : '加载中'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* 无封面图时的备用骨架屏 */}
          {isVideoLoading && !posterUrl && (
            <div className="absolute inset-0 z-10 bg-gradient-to-br from-gray-800 via-gray-700 to-gray-800 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <span className="material-icons-round text-5xl text-white/40 animate-pulse">play_circle_outline</span>
                <div className="flex items-center gap-2 px-4 py-2 bg-black/50 rounded-full">
                  <div className="w-4 h-4 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-spin"></div>
                  <span className="text-white/80 text-sm font-medium">
                    {loadDuration !== null ? `${(loadDuration / 1000).toFixed(1)}s` : '加载中'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            src={url}
            poster={posterUrl}
            preload="auto"
            controls
            autoPlay
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            onLoadedData={handleLoadedData}
            onWaiting={() => setIsVideoLoading(true)}
            onPlaying={() => setIsVideoLoading(false)}
            className="block"
            style={{ maxHeight: 'calc(90vh - 88px)' }}
          />
        </div>

        {/* 底部栏 — 在视频容器下方，不遮挡 controls */}
        <div className="w-full flex items-center justify-between bg-gray-900/95 backdrop-blur-sm px-4 py-3 rounded-b-lg">
          <p className="text-white/90 text-sm font-medium leading-relaxed">{(title ?? '').length > 10 ? (title ?? '').slice(0, 10) + '...' : title}</p>
          {shouldShowReplica && onReplica && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onReplica(); }}
              className="shrink-0 inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity"
            >
              <span className="material-icons-round text-base">auto_fix_high</span>
              一键复刻
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

const SQUARE_REVERSE_DECK_STORAGE_KEY = "square.latestReverseDeck.v1";

// Session 去重：行为追踪记录（仅 view 行为）
const TRACKED_SESSION_KEY = 'square.tracked_items.v1';

function getTrackedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(TRACKED_SESSION_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function hasTracked(itemId: string): boolean {
  return getTrackedSet().has(itemId);
}

function markTracked(itemId: string): void {
  const set = getTrackedSet();
  set.add(itemId);
  sessionStorage.setItem(TRACKED_SESSION_KEY, JSON.stringify([...set]));
}

type SquareLibraryScriptItem = Awaited<ReturnType<typeof backendApi.listLibraryScripts>>["scripts"][number];

const normalizeKeyword = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
};

const dedupeKeywords = (items: string[]): string[] =>
  [...new Set(items.map(normalizeKeyword).filter((item) => item.length > 0))];

const pickFirstNonEmptyText = (...candidates: Array<unknown>): string => {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const normalized = candidate.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return "";
};

const pickLongestNonEmptyText = (...candidates: string[]): string =>
  candidates
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .sort((left, right) => right.length - left.length)[0] ?? "";

const buildSegmentsFromScriptText = (scriptText: string): SquareReverseDeckSnapshot["segments"] =>
  scriptText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 40)
    .map((line, index) => ({
      time: `${index * 3}-${(index + 1) * 3}s`,
      title: `场景 ${index + 1}`,
      content: line,
      visualCue: line,
    }));

function extractDouyinVideoItemId(value: string | null | undefined): string | null {
  const input = String(value ?? "").trim();
  if (!input) {
    return null;
  }
  const byPath = input.match(/\/video\/(\d{10,24})(?:[/?#]|$)/i)?.[1];
  if (byPath) {
    return byPath;
  }
  const byQuery = input.match(/[?&](?:item_id|aweme_id|group_id)=(\d{10,24})(?:[&#]|$)/i)?.[1];
  if (byQuery) {
    return byQuery;
  }
  return null;
}

function resolvePreferredDouyinUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const itemId = extractDouyinVideoItemId(candidate);
    if (itemId) {
      return `https://www.douyin.com/video/${itemId}`;
    }
  }
  for (const candidate of candidates) {
    const input = String(candidate ?? "").trim();
    if (!isHttpUrl(input)) {
      continue;
    }
    try {
      const parsed = new URL(input);
      const host = parsed.hostname.toLowerCase();
      if (host === "douyin.com" || host.endsWith(".douyin.com") || host === "iesdouyin.com" || host.endsWith(".iesdouyin.com")) {
        return parsed.toString();
      }
    } catch {
      continue;
    }
  }
  return null;
}

function _buildSnapshotFromStoryboardLibraryItem(item: ReverseStoryboardLibraryRecordDto): SquareReverseDeckSnapshot {
  const scriptText = pickFirstNonEmptyText(item.content, item.summary, item.report.intro) || "暂无文案内容";
  const frames = (item.report.frames ?? []).slice(0, 20).map((frame: { index?: unknown; title?: unknown; narration?: unknown; visualCue?: unknown }) => ({
    index: Number(frame.index) || 0,
    title: String(frame.title ?? "").trim(),
    narration: String(frame.narration ?? "").trim(),
    visualCue: String(frame.visualCue ?? "").trim(),
  }));
  const sections = (item.report.sections ?? [])
    .map((section: { order?: unknown; title?: unknown; content?: unknown }) => ({
      order: Number(section.order) || 0,
      title: String(section.title ?? "").trim(),
      content: String(section.content ?? "").trim(),
    }))
    .filter((section) => section.order >= 1 && section.order <= 5);
  return {
    updatedAt: Number(item.updatedAt) || Date.now(),
    title: String(item.title ?? "").trim() || "反推脚本",
    sourceTitle: String(item.title ?? "").trim() || null,
    sourceUrl: resolvePreferredDouyinUrl(item.sourceMeta.videoUrl ?? null) ?? (pickFirstNonEmptyText(item.sourceMeta.videoUrl) || null),
    libraryScriptId: null,
    keywords: dedupeKeywords(Array.isArray(item.tags) ? [...item.tags] : []),
    scriptText,
    sections,
    frames,
    segments:
      frames.length > 0
        ? frames.map((frame) => ({
            time: frame.index > 0 ? `${Math.max(0, frame.index - 1) * 3}-${frame.index * 3}s` : "--",
            title: frame.title || `镜头 ${frame.index || 1}`,
            content: frame.narration || frame.visualCue || "",
            visualCue: frame.visualCue || frame.narration || "",
          }))
        : buildSegmentsFromScriptText(scriptText),
    strategyType: null,
  };
}

function _buildSnapshotFromLibraryScriptItem(item: SquareLibraryScriptItem & { reverseContext?: LibraryScriptReverseContextDto | null; updatedAt?: number | string }): SquareReverseDeckSnapshot {
  const reverseContext = item.reverseContext ?? null;
  const scriptText = pickFirstNonEmptyText(
    reverseContext?.sourceMeta?.scriptText,
    item.content,
  ) || "暂无文案内容";
  const storyboardSections = reverseContext?.storyboardPanel?.report?.sections ?? [];
  const storyboardFrames = reverseContext?.storyboardPanel?.report?.frames ?? [];
  return {
    updatedAt: Number(item.updatedAt ?? item.date) || Date.now(),
    title: String(item.title ?? "").trim() || "反推脚本",
    sourceTitle: pickFirstNonEmptyText(reverseContext?.sourceMeta?.title, item.title) || null,
    sourceUrl:
      resolvePreferredDouyinUrl(reverseContext?.sourceMeta?.url, reverseContext?.sourceMeta?.videoUrl) ??
      (pickFirstNonEmptyText(reverseContext?.sourceMeta?.url, reverseContext?.sourceMeta?.videoUrl) || null),
    libraryScriptId: item.id ?? null,
    keywords: dedupeKeywords(Array.isArray(item.tags) ? [...item.tags] : []),
    scriptText,
    sections: storyboardSections
      .map((section: { order?: number; title?: string; content?: string }) => ({
        order: Number(section.order) || 0,
        title: String(section.title ?? "").trim(),
        content: String(section.content ?? "").trim(),
      }))
      .filter((section: { order: number }) => section.order >= 1 && section.order <= 5),
    frames: storyboardFrames.slice(0, 20).map((frame: { index?: number; title?: string; narration?: string; visualCue?: string }) => ({
      index: Number(frame.index) || 0,
      title: String(frame.title ?? "").trim(),
      narration: String(frame.narration ?? "").trim(),
      visualCue: String(frame.visualCue ?? "").trim(),
    })),
    segments: buildSegmentsFromScriptText(scriptText),
    strategyType: null,
  };
}

// ============================================================================
// 广场页面主组件
// ============================================================================

export const Square: React.FC = () => {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  // React 19: 使用 useShallow 包装对象 selector
  const { token, pushTaskNotification } = useAppStore(useShallow((state) => ({
    token: state.token,
    pushTaskNotification: state.pushTaskNotification,
  })));
  const [activeCategory, setActiveCategory] = useState('全部');
  const [reverseDeckOpen, setReverseDeckOpen] = useState(false);
  const [reverseRunning, setReverseRunning] = useState(false);
  const [reverseProgress, setReverseProgress] = useState(0);
  const [reverseWaveOffset, setReverseWaveOffset] = useState(0);
  const [reverseInputMode, setReverseInputMode] = useState<SquareReverseInputMode>("douyin_url");
  const [reverseInput, setReverseInput] = useState("");
  const [reverseInputFeedback, setReverseInputFeedback] = useState<string | null>(null);
  const [reverseInputFeedbackTone, setReverseInputFeedbackTone] = useState<"error" | "success" | "info">("info");
  // 智能提示状态 - 实时显示输入类型识别结果
  const [reverseInputHint, setReverseInputHint] = useState<{
    icon: string;
    message: string;
  } | null>(null);
  const [reverseInputHintTone, setReverseInputHintTone] = useState<'success' | 'info' | 'error'>('info');
  const [reverseDeckSnapshot, setReverseDeckSnapshot] = useState<SquareReverseDeckSnapshot | null>(null);
  // 反推完成时显示存储提示（首次打开卡片时显示）
  const [showStorageHint, setShowStorageHint] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageMountedRef = useRef(true);
  const pendingRecoveryLockRef = useRef(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 反推任务最小化状态
  const [reverseConfirmMinimizeOpen, setReverseConfirmMinimizeOpen] = useState(false);
  const [reverseMinimized, setReverseMinimized] = useState(false);
  const reverseMinimizedRef = useRef(false);
  useEffect(() => { reverseMinimizedRef.current = reverseMinimized; }, [reverseMinimized]);

  // 行为追踪相关
  const sessionIdRef = useRef(crypto.randomUUID());

  // 广场聚合数据状态
  const [aggregateItems, setAggregateItems] = useState<SquareContentItem[]>([]);
  const [aggregateLoading, setAggregateLoading] = useState(true);

  // 分页状态
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // 新建项目弹窗
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);

  // 视频预览弹窗状态
  const [previewMedia, setPreviewMedia] = useState<{ type: 'video'; url: string; title?: string; itemId?: string } | null>(null);

  // 搜索相关状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");

  // ============================================================================
  // 工具函数
  // ============================================================================

  // ============================================================================
  // 数据获取
  // ============================================================================

  // 搜索防抖：延迟 300ms 后更新 debouncedKeyword
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(searchKeyword);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchKeyword]);

  // 加载更多数据
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    const nextPage = page + 1;

    try {
      const result = await getSquareAggregate(
        async (method, path, options) => {
          return request(method, path, { body: options?.body });
        },
        { category: activeCategory === '全部' ? undefined : activeCategory, page: nextPage, pageSize: 20 }
      );

      if (result.data.length > 0) {
        setAggregateItems(prev => [...prev, ...result.data]);
        setPage(nextPage);
      }

      if (result.page >= result.totalPages) {
        setHasMore(false);
      }
    } catch (e) {
      console.warn('[Square] loadMore error', e);
    } finally {
      setLoadingMore(false);
    }
  }, [page, hasMore, loadingMore, activeCategory]);

  // 从聚合 API 获取广场内容
  useEffect(() => {
    const fetchAggregate = async () => {
      setAggregateLoading(true);
      const result = await getSquareAggregate(
        async (method, path, options) => {
          return request(method, path, { body: options?.body });
        },
        { category: activeCategory === '全部' ? undefined : activeCategory, keyword: debouncedKeyword || undefined, page: 1, pageSize: 20 }
      );
      // AggregateQueryResult 直接返回数据，不需要 success 检查
      setAggregateItems(result.data);
      setPage(1);
      setHasMore(result.page < result.totalPages);
      setAggregateLoading(false);
    };
    fetchAggregate();
  }, [activeCategory, debouncedKeyword]);

  // ============================================================================
  // 行为追踪
  // ============================================================================

  /**
   * 行为追踪工具函数
   * 追踪浏览和点击行为，不阻塞用户交互
   * 使用 Session 去重：view 行为在 session 内只追踪一次
   */
  const handleTrackBehavior = async (
    itemId: string,
    sourceType: string,
    category: string,
    type: 'view' | 'click'
  ) => {
    // 浏览行为使用 Session 去重（避免重复追踪）
    if (type === 'view' && hasTracked(itemId)) return;
    if (type === 'view') markTracked(itemId);

    try {
      await trackSquareBehavior(
        async (method, path, options) => {
          return request(method, path, { token: options?.token, body: options?.body });
        },
        token || '',
        {
          itemId,
          itemType: 'template',
          itemCategory: category,
          behaviorType: type,
          sessionId: sessionIdRef.current,
        }
      );
    } catch (e) {
      // 行为追踪失败不阻塞用户交互
      console.warn('[Square] track error', e);
    }
  };

  // Intersection Observer 追踪浏览行为
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const id = entry.target.getAttribute('data-id');
            const type = entry.target.getAttribute('data-type');
            const cat = entry.target.getAttribute('data-category');
            if (id && type && cat) {
              handleTrackBehavior(id, type, cat, 'view');
            }
          }
        });
      },
      { threshold: 0.5 }
    );

    document.querySelectorAll('[data-square-card]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [aggregateItems]);

  // 滚动加载更多
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // 距离底部不到 200px 时触发加载
      if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loadingMore) {
        loadMore();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMore, loadMore]);


  const categories = SQUARE_CATEGORY_FILTER_OPTIONS;

  useEffect(() => {
    pageMountedRef.current = true;
    return () => {
      pageMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const readSnapshot = () => {
      try {
        const raw = sessionStorage.getItem(SQUARE_REVERSE_DECK_STORAGE_KEY);
        if (!raw) {
          setReverseDeckSnapshot(null);
          return;
        }
        const parsed = JSON.parse(raw) as SquareReverseDeckSnapshot;
        if (!parsed || typeof parsed !== "object") {
          setReverseDeckSnapshot(null);
          return;
        }
        setReverseDeckSnapshot(parsed);
      } catch {
        setReverseDeckSnapshot(null);
      }
    };
    readSnapshot();
    const onFocus = () => readSnapshot();
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onFocus);
    };
  }, []);

  // 反推进度动画 - 视频弹窗打开时暂停，避免卡顿
  useEffect(() => {
    // 弹窗打开时暂停 setInterval，避免频繁 setState 导致视频卡顿
    if (!reverseRunning || previewMedia) {
      return;
    }
    const targetDurationMs = reverseInputMode === "video_url" ? 32_000 : 22_000;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      const target = Math.min(92, (elapsedMs / targetDurationMs) * 92);
      setReverseProgress((current) => (current >= 92 ? current : Math.min(92, Math.max(target, current + 0.5))));
      setReverseWaveOffset((current) => (current + 24) % 320);
    }, 140);
    return () => {
      window.clearInterval(timer);
    };
  }, [reverseInputMode, reverseRunning, previewMedia]);

  // 反推进度超过 90% 时弹出最小化确认窗
  useEffect(() => {
    if (!reverseRunning || reverseMinimized || reverseConfirmMinimizeOpen) return;
    if (reverseProgress >= 90) {
      setReverseConfirmMinimizeOpen(true);
    }
  }, [reverseProgress, reverseRunning, reverseMinimized, reverseConfirmMinimizeOpen]);

  useEffect(() => {
    if (reverseInputMode === "douyin_url") {
      setReverseInputMode("video_url");
    }
  }, [reverseInputMode]);

  // 实时检测输入类型，显示智能提示
  useEffect(() => {
    const raw = reverseInput.trim();
    if (!raw) {
      setReverseInputHint(null);
      return;
    }

    const normalized = normalizeSquareReverseUrlInput(raw);

    if (normalized.fromDirtyText) {
      // 从脏文本中提取了 URL
      setReverseInputHint({
        icon: 'auto_fix_high',
        message: '已从分享文案中提取链接'
      });
      setReverseInputHintTone('success');
    } else if (isLikelyDouyinShareUrl(normalized.normalized)) {
      // 抖音分享链接
      setReverseInputHint({
        icon: 'link',
        message: '检测到抖音链接，将进行画面分析'
      });
      setReverseInputHintTone('info');
    } else if (isLikelyDirectPlayableVideoUrl(normalized.normalized)) {
      // 视频直链
      setReverseInputHint({
        icon: 'movie',
        message: '检测到视频直链，将直接分析画面'
      });
      setReverseInputHintTone('info');
    } else if (!isHttpUrl(normalized.normalized)) {
      // 无效输入
      setReverseInputHint({
        icon: 'error_outline',
        message: '请输入有效的链接'
      });
      setReverseInputHintTone('error');
    } else {
      // 通用 HTTP URL，不显示提示
      setReverseInputHint(null);
    }
  }, [reverseInput]);

  useEffect(() => {
    if (!token || reverseRunning) {
      return;
    }

    let disposed = false;

    const tryRecoverPendingReverse = async () => {
      if (pendingRecoveryLockRef.current) {
        return;
      }
      if (clearLegacyPendingReverseJobStorage() && !disposed) {
        setReverseInputFeedbackTone("info");
        setReverseInputFeedback("检测到旧版恢复记录，已清理；如需继续，请重新发起一次反推。");
      }

      pendingRecoveryLockRef.current = true;
      try {
        await recoverPendingReverseJobs({
          entryPoint: "square",
          fetchJob: (jobId) => backendApi.getReverseParseV2Job(token, jobId),
          onCompleted: async (job, result) => {
            if (disposed) {
              return;
            }
            const storageTarget = await applyReverseParseResultToDeck(
              result,
              (result.inputMode ?? job.inputMode) as SquareReverseRequestInputMode,
              result.input?.trim() || job.sourceHash,
            );
            setReverseInputFeedbackTone("success");
            setReverseInputFeedback(`后台任务已完成，已恢复本次反推卡片，并写入${storageTarget}。`);
          },
          onFailed: async (_job, error) => {
            if (disposed) {
              return;
            }
            setReverseInputFeedbackTone("error");
            setReverseInputFeedback(error.message || "后台反推任务失败，请重新发起。");
          },
          onExpired: async () => {
            if (disposed) {
              return;
            }
            setReverseInputFeedbackTone("info");
            setReverseInputFeedback("待恢复反推任务已过期，请重新发起。");
          },
        });
      } catch {
        // swallow recover errors to avoid interrupting normal page usage
      } finally {
        pendingRecoveryLockRef.current = false;
      }
    };

    void tryRecoverPendingReverse();
    const onFocus = () => {
      void tryRecoverPendingReverse();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onFocus);
    return () => {
      disposed = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onFocus);
    };
  }, [token, reverseRunning]);

  const openNewProjectDialog = () => {
    setNewProjectDialogOpen(true);
  };

  const closeNewProjectDialog = () => {
    setNewProjectDialogOpen(false);
  };

  /** 点击卡片直接创建项目并跳转 */
  const handleCreateProject = (kind: ProjectFlowKind) => {
    closeNewProjectDialog();
    if (!token) return;
    void (async () => {
      try {
        const created = await bootstrapProject({
          token,
          projectName: `项目-${new Date().toLocaleString("zh-CN")}`,
          projectFlowKind: kind,
        });
        navigate(getProjectStep1Path(created.id, kind));
      } catch (e) {
        console.error("[Square] 创建项目失败:", e);
      }
    })();
  };

  const handleCreateNewProject = () => {
    openNewProjectDialog();
  };

  const persistSquareReverseDeckSnapshot = (snapshot: SquareReverseDeckSnapshot) => {
    setReverseDeckSnapshot(snapshot);
    try {
      sessionStorage.setItem(SQUARE_REVERSE_DECK_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // ignore storage errors
    }
  };

  const applyReverseParseResultToDeck = async (
    parsed: ReverseParseV2ResultDto,
    requestInputMode: SquareReverseRequestInputMode,
    source: string,
  ): Promise<"反推分镜库" | "成品脚本库"> => {
    let generatedScriptText = parsed.libraryScript?.content?.trim() || "";
    if (!generatedScriptText && parsed.projectId && parsed.scriptVersionId) {
      try {
        const generated = await backendApi.latestProjectScript(token as string, parsed.projectId);
        const basicInfo = String((generated.payload as Record<string, unknown>).basicInfo ?? "");
        generatedScriptText = basicInfo.replace(/^basic:/, "").trim() || basicInfo;
      } catch {
        // ignore latest script fallback errors
      }
    }
    const primaryItem = parsed.scriptHints?.primaryItem ?? null;
    const primaryItemText = pickFirstNonEmptyText(primaryItem?.scriptText);
    const overviewsText = (parsed.scriptHints?.overviews ?? [])
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0)
      .join("\n");
    const storyboardIntro = pickFirstNonEmptyText(parsed.storyboardPanel?.report?.intro);
    const scriptText = pickLongestNonEmptyText(primaryItemText, overviewsText, generatedScriptText, storyboardIntro) || "暂无文案内容";
    const keywords = dedupeKeywords(
      [
        ...((parsed.libraryScript?.tags ?? []).filter((tag) => String(tag).trim().startsWith("#")) as string[]),
        requestInputMode === "upload_file" ? "#文件反推" : requestInputMode === "video_url" ? "#视频链接反推" : "#URL反推",
        "#反推生成",
      ],
    );
    const sourceTitle = pickFirstNonEmptyText(primaryItem?.title, parsed.libraryScript?.title);
    const sourceUrl = pickFirstNonEmptyText(
      resolvePreferredDouyinUrl(primaryItem?.url, parsed.input, source, parsed.resolvedVideoUrl),
      primaryItem?.url,
      parsed.input,
      parsed.resolvedVideoUrl,
      source,
    );
    const segments = buildSegmentsFromScriptText(scriptText);
    const frames = (parsed.storyboardPanel?.report?.frames ?? [])
      .slice(0, 20)
      .map((frame) => ({
        index: Number(frame.index) || 0,
        title: String(frame.title ?? "").trim(),
        narration: String(frame.narration ?? "").trim(),
        visualCue: String(frame.visualCue ?? "").trim(),
      }));
    const sections = (parsed.storyboardPanel?.report?.sections ?? [])
      .map((section) => ({
        order: Number(section.order) || 0,
        title: String(section.title ?? "").trim(),
        content: String(section.content ?? "").trim() || "暂无内容",
      }))
      .filter((section) => section.order >= 1 && section.order <= 5);

    // 真人相关字段（当前反推流程不返回此数据，保留字段以备后续扩展）
    const hasRealPerson = null;
    const exposureLevel = null;
    const screenTimeRatio = null;

    const snapshot: SquareReverseDeckSnapshot = {
      updatedAt: Date.now(),
      title: resolveSquareReverseDeckTitle({
        sourceTitle,
        fallbackTitle: parsed.libraryScript?.title,
        source,
        storyboardPanel: parsed.storyboardPanel ?? null,
      }),
      sourceTitle: sourceTitle || null,
      sourceUrl: sourceUrl || null,
      libraryScriptId: parsed.libraryScriptId ?? parsed.libraryScript?.id ?? null,
      keywords,
      scriptText,
      sections,
      frames,
      segments,
      hasRealPerson: hasRealPerson ?? null,
      exposureLevel: exposureLevel ?? null,
      screenTimeRatio: screenTimeRatio ?? null,
      strategyType: null,
    };

    persistSquareReverseDeckSnapshot(snapshot);
    setShowStorageHint(true); // 反推完成，显示存储提示
    setReverseDeckOpen(true);
    return parsed.reverseStoryboardLibraryId && !parsed.libraryScriptId && !parsed.libraryScript
      ? "反推分镜库"
      : "成品脚本库";
  };

  /**
   * 从 VideoScriptDataRecord + ShotBreakdown 构建 SquareReverseDeckSnapshot，
   * 用于模板已关联脚本时直接弹出反推结果弹窗
   */
  const buildSnapshotFromScriptData = (
    script: import("../../../../src/service/scripts-data-db-service").VideoScriptDataRecord,
    item: SquareContentItem,
    shotBreakdown?: Array<{
      id: string;
      scriptDataId: string;
      shotIndex: number;
      shotType: string | null;
      cameraMovement: string | null;
      shotDescription: string | null;
      timecodeStart: string | null;
      timecodeEnd: string | null;
      durationSeconds: number | null;
      visualJson: Record<string, unknown> | null;
      subjectsJson: unknown[] | null;
      audioJson: Record<string, unknown> | null;
      textElementsJson: unknown[] | null;
    }>,
  ): SquareReverseDeckSnapshot => {
    // 脚本正文：优先 basic_info（完整分镜正文）> storyboard（分镜文本）> summary（视频摘要）
    const rawBasicInfo = script.basicInfo?.replace(/^basic:/, "").trim() || "";
    const storyboardText = typeof script.storyboard === "string"
      ? String(script.storyboard).trim()
      : "";
    const scriptText = pickFirstNonEmptyText(rawBasicInfo, storyboardText, script.summary) || "暂无文案内容";
    const sourceUrl = item.videoUrl || script.sourceOssUrl || null;
    const keywords = script.tags?.length
      ? dedupeKeywords(script.tags)
      : script.keyElements?.length
        ? dedupeKeywords(script.keyElements)
        : [];

    // 从 shotBreakdown 构建 frames 和 segments
    const frames: SquareReverseDeckSnapshot["frames"] = (shotBreakdown && shotBreakdown.length > 0)
      ? shotBreakdown.slice(0, 20).map((shot) => {
          const audio = shot.audioJson ?? {};
          const narration = String(
            (audio as Record<string, unknown>).dialogue
              ? ((audio as Record<string, unknown>).dialogue as Record<string, unknown>)?.content ?? ""
              : (audio as Record<string, unknown>).narration
                ? ((audio as Record<string, unknown>).narration as Record<string, unknown>)?.content
                  ?? ((audio as Record<string, unknown>).narration as Record<string, unknown>)?.text
                  ?? ""
                : "",
          ).trim();
          const visual = shot.visualJson ?? {};
          const scene = (visual as Record<string, unknown>).scene as Record<string, unknown> | undefined;
          const visualCue = typeof scene?.environment === "string" ? scene.environment : (shot.shotDescription ?? "");
          return {
            index: shot.shotIndex,
            title: `镜头 ${shot.shotIndex}`,
            narration,
            visualCue,
          };
        })
      : [];
    const segments: SquareReverseDeckSnapshot["segments"] = frames.length > 0
      ? frames.map((frame) => ({
          time: frame.index > 0 ? `${Math.max(0, frame.index - 1) * 3}-${frame.index * 3}s` : "--",
          title: frame.title || `镜头 ${frame.index || 1}`,
          content: frame.narration || frame.visualCue || "",
          visualCue: frame.visualCue || frame.narration || "",
        }))
      : [];

    return {
      updatedAt: Number(script.updatedAt) || Date.now(),
      title: pickFirstNonEmptyText(script.title, item.title) || "模板脚本",
      sourceTitle: item.title || null,
      sourceUrl,
      libraryScriptId: script.id ?? null,
      keywords,
      scriptText,
      sections: [],
      frames,
      segments,
      videoUrl: sourceUrl,
      coverUrl: item.coverUrl || null,
      hasRealPerson: script.payload?.video_analysis?.on_screen_presence?.has_real_person ?? null,
      exposureLevel: script.payload?.video_analysis?.on_screen_presence?.exposure_level ?? null,
      screenTimeRatio: script.payload?.video_analysis?.on_screen_presence?.person_details?.[0]?.screen_time_ratio ?? null,
      mainScene: script.mainScene ?? null,
      weather: script.weather ?? null,
      atmosphere: script.atmosphere ?? null,
      timeOfDay: script.timeOfDay ?? null,
      strategyType: script.type != null ? scriptTypeToStrategy(script.type as import('../../../../src/contracts/types').ScriptTypeValue) : null,
    };
  };

  /**
   * 处理一键复刻按钮点击：
   * 优先使用模板已关联的脚本直接弹出结果弹窗，无脚本时走反推管线
   */
  const handleReplicaClick = async (item: SquareContentItem) => {
    if (!token) {
      setReverseInputFeedbackTone("error");
      setReverseInputFeedback("请先登录后再执行复刻。");
      return;
    }

    // 关闭视频预览弹窗（如果打开）
    setPreviewMedia(null);

    try {
      // 先查模板是否已关联脚本
      const result = await backendApi.squareTemplateGetScript(token, item.id);
      if (result.hasScript && result.script && result.shotBreakdown && result.shotBreakdown.length > 0) {
        // 有脚本 → 直接构建 snapshot 并弹窗
        const snapshot = buildSnapshotFromScriptData(result.script, item, result.shotBreakdown);
        persistSquareReverseDeckSnapshot(snapshot);
        setShowStorageHint(true);
        setReverseDeckOpen(true);
        return;
      }
    } catch (e) {
      // 查询失败时暴露错误，不静默降级
      const message = e instanceof Error ? e.message : "查询模板脚本失败";
      setReverseInputFeedbackTone("error");
      setReverseInputFeedback(message);
      return;
    }

    // 无关联脚本 → 走反推管线，完成后自动关联
    if (!item.videoUrl) {
      setReverseInputFeedbackTone("error");
      setReverseInputFeedback("该内容无视频链接，无法反推");
      return;
    }

    void handleStartReverseFromInput({ sourceOverride: item.videoUrl, modeOverride: "video_url", templateIdOverride: item.id });
  };

  const handleStartReverseFromInput = async (options?: {
    sourceOverride?: string;
    modeOverride?: SquareReverseRequestInputMode;
    fileOverride?: File | null;
    templateIdOverride?: string;
  }) => {
    if (!token) {
      setReverseInputFeedbackTone("error");
      setReverseInputFeedback("请先登录后再执行反推。");
      return;
    }
    const requestedMode = options?.modeOverride;
    const isUploadMode = requestedMode === "upload_file";
    const rawSource = String(options?.sourceOverride ?? reverseInput).trim();
    const normalizedInput = isUploadMode
      ? { normalized: rawSource, fromDirtyText: false }
      : normalizeSquareReverseUrlInput(rawSource);
    const source = normalizedInput.normalized;
    if (!source) {
      setReverseInputFeedbackTone("error");
      setReverseInputFeedback(isUploadMode ? "请先选择本地视频/音频文件。" : "请输入抖音链接或视频直链。");
      return;
    }
    if (!isUploadMode && !isHttpUrl(source) && !/douyin\.com|iesdouyin\.com/i.test(source)) {
      setReverseInputFeedbackTone("error");
      setReverseInputFeedback("仅支持抖音链接或 http(s) 视频链接。");
      return;
    }
    setReverseInputFeedbackTone("info");
    if (!isUploadMode) {
      setReverseInput(source);
      setReverseInputFeedback(
        normalizedInput.fromDirtyText ? "已自动从分享文案中提取可用链接。" : null,
      );
    } else {
      setReverseInput("");
      setReverseInputFeedback(null);
    }

    let requestInputMode: SquareReverseRequestInputMode = requestedMode ?? reverseInputMode;
    if (!options?.modeOverride && isLikelyDirectPlayableVideoUrl(source)) {
      requestInputMode = "video_url";
    }
    if (requestInputMode !== "upload_file" && reverseInputMode !== requestInputMode) {
      setReverseInputMode(requestInputMode);
    }

    // 启动进度条动画
    setReverseRunning(true);
    setReverseProgress(6);
    setReverseWaveOffset(0);

    try {
      // video_url 模式：走异步 LLM 反推管线（加入全局任务队列）
      if (requestInputMode === "video_url") {
        await backendApi.startLlmReverseJob(token!, { input: source, templateId: options?.templateIdOverride });
        // 快速推进到 100% 给用户反馈，然后延迟收起
        setReverseProgress(100);
        setReverseInput("");
        pushTaskNotification({
          category: "reverse-script",
          title: "已加入任务队列",
          detail: `反推任务已启动，可在右上角任务队列查看进度`,
          targetPath: "/square",
          toastDurationMs: 5000,
        });
        window.setTimeout(() => {
          setReverseRunning(false);
          setReverseProgress(0);
        }, 1500);
        return;
      }
      // douyin_url / upload_file 模式：走原有管线
      let parsed = await backendApi.reverseParseV2(token, {
        mode: requestInputMode,
        input: source,
        ...(options?.fileOverride ? { file: options.fileOverride } : {}),
      });
      if (parsed.result?.fallback || parsed.error?.code === "FALLBACK_REQUIRED") {
        throw new Error(parsed.error?.message || "反推失败，请稍后重试。");
      }
      const storageTarget = await applyReverseParseResultToDeck(parsed, requestInputMode, source);
      // 最小化时：推送 toast 通知，不打开结果面板
      if (reverseMinimizedRef.current) {
        pushTaskNotification({
          category: "reverse-script",
          title: "反推完成",
          detail: `已写入${storageTarget}，可前往脚本中心查看`,
          targetPath: "/reverse",
          toastDurationMs: 8000,
        });
        setReverseProgress(100);
        setReverseRunning(false);
        setReverseInput("");
        window.setTimeout(() => {
          setReverseMinimized(false);
          setReverseProgress(0);
        }, 4000);
      } else {
        setReverseInputFeedbackTone("success");
        setReverseInputFeedback(`反推完成，已写入${storageTarget}。`);
        setReverseInput("");
        setReverseProgress(100);
        window.setTimeout(() => {
          setReverseProgress(0);
        }, 900);
      }
    } catch (error) {
      const message = (() => {
        if (error instanceof ApiError) {
          const failure = resolveVideoReverseFailurePolicy({
            code: error.code,
            message: error.message,
            requestId: error.requestId,
          });
          return failure.userMessage;
        }
        return error instanceof Error ? error.message : "反推失败，请稍后重试。";
      })();

      // 最小化时：推送错误 toast
      if (reverseMinimizedRef.current) {
        pushTaskNotification({
          category: "reverse-script",
          title: "反推失败",
          detail: message,
          targetPath: "/reverse",
          toastDurationMs: 8000,
        });
        setReverseRunning(false);
        window.setTimeout(() => {
          setReverseMinimized(false);
          setReverseProgress(0);
        }, 4000);
      } else {
        setReverseInputFeedbackTone("error");
        setReverseInputFeedback(message);
        setReverseProgress(0);
      }
    } finally {
      // 非最小化时才在此处重置（最小化时已在上方各分支中重置）
      if (!reverseMinimizedRef.current) {
        setReverseRunning(false);
      }
    }
  };

  const handleReverseFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!token) {
      setReverseInputFeedbackTone("error");
      setReverseInputFeedback("请先登录后再执行反推。");
      return;
    }

    setReverseInputMode("video_url");
    setReverseInputFeedbackTone("info");
    setReverseInputFeedback(`已选择文件：${file.name}，正在上传到云端...`);
    setReverseRunning(true);
    setReverseProgress(10);

    // 先上传到 OSS，再用 video_url 模式调用反推
    void (async () => {
      try {
        // 上传到 OSS
        const { fileUrl } = await uploadFileToOss(token, "reverse-upload", file, true, {
          onProgress: (percent) => {
            setReverseProgress(Math.min(percent * 0.8, 80)); // 上传进度占 80%
          }
        });

        setReverseProgress(85);
        setReverseInputFeedback(`文件已上传，开始画面分析...`);

        // 用 OSS URL 调用 LLM 反推管线（video_url 模式）
        await backendApi.startLlmReverseJob(token, { input: fileUrl, filename: file.name });

        setReverseProgress(100);
        setReverseInput("");
        pushTaskNotification({
          category: "reverse-script",
          title: "已加入任务队列",
          detail: `反推任务已启动，可在右上角任务队列查看进度`,
          targetPath: "/square",
          toastDurationMs: 5000,
        });
        window.setTimeout(() => {
          setReverseRunning(false);
          setReverseProgress(0);
        }, 1500);
      } catch (error) {
        const message = error instanceof Error ? error.message : "上传失败，请稍后重试。";
        setReverseInputFeedbackTone("error");
        setReverseInputFeedback(message);
        setReverseRunning(false);
        setReverseProgress(0);
      }
    })();

    event.target.value = "";
  };

  const triggerReverseFileUpload = () => {
    if (reverseRunning) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleSendSnapshotToStep3 = () => {
    if (!reverseDeckSnapshot) {
      return;
    }
    if (!token) return;

    // 无分镜数据时不允许投入创作
    if (!reverseDeckSnapshot.segments || reverseDeckSnapshot.segments.length === 0) {
      void confirm('该脚本缺少分镜数据，无法投入创作。\n\n请先通过反推生成分镜，或选择其他脚本。', '无法投入创作');
      return;
    }

    // 判断是否有真人，无真人或未检测则阻止投入创作
    // 判断是否有真人、露出程度、出镜时长
    // if (reverseDeckSnapshot.hasRealPerson !== true) {
    //   void confirm(
    //     '该视频未检测到真人，无法投入创作。\n\n服装搭配功能需要真人模特展示，建议选择包含真人模特的视频进行反推。',
    //     '无法投入创作'
    //   );
    //   return;
    // }
    // if (reverseDeckSnapshot.exposureLevel === '低') {
    //   void confirm(
    //     '该视频真人露出程度过低，无法投入创作。\n\n服装搭配功能需要完整展示服装效果，建议选择人物露出程度较高的视频。',
    //     '无法投入创作'
    //   );
    //   return;
    // }
    // if (!reverseDeckSnapshot.screenTimeRatio || reverseDeckSnapshot.screenTimeRatio < 0.7) {
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
          reverseScriptId: reverseDeckSnapshot.libraryScriptId,
          projectDataPatch: {
            pendingReverseDeckScript: {
              libraryScriptId: reverseDeckSnapshot.libraryScriptId,
              title: reverseDeckSnapshot.title || "反推脚本",
              summary: reverseDeckSnapshot.scriptText || "暂无摘要内容",
              segments: reverseDeckSnapshot.segments ?? [],
            },
          },
        });
        navigate(getProjectStep1Path(created.id, "video"));
      } catch (e) {
        console.error("[Square] 反推创建项目失败:", e);
      }
    })();
  };

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="sticky top-0 z-20 w-full px-4 md:px-6 py-4 bg-background-warm/95 backdrop-blur-sm border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full md:w-auto">
            <button
              className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium shadow-md shadow-primary/20 whitespace-nowrap"
              onClick={() => setActiveCategory('全部')}
            >
              热门推荐
            </button>
            {categories.slice(1).map(tag => (
              <button
                key={tag}
                onClick={() => setActiveCategory(tag)}
                className={`px-5 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap border ${
                  activeCategory === tag
                    ? 'bg-white border-primary text-primary shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary/30 hover:text-primary'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:flex items-center gap-3 pl-3 border-l border-gray-200">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-xs font-bold text-primary shadow-sm shrink-0 cursor-pointer hover:bg-gray-50 transition-colors">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <span>内容喵.AI 社区动态</span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="搜索创意灵感..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm w-48 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
                <span className="material-icons-round absolute left-2.5 top-2.5 text-gray-400 text-lg">search</span>
              </div>
            </div>
          </div>
        </div>

        <div ref={scrollContainerRef} className="relative flex-1 overflow-y-auto px-4 md:px-6 pt-4 pb-8">
          <div className="text-center max-w-7xl mx-auto mb-12">
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-gray-900 font-display mb-4">
              探索无限创意可能
            </h1>
            <h2 className="text-2xl md:text-4xl font-black mb-8 tracking-tight leading-tight">
              <span className="text-gray-900">从 </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">爆款视频 </span>
              <span className="text-gray-900">到 </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-900 to-purple-600">精细化脚本</span>
            </h2>
            <div className="mx-auto mb-4 w-full max-w-3xl">
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="video/*,audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg"
                  onChange={handleReverseFileUpload}
                />
                <div className={`flex w-full rounded-xl overflow-hidden border transition-colors duration-300 ${
                  reverseRunning && !reverseMinimized
                    ? "bg-gradient-to-r from-sky-50 via-cyan-50 to-blue-50 border-sky-200/60 shadow-lg shadow-sky-100/40"
                    : "bg-white border-gray-200 shadow-xl shadow-gray-200/40"
                } items-stretch`}>
                    <div className="flex-1 relative self-stretch min-h-[50px]">
                      {/* 进度条背景 - 运行且未最小化时覆盖整个输入区域 */}
                      {reverseRunning && !reverseMinimized && (
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-sky-400/20 via-cyan-400/20 to-blue-400/20 transition-[width] duration-500 ease-out"
                          style={{ width: `${Math.max(2, reverseProgress)}%` }}
                        />
                      )}
                      {/* 进度条流光 */}
                      {reverseRunning && !reverseMinimized && (
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                          style={{
                            width: `${Math.max(2, reverseProgress)}%`,
                            backgroundImage: "repeating-linear-gradient(120deg, rgba(255,255,255,0.3) 0px, rgba(255,255,255,0.3) 10px, transparent 10px, transparent 22px)",
                            backgroundPosition: `${reverseWaveOffset}px 0`,
                          }}
                        />
                      )}
                      <span className={`hidden md:block absolute left-4 top-1/2 -translate-y-1/2 font-bold text-xs px-2 py-0.5 rounded z-10 transition-colors ${
                        reverseRunning && !reverseMinimized ? "text-sky-500 bg-sky-100" : "text-gray-400 bg-gray-100"
                      }`}>
                        链接
                      </span>
                      {reverseRunning && !reverseMinimized ? (
                        <div className="relative w-full min-h-[50px] flex items-center justify-center gap-2 text-sm font-bold text-sky-600 z-10">
                          <span className="material-icons-round animate-spin text-lg">autorenew</span>
                          {reverseProgress < 15 ? "正在解析视频地址..." :
                           reverseProgress < 40 ? "正在下载视频..." :
                           reverseProgress < 75 ? "AI 正在分析画面..." :
                           "正在生成分镜报告..."}
                          <span className="text-sky-400 text-xs font-medium">{Math.round(reverseProgress)}%</span>
                        </div>
                      ) : (
                        <input
                          value={reverseInput}
                          onChange={(event) => setReverseInput(event.target.value)}
                          placeholder="粘贴抖音链接或视频链接..."
                          className="w-full h-full pl-4 md:pl-14 pr-4 text-sm font-medium text-gray-800 outline-none text-center"
                        />
                      )}
                    </div>
                    {/* 上传按钮 - 集成在输入框内部右侧 */}
                    <button
                      type="button"
                      onClick={triggerReverseFileUpload}
                      disabled={reverseRunning}
                      className="self-stretch flex items-center justify-center px-3 text-gray-400 hover:text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                      title="上传本地视频/音频文件"
                    >
                      <span className="material-icons-round text-xl">attach_file</span>
                    </button>
                    {/* 反推按钮 */}
                    <button
                      type="button"
                      onClick={() => void handleStartReverseFromInput()}
                      disabled={reverseRunning}
                      className="flex min-h-[50px] shrink-0 self-stretch items-center gap-2 rounded-none rounded-r-xl bg-[#1A1A1A] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {reverseRunning ? "分析中..." : "一键复刻"}
                      {!reverseRunning && <span className="material-icons-round text-base text-yellow-400">bolt</span>}
                    </button>
                  </div>

                  {/* 智能提示（左） + 特性标签（右） 同一行 */}
                  <div className="flex items-center justify-between mt-2 min-h-[20px]">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      {reverseInputHint ? (
                        <>
                          <span className={`material-icons-round text-sm ${
                            reverseInputHintTone === 'success' ? 'text-emerald-600' :
                            reverseInputHintTone === 'error' ? 'text-rose-600' : 'text-sky-600'
                          }`}>
                            {reverseInputHint.icon}
                          </span>
                          <span className={
                            reverseInputHintTone === 'success' ? 'text-emerald-700' :
                            reverseInputHintTone === 'error' ? 'text-rose-600' : 'text-gray-600'
                          }>
                            {reverseInputHint.message}
                          </span>
                        </>
                      ) : <span />}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-semibold text-gray-400">
                      <span className="flex items-center gap-0.5"><span className="material-icons-round text-sm">speed</span> 极速解析</span>
                      <span className="flex items-center gap-0.5"><span className="material-icons-round text-sm">auto_fix_high</span> 画面分析</span>
                      <span className="flex items-center gap-0.5"><span className="material-icons-round text-sm">psychology</span> 爆款逻辑提取</span>
                    </div>
                  </div>

                {reverseDeckOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setReverseDeckOpen(false); setShowStorageHint(false); }}>
                    <div onClick={(e) => e.stopPropagation()}>
                      <SquareReverseDeckCard
                        snapshot={reverseDeckSnapshot}
                        onSendToStep3={handleSendSnapshotToStep3}
                        onClose={() => { setReverseDeckOpen(false); setShowStorageHint(false); }}
                        showStorageHint={showStorageHint}
                      />
                    </div>
                  </div>
                )}

                {/* 反推最小化确认弹窗 */}
                {reverseConfirmMinimizeOpen && reverseRunning && !reverseMinimized && (
                  <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-fade-in">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center">
                          <span className="material-icons-round text-sky-600 text-xl">schedule</span>
                        </div>
                        <h3 className="text-base font-bold text-gray-900">逐帧分析中</h3>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed mb-5">
                        逐帧分析耗时较长，你可以继续浏览其他内容。解析完成后脚本将自动存入
                        <span className="font-semibold text-gray-800">个人脚本中心</span>，
                        随时可以继续根据脚本生成视频。
                      </p>
                      <button
                        type="button"
                        className="w-full py-2.5 rounded-xl bg-sky-500 text-white font-semibold text-sm hover:bg-sky-600 active:bg-sky-700 transition-colors"
                        onClick={() => {
                          setReverseMinimized(true);
                          setReverseConfirmMinimizeOpen(false);
                        }}
                      >
                        确认，最小化任务
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="mx-auto w-full max-w-3xl">
            {reverseInputFeedback ? (
              <div
                className={`mb-4 text-xs font-medium text-center ${
                  reverseInputFeedbackTone === "error"
                    ? "text-rose-600"
                    : reverseInputFeedbackTone === "success"
                      ? "text-emerald-700"
                      : "text-gray-600"
                }`}
              >
                {reverseInputFeedback}
              </div>
            ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mx-auto max-w-[1600px] pb-20 mt-12">
            {/* 加载状态 */}
            {aggregateLoading && (
              <div className="col-span-full flex justify-center items-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}

            {/* 内容列表 */}
            {!aggregateLoading && aggregateItems.map(item => (
              <div
                key={item.id}
                data-square-card
                data-id={item.id}
                data-type={item.sourceType}
                data-category={item.category}
              >
                <SquareCard
                  {...item}
                  onPlay={() => {
                    if (item.videoUrl) {
                      setPreviewMedia({
                        type: 'video',
                        url: item.videoUrl,
                        title: item.title,
                        itemId: item.id,
                      });
                    }
                    handleTrackBehavior(item.id, 'template', item.category, 'click');
                  }}
                />
              </div>
            ))}

            {/* 空状态 */}
            {!aggregateLoading && aggregateItems.length === 0 && (
              <div className="col-span-full text-center py-20 text-gray-400">
                <span className="material-icons-round text-4xl mb-2">sentiment_dissatisfied</span>
                <p>该分类下暂无内容</p>
              </div>
            )}

            {/* 底部加载触发器 - 无限滚动 */}
            {!aggregateLoading && aggregateItems.length > 0 && (
              <div data-load-more-sentinel className="col-span-full h-20 flex items-center justify-center">
                {loadingMore && (
                  <div className="flex items-center gap-2 text-gray-500">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    <span className="text-sm">加载更多...</span>
                  </div>
                )}
                {!hasMore && !loadingMore && (
                  <div className="text-sm text-gray-400">
                    已加载全部内容
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleCreateNewProject}
          className="fixed bottom-8 right-4 md:right-8 z-50 flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-5 md:px-6 py-3 md:py-4 rounded-full shadow-2xl shadow-primary/30 transition-all hover:-translate-y-1 hover:scale-105 group border border-white/10"
        >
          <span className="material-icons-round group-hover:animate-spin">add</span>
          <span className="font-bold text-sm md:text-base">新建项目</span>
        </button>

        {/* 视频预览弹窗 - 使用 memo 组件防止父组件重渲染影响播放 */}
        {previewMedia && (
          <VideoPreviewModal
            url={previewMedia.url}
            title={previewMedia.title}
            onClose={() => {
              setPreviewMedia(null);
            }}
            onReplica={
              previewMedia.itemId
                ? () => {
                    const clickedItem = aggregateItems.find(i => i.id === previewMedia.itemId);
                    if (clickedItem) {
                      setPreviewMedia(null);
                      void handleReplicaClick(clickedItem);
                    }
                  }
                : undefined
            }
          />
        )}

        {/* 新建项目类型选择弹窗 */}
        <NewProjectTypeDialog
          open={newProjectDialogOpen}
          onClose={closeNewProjectDialog}
          onCreateProject={handleCreateProject}
        />
      </div>
    </Layout>
  );
};
