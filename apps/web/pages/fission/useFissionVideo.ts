/**
 * 裂变视频页面自定义 Hook
 * 封装所有状态管理和业务逻辑
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router';
import { useAppStore } from '../../store/useAppStore';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';

import type {
  ClipVideo,
  FissionVideo,
  VideoCard,
  Message,
  StoryboardCombination,
  VideoMusicInfo,
} from './types';

import {
  createApiRequest,
  fetchFissionVideos,
  deleteFissionVideo,
  // 已删除：getOrCreateFissionVideoStatus（startParallelFission 已自动创建状态记录）
  fetchAtmosphere,
  fetchStoryboardCombinations,
  uploadComVideo,
  matchMusicByScript,
  fetchFissionTaskItems,
  type FissionVideoStatus,
  type MatchMusicByScriptResult,
  type FissionTaskItemRecord,
} from './api';

import { realProjectsApi } from '../../services/realApi';
import {
  spendProjectFlowCredits,
  resolveProjectFlowCreditSpendErrorMessage,
  checkCreditsBalance,
} from '../project-flow/projectFlowCredit';
// 废弃 import 已删除：processMirrorStoryboard、checkStoryboardExists（分镜数据改用 task_items）

import {
  checkVideoMergeSupport,
} from '../../libs/video-merge';
import { mergeProjectVideos } from '../../utils/videoMergeHelper';
import { FISSION_MAX_COUNT } from './constants';

/**
 * 从视频URL中提取镜像标志
 */
export const extractClipId = (videoUrl: string): string => {
  const match = videoUrl.match(/clip-(\d+)/i);
  if (match) {
    return `clip-${match[1]}`;
  }
  return `clip-${videoUrl.split('/').pop()?.split('.')[0]?.slice(-4) || 'unknown'}`;
};

/**
 * 将存储路径转换为可访问的视频URL
 */
export const resolveVideoUrl = (path: string | null): string => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const baseUrl = window.location.origin;
  return `${baseUrl}/storage/objects/${path}`;
};

/**
 * 裂变视频 Hook 返回类型
 */
export interface UseFissionVideoReturn {
  // URL 参数
  projectId: string;

  // 状态
  clipVideos: ClipVideo[];
  projectDataLoading: boolean;
  hasLoadedProjectData: boolean;
  originalVideoUrl: string | null;
  selectedRoleDirection: { age?: number } | null;  // 角色年龄（用于积分定价）
  fissionCount: number;
  selectedVideoIds: string[];
  fissionVideos: FissionVideo[];
  displayVideos: VideoCard[];
  loading: boolean;
  message: Message | null;
  batchEditMode: boolean;
  deleteMenuVideoId: string | null;
  fissionVideoStatus: FissionVideoStatus | null;
  atmospheres: string[];

  // 异步任务状态（从 globalTaskQueue 派生）
  asyncPrepStatus: {
    newStoryAsyncStatus: 'pending' | 'processing' | 'completed' | 'failed';
    shotPromptsAsyncStatus: 'pending' | 'processing' | 'completed' | 'failed';
    asyncFailedStage: string | null;
    asyncErrorMessage: string | null;
  } | null;
  asyncPrepLoading: boolean;

  // 分镜任务项进度（从 globalTaskQueue 派生，用于 FissionTaskGrid）
  taskItemsData: Array<{
    id: string;
    category: 'image_video' | 'new_story';
    storyboardIndex: number;
    imageStatus: 'pending' | 'processing' | 'completed' | 'failed';
    videoStatus: 'pending' | 'processing' | 'completed' | 'failed';
    imageUrl: string | null;
    videoUrl: string | null;
    imageErrorMessage: string | null;
    videoErrorMessage: string | null;
  }>;

  // 分镜组合相关
  combinations: StoryboardCombination[];
  combinationsLoading: boolean;
  selectedCombination: StoryboardCombination | null;
  generatedVideos: Array<{
    combinationId: string;
    videoUrl?: string;
    success: boolean;
    message?: string;
  }>;

  // 合并视频相关
  mergeVideoLoading: boolean;
  mergeVideoProgress: {
    percent: number;
    message: string;
  } | null;

  // 加载中的视频数量
  loadingVideoCount: number;

  // 自动生成视频流程
  generateVideoLoading: boolean;
  generateVideoProgress: number;

  // 音乐氛围识别
  musicAtmosphereLoading: boolean;
  musicAtmosphereResult: MatchMusicByScriptResult | null;

  // 裂变数量控制
  availableFissionOptions: number[];
  canFission: boolean;
  mirrorStatusMessage: string;
  fissionButtonState: {
    text: string;
    disabled: boolean;
    action: 'new' | 'continue' | 'none' | 'auto' | 'retry_async' | 'waiting_story' | 'waiting_prompts' | 'partial_complete';
  };

  // 操作方法
  setFissionCount: (count: number) => void;
  setBatchEditMode: (mode: boolean) => void;
  setDeleteMenuVideoId: (id: string | null) => void;
  setSelectedVideoIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  toggleVideoSelection: (videoId: string) => void;
  showMessage: (message: Message | null) => void;
  handleCancel: () => void;
  handleBatchDownload: () => Promise<void>;
  handleBatchDelete: () => Promise<void>;
  handleDownload: (video: VideoCard) => void;
  handleDelete: (videoId: string) => Promise<void>;
  handleContinueFissionNew: () => Promise<void>;
  handleMergePartial: () => Promise<void>;
  handleComplete: () => void;
  loadFissionVideos: () => Promise<void>;
  // 已删除：loadFissionVideoStatus（startParallelFission 已自动创建状态记录）
  handleQueryCombinations: (autoGenerate?: boolean) => Promise<void>;
  setSelectedCombination: (combination: StoryboardCombination | null) => void;
  handleGenerateVideo: (selectedCount?: number) => Promise<void>;
  handleMatchMusicAtmosphere: () => Promise<void>;
  selectedMusic: VideoMusicInfo | null;
  setSelectedMusic: React.Dispatch<React.SetStateAction<VideoMusicInfo | null>>;

  // 合并确认弹窗
  pendingMergeConfirm: boolean;
  confirmMerge: () => void;
  cancelMerge: () => void;
}

/**
 * 裂变视频页面主 Hook
 */
export const useFissionVideo = (): UseFissionVideoReturn => {
  // 登录状态
  const token = useAppStore((state) => state.token);

  // 删除确认弹窗（全局 Provider）
  const { confirm } = useConfirm();
  const { showToast } = useToast();

  // URL 参数 - 优先路径参数 :projectId，兼容查询参数和 store
  const params = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectId = params.projectId || searchParams.get('projectId') || searchParams.get('project_id') || '';

  // API 请求函数
  const apiRequest = useCallback(createApiRequest(token), [token]);

  // ========== 状态定义 ==========

  // 镜像视频列表
  const [clipVideos, setClipVideos] = useState<ClipVideo[]>([]);
  const [projectDataLoading, setProjectDataLoading] = useState(false);
  const [hasLoadedProjectData, setHasLoadedProjectData] = useState(false);

  // 原视频 URL（从 projectData.exportUrl 获取）
  const [originalVideoUrl, setOriginalVideoUrl] = useState<string | null>(null);

  // 角色年龄（用于积分定价）
  const [selectedRoleDirection, setSelectedRoleDirection] = useState<{ age?: number } | null>(null);

  // 裂变设置
  const [fissionCount, setFissionCount] = useState<number>(6);

  // 视频选择
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [fissionVideos, setFissionVideos] = useState<FissionVideo[]>([]);

  // 加载状态
  const [loading, setLoading] = useState(false);

  // 结果提示
  const [message, setMessage] = useState<Message | null>(null);

  // 批量编辑
  const [batchEditMode, setBatchEditMode] = useState(false);
  const [deleteMenuVideoId, setDeleteMenuVideoId] = useState<string | null>(null);

  // 裂变状态
  const [fissionVideoStatus, setFissionVideoStatus] = useState<FissionVideoStatus | null>(null);
  const [atmospheres, setAtmospheres] = useState<string[]>([]);

  // 异步任务状态（从 globalTaskQueue 读取）
  const [asyncPrepLoading, setAsyncPrepLoading] = useState(false);

  // 数据库中的任务项数据（用于持久化状态恢复）
  const [dbTaskItems, setDbTaskItems] = useState<FissionTaskItemRecord[]>([]);
  const [dbTaskItemsLoading, setDbTaskItemsLoading] = useState(false);

  // 从 globalTaskQueue 获取裂变相关任务
  const globalTaskQueue = useAppStore((state) => state.globalTaskQueue);

  // new_story 任务状态（从 globalTaskQueue 派生）
  const newStoryJob = useMemo(
    () => globalTaskQueue.find((t) => t.type === 'step6_fission_new_story' && t.projectId === projectId),
    [globalTaskQueue, projectId],
  );

  // shot_prompts 任务状态（从 globalTaskQueue 派生）
  const shotPromptsJob = useMemo(
    () => globalTaskQueue.find((t) => t.type === 'step6_fission_shot_prompts' && t.projectId === projectId),
    [globalTaskQueue, projectId],
  );

  // 父任务状态（从 globalTaskQueue 派生）
  const parentFissionJob = useMemo(
    () => globalTaskQueue.find((t) => t.type === 'step6_fission' && t.projectId === projectId),
    [globalTaskQueue, projectId],
  );

  // item-level jobs（从 globalTaskQueue 派生）
  const itemImageJobs = useMemo(
    () => globalTaskQueue.filter((t) => t.type === 'step6_fission_item_image' && t.projectId === projectId),
    [globalTaskQueue, projectId],
  );
  const itemVideoJobs = useMemo(
    () => globalTaskQueue.filter((t) => t.type === 'step6_fission_item_video_submit' && t.projectId === projectId),
    [globalTaskQueue, projectId],
  );

  // 将 item jobs 映射为 FissionTaskCardData 格式
  // 简化逻辑：数据库作为唯一持久化源，globalTaskQueue 仅补充实时进度
  const taskItemsData = useMemo(() => {
    // 无数据库数据时返回空数组（等待加载）
    if (dbTaskItems.length === 0) return [];

    // 构建实时状态映射（仅用于补充 pending/processing 状态）
    const realtimeStatusMap = new Map<string, { imageStatus?: string; videoStatus?: string; imageUrl?: string; videoUrl?: string; imageError?: string; videoError?: string }>();

    itemImageJobs.forEach(job => {
      let input: Record<string, unknown> | null = null;
      try {
        input = job.input ? JSON.parse(job.input) as Record<string, unknown> : null;
      } catch {
        // ignore parse errors
      }
      const idx = (input?.itemIndex as number) ?? 0;
      const taskType = (input?.taskType as string) ?? 'image_video';
      const key = `${taskType}-${idx}`;
      const result = job.result as Record<string, unknown> | null;

      realtimeStatusMap.set(key, {
        ...realtimeStatusMap.get(key),
        imageStatus: job.status,
        imageUrl: result?.imageUrl as string,
        imageError: job.error?.message ?? result?.errorMessage as string,
      });
    });

    itemVideoJobs.forEach(job => {
      let input: Record<string, unknown> | null = null;
      try {
        input = job.input ? JSON.parse(job.input) as Record<string, unknown> : null;
      } catch {
        // ignore parse errors
      }
      const idx = (input?.itemIndex as number) ?? 0;
      const taskType = (input?.taskType as string) ?? 'image_video';
      const key = `${taskType}-${idx}`;
      const result = job.result as Record<string, unknown> | null;

      realtimeStatusMap.set(key, {
        ...realtimeStatusMap.get(key),
        videoStatus: job.status,
        videoUrl: result?.videoUrl as string,
        videoError: job.error?.message ?? result?.errorMessage as string,
      });
    });

    // 按 itemIndex 排序并映射
    return [...dbTaskItems]
      .sort((a, b) => a.itemIndex - b.itemIndex)
      .map(dbItem => {
        const key = `${dbItem.taskType}-${dbItem.itemIndex}`;
        const realtime = realtimeStatusMap.get(key);

        // 状态整合原则：已完成/失败的状态使用数据库（持久化），进行中使用实时
        const mergeStatus = (dbStatus: string, realtimeStatus?: string) => {
          // 数据库已完成/失败，使用数据库状态（稳定）
          if (dbStatus === 'completed' || dbStatus === 'failed') return dbStatus;
          // 否则使用实时状态（进行中的任务）
          return realtimeStatus ?? dbStatus;
        };

        return {
          id: key,
          category: dbItem.taskType,
          storyboardIndex: dbItem.itemIndex - 1,
          imageStatus: mergeStatus(dbItem.imageStatus, realtime?.imageStatus) as 'pending' | 'processing' | 'completed' | 'failed',
          videoStatus: mergeStatus(dbItem.videoStatus, realtime?.videoStatus) as 'pending' | 'processing' | 'completed' | 'failed',
          imageUrl: realtime?.imageUrl ?? dbItem.imageUrl,
          videoUrl: realtime?.videoUrl ?? dbItem.videoUrl,
          imageErrorMessage: realtime?.imageError ?? dbItem.imageErrorMessage,
          videoErrorMessage: realtime?.videoError ?? dbItem.videoErrorMessage,
        };
      });
  }, [dbTaskItems, itemImageJobs, itemVideoJobs]);

  // 将 new_story / shot_prompts job 的状态映射为 asyncPrepStatus
  const asyncPrepStatus = useMemo(() => {
    if (!newStoryJob) return null;
    const result = newStoryJob.result as Record<string, unknown> | null;
    const shotStatus = shotPromptsJob
      ? (shotPromptsJob.status === 'running' ? 'processing' : shotPromptsJob.status === 'completed' ? 'completed' : shotPromptsJob.status === 'failed' ? 'failed' : 'pending')
      : 'completed';
    return {
      newStoryAsyncStatus: (newStoryJob.status === 'running' ? 'processing' : newStoryJob.status === 'completed' ? 'completed' : newStoryJob.status === 'failed' ? 'failed' : 'pending') as 'pending' | 'processing' | 'completed' | 'failed',
      shotPromptsAsyncStatus: shotStatus as 'pending' | 'processing' | 'completed' | 'failed',
      asyncFailedStage: (result?.errorMessage as string ?? null) as string | null,
      asyncErrorMessage: (result?.errorMessage as string ?? newStoryJob.error?.message ?? null) as string | null,
    };
  }, [newStoryJob, shotPromptsJob]);

  // 同步最新值到 ref（避免 useCallback 闭包陈旧）
  useEffect(() => {
    asyncPrepStatusRef.current = asyncPrepStatus;
  });

  // 加载数据库中的任务项数据（用于持久化状态恢复）
  // 注意：必须定义在使用它的 useEffect 之前，避免 TDZ 错误
  const loadDbTaskItems = useCallback(async () => {
    if (!token || !fissionVideoStatus?.id) return;
    setDbTaskItemsLoading(true);
    try {
      const result = await fetchFissionTaskItems(apiRequest, fissionVideoStatus.id);
      if (result.success && result.items) {
        // 按 itemIndex 排序
        const sortedItems = [...result.items].sort((a, b) => a.itemIndex - b.itemIndex);
        setDbTaskItems(sortedItems);
        console.log('[loadDbTaskItems] 加载任务项:', sortedItems.length, '个');
      }
    } catch (error) {
      console.error('加载任务项失败:', error);
    } finally {
      setDbTaskItemsLoading(false);
    }
  }, [token, apiRequest, fissionVideoStatus?.id]);

  // 新故事完成后立即刷新 task_items（显示骨架卡片）
  const prevNewStoryStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!asyncPrepStatus || !fissionVideoStatus?.id) return;

    let mounted = true;

    // newStoryAsyncStatus 变为 completed 时加载 task_items
    // 支持从任意状态（null/pending/processing）→ completed 的转换，
    // 因为 pending→running 不产生 SSE 事件，前端可能直接看到 completed
    if (asyncPrepStatus.newStoryAsyncStatus === 'completed' && prevNewStoryStatusRef.current !== 'completed') {
      console.log('[NewStoryDone] 新故事完成，刷新 task_items 显示骨架');
      loadDbTaskItems().catch(err => {
        if (mounted) {
          console.error('[NewStoryDone] 加载任务项失败:', err);
          showToast('任务数据加载失败', 'error');
        }
      });
    }

    prevNewStoryStatusRef.current = asyncPrepStatus.newStoryAsyncStatus;
    return () => { mounted = false; };
  }, [asyncPrepStatus, fissionVideoStatus?.id, loadDbTaskItems]);

  // 分镜组合相关（合并视频时使用）
  const [combinations, setCombinations] = useState<StoryboardCombination[]>([]);
  const [combinationsLoading, setCombinationsLoading] = useState(false);
  const [selectedCombination, setSelectedCombinationState] = useState<StoryboardCombination | null>(null);
  const [generatedVideos, setGeneratedVideos] = useState<Array<{
    combinationId: string;
    videoUrl?: string;
    success: boolean;
    message?: string;
  }>>([]);

  // 合并视频相关
  const [mergeVideoLoading, setMergeVideoLoading] = useState(false);
  const [mergeVideoProgress, setMergeVideoProgress] = useState<{
    percent: number;
    message: string;
  } | null>(null);

  // 加载中的视频数量（用于生成视频时显示占位）
  const [loadingVideoCount, setLoadingVideoCount] = useState(0);

  // 自动生成视频流程状态
  const [generateVideoLoading, setGenerateVideoLoading] = useState(false);
  const [generateVideoProgress, setGenerateVideoProgress] = useState<number>(0);

  // 并行裂变启动标记：用于在 effect 中检测后台任务完成并自动执行组合合并
  const [parallelFissionStarted, setParallelFissionStarted] = useState<number | null>(null);
  // 启动瞬间的 asyncPrepStatus 快照：防止旧的 failed 状态误触发完成检测
  const asyncPrepStatusAtStartRef = useRef<{ newStoryAsyncStatus: string; shotPromptsAsyncStatus: string } | null>(null);
  // asyncPrepStatus 最新值 ref：避免 useCallback 闭包陈旧
  const asyncPrepStatusRef = useRef<typeof asyncPrepStatus>(null);

  // 自动恢复执行标记：防止重复执行
  const [autoResumeTriggered, setAutoResumeTriggered] = useState(false);

  // 合并确认弹窗：ready_for_merge 后弹窗让用户确认再合并
  const [pendingMergeConfirm, setPendingMergeConfirm] = useState(false);

  // 音乐氛围识别
  const [musicAtmosphereLoading, setMusicAtmosphereLoading] = useState(false);
  const [musicAtmosphereResult, setMusicAtmosphereResult] = useState<MatchMusicByScriptResult | null>(null);

  // 用户选择的背景音乐（优先使用，未选择则使用后端自动匹配）
  const [selectedMusic, setSelectedMusic] = useState<VideoMusicInfo | null>(null);

  // ========== 计算属性 ==========

  // ========== 裂变数量控制 ==========

  /**
   * 计算可选的裂变数量选项
   * 规则：每个项目最多裂变 12 个视频，再次裂变数量从 1 到 (12 - 已裂变数量)
   */
  const availableFissionOptions = useMemo(() => {
    const generatedCount = fissionVideos.filter(v => v.status === 'completed').length;
    const remainingQuota = FISSION_MAX_COUNT - generatedCount;
    // 从 1 到剩余额度，生成所有可选数量
    return Array.from({ length: remainingQuota }, (_, i) => i + 1);
  }, [fissionVideos]);

  /**
   * 是否允许裂变
   */
  const canFission = useMemo(() => {
    return availableFissionOptions.length > 0;
  }, [availableFissionOptions]);

  /**
   * 裂变状态提示信息
   */
  const mirrorStatusMessage = useMemo(() => {
    const generatedCount = fissionVideos.filter(v => v.status === 'completed').length;

    if (generatedCount >= FISSION_MAX_COUNT) {
      return `已生成 ${generatedCount} 个视频，已达上限，无法继续生成`;
    }

    return `已生成 ${generatedCount} 个，还可生成 ${FISSION_MAX_COUNT - generatedCount} 个`;
  }, [fissionVideos]);

  /**
   * 裂变按钮状态
   * 根据裂变状态判断按钮文案、可点击性和动作类型
   */
  const fissionButtonState = useMemo(() => {
    // 如果正在生成，显示"裂变中..."
    if (generateVideoLoading) {
      return { text: '裂变中...', disabled: true, action: 'none' as const };
    }

    // 项目数据加载中，禁用按钮
    if (projectDataLoading || !hasLoadedProjectData) {
      return { text: '加载中...', disabled: true, action: 'none' as const };
    }

    // 原视频未加载，禁用按钮
    if (!originalVideoUrl) {
      return { text: '一键裂变', disabled: true, action: 'new' as const };
    }

    // 检查异步准备任务状态（从 globalTaskQueue 检测，优先级最高）
    if (asyncPrepStatus) {
      // 提示词正在生成中
      if (asyncPrepStatus.shotPromptsAsyncStatus === 'processing') {
        return { text: '正在生成提示词...', disabled: true, action: 'waiting_prompts' as const };
      }
      // 新故事正在生成中
      if (asyncPrepStatus.newStoryAsyncStatus === 'processing') {
        return { text: '正在生成新故事...', disabled: true, action: 'waiting_story' as const };
      }
      // 异步准备失败时允许重试（必须在 pending 判断之前，否则 failed+pending 组合会被拦截）
      const hasFailed = asyncPrepStatus.newStoryAsyncStatus === 'failed' || asyncPrepStatus.shotPromptsAsyncStatus === 'failed';
      if (hasFailed) {
        // 打开弹窗让用户选择裂变数量后重新启动完整流程
        return { text: '重试裂变', disabled: !canFission, action: 'retry_async' as const };
      }
      // 提示词未开始生成（等待新故事完成后触发，仅新故事还在正常流程中时才等待）
      if (asyncPrepStatus.shotPromptsAsyncStatus === 'pending' && asyncPrepStatus.newStoryAsyncStatus !== 'completed' && asyncPrepStatus.newStoryAsyncStatus !== 'failed') {
        return { text: '等待新故事任务启动...', disabled: true, action: 'waiting_story' as const };
      }
    }

    // 无裂变记录，显示"一键裂变"
    if (!fissionVideoStatus) {
      return { text: '一键裂变', disabled: !canFission, action: 'new' as const };
    }

    // 根据数据库持久化状态判断
    switch (fissionVideoStatus.status) {
      case 'new_story':
        // 新故事状态（fallback：若 globalTaskQueue 未及时更新，数据库状态兜底）
        return { text: '正在生成新故事...', disabled: true, action: 'waiting_story' as const };
      case 'parallel_running':
        // 分镜视频生成中
        return { text: '裂变中...', disabled: true, action: 'none' as const };
      case 'combining':
        // 组合方案生成中
        return { text: '组合中...', disabled: true, action: 'none' as const };
      case 'ready_for_merge':
        // 前置工作已完成，等待用户确认合并
        // action: 'auto' 表示自动流程，点击时检查 pendingMergeConfirm 弹窗
        return { text: '开始合并', disabled: false, action: 'auto' as const };
      case 'ready_for_step4':
        // 旧路径兼容：分镜视频完成，等待组合合并（disabled 状态，action 无意义）
        return { text: '等待合并...', disabled: true, action: 'none' as const };
      case 'completed':
        // 已达上限（12个），显示"裂变完成"
        if (!canFission && fissionVideos.length >= FISSION_MAX_COUNT) {
          return { text: '裂变完成', disabled: true, action: 'none' as const };
        }
        // 异常状态：已完成但无视频（数据库状态错误或视频被删除）
        if (fissionVideos.length === 0) {
          return { text: '状态异常：已完成但无视频', disabled: true, action: 'none' as const };
        }
        // 已有裂变视频 → 再次裂变（弹窗选数量）
        return { text: '再次裂变', disabled: !canFission, action: 'continue' as const };
      case 'partial_complete': {
        // 部分完成（有失败项），按钮可点击，让用户选择重试失败或直接合并
        const failedCount = taskItemsData.filter(t =>
          t.imageStatus === 'failed' || t.videoStatus === 'failed'
        ).length;
        const successCount = taskItemsData.filter(t =>
          t.imageStatus === 'completed' && t.videoStatus === 'completed'
        ).length;
        const detail = taskItemsData.length > 0
          ? `(${failedCount}个失败，${successCount}个成功)`
          : '(加载中...)';
        return { text: `部分完成 ${detail}`, disabled: false, action: 'partial_complete' as const };
      }
      default:
        // 其他状态（creating、organizing_mirror、new_mirror 等），显示"一键裂变"
        return { text: '一键裂变', disabled: !canFission, action: 'new' as const };
    }
  }, [generateVideoLoading, fissionVideoStatus, canFission, projectDataLoading, hasLoadedProjectData, originalVideoUrl, asyncPrepStatus, fissionVideos, taskItemsData]);

  // 展示视频列表 - 没有视频时返回空数组
  const completedVideos: VideoCard[] = fissionVideos.length > 0
    ? fissionVideos
        .filter(v => v.status === 'completed' || v.videoPath)
        .map((v, index) => ({
          id: v.id,
          url: resolveVideoUrl(v.videoPath),
          // 简洁展示：用户不关心分镜组合细节，只关心序号
          title: `裂变 #${index + 1}`,
          size: v.durationSec ? `${(v.durationSec * 0.5).toFixed(1)} MB` : '10.0 MB',
          durationSec: v.durationSec ?? undefined,
          selected: selectedVideoIds.includes(v.id),
        }))
    : [];

  // 生成加载中的占位视频列表
  const loadingVideos: VideoCard[] = Array.from({ length: loadingVideoCount }, (_, i) => ({
    id: `loading-${Date.now()}-${i}`,
    url: '',
    title: `视频 ${completedVideos.length + i + 1}`,
    size: '生成中...',
    loading: true,
  }));

  // 固定 12 个槽位：真实视频 + 加载中 + 空占位（合并中时 placeholder 变为合并 loading）
  const FISSION_GRID_SLOTS = 12;
  const realAndLoading = [...completedVideos, ...loadingVideos];
  const placeholderCount = Math.max(0, FISSION_GRID_SLOTS - realAndLoading.length);
  const isMerging = mergeVideoLoading && loadingVideoCount === 0;
  const placeholderVideos: VideoCard[] = Array.from({ length: placeholderCount }, (_, i) => ({
    id: `placeholder-${i}`,
    url: '',
    title: isMerging ? `合并中 ${Math.round(mergeVideoProgress?.percent ?? 0)}%` : `视频 ${realAndLoading.length + i + 1}`,
    size: isMerging ? `${mergeVideoProgress?.message ?? '合并视频...'}` : '',
    loading: false,
    placeholder: !isMerging,
    merging: isMerging,
  }));
  const displayVideos: VideoCard[] = [...realAndLoading, ...placeholderVideos];

  // ========== 数据加载 ==========

  // 加载项目数据：只加载页面显示必需的数据
  // - getProject → exportUrl（原视频URL，页面显示必需）
  // - getStep4VideoScenes → 分镜视频列表（页面显示必需）
  // 其他数据（角色、服装、脚本等）由后端在裂变时自行获取，前端不预加载
  const loadProjectData = useCallback(async () => {
    if (!projectId || !token) {
      console.log('未提供 project_id 或 token 参数');
      return;
    }

    setProjectDataLoading(true);
    try {
      // 获取基础项目信息
      const project = await realProjectsApi.getProject(token, projectId);
      console.log('[loadProjectData] getProject 返回:', project);

      // 原视频 URL（从 getProject 获取）
      if (project.exportUrl) {
        setOriginalVideoUrl(project.exportUrl);
        console.log('成功加载原视频 URL:', project.exportUrl);
      } else {
        console.warn('未找到 exportUrl 数据');
      }

      // 角色年龄（用于积分定价）
      if (project.selectedRoleDirection) {
        setSelectedRoleDirection(project.selectedRoleDirection);
      }

      // 从 nrm_step4_video_scenes 获取分镜视频
      try {
        const { scenes } = await realProjectsApi.getStep4VideoScenes(token, projectId);
        if (Array.isArray(scenes) && scenes.length > 0) {
          const clips: ClipVideo[] = scenes
            .filter(s => s.selectedIndex >= 0 && s.clipUrl)
            .map((s, index) => ({
              id: `clip-${index + 1}`,
              url: s.clipUrl!,
              label: `镜像 ${index + 1}`,
            }));
          if (clips.length > 0) {
            setClipVideos(clips);
            console.log(`成功从独立表加载 ${clips.length} 个镜像视频:`, clips.map(c => c.id).join(', '));
          } else {
            console.warn('nrm_step4_video_scenes 无有效的选定视频');
            throw new Error('未找到已生成的分镜视频，请先完成分镜视频生成');
          }
        } else {
          console.warn('nrm_step4_video_scenes 无数据');
          throw new Error('未找到已生成的分镜视频，请先完成分镜视频生成');
        }
      } catch (err) {
        console.error('读取 nrm_step4_video_scenes 失败:', err);
        throw err;
      }
    } catch (error) {
      console.error('加载项目数据失败:', error);
    } finally {
      setProjectDataLoading(false);
      setHasLoadedProjectData(true);
    }
  }, [projectId, token]);

  // 加载裂变视频列表
  const loadFissionVideos = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const videos = await fetchFissionVideos(apiRequest, projectId);
      setFissionVideos(videos);
    } catch (error) {
      console.error('加载裂变视频列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [token, apiRequest, projectId]);

  // 加载裂变状态记录（获取 fissionVideoStatus.id 用于加载 task items）
  const loadFissionVideoStatus = useCallback(async () => {
    if (!token || !projectId) return;
    try {
      const data = await apiRequest<{ success: boolean; records?: FissionVideoStatus[] }>(
        `/fission/status?projectId=${projectId}`,
      );
      if (data.success && data.records && data.records.length > 0) {
        // 取最新一条（按 updatedAt 降序）
        const latest = data.records.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        setFissionVideoStatus(latest);
      }
    } catch (error) {
      console.error('加载裂变状态失败:', error);
    }
  }, [token, apiRequest, projectId]);

  // 已删除：loadFissionVideoStatus（startParallelFission 已自动创建状态记录）
  // prep 任务状态已从 globalTaskQueue 派生（asyncPrepStatus），无需独立轮询

  // 加载背景音乐氛围（自动分析脚本）
  const loadAtmospheres = useCallback(async () => {
    if (!token || !projectId) return;
    try {
      const result = await fetchAtmosphere(apiRequest, projectId);
      if (result.success && result.atmospheres) {
        setAtmospheres(result.atmospheres);
        console.log('氛围:', result.atmospheres.join('、'));
      }
    } catch (error) {
      console.error('加载氛围失败:', error);
    }
  }, [token, apiRequest, projectId]);

  // ========== 初始化加载（合并为单一 useEffect）==========
  useEffect(() => {
    if (!projectId || !token) return;

    // 并行加载页面必需数据
    Promise.all([
      loadProjectData(),
      loadFissionVideos(),
      loadFissionVideoStatus(),
    ]).catch(err => {
      console.error('[Init] 初始化加载失败:', err);
      showToast('页面加载失败，请刷新重试', 'error');
    });
  }, [projectId, token]); // 仅依赖 projectId 和 token，避免 loadXxx 函数变化触发重复加载

  // 当 fissionVideoStatus.id 变化时重置 auto-resume 标记
  // 已完成的项目进入页面时，globalTaskQueue 为空，需要在此主动加载一次 task items
  // 新项目等待 new_story 完成后再加载（由 transition detection 触发）
  useEffect(() => {
    if (!fissionVideoStatus?.id) return;

    let mounted = true;
    setAutoResumeTriggered(false);
    // 只有已完成/部分完成/ready_for_step4 状态才立即加载 task items
    // 新故事还在生成时不加载，等待 new_story 完成
    const completedStates = ['completed', 'partial_complete', 'ready_for_step4', 'combining', 'ready_for_merge'];
    if (completedStates.includes(fissionVideoStatus.status)) {
      loadDbTaskItems().catch(err => {
        if (mounted) {
          console.error('[FissionStatusReady] 加载任务项失败:', err);
          showToast('任务数据加载失败', 'error');
        }
      });
    }
    return () => { mounted = false; };
  }, [fissionVideoStatus?.id, fissionVideoStatus?.status, loadDbTaskItems]);

  // globalTaskQueue 变化时：仅当有 fission 任务且任务状态摘要变化才刷新
  const prevQueueDigestRef = useRef('');
  useEffect(() => {
    const fissionTasks = globalTaskQueue.filter(t => t.projectId === projectId && t.type.startsWith('step6_fission'));
    if (fissionTasks.length === 0 || !fissionVideoStatus?.id) return;

    // 生成状态摘要：id:status 对，变化时才触发
    const digest = fissionTasks.map(t => `${t.id}:${t.status}`).sort().join(',');
    if (digest === prevQueueDigestRef.current) return;
    prevQueueDigestRef.current = digest;

    let mounted = true;

    // new_story 未完成且 task_items 未加载过时，只刷新 status，不加载 task_items
    // task_items 在 new_story 完成后由 transition detection 触发首次加载
    const newStoryCompleted = fissionTasks.some(t => t.type === 'step6_fission_new_story' && t.status === 'completed');
    if (!newStoryCompleted && dbTaskItems.length === 0) {
      loadFissionVideoStatus().catch(err => {
        if (mounted) {
          console.error('[SyncStatus] 同步失败:', err);
          showToast('状态同步失败', 'error');
        }
      });
      return () => { mounted = false; };
    }

    loadDbTaskItems().catch(err => {
      if (mounted) {
        console.error('[SyncTaskItems] 同步失败:', err);
        showToast('任务同步失败', 'error');
      }
    });
    loadFissionVideoStatus().catch(err => {
      if (mounted) {
        console.error('[SyncStatus] 同步失败:', err);
        showToast('状态同步失败', 'error');
      }
    });
    return () => { mounted = false; };
  }, [fissionVideoStatus?.id, globalTaskQueue, projectId, dbTaskItems.length, loadDbTaskItems, loadFissionVideoStatus]);

  // 已删除：状态变化时刷新 loadFissionVideoStatus（由 globalTaskQueue 自动订阅）

  // ========== 交互处理函数 ==========

  // 切换视频选择
  const toggleVideoSelection = useCallback((videoId: string) => {
    setSelectedVideoIds(prev => {
      if (prev.includes(videoId)) {
        return prev.filter(id => id !== videoId);
      } else {
        return [...prev, videoId];
      }
    });
  }, []);

  // 显示消息提示
  const showMessage = useCallback((msg: Message | null) => {
    setMessage(msg);
    if (msg) {
      setTimeout(() => setMessage(null), 3000);
    }
  }, []);

  // 执行裂变操作
  // 取消操作 / 返回项目列表
  const handleCancel = useCallback(() => {
    setFissionCount(3);
    setSelectedVideoIds([]);
    // 跳转到项目列表页
    navigate('/projects');
  }, [navigate]);

  // 通用下载函数：fetch + Blob 方式解决跨域下载问题
  const downloadVideo = useCallback(async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`下载失败: ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      return true;
    } catch (error) {
      console.error('下载视频失败:', error);
      return false;
    }
  }, []);

  // 批量下载（仅下载已选中的视频）
  const handleBatchDownload = useCallback(async () => {
    const videosToDownload = displayVideos.filter(v => selectedVideoIds.includes(v.id));

    if (videosToDownload.length === 0) {
      setMessage({ type: 'error', text: '请先选择要下载的视频' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setMessage({ type: 'info', text: `正在下载 ${videosToDownload.length} 个视频...` });

    let successCount = 0;
    for (let i = 0; i < videosToDownload.length; i++) {
      const video = videosToDownload[i];
      const success = await downloadVideo(video.url, `${video.title}.mp4`);
      if (success) successCount++;
      // 间隔 300ms 避免浏览器阻止
      if (i < videosToDownload.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    setMessage({ type: 'success', text: `成功下载 ${successCount}/${videosToDownload.length} 个视频` });
    setTimeout(() => setMessage(null), 3000);
  }, [displayVideos, selectedVideoIds, downloadVideo]);

  // 批量删除
  const handleBatchDelete = useCallback(async () => {
    if (selectedVideoIds.length === 0) {
      setMessage({ type: 'error', text: '请先选择要删除的视频' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    const confirmed = await confirm(`确定要删除选中的 ${selectedVideoIds.length} 个视频吗？`, '批量删除确认');
    if (!confirmed) {
      return;
    }

    setLoading(true);
    try {
      await Promise.all(
        selectedVideoIds.map(id => deleteFissionVideo(apiRequest, id))
      );
      setMessage({ type: 'success', text: '删除成功' });
      setSelectedVideoIds([]);
      setBatchEditMode(false);
      loadFissionVideos();
    } catch (error) {
      console.error('批量删除失败:', error);
      setMessage({ type: 'error', text: '删除失败' });
    } finally {
      setLoading(false);
    }

    setTimeout(() => setMessage(null), 3000);
  }, [selectedVideoIds, apiRequest, loadFissionVideos, confirm]);

  // 单个视频下载（使用 fetch + Blob 解决跨域问题）
  const handleDownload = useCallback(async (video: VideoCard) => {
    setMessage({ type: 'info', text: '正在下载...' });
    const success = await downloadVideo(video.url, `${video.title}.mp4`);
    if (success) {
      setMessage({ type: 'success', text: '下载成功' });
    } else {
      setMessage({ type: 'error', text: '下载失败' });
    }
    setTimeout(() => setMessage(null), 3000);
  }, [downloadVideo]);

  // 单个视频删除
  const handleDelete = useCallback(async (videoId: string) => {
    const confirmed = await confirm('确定要删除这个视频吗？', '删除确认');
    if (!confirmed) return;

    try {
      await deleteFissionVideo(apiRequest, videoId);
      setMessage({ type: 'success', text: '删除成功' });
      loadFissionVideos();
    } catch (error) {
      console.error('删除失败:', error);
      setMessage({ type: 'error', text: '删除失败' });
    }

    setDeleteMenuVideoId(null);
    setTimeout(() => setMessage(null), 3000);
  }, [apiRequest, loadFissionVideos, confirm]);

  // 完成
  const handleComplete = useCallback(() => {
    setMessage({ type: 'success', text: '裂变流程已完成！' });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  // ========== 音乐氛围识别功能 ==========

  /**
   * 识别音乐氛围
   * 从后端获取分镜脚本数据，调用后端API匹配音乐
   */
  const handleMatchMusicAtmosphere = useCallback(async () => {
    if (!projectId || !token) {
      showMessage({ type: 'error', text: '缺少项目ID或未登录' });
      return;
    }

    setMusicAtmosphereLoading(true);
    setMusicAtmosphereResult(null);

    try {
      // 从后端获取分镜脚本数据
      const { segments } = await realProjectsApi.getStep4ScriptSegments(token, projectId);

      if (!segments || segments.length === 0) {
        showMessage({ type: 'error', text: '未找到分镜脚本数据' });
        setMusicAtmosphereLoading(false);
        return;
      }

      // 从分镜脚本中拼接文本
      const scriptText = segments
        .map(s => s.content)
        .filter(Boolean)
        .join('\n') || '';

      if (!scriptText) {
        showMessage({ type: 'error', text: '未找到故事脚本数据' });
        setMusicAtmosphereLoading(false);
        return;
      }

      console.log('[MatchMusicAtmosphere] 脚本文本长度:', scriptText.length);

      // 调用后端API匹配音乐
      const result = await matchMusicByScript(apiRequest, scriptText);
      console.log('[MatchMusicAtmosphere] 匹配结果:', result);

      setMusicAtmosphereResult(result);

      if (result.success && result.music) {
        // 成功匹配后自动设置用户选择的背景音乐
        const matchedMusic: VideoMusicInfo = {
          id: result.music.id,
          title: result.music.title || '未知音乐',
          musicUrl: result.music.musicUrl || result.musicUrl || '',
          atmospheres: result.music.atmospheres || [],
          duration: null,
        };
        setSelectedMusic(matchedMusic);
        showMessage({
          type: 'success',
          text: result.usedDefault
            ? `匹配完成（使用默认氛围: ${result.matchedAtmosphere || '未知'}）`
            : `匹配成功: ${result.matchedAtmosphere || '未知'}氛围`,
        });
      } else if (result.success) {
        showMessage({
          type: 'success',
          text: result.usedDefault
            ? `匹配完成（使用默认氛围: ${result.matchedAtmosphere || '未知'}）`
            : `匹配成功: ${result.matchedAtmosphere || '未知'}氛围`,
        });
      } else {
        showMessage({ type: 'error', text: result.error || '匹配失败' });
      }
    } catch (error) {
      console.error('[MatchMusicAtmosphere] 匹配音乐失败:', error);
      const errorMessage = error instanceof Error ? error.message : '匹配音乐失败';
      showMessage({ type: 'error', text: errorMessage });
      setMusicAtmosphereResult({
        success: false,
        musicUrl: null,
        music: null,
        matchedAtmosphere: null,
        usedDefault: false,
        error: errorMessage,
      });
    } finally {
      setMusicAtmosphereLoading(false);
    }
  }, [projectId, token, apiRequest, showMessage]);

  /**
   * 根据分镜列表和背景音乐合并视频
   * @param storyboardList 分镜列表
   * @param backgroundMusic 背景音乐（可选）
   * @returns 合并后的视频 Blob、URL、时长和封面图片URL
   */
  const comVideoByStoryboard = useCallback(async (
    storyboardList: Array<{ storyboardUrl: string; storyboardFlag: string }>,
    backgroundMusic?: { url: string }
  ): Promise<{ blob: Blob; url: string; duration: number } | null> => {
    // 检查浏览器支持
    const support = await checkVideoMergeSupport();
    if (!support.supported) {
      setMessage({ type: 'error', text: support.reason || '浏览器不支持视频合并' });
      setTimeout(() => setMessage(null), 3000);
      return null;
    }

    setMergeVideoLoading(true);
    setMergeVideoProgress({ percent: 0, message: '准备合并视频...' });

    try {
      // 直接传递视频 URL，mergeProjectVideos 内部会通过 downloadRemoteVideos 自动处理代理下载
      const videoUrls = storyboardList.map(s => s.storyboardUrl);

      if (videoUrls.length === 0) {
        throw new Error('没有可用的分镜视频');
      }

      // 背景音乐：直接传递 URL，mergeProjectVideos 内部会自动处理
      const backgroundAudio = backgroundMusic?.url ? { source: backgroundMusic.url } : undefined;

      console.log(`[MergeVideo] 开始合并视频: ${videoUrls.length} 个视频`);

      // 调用封装的合并方法（转场3秒、随机）
      // mergeProjectVideos -> mergeVideosWithTransitions -> downloadRemoteVideos -> rewriteToProxyUrl
      // 自动将 OSS URL 重写为后端代理 URL，避免 CORS 问题
      const result = await mergeProjectVideos({
        videos: videoUrls,
        backgroundAudio,
        onProgress: (percent, message) => {
          setMergeVideoProgress({ percent, message });
        },
      });

      setMergeVideoProgress({ percent: 100, message: '合并完成！' });
      console.log(`[MergeVideo] 合并完成, 输出大小: ${(result.blob.size / 1024 / 1024).toFixed(2)} MB`);

      return result;
    } catch (error) {
      console.error('[MergeVideo] 合并失败:', error);
      setMessage({ type: 'error', text: `合并视频失败: ${error}` });
      setTimeout(() => setMessage(null), 3000);
      return null;
    } finally {
      setMergeVideoLoading(false);
      // 延迟清除进度提示
      setTimeout(() => setMergeVideoProgress(null), 2000);
    }
  }, [token, projectId]);

  /**
   * 第一步：获取分镜和背景音乐列表
   * 调用 API 获取分镜组合列表
   */
  const fetchStoryboardsWithMusic = useCallback(async (): Promise<StoryboardCombination[] | null> => {
    if (!projectId) {
      setMessage({ type: 'error', text: '缺少项目ID' });
      setTimeout(() => setMessage(null), 3000);
      return null;
    }

    setCombinationsLoading(true);
    setGeneratedVideos([]);

    try {
      const result = await fetchStoryboardCombinations(apiRequest, projectId, fissionCount, false);

      if (result.success && result.data && result.data.length > 0) {
        setCombinations(result.data);
        setMessage({ type: 'success', text: `查询成功，共 ${result.data.length} 个组合` });
        setTimeout(() => setMessage(null), 3000);
        return result.data;
      } else if (result.success && result.data && result.data.length === 0) {
        setCombinations([]);
        setMessage({ type: 'error', text: '查询成功，但没有找到分镜组合' });
        setTimeout(() => setMessage(null), 5000);
        return null;
      } else {
        setCombinations([]);
        setMessage({ type: 'error', text: result.message || '查询分镜组合失败' });
        setTimeout(() => setMessage(null), 5000);
        return null;
      }
    } catch (error) {
      console.error('[Combinations] 查询失败:', error);
      setCombinations([]);
      setMessage({ type: 'error', text: `查询分镜组合失败: ${error}` });
      setTimeout(() => setMessage(null), 5000);
      // 重新抛出异常，让调用方感知失败
      throw error;
    } finally {
      setCombinationsLoading(false);
    }
  }, [projectId, fissionCount, apiRequest]);

  /**
   * 第二步：使用前端方法合并视频
   * 遍历组合列表，为每个组合调用前端合并方法（comVideoByStoryboard）
   * 包含随机转场效果
   */
  const mergeCombinationVideos = useCallback(async (combinationList: StoryboardCombination[]) => {
    if (!combinationList || combinationList.length === 0) {
      setMessage({ type: 'error', text: '没有可合并的分镜组合' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setCombinationsLoading(true);
    setMergeVideoProgress({ percent: 0, message: '开始生成视频...' });

    const generatedResults: typeof generatedVideos = [];
    const totalCombinations = combinationList.length;

    try {
      for (let i = 0; i < totalCombinations; i++) {
        const combination = combinationList[i];
        const progressPercent = Math.floor(10 + (i / totalCombinations) * 80);
        setMergeVideoProgress({
          percent: progressPercent,
          message: `处理组合 ${i + 1}/${totalCombinations}...`,
        });

        try {
          const storyboardList = combination.storyboardList || [];
          // 优先使用用户选择的背景音乐，未选择则使用后端自动匹配的音乐
          const backgroundMusic = selectedMusic || combination.backgroundMusics?.[0];

          console.log('[MergeVideo] 组合:', combination.combinationId, '背景音乐:', backgroundMusic, '用户选择:', !!selectedMusic);

          if (storyboardList.length === 0) {
            generatedResults.push({
              combinationId: combination.combinationId,
              success: false,
              message: '分镜列表为空',
            });
            continue;
          }

          // 调用前端合并方法（包含随机转场）
          const mergeResult = await comVideoByStoryboard(
            storyboardList.map(s => ({ storyboardUrl: s.storyboardUrl, storyboardFlag: s.storyboardFlag })),
            backgroundMusic?.musicUrl ? { url: backgroundMusic.musicUrl } : undefined
          );

          if (mergeResult) {
            // 转场信息：使用 FreeCut 帧数模式
            const transitionType = 'random';
            const transitionDurationFrames = 90; // 90帧 = 3秒 @ 30fps (FreeCut模式)

            // 上传并保存到服务器
            const uploadResult = await uploadComVideo(apiRequest, {
              projectId: projectId || '',
              videoBlob: mergeResult.blob,
              combinationId: combination.combinationId,
              combinationType: combination.combinationType,
              storyboardUrls: storyboardList.map(s => s.storyboardUrl),
              transitionType,
              transitionDurationFrames,  // FreeCut 帧数模式
              audioUrl: backgroundMusic?.musicUrl,
              durationSec: mergeResult.duration,
              speed: 1.0,
            });

            generatedResults.push({
              combinationId: combination.combinationId,
              videoUrl: uploadResult.success ? uploadResult.videoUrl : mergeResult.url,
              success: uploadResult.success,
              message: uploadResult.success ? undefined : uploadResult.message,
            });

            // 关键：每成功上传一个视频，立即刷新列表显示 + 递减加载占位数量
            if (uploadResult.success) {
              console.log('[MergeVideo] 视频上传成功，立即刷新显示:', combination.combinationId);
              await loadFissionVideos();
              setLoadingVideoCount(prev => Math.max(0, prev - 1));
            }
          } else {
            generatedResults.push({
              combinationId: combination.combinationId,
              success: false,
              message: '合并失败',
            });
          }
        } catch (error) {
          console.error(`[MergeVideo] 处理组合 ${combination.combinationId} 失败:`, error);
          generatedResults.push({
            combinationId: combination.combinationId,
            success: false,
            message: String(error),
          });
        }
      }

      setGeneratedVideos(generatedResults);
      const successCount = generatedResults.filter(v => v.success).length;
      setMergeVideoProgress({ percent: 100, message: `完成！成功 ${successCount}/${totalCombinations}` });
      setMessage({ type: 'success', text: `生成完成！共 ${successCount}/${totalCombinations} 个视频` });
      loadFissionVideos();

      // 标记裂变完成，更新状态为 completed
      if (successCount > 0 && token && projectId) {
        try {
          await realProjectsApi.completeFission(token, projectId);
          console.log('[Combinations] 裂变状态已更新为 completed');
          // 立即刷新前端状态，避免刷新页面后 still 看到 ready_for_merge
          await loadFissionVideoStatus();
        } catch (error) {
          console.error('[Combinations] 更新裂变状态失败:', error);
        }
      }
    } catch (error) {
      console.error('[Combinations] 合并视频失败:', error);
      setMessage({ type: 'error', text: `合并视频失败: ${error}` });
    } finally {
      setCombinationsLoading(false);
      setTimeout(() => {
        setMergeVideoProgress(null);
        setMessage(null);
      }, 5000);
    }
  }, [comVideoByStoryboard, loadFissionVideos, loadFissionVideoStatus, apiRequest, projectId, selectedMusic, token]);

  /**
   * 查询分镜组合并合并视频
   * 简化为两个步骤：1.获取分镜和背景音乐列表 2.前端合并视频
   */
  const handleQueryCombinations = useCallback(async (_autoGenerate?: boolean) => {
    // 开始生成时设置加载中的视频数量
    setLoadingVideoCount(fissionCount);
    try {
      // 第一步：获取分镜和背景音乐列表
      const combinationList = await fetchStoryboardsWithMusic();
      if (!combinationList) {
        setLoadingVideoCount(0);
        return;
      }

      // 第二步：使用前端方法合并视频
      await mergeCombinationVideos(combinationList);
    } finally {
      // 无论成功或失败，都清除加载状态
      setLoadingVideoCount(0);
    }
  }, [fetchStoryboardsWithMusic, mergeCombinationVideos, fissionCount]);

  /**
   * 执行组合+合并流程
   * 1. 调用 getCombinations 获取分镜组合
   * 2. 下载分镜视频
   * 3. 合并视频
   * 4. 上传到服务器
   */
  const executeCombinationAndMerge = useCallback(async () => {
    console.log('[ExecuteCombination] 开始执行组合+合并流程');

    try {
      setMergeVideoProgress({ percent: 0, message: '获取分镜组合...' });
      const combinationList = await fetchStoryboardCombinations(apiRequest, projectId, fissionCount, false);

      if (!combinationList.success) {
        throw new Error(combinationList.message || '获取分镜组合失败');
      }

      // 已有视频直接跳过，刷新列表即可
      if (combinationList.existingVideos && combinationList.existingVideos.length > 0) {
        console.log('[ExecuteCombination] 已有视频:', combinationList.existingVideos.length, '个');
      }

      // 有待合并的组合就执行
      if (combinationList.data && combinationList.data.length > 0) {
        console.log('[ExecuteCombination] 待合并组合:', combinationList.data.length, '个');
        await mergeCombinationVideos(combinationList.data);
      } else {
        // 无组合可用
        console.log('[ExecuteCombination] 无可合并的组合');
        await loadFissionVideos();
        await loadFissionVideoStatus();
        return;
      }

      console.log('[ExecuteCombination] 组合+合并流程完成');
    } catch (error) {
      console.error('[ExecuteCombination] 执行失败:', error);
      throw error;
    }
  }, [apiRequest, projectId, fissionCount, fetchStoryboardCombinations, mergeCombinationVideos, loadFissionVideos, loadFissionVideoStatus]);

  // 页面加载/状态变化时检查：只提示用户，不自动触发合并
  useEffect(() => {
    const status = fissionVideoStatus?.status;

    // partial_complete 状态：提示用户选择重试或继续
    if (status === 'partial_complete' && !autoResumeTriggered) {
      setAutoResumeTriggered(true);
      showMessage({ type: 'info', text: '部分任务失败，请选择重试失败项或直接合并' });
    }
  }, [fissionVideoStatus, autoResumeTriggered, showMessage]);

  // 并行裂变完成：设置确认弹窗并提示用户
  useEffect(() => {
    if (!parallelFissionStarted) return;

    // 超时保护：10 分钟未进入终态则强制重置
    const timeoutMs = 10 * 60 * 1000;
    if (Date.now() - parallelFissionStarted > timeoutMs) {
      console.warn('[ParallelFission] 超时保护触发，强制重置 loading');
      setParallelFissionStarted(null);
      setGenerateVideoLoading(false);
      showMessage({ type: 'error', text: '裂变任务超时，请刷新页面或重新尝试' });
      return;
    }

    const status = fissionVideoStatus?.status;

    if (status === 'ready_for_merge' || status === 'ready_for_step4') {
      // 清除触发标记
      setParallelFissionStarted(null);
      setGenerateVideoLoading(false);
      // 设置确认弹窗：ready_for_merge 状态下用户点击按钮需要确认后才合并
      setPendingMergeConfirm(true);
      showMessage({ type: 'info', text: '分镜视频生成完成，请点击"开始合并"' });
    } else if (status === 'completed') {
      // completed 状态：清除触发标记（已有视频时不弹窗，无视频时按钮显示异常）
      setParallelFissionStarted(null);
      setGenerateVideoLoading(false);
      // completed + 无视频：异常状态，不弹窗
      // completed + 有视频：显示"再次裂变"，用户可手动触发
      const completedVideoCount = fissionVideos.filter(v => v.status === 'completed' || v.videoPath).length;
      if (completedVideoCount === 0) {
        showMessage({ type: 'info', text: '裂变完成但无视频，请检查状态' });
      } else {
        showMessage({ type: 'success', text: '裂变完成，可继续裂变更多视频' });
      }
    } else if (status === 'partial_complete') {
      setParallelFissionStarted(null);
      setGenerateVideoLoading(false);
      showMessage({ type: 'info', text: '部分任务失败，请选择重试失败项或直接合并' });
    } else if (asyncPrepStatus && (asyncPrepStatus.newStoryAsyncStatus === 'failed' || asyncPrepStatus.shotPromptsAsyncStatus === 'failed')) {
      // 异步准备任务失败（如积分不足导致 new_story/shot_prompts 执行器失败）
      // 仅当状态是启动后新增的 failed 才触发（防止旧 failed 快照误触发）
      const snapshot = asyncPrepStatusAtStartRef.current;
      const newStoryNewlyFailed = asyncPrepStatus.newStoryAsyncStatus === 'failed' && snapshot?.newStoryAsyncStatus !== 'failed';
      const shotPromptsNewlyFailed = asyncPrepStatus.shotPromptsAsyncStatus === 'failed' && snapshot?.shotPromptsAsyncStatus !== 'failed';
      if (newStoryNewlyFailed || shotPromptsNewlyFailed) {
        setParallelFissionStarted(null);
        setGenerateVideoLoading(false);
        const errorMsg = asyncPrepStatus.asyncErrorMessage || '';
        const isCreditError = errorMsg.includes('积分不足') || errorMsg.includes('INSUFFICIENT');
        const failedPart = newStoryNewlyFailed ? '新故事' : '提示词';
        showMessage({
          type: 'error',
          text: isCreditError
            ? '积分不足，请先充值或联系管理员。'
            : `${failedPart}生成失败${errorMsg ? `：${errorMsg}` : ''}`,
        });
      }
    }
  }, [fissionVideoStatus, parallelFissionStarted, showMessage, fissionVideos, asyncPrepStatus]);

  /**
   * 继续裂变/补齐失败项
   * 根据当前 fissionVideoStatus 决定行为：
   * - ready_for_merge → 直接执行合并
   * - partial_complete → 调用 resume 补齐失败项后合并
   */
  const handleContinueFissionNew = useCallback(async () => {
    if (generateVideoLoading) {
      showMessage({ type: 'error', text: '正在执行中，请勿重复点击' });
      return;
    }

    if (!token || !projectId) {
      showMessage({ type: 'error', text: '未登录或缺少项目ID' });
      return;
    }

    const status = fissionVideoStatus?.status;
    const canMergeNow = status === 'ready_for_merge';

    if (canMergeNow) {
      // 前置任务已完成，直接合并
      setGenerateVideoLoading(true);
      setMergeVideoLoading(true);
      setMergeVideoProgress({ percent: 0, message: '准备合并...' });
      try {
        await executeCombinationAndMerge();
        showMessage({ type: 'success', text: '裂变合并完成！' });
      } catch (error) {
        console.error('[ContinueFission] 合并失败:', error);
        showMessage({ type: 'error', text: `合并失败: ${error instanceof Error ? error.message : String(error)}` });
      } finally {
        setGenerateVideoLoading(false);
        setMergeVideoLoading(false);
        setLoadingVideoCount(0);
      }
      return;
    }

    // 需要补齐：触发 resume
    setGenerateVideoLoading(true);
    setGenerateVideoProgress(0);
    setLoadingVideoCount(fissionCount);

    try {
      const result = await apiRequest<{ success: boolean; resumedCount: number; message?: string }>('/fission/resume', {
        method: 'POST',
        body: { projectId },
      });

      // resume 返回 0：没有待处理任务 → 前置已完成，立即合并
      if (result.resumedCount === 0) {
        console.log('[ContinueFission] resume 返回 0，前置已完成，直接合并');
        setMergeVideoLoading(true);
        setMergeVideoProgress({ percent: 0, message: '准备合并...' });
        try {
          await executeCombinationAndMerge();
          showMessage({ type: 'success', text: '裂变合并完成！' });
        } catch (mergeError) {
          console.error('[ContinueFission] 合并失败:', mergeError);
          showMessage({ type: 'error', text: `合并失败: ${mergeError instanceof Error ? mergeError.message : String(mergeError)}` });
        } finally {
          setGenerateVideoLoading(false);
          setMergeVideoLoading(false);
          setLoadingVideoCount(0);
        }
        return;
      }

      showMessage({ type: 'info', text: '已触发裂变任务，请等待...' });
      // 刷新裂变状态，确保 useEffect 看到的是 parallel_running 而非旧的 failed/partial_complete
      await loadFissionVideoStatus();
      // 设置启动标记，触发完成检测 effect（处理异步任务失败时重置 loading）
      const currentAsyncPrep = asyncPrepStatusRef.current;
      asyncPrepStatusAtStartRef.current = currentAsyncPrep
        ? { newStoryAsyncStatus: currentAsyncPrep.newStoryAsyncStatus, shotPromptsAsyncStatus: currentAsyncPrep.shotPromptsAsyncStatus }
        : null;
      setParallelFissionStarted(Date.now());
    } catch (error) {
      console.error('[RetryFission] 触发失败:', error);
      showMessage({ type: 'error', text: `触发失败: ${error}` });
      setGenerateVideoLoading(false);
      setLoadingVideoCount(0);
    }
  }, [
    generateVideoLoading,
    token,
    projectId,
    fissionCount,
    fissionVideoStatus,
    fissionVideos,
    apiRequest,
    showMessage,
    executeCombinationAndMerge,
    loadFissionVideoStatus,
  ]);

  /**
   * 部分完成时直接合并成功的任务项
   * 调用 /fission/merge-partial 生成组合方案，然后触发合并
   */
  const handleMergePartial = useCallback(async () => {
    if (generateVideoLoading) {
      showMessage({ type: 'error', text: '正在执行中，请勿重复点击' });
      return;
    }

    if (!token || !projectId) {
      showMessage({ type: 'error', text: '未登录或缺少项目ID' });
      return;
    }

    setGenerateVideoLoading(true);
    setMergeVideoLoading(true);
    setMergeVideoProgress({ percent: 0, message: '准备合并...' });

    try {
      const result = await apiRequest<{ success: boolean; completedCount: number; combinationCount: number; message?: string }>('/fission/merge-partial', {
        method: 'POST',
        body: { projectId },
      });

      showMessage({ type: 'info', text: result.message || `已用 ${result.completedCount} 个成功项生成组合` });

      // 状态已更新为 ready_for_merge，触发合并
      await executeCombinationAndMerge();
      showMessage({ type: 'success', text: '裂变合并完成！' });
    } catch (error) {
      showMessage({ type: 'error', text: `合并失败: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setGenerateVideoLoading(false);
      setMergeVideoLoading(false);
      setLoadingVideoCount(0);
    }
  }, [generateVideoLoading, token, projectId, apiRequest, showMessage, executeCombinationAndMerge]);

  /**
   * 设置选中的分镜组合
   */
  const setSelectedCombination = useCallback((combination: StoryboardCombination | null) => {
    setSelectedCombinationState(combination);
  }, []);

  // ========== 同步裂变流程（新版）==========

  /**
   * 并行裂变流程（非阻塞版）
   * 第一步：整理镜像（同步）
   * 第二步：调用并行裂变 API（后台异步执行图生视频 + 新故事）
   * 完成后通过 useEffect 自动检测并执行组合合并
   * 后端自动计算 imageVideoCount 和 newStoryCount
   * @param selectedCount 用户选择的裂变数量（直接传入，绕过状态更新延迟）
   */
  const handleParallelFission = useCallback(async (selectedCount?: number) => {
    // 使用传入的数量或当前状态值
    const targetCount = selectedCount ?? fissionCount;

    // 防止重复点击
    if (generateVideoLoading) {
      showMessage({ type: 'error', text: '正在执行中，请勿重复点击' });
      return;
    }

    if (!token || !projectId) {
      showMessage({ type: 'error', text: '未登录或缺少项目ID' });
      return;
    }

    setGenerateVideoLoading(true);
    setGenerateVideoProgress(0);
    setLoadingVideoCount(targetCount);

    try {
      // ===== 积分余额预检查 =====
      const fissionCostMap: Record<number, number> = { 3: 5, 6: 10, 9: 13, 12: 15 };
      const requiredAmount = fissionCostMap[targetCount] ?? 10;
      try {
        const { sufficient } = await checkCreditsBalance(token, requiredAmount);
        if (!sufficient) {
          showMessage({ type: 'error', text: '积分不足，请先充值或联系管理员。' });
          setGenerateVideoLoading(false);
          return;
        }
      } catch (error) {
        showMessage({ type: 'error', text: resolveProjectFlowCreditSpendErrorMessage(error, '积分信息读取失败，请稍后重试。') });
        setGenerateVideoLoading(false);
        return;
      }

      // ===== 步骤1已废弃：整理镜像（分镜数据改用 task_items，后端自动处理）=====

      // ===== 步骤2：启动并行裂变（后台异步执行）=====
      setGenerateVideoProgress(12);
      showMessage({ type: 'info', text: '正在启动并行任务...' });

      console.log('[ParallelFission] 启动并行裂变:', { projectId });

      // 后端自动计算 imageVideoCount 和 newStoryCount
      const result = await realProjectsApi.startParallelFission(token, {
        projectId,
      });

      if (!result.success || !result.fissionVideoStatusId) {
        throw new Error(result.message || '启动并行裂变失败');
      }

      // ===== 积分扣减：任务启动成功后扣减 =====
      const fissionOperationMap: Record<number, string> = {
        3: 'fission_3',
        6: 'fission_6',
        9: 'fission_9',
        12: 'fission_12',
      };
      // 积分扣减：任务启动后扣减
      // 注意：后端 executor 已通过冻结机制扣费，此处无需重复扣费
      // 冻结机制在 generateImageToVideo 中执行：freeze → deductFrozen
      // RouteKey: fission_video_generation_child/adult（根据角色年龄自动选择）
      console.log('[ParallelFission] 并行裂变已启动，状态ID:', result.fissionVideoStatusId);

      // 加载 fissionVideoStatus（设置 id，使后续 SSE 驱动的 effect 可以正常运行）
      await loadFissionVideoStatus();

      // 设置启动标记，触发完成检测 effect
      const currentAsyncPrep = asyncPrepStatusRef.current;
      asyncPrepStatusAtStartRef.current = currentAsyncPrep
        ? { newStoryAsyncStatus: currentAsyncPrep.newStoryAsyncStatus, shotPromptsAsyncStatus: currentAsyncPrep.shotPromptsAsyncStatus }
        : null;
      setParallelFissionStarted(Date.now());

      setGenerateVideoProgress(15);
      showMessage({ type: 'info', text: '任务执行中，请等待完成...' });

    } catch (error) {
      console.error('[ParallelFission] 启动失败:', error);
      showMessage({ type: 'error', text: `裂变失败: ${error instanceof Error ? error.message : String(error)}` });
      setGenerateVideoLoading(false);
    }
  }, [
    projectId,
    token,
    generateVideoLoading,
    showMessage,
    clipVideos,
    asyncPrepStatus,
    loadFissionVideoStatus,
  ]);

  // ========== 自动生成视频流程 ==========

  /**
   * 自动执行裂变流程
   * 调用 handleParallelFission（非阻塞并行 API + 前端轮询检测完成）
   * @param selectedCount 用户选择的裂变数量（直接传入，绕过状态更新延迟）
   */
  const handleGenerateVideo = useCallback(async (selectedCount?: number) => {
    // 防止重复点击
    if (generateVideoLoading) {
      setMessage({ type: 'error', text: '正在执行中，请勿重复点击' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    // 使用新的并行裂变流程
    await handleParallelFission(selectedCount);
  }, [generateVideoLoading, handleParallelFission]);

  // 清理资源（无需清理镜像视频，已移除前端处理）

  return {
    // URL 参数
    projectId,

    // 状态
    clipVideos,
    projectDataLoading,
    hasLoadedProjectData,
    originalVideoUrl,
    selectedRoleDirection,  // 角色年龄（用于积分定价）
    fissionCount,
    selectedVideoIds,
    fissionVideos,
    displayVideos,
    loading,
    message,
    batchEditMode,
    deleteMenuVideoId,
    fissionVideoStatus,
    atmospheres,

    // 异步任务状态（从 globalTaskQueue 派生）
    asyncPrepStatus,
    asyncPrepLoading,

    // 分镜任务项进度（从 globalTaskQueue 派生，用于 FissionTaskGrid）
    taskItemsData,

    // 分镜组合相关
    combinations,
    combinationsLoading,
    selectedCombination,
    generatedVideos,

    // 合并视频相关
    mergeVideoLoading,
    mergeVideoProgress,

    // 加载中的视频数量
    loadingVideoCount,

    // 自动生成视频流程
    generateVideoLoading,
    generateVideoProgress,

    // 音乐氛围识别
    musicAtmosphereLoading,
    musicAtmosphereResult,

    // 裂变数量控制
    availableFissionOptions,
    canFission,
    mirrorStatusMessage,
    fissionButtonState,

    // 操作方法
    setFissionCount,
    setBatchEditMode,
    setDeleteMenuVideoId,
    setSelectedVideoIds,
    toggleVideoSelection,
    showMessage,
    handleCancel,
    handleBatchDownload,
    handleBatchDelete,
    handleDownload,
    handleDelete,
    handleContinueFissionNew,
    handleMergePartial,
    handleComplete,
    loadFissionVideos,
    // 已删除：loadFissionVideoStatus（由 globalTaskQueue 自动订阅）
    handleQueryCombinations,
    setSelectedCombination,
    handleGenerateVideo,
    handleMatchMusicAtmosphere,
    selectedMusic,
    setSelectedMusic,

    // 合并确认弹窗
    pendingMergeConfirm,
    confirmMerge: () => {
      setPendingMergeConfirm(false);
      setGenerateVideoLoading(true);
      setGenerateVideoProgress(0);
      showMessage({ type: 'info', text: '正在合并视频...' });
      executeCombinationAndMerge()
        .then(() => {
          showMessage({ type: 'success', text: '裂变完成！' });
        })
        .catch((error) => {
          console.error('[ConfirmMerge] 合并失败:', error);
          showMessage({ type: 'error', text: `合并失败: ${error instanceof Error ? error.message : String(error)}` });
        })
        .finally(() => {
          setGenerateVideoLoading(false);
          setLoadingVideoCount(0);
        });
    },
    cancelMerge: () => {
      setPendingMergeConfirm(false);
      // 不重置 autoResumeTriggered，避免取消后立即再次弹窗
      // 用户可通过主按钮手动触发合并
    },

  };
};

// ========== 并行执行相关 Hook ==========

/** 任务进度统计 */
export interface TaskProgress {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  processing: number;
}

/** 分镜项进度信息 */
export interface StoryboardItemProgress {
  itemIndex: number;
  taskType: 'image_video' | 'new_story';
  imageStatus: 'pending' | 'processing' | 'completed' | 'failed';
  videoStatus: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl: string | null;
  videoUrl: string | null;
  imageErrorMessage: string | null;
  videoErrorMessage: string | null;
  retryCount: number;
}

/** 任务进度详情 */
export interface TaskProgressDetail {
  imageVideo: TaskProgress;
  newStory: TaskProgress;
  items: StoryboardItemProgress[];
}

/** 并行裂变进度响应 */
export interface FissionProgressResponse {
  success: boolean;
  status: string;
  progress: TaskProgressDetail;
}

/**
 * 启动并行裂变任务
 */
export function useStartParallelFission() {
  const token = useAppStore((state) => state.token);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startParallelFission = useCallback(async (params: {
    projectId: string;
    imageVideoCount: number;
    newStoryCount: number;
  }) => {
    if (!token) throw new Error('未登录');
    setLoading(true);
    setError(null);
    try {
      const data = await realProjectsApi.startParallelFission(token, params);
      setLoading(false);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '启动并行裂变失败';
      setError(errorMessage);
      setLoading(false);
      throw err;
    }
  }, [token]);

  return { startParallelFission, loading, error };
}

// 已删除：useFissionProgress hook（前端已改用 globalTaskQueue 订阅）

/**
 * 重试失败项
 */
export function useRetryFailedItems() {
  const token = useAppStore((state) => state.token);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retryFailedItems = useCallback(async (params: {
    projectId: string;
    taskType: 'image_video' | 'new_story';
    itemIds?: string[];
  }) => {
    if (!token) throw new Error('未登录');
    setLoading(true);
    setError(null);
    try {
      const data = await realProjectsApi.retryFailedItems(token, params);
      setLoading(false);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '重试失败';
      setError(errorMessage);
      setLoading(false);
      throw err;
    }
  }, [token]);

  return { retryFailedItems, loading, error };
}

/**
 * 恢复卡住的 pending 任务
 */
export function useResumePendingTasks() {
  const token = useAppStore((state) => state.token);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resumePendingTasks = useCallback(async (params: { projectId: string }) => {
    if (!token) throw new Error('未登录');
    setLoading(true);
    setError(null);
    try {
      const data = await realProjectsApi.resumePendingTasks(token, params);
      setLoading(false);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '恢复任务失败';
      setError(errorMessage);
      setLoading(false);
      throw err;
    }
  }, [token]);

  return { resumePendingTasks, loading, error };
}
