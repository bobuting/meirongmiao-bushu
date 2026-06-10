/**
 * Step 6 视频裂变页面
 * 在项目流程布局内渲染，不包含 Layout 组件
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '../../../components/ui/Button';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { useAppStore } from '../../../store/useAppStore';
import { FullScreenLoading } from '../../../components/shared/FullScreenLoading';
import { VideoPreviewModal } from '../../../components/shared/VideoPreviewModal';
import { useFissionVideo, useRetryFailedItems, useResumePendingTasks } from '../../fission/useFissionVideo';
import {
  FissionTaskGrid,
} from '../../fission/components';
import { StepContentHeader } from '../../../components/project-flow/StepContentHeader';
import {
  DEFAULT_PROJECT_FLOW_CREDIT_PRICING,
  loadProjectFlowCreditPricing,
  spendProjectFlowCredits,
  resolveProjectFlowCreditSpendErrorMessage,
  checkCreditsBalance,
  selectCreditCostByAge,
} from '../projectFlowCredit';
import type { ProjectFlowCreditPricing } from '../projectFlowCredit';
import {
  ProjectFlowHistorySidebar,
  type StoryboardFrame,
  type VideoClipItem,
} from '../../../components/project-flow';
import { getOssVideoSnapshotUrl } from '../../../utils/ossImage';

// ==================== 配置开关 ====================

// ==================== 工具函数 ====================

// ==================== 主组件 ====================

export const Step6FissionScreen: React.FC = () => {
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams<{ projectId: string }>();
  // Step6 页面不依赖 useProjectState 的 6 个 API，改用 useFissionVideo 的数据
  // useFissionVideo 内部会加载必要的项目数据（exportUrl、角色、服装等）

  // 使用全局确认对话框
  const { confirm } = useConfirm();

  const {
    projectId,
    clipVideos,
    projectDataLoading,
    hasLoadedProjectData,
    originalVideoUrl,
    selectedRoleDirection,  // 角色年龄（用于积分定价）
    fissionCount,
    displayVideos,
    fissionVideos,
    fissionVideoStatus,
    selectedVideoIds,
    batchEditMode,
    deleteMenuVideoId,
    generateVideoLoading,
    generateVideoProgress,
    loadingVideoCount,
    mergeVideoProgress,
    setFissionCount,
    setBatchEditMode: _setBatchEditMode,
    setDeleteMenuVideoId,
    setSelectedVideoIds,
    toggleVideoSelection,
    showMessage,
    handleBatchDownload,
    handleBatchDelete: _handleBatchDelete,
    handleDownload,
    handleDelete,
    handleGenerateVideo,
    handleContinueFissionNew,
    handleMergePartial,
    // 裂变数量控制
    availableFissionOptions,
    canFission,
    mirrorStatusMessage,
    fissionButtonState,
    // 分镜任务项进度（用于 FissionTaskGrid）
    taskItemsData,
    // 合并确认弹窗
    pendingMergeConfirm,
    confirmMerge,
    cancelMerge,
  } = useFissionVideo();

  // 已完成的视频列表（排除 loading 状态）
  const completedVideos = useMemo(() => displayVideos.filter(v => !v.loading), [displayVideos]);

  // 已删除：useFissionProgress（改用 globalTaskQueue 订阅）
  const { retryFailedItems, loading: retryLoading } = useRetryFailedItems();
  const { resumePendingTasks, loading: resumeLoading } = useResumePendingTasks();
  const userToken = useAppStore((s) => s.token);

  // 积分定价（必须在 handleRetryTask/handleRetryAllTasks 之前声明）
  const [creditPricing, setCreditPricing] = useState<ProjectFlowCreditPricing>(DEFAULT_PROJECT_FLOW_CREDIT_PRICING);
  useEffect(() => {
    loadProjectFlowCreditPricing(userToken).then(setCreditPricing);
  }, [userToken]);

  // 当 globalTaskQueue 中裂变相关任务状态变化时，刷新视频列表
  const globalTaskQueue = useAppStore((state) => state.globalTaskQueue);
  const fissionJobStatuses = useMemo(
    () => globalTaskQueue
      .filter((t) => t.projectId === projectId && t.type.startsWith('step6_fission'))
      .map((t) => `${t.type}:${t.status}`)
      .join(','),
    [globalTaskQueue, projectId],
  );

  // globalTaskQueue 状态变化时触发 loadFissionVideos（通过 useFissionVideo 内部机制）
  // 不再需要手动刷新进度

  const _videoPlayerRef = useRef<HTMLVideoElement>(null);
  const fissionResultRef = useRef<HTMLDivElement>(null);

  // 合并相关状态
  const [mergeLoading, setMergeLoading] = useState(false);

  // 已删除：进度详情显示（useFissionProgress 和相关 useMemo）
  // 任务状态通过 globalTaskQueue 订阅，视频列表通过 loadFissionVideos 获取
  // 用户可等待任务完成后查看生成的视频

  // 根据 fissionCount 映射裂变 operation（仅支持 6 和 12 两档）
  const fissionOperationMap: Record<number, string> = { 6: 'fission_6', 12: 'fission_12' };
  const fissionOperation = fissionOperationMap[fissionCount] ?? 'fission_6';

  // 处理重试
  const handleRetryTask = useCallback(async (category: 'image_video' | 'new_story', _itemIndex: number) => {
    const confirmed = await confirm('确定要重试该任务吗？将扣除相应积分。', '重试');
    if (!confirmed) return;
    // 积分余额预检查（使用年龄分流定价）
    try {
      const age = selectedRoleDirection?.age;
      const singleFissionCost = selectCreditCostByAge(
        age,
        creditPricing.fissionChildCost,
        creditPricing.fissionAdultCost,
      );
      const { sufficient, balance } = await checkCreditsBalance(userToken, singleFissionCost);
      if (!sufficient) {
        showMessage({ type: 'error', text: `积分不足，当前余额 ${balance}，需要 ${singleFissionCost}，请先充值或联系管理员。` });
        return;
      }
    } catch (error) {
      showMessage({ type: 'error', text: resolveProjectFlowCreditSpendErrorMessage(error, '积分信息读取失败，请稍后重试。') });
      return;
    }
    try {
      await retryFailedItems({ projectId: projectId!, taskType: category, itemIds: [String(_itemIndex)] });
      // 积分扣减：重试成功后扣减
      // 注意：后端 executor 已通过冻结机制扣费，此处无需重复扣费
      // RouteKey: fission_video_generation_child/adult（根据角色年龄自动选择）
    } catch (error) {
      console.error('重试任务失败:', error);
    }
  }, [projectId, retryFailedItems, confirm, userToken, selectedRoleDirection, creditPricing, showMessage]);

  // 处理重试全部
  const handleRetryAllTasks = useCallback(async () => {
    const confirmed = await confirm('确定要重试全部失败任务吗？将扣除相应积分。', '重试全部');
    if (!confirmed) return;
    // 积分余额预检查（使用年龄分流定价）
    try {
      const age = selectedRoleDirection?.age;
      const singleFissionCost = selectCreditCostByAge(
        age,
        creditPricing.fissionChildCost,
        creditPricing.fissionAdultCost,
      );
      const { sufficient, balance } = await checkCreditsBalance(userToken, singleFissionCost);
      if (!sufficient) {
        showMessage({ type: 'error', text: `积分不足，当前余额 ${balance}，需要 ${singleFissionCost}，请先充值或联系管理员。` });
        return;
      }
    } catch (error) {
      showMessage({ type: 'error', text: resolveProjectFlowCreditSpendErrorMessage(error, '积分信息读取失败，请稍后重试。') });
      return;
    }
    try {
      await retryFailedItems({ projectId: projectId!, taskType: 'image_video' });
      await retryFailedItems({ projectId: projectId!, taskType: 'new_story' });
      // 积分扣减：全部重试成功后按裂变数量扣减
      // 注意：后端 executor 已通过冻结机制扣费，此处无需重复扣费
      // RouteKey: fission_video_generation_child/adult（根据角色年龄自动选择）
    } catch (error) {
      console.error('重试全部失败:', error);
    }
  }, [projectId, retryFailedItems, confirm, userToken, selectedRoleDirection, creditPricing, showMessage]);

  // 处理恢复卡住的任务
  const handleResumeTasks = useCallback(async () => {
    try {
      const result = await resumePendingTasks({ projectId: projectId! });
      if (result.success && result.resumedCount > 0) {
        showMessage({ type: 'success', text: `已恢复 ${result.resumedCount} 个任务` });
      }
      // 已删除：loadFissionVideoStatus 和 refetchProgress（由 globalTaskQueue 自动触发）
    } catch (error) {
      console.error('恢复任务失败:', error);
      showMessage({ type: 'error', text: '恢复任务失败' });
    }
  }, [projectId, resumePendingTasks, showMessage]);

  // 处理预览
  const handleTaskPreview = useCallback((type: 'image' | 'video', url: string) => {
    if (type === 'video') {
      setVideoPreview({ clips: [{ index: 0, title: '裂变视频', thumbnailUrl: url }], currentIndex: 0 });
    } else {
      // 图片预览用 frame 格式
      setImagePreview({ frames: [{ index: 0, title: '', imageUrl: url }], currentIndex: 0 });
    }
  }, []);

  // 处理开始合并
  const handleStartMerge = useCallback(async () => {
    setMergeLoading(true);
    try {
      // 复用现有的继续裂变逻辑（内部根据状态决定 resume 或直接合并）
      await handleContinueFissionNew();
      requestAnimationFrame(() => {
        fissionResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (error) {
      console.error('合并失败:', error);
    } finally {
      setMergeLoading(false);
    }
  }, [handleContinueFissionNew]);

  // 标记是否已显示过提示
  const hasShownNoOriginalVideoRef = useRef(false);

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

  // 裂变设置弹窗状态
  const [fissionModalOpen, setFissionModalOpen] = useState(false);
  // 部分完成选择弹窗（重试失败项 or 直接合并）
  const [partialCompleteModalOpen, setPartialCompleteModalOpen] = useState(false);

  // 弹窗打开时默认选中最大可用数量
  useEffect(() => {
    if (fissionModalOpen && availableFissionOptions.length > 0) {
      setFissionCount(availableFissionOptions.length);
    }
  }, [fissionModalOpen, availableFissionOptions.length, setFissionCount]);

  // 裂变成本：分镜数量 × (图片单价 + 视频单价)，按年龄分流定价
  // totalShotCount = clipCount + ceil(clipCount/2)（原始分镜 + 扩写分镜）
  const fissionCreditCost = useMemo(() => {
    const clipCount = clipVideos.length;
    const totalShotCount = clipCount + Math.ceil(clipCount / 2);
    const age = selectedRoleDirection?.age;
    const videoCost = selectCreditCostByAge(age, creditPricing.fissionChildCost, creditPricing.fissionAdultCost);
    const imageCost = selectCreditCostByAge(age, creditPricing.fissionStoryboardImageChildCost, creditPricing.fissionStoryboardImageAdultCost);
    return totalShotCount * (videoCost + imageCost);
  }, [clipVideos, selectedRoleDirection, creditPricing]);

  // 检测是否有原视频，仅在首次加载完成后检测一次
  useEffect(() => {
    if (hasLoadedProjectData && !hasShownNoOriginalVideoRef.current) {
      if (!originalVideoUrl) {
        showMessage({ type: 'info', text: '原视频还未生成' });
      }
      hasShownNoOriginalVideoRef.current = true;
    }
  }, [hasLoadedProjectData, originalVideoUrl, showMessage]);

  // 完成并返回项目列表
  const _handleCompleteAndReturn = () => {
    navigate('/projects?filter=latest');
  };

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
      if (e.key === 'ArrowLeft') {
        handleImagePreviewPrev();
      } else if (e.key === 'ArrowRight') {
        handleImagePreviewNext();
      } else if (e.key === 'Escape') {
        setImagePreview(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imagePreview, handleImagePreviewPrev, handleImagePreviewNext]);

  // ========== 全屏 loading ==========
  // Step6 使用 useFissionVideo 的 projectDataLoading，不依赖 useProjectState
  if (projectDataLoading && !hasLoadedProjectData) {
    return <FullScreenLoading />;
  }

  // ========== 历史侧边栏数据 ==========

  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-[#fdfbf7] lg:flex-row">
      {/* 左侧历史侧边栏 */}
      <ProjectFlowHistorySidebar
        currentStep={6}
        onImagePreview={(frames, currentIndex) => setImagePreview({ frames, currentIndex })}
        onVideoPreview={(clips, currentIndex) => setVideoPreview({ clips, currentIndex })}
      />

      {/* 右侧主区域 */}
      <div className="relative flex-1 flex flex-col min-h-0 bg-[#fdfbf7]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.03) 1px, transparent 0)', backgroundSize: '24px 24px' }}>
        <StepContentHeader
          stepNumber={6}
          title="视频裂变"
          icon="auto_awesome"
          subtitle="基于成片视频，一键裂变为多条不同风格的短视频"
          badges={fissionVideoStatus ? (
            fissionVideoStatus.status === 'partial_complete' ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                {mirrorStatusMessage}
              </span>
            ) : (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                fissionVideoStatus.status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : fissionVideoStatus.status === 'creating'
                    ? 'bg-blue-100 text-blue-700'
                    : fissionVideoStatus.status === 'organizing_mirror'
                      ? 'bg-indigo-100 text-indigo-700'
                      : fissionVideoStatus.status === 'new_mirror'
                        ? 'bg-purple-100 text-purple-700'
                        : fissionVideoStatus.status === 'new_story'
                          ? 'bg-orange-100 text-orange-700'
                          : fissionVideoStatus.status === 'parallel_running'
                            ? 'bg-amber-100 text-amber-700'
                            : fissionVideoStatus.status === 'combining'
                              ? 'bg-cyan-100 text-cyan-700'
                              : fissionVideoStatus.status === 'ready_for_merge'
                                ? 'bg-teal-100 text-teal-700'
                                : 'bg-gray-100 text-gray-700'
              }`}>
                {fissionVideoStatus.status === 'completed' ? '已完成' :
                 fissionVideoStatus.status === 'creating' ? '新建中' :
                 fissionVideoStatus.status === 'organizing_mirror' ? '整理镜像' :
                 fissionVideoStatus.status === 'new_mirror' ? '新镜像' :
                 fissionVideoStatus.status === 'new_story' ? '新故事' :
                 fissionVideoStatus.status === 'parallel_running' ? '并行执行中' :
                 fissionVideoStatus.status === 'combining' ? '组合中' :
                 fissionVideoStatus.status === 'ready_for_merge' ? '待合并' :
                 fissionVideoStatus.status === 'ready_for_step4' ? '等待合并' :
                 fissionVideoStatus.status}
              </span>
            )
          ) : undefined}
        />
        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-24 lg:px-8">
          <div className="mx-auto w-full max-w-[960px] space-y-6">
            {/* 最终合成视频预览（原始视频） */}
            <div className="flex flex-col items-center">
              <div className="mx-auto max-w-[200px]">
                {projectDataLoading ? (
                  <div className="bg-gray-100 rounded-[28px] p-8 text-center" style={{ aspectRatio: '9/16' }}>
                    <span className="material-icons-round animate-spin text-primary text-2xl">refresh</span>
                    <p className="text-xs text-gray-400 mt-2">加载中...</p>
                  </div>
                ) : originalVideoUrl ? (
                  <div
                    className="relative cursor-pointer group"
                    onClick={() => setVideoPreview({ clips: [{ index: 0, title: '原始视频', thumbnailUrl: originalVideoUrl }], currentIndex: 0 })}
                  >
                    {/* 装饰球 - 玻璃折射内容 */}
                    <div className="absolute -inset-6 rounded-[40px] bg-gradient-to-br from-orange-300/35 via-rose-200/25 to-violet-300/35 blur-lg" />
                    {/* 玻璃边框容器 */}
                    <div className="relative rounded-[32px] backdrop-blur-xl" style={{ padding: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 32, boxShadow: 'inset 0 3px 8px rgba(255,255,255,0.6), inset 0 -3px 8px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.05), 0 0 0 1px rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.4)' }}>
                      {/* 玻璃顶部高光 */}
                      <div className="absolute top-0 left-0 right-0 h-16 rounded-t-[32px] overflow-hidden pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent" />
                      </div>
                      <div
                        className="relative overflow-hidden rounded-[22px]"
                        style={{ aspectRatio: '9/16' }}
                      >
                      <img
                        src={getOssVideoSnapshotUrl(originalVideoUrl, 0, 400)}
                        className="w-full h-full object-contain"
                        alt="原始视频"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-xl flex items-center justify-center">
                          <span className="material-icons-round text-white text-2xl">play_arrow</span>
                        </div>
                      </div>
                      <div className="absolute bottom-3 left-3 right-3 bg-white/10 backdrop-blur-xl rounded-xl p-3">
                        <div className="text-white font-bold text-sm">最终合成视频</div>
                        <div className="text-white/60 text-xs">{clipVideos.length} 个分镜</div>
                      </div>
                    </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="bg-gray-100 rounded-[28px] p-8 text-center border border-dashed border-gray-300"
                    style={{ aspectRatio: '9/16' }}
                  >
                    <span className="material-icons-round text-gray-400 text-3xl mb-2">videocam_off</span>
                    <p className="text-sm text-gray-500">原视频还未生成</p>
                    <p className="text-xs text-gray-400 mt-1">请先完成 Step4 视频合成</p>
                  </div>
                )}
              </div>

              {/* 裂变触发按钮 */}
              <div className="mt-6 flex flex-col items-center">
                {/* 微型向下裂变动效 */}
                <div className="relative flex flex-col items-center mb-4 select-none">
                  {/* 发光源点 */}
                  <div className="relative z-10">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-orange-400 flex items-center justify-center shadow-md shadow-primary/40">
                      <span className="material-icons-round text-white text-xs">auto_awesome</span>
                    </div>
                    <div className="absolute inset-[-3px] rounded-full border border-primary/40 animate-[fissionPulse_2s_ease-in-out_infinite]" />
                  </div>
                  {/* 迷你弧线 */}
                  <svg className="w-[180px] h-[50px]" viewBox="0 0 180 50" fill="none">
                    <defs>
                      <linearGradient id="fm-g" x1="90" y1="0" x2="90" y2="50" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#e68c19" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#e68c19" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <line x1="90" y1="0" x2="90" y2="30" stroke="url(#fm-g)" strokeWidth="1.5" />
                    <path d="M90 2 Q70 20 20 45" stroke="url(#fm-g)" strokeWidth="1" strokeDasharray="3 3" fill="none" />
                    <path d="M90 2 Q110 20 160 45" stroke="url(#fm-g)" strokeWidth="1" strokeDasharray="3 3" fill="none" />
                    <path d="M90 2 Q75 18 45 42" stroke="url(#fm-g)" strokeWidth="1" strokeDasharray="3 3" fill="none" />
                    <path d="M90 2 Q105 18 135 42" stroke="url(#fm-g)" strokeWidth="1" strokeDasharray="3 3" fill="none" />
                  </svg>
                  {/* 小目标卡片 */}
                  <div className="flex items-center gap-2 -mt-1">
                    {['from-orange-50 to-amber-50 border-orange-200/60', 'from-primary/10 to-orange-100 border-primary/25', 'from-orange-50 to-amber-50 border-orange-200/60'].map((cls, i) => (
                      <div key={i} className={`w-[40px] h-[26px] rounded-lg bg-gradient-to-br ${cls} border flex items-center justify-center animate-[fissionDropIn_0.4s_${0.1 + i * 0.12}s_both]`}>
                        <span className="text-orange-400 text-[10px]">▶</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 一键裂变/再次裂变按钮 */}
                <button
                  onClick={() => {
                    if (fissionButtonState.action === 'auto') {
                      if (pendingMergeConfirm) {
                        confirmMerge();
                      } else {
                        handleStartMerge();
                      }
                    } else if (fissionButtonState.action === 'partial_complete') {
                      // 部分完成：弹出选择弹窗（重试失败 or 直接合并）
                      setPartialCompleteModalOpen(true);
                    } else if (fissionButtonState.action === 'retry_async' || fissionButtonState.action === 'continue' || fissionButtonState.action === 'new') {
                      // retry_async、continue、new 都打开弹窗，让用户选择裂变数量后再执行
                      setFissionModalOpen(true);
                    }
                  }}
                  disabled={fissionButtonState.disabled}
                  className={`px-8 py-3 rounded-2xl font-bold text-base flex items-center gap-2 transition-all duration-200 ${
                    !fissionButtonState.disabled
                      ? 'bg-gradient-to-r from-primary to-orange-500 text-white shadow-lg shadow-primary/30 hover:from-primary-hover hover:to-orange-600 hover:shadow-xl hover:shadow-primary/40 hover:scale-105'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {/* 裂变中显示旋转动画 */}
                  {fissionButtonState.disabled && (fissionButtonState.text === '裂变中...' || fissionButtonState.text === '组合中...') ? (
                    <>
                      <span className="material-icons-round text-xl animate-spin">refresh</span>
                      {fissionButtonState.text}
                    </>
                  ) : (
                    <>
                      <span className="material-icons-round text-xl">auto_awesome</span>
                      {fissionButtonState.text}
                      {!fissionButtonState.disabled && (
                        <span className="material-icons-round text-lg ml-0.5">keyboard_arrow_down</span>
                      )}
                    </>
                  )}
                </button>
                <p className="text-[11px] text-gray-400 text-center mt-2">
                  {fissionButtonState.disabled ? (mirrorStatusMessage || '裂变中...') : (
                    fissionButtonState.action === 'auto' ? (pendingMergeConfirm ? '所有前置工作已完成，点击确认合并' : '点击开始合并视频') :
                    fissionButtonState.action === 'partial_complete' ? '部分任务失败，点击选择重试或直接合并' :
                    fissionButtonState.action === 'retry_async' ? '前置准备失败，点击重新启动完整裂变流程' :
                    fissionButtonState.action === 'continue' ? '基于已有分镜继续生成' :
                    fissionButtonState.action === 'waiting_story' ? '正在等待新故事生成' :
                    fissionButtonState.action === 'waiting_prompts' ? '正在等待提示词生成' : '一条视频变多条不同风格'
                  )}
                </p>
              </div>
            </div>

            {/* 分镜任务项进度卡片（从 globalTaskQueue 派生） — 直接显示 */}
            <FissionTaskGrid
              items={taskItemsData}
              onRetry={handleRetryTask}
              onPreview={handleTaskPreview}
              retryLoading={retryLoading}
            />

            {/* 裂变结果 — 直接显示 */}
            <div ref={fissionResultRef} className="bg-white rounded-2xl border border-gray-200 p-6">
              {/* 标题栏 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-icons-round text-primary">celebration</span>
                  <span className="text-sm font-bold text-gray-800">裂变结果</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    已生成 {fissionVideos.filter(v => v.status === 'completed' || v.videoPath).length} 个
                    {loadingVideoCount > 0 && (
                      <span className="text-yellow-600 ml-1">（{loadingVideoCount} 个生成中）</span>
                    )}
                  </span>
                </div>
              </div>

              {/* 进度条（仅生成阶段显示）- 简化为 loading 文字 */}
              {generateVideoLoading && loadingVideoCount > 0 && (
                <div className="mb-4 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/60 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-primary text-sm animate-spin">refresh</span>
                    <span className="text-sm font-medium text-gray-700">正在裂变中...</span>
                    <span className="text-xs text-gray-500 ml-auto">剩余 {loadingVideoCount} 个</span>
                  </div>
                </div>
              )}

              {/* 视频网格 — 固定 12 个槽位，一行 6 个 */}
              <div className="grid grid-cols-6 gap-3">
                {displayVideos.map((video, index) => {
                  // 空占位卡片（未生成的固定槽位）
                  if (video.placeholder) {
                    return (
                      <div key={video.id} className="rounded-2xl border-2 border-dashed border-gray-200 overflow-hidden transition-all duration-200 hover:border-primary/30">
                        <div className="relative aspect-[9/16] bg-gradient-to-br from-slate-50 via-white to-stone-50 flex flex-col items-center justify-center">
                          <span className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-lg font-bold bg-slate-400 text-white z-10">
                            #{index + 1}
                          </span>
                          <span className="material-icons-round text-3xl text-slate-300 mb-2">movie_creation</span>
                          <p className="text-xs text-slate-400">待生成</p>
                        </div>
                      </div>
                    );
                  }

                  // 合并中卡片
                  // 合并中卡片 - 简化为 loading 动画
                  if (video.merging) {
                    return (
                      <div key={video.id} className="rounded-2xl border-2 border-primary/30 bg-primary/5 overflow-hidden transition-all duration-200">
                        <div className="relative aspect-[9/16] bg-gradient-to-br from-primary/5 to-sky-50 flex flex-col items-center justify-center">
                          <span className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-lg font-bold bg-primary text-white z-10">
                            #{index + 1}
                          </span>
                          <span className="material-icons-round text-3xl text-primary animate-spin">autorenew</span>
                          <p className="text-xs text-primary/70 mt-2">合并中</p>
                        </div>
                      </div>
                    );
                  }

                  // 生成中卡片
                  if (video.loading) {
                    return (
                      <div key={video.id} className="rounded-2xl border-2 border-amber-200 bg-amber-50/30 overflow-hidden transition-all duration-200">
                        <div className="relative aspect-[9/16] bg-gradient-to-br from-amber-50 to-orange-50 flex flex-col items-center justify-center">
                          <span className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-lg font-bold bg-yellow-500 text-white z-10">
                            <span className="flex items-center gap-1">
                              <span className="material-icons-round text-xs animate-spin">refresh</span>
                              生成中
                            </span>
                          </span>
                          <span className="material-icons-round text-3xl text-amber-300 animate-spin">autorenew</span>
                        </div>
                      </div>
                    );
                  }

                  // 有视频 — 直接显示视频
                  const isSelected = selectedVideoIds.includes(video.id);
                  return (
                    <div
                      key={video.id}
                      className={`rounded-2xl border-[3px] backdrop-blur-md shadow-lg shadow-black/10 overflow-hidden transition-all duration-200 ${
                        isSelected ? 'bg-primary/5 border-primary shadow-primary/20' : 'bg-white/40 border-white/60 hover:-translate-y-1 hover:shadow-xl hover:border-white/80'
                      }`}
                    >
                      <div
                        className={`relative aspect-[9/16] bg-gray-900 group cursor-pointer`}
                        onClick={() => {
                          if (video.loading) return;
                          // 点击卡片 = 预览视频
                          const clips = displayVideos.filter(v => !v.loading).map((v, i) => ({ index: i, title: v.title || `裂变视频 ${i + 1}`, thumbnailUrl: v.url }));
                          setVideoPreview({ clips, currentIndex: index });
                        }}
                      >
                        {/* 序号标签 + 复选框 */}
                        <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
                          <span className={`text-xs px-2 py-0.5 rounded-lg font-bold ${
                            video.loading ? 'bg-yellow-500 text-white' : 'bg-primary text-white'
                          }`}>
                            {video.loading ? (
                              <span className="flex items-center gap-1">
                                <span className="material-icons-round text-xs animate-spin">refresh</span>
                                生成中
                              </span>
                            ) : (
                              <> #{index + 1}</>
                            )}
                          </span>

                          {/* 选中复选框 - 标题右侧 */}
                          {!video.loading && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleVideoSelection(video.id);
                              }}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'bg-white border-white text-primary scale-110'
                                  : 'bg-white/60 border-white/80 hover:bg-white hover:border-white'
                              }`}
                            >
                              {isSelected && (
                                <span className="material-icons-round text-xs">check</span>
                              )}
                            </button>
                          )}
                        </div>

                        {video.loading ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                              <div className="relative w-12 h-12 mx-auto mb-1">
                                {/* 背景圆环 */}
                                <div className="absolute inset-0 border-2 border-yellow-500/20 rounded-full" />
                                {/* 旋转spinner：只有顶部边框有颜色 */}
                                <div className="absolute inset-0 border-2 border-transparent border-t-yellow-500 rounded-full animate-spin" />
                              </div>
                              <p className="text-yellow-500 text-xs">生成中...</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <img
                              src={getOssVideoSnapshotUrl(video.url, 0, 400)}
                              className="w-full h-full object-cover"
                              alt={video.title || '裂变视频'}
                            />
                            {/* 播放按钮 */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                                <span className="material-icons-round text-white text-xl">play_arrow</span>
                              </div>
                            </div>
                          </>
                        )}
                    </div>

                    {/* 底部信息 */}
                    <div className="p-2">
                      <div className={`text-xs font-medium truncate ${video.loading ? 'text-gray-400' : 'text-gray-800'}`}>
                        {video.title}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-xs ${video.loading ? 'text-yellow-500' : 'text-gray-400'}`}>
                          {video.size}
                        </span>
                        {!video.loading && (
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(video);
                              }}
                              className="w-5 h-5 rounded flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                              title="下载"
                            >
                              <span className="material-icons-round text-xs">download</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const clips = displayVideos.filter(v => !v.loading).map((v, i) => ({ index: i, title: v.title || `裂变视频 ${i + 1}`, thumbnailUrl: v.url }));
                                const idx = displayVideos.findIndex(v => v.id === video.id);
                                setVideoPreview({ clips, currentIndex: idx >= 0 ? idx : 0 });
                              }}
                              className="w-5 h-5 rounded flex items-center justify-center bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors"
                              title="预览"
                            >
                              <span className="material-icons-round text-xs">visibility</span>
                            </button>
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteMenuVideoId(deleteMenuVideoId === video.id ? null : video.id);
                                }}
                                className="w-5 h-5 rounded flex items-center justify-center bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors"
                                title="更多"
                              >
                                <span className="material-icons-round text-xs">more_horiz</span>
                              </button>
                              {deleteMenuVideoId === video.id && (
                                <div className="absolute bottom-full right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[60px]">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(video.id);
                                      setDeleteMenuVideoId(null);
                                    }}
                                    className="w-full px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 rounded-lg"
                                  >
                                    删除
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* 底部统计 */}
              {displayVideos.length > 0 && (
                <div className="mt-4 text-xs text-gray-400 text-center">
                  已选择 {selectedVideoIds.length}/{displayVideos.length - loadingVideoCount} 个视频
                </div>
              )}
            </div>
            {/* 已删除：并行裂变任务管理界面（依赖 useFissionProgress）*/}
            {/* 任务状态通过 globalTaskQueue 订阅，用户可等待完成后查看生成视频 */}
          </div>
        </div>
      </div>

      {/* 部分完成选择弹窗（重试失败 or 直接合并） */}
      {partialCompleteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-backdrop-fade-in"
          onClick={() => setPartialCompleteModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-modal-pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">部分任务完成</h3>
              <p className="text-sm text-gray-500 mb-6">
                部分分镜视频生成失败，你可以选择重试失败项或直接用已成功的视频合并。
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setPartialCompleteModalOpen(false);
                    handleContinueFissionNew();
                  }}
                  disabled={generateVideoLoading}
                  className="w-full py-3.5 rounded-2xl text-sm font-bold bg-gradient-to-r from-primary to-orange-500 text-white shadow-lg shadow-primary/25 hover:from-primary-hover hover:to-orange-600 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <span className="material-icons-round text-base">replay</span>
                  重试失败项
                </button>
                <button
                  onClick={() => {
                    setPartialCompleteModalOpen(false);
                    handleMergePartial();
                  }}
                  disabled={generateVideoLoading}
                  className="w-full py-3.5 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <span className="material-icons-round text-base">merge</span>
                  直接合并已有视频
                </button>
              </div>
            </div>
            <div className="px-6 pb-5">
              <button
                onClick={() => setPartialCompleteModalOpen(false)}
                disabled={generateVideoLoading}
                className="w-full py-2.5 rounded-xl text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 裂变设置弹窗 */}
      {fissionModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-backdrop-fade-in"
          onClick={() => { if (!generateVideoLoading) setFissionModalOpen(false); }}
        >
          <div
            className="relative bg-white rounded-3xl shadow-2xl w-[540px] max-w-[92vw] overflow-hidden animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors z-10"
              onClick={() => { if (!generateVideoLoading) setFissionModalOpen(false); }}
            >
              <span className="material-icons-round text-gray-500 text-lg">close</span>
            </button>

            {/* 弹窗头部：裂变引导视觉 */}
            <div className="relative bg-gradient-to-b from-orange-50 via-amber-50/60 to-white pt-8 pb-6 px-8 flex flex-col items-center overflow-hidden">
              {/* 背景光晕装饰 */}
              <div className="absolute top-[-40px] left-1/2 -translate-x-1/2 w-[200px] h-[200px] rounded-full bg-primary/10 blur-[60px]" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[300px] h-[60px] rounded-full bg-orange-200/20 blur-[40px]" />

              {/* 标题 */}
              <div className="relative z-10 text-center mb-4">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="material-icons-round text-primary text-2xl">auto_awesome</span>
                  <span className="text-lg font-bold text-gray-900">视频裂变</span>
                </div>
                <p className="text-xs text-gray-500">一条视频变多条不同风格</p>
              </div>

              {/* 裂变动画：一变多 */}
              <div className="relative z-10 flex flex-col items-center">
                {/* 源视频 */}
                <div className="relative z-10">
                  <div className="w-10 h-16 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-600 shadow-lg flex items-center justify-center">
                    <span className="material-icons-round text-white/80 text-lg">play_circle</span>
                  </div>
                  <div className="absolute inset-[-2px] rounded-lg border border-primary/40 animate-[fissionPulse_2s_ease-in-out_infinite]" />
                </div>

                {/* 扇形弧线 + 目标卡片 */}
                <svg className="w-[360px] h-[70px] -mt-1" viewBox="0 0 360 70" fill="none">
                  <defs>
                    <linearGradient id="fm-modal-g" x1="180" y1="0" x2="180" y2="70" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#e68c19" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#e68c19" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <line x1="180" y1="0" x2="180" y2="40" stroke="url(#fm-modal-g)" strokeWidth="2" />
                  <path d="M180 4 Q140 30 40 62" stroke="url(#fm-modal-g)" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />
                  <path d="M180 4 Q155 28 90 58" stroke="url(#fm-modal-g)" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />
                  <path d="M180 4 Q170 26 155 55" stroke="url(#fm-modal-g)" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />
                  <path d="M180 4 Q190 26 205 55" stroke="url(#fm-modal-g)" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />
                  <path d="M180 4 Q205 28 270 58" stroke="url(#fm-modal-g)" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />
                  <path d="M180 4 Q220 30 320 62" stroke="url(#fm-modal-g)" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />
                </svg>

                {/* 目标视频卡片行 */}
                <div className="flex items-center gap-2 -mt-2">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`w-[48px] h-[32px] rounded-lg border flex items-center justify-center animate-[fissionDropIn_0.5s_${0.08 + i * 0.1}s_both] ${
                        i === 2
                          ? 'bg-gradient-to-br from-primary/15 to-orange-100 border-primary/30 shadow-sm shadow-primary/20'
                          : 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200/50'
                      }`}
                    >
                      <span className="text-orange-400 text-xs">▶</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 裂变设置内容 */}
            <div className="px-8 py-6 space-y-5">
              {/* 裂变数量选择 */}
              <div>
                <label className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="material-icons-round text-primary text-base">tune</span>
                  裂变数量
                </label>
                {mirrorStatusMessage && (
                  <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200/60 px-3 py-2 flex items-center gap-2">
                    <span className="material-icons-round text-amber-500 text-base">info</span>
                    <span className="text-sm text-amber-700">{mirrorStatusMessage}</span>
                  </div>
                )}

                {/* 独立的滑动条组件 */}
                {availableFissionOptions.length > 0 && (
                  <div className="mt-6 bg-gray-50 rounded-2xl p-5 border border-gray-200/80">
                    {/* 标题 */}
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <span className="material-icons-round text-primary text-lg">tune</span>
                      <span className="text-sm font-medium text-gray-700">选择裂变数量</span>
                    </div>

                    {/* 滑动条轨道 + 带数字的圆形节点 */}
                    <div className="relative h-16">
                      {/* 轨道背景 */}
                      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2 rounded-full bg-gray-200" />

                      {/* 已选中区域填充 */}
                      {availableFissionOptions.length > 1 && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 left-0 h-2 rounded-full bg-gradient-to-r from-primary to-orange-400 transition-all duration-200"
                          style={{ width: `${((fissionCount - 1) / (availableFissionOptions.length - 1)) * 100}%` }}
                        />
                      )}

                      {/* 带数字的圆形节点 */}
                      {Array.from({ length: Math.min(availableFissionOptions.length, 12) }, (_, i) => {
                        const isSelected = i + 1 === fissionCount;
                        const isPassed = i + 1 < fissionCount;

                        // 根据节点数量自适应调整大小
                        const nodeCount = Math.min(availableFissionOptions.length, 12);
                        const getNodeSize = () => {
                          if (nodeCount <= 6) {
                            return isSelected ? 'w-10 h-10' : 'w-9 h-9';
                          } else if (nodeCount <= 9) {
                            return isSelected ? 'w-9 h-9' : 'w-8 h-8';
                          } else {
                            return isSelected ? 'w-8 h-8' : 'w-7 h-7';
                          }
                        };
                        const getFontSize = () => {
                          if (nodeCount <= 6) {
                            return isSelected ? 'text-sm font-bold' : 'text-xs font-medium';
                          } else {
                            return isSelected ? 'text-xs font-bold' : 'text-xs font-medium';
                          }
                        };
                        const getMarginLeft = () => {
                          if (nodeCount <= 6) {
                            return isSelected ? '-20px' : '-18px';
                          } else if (nodeCount <= 9) {
                            return isSelected ? '-18px' : '-16px';
                          } else {
                            return isSelected ? '-16px' : '-14px';
                          }
                        };

                        return (
                          <div
                            key={i}
                            className={`absolute top-1/2 -translate-y-1/2 ${getNodeSize()} rounded-full
                                        flex items-center justify-center
                                        transition-all duration-200 cursor-pointer
                                        ${isSelected
                                          ? 'bg-gradient-to-br from-primary to-orange-500 border-2 border-white shadow-lg shadow-primary/40 text-white z-10'
                                          : isPassed
                                            ? 'bg-white border-2 border-primary text-primary shadow-sm'
                                            : 'bg-white border-2 border-gray-300 text-gray-400'
                                        }`}
                            style={{
                              left: nodeCount === 1 ? '50%' : `${(i / (nodeCount - 1)) * 100}%`,
                              marginLeft: nodeCount === 1 ? (isSelected ? '-20px' : '-18px') : getMarginLeft()
                            }}
                            onClick={() => !generateVideoLoading && setFissionCount(i + 1)}
                          >
                            <span className={getFontSize()}>{i + 1}</span>
                          </div>
                        );
                      })}

                      {/* 透明滑动条（用于拖动交互） */}
                      <input
                        type="range"
                        min={1}
                        max={availableFissionOptions.length}
                        value={fissionCount}
                        onChange={(e) => setFissionCount(Number(e.target.value))}
                        disabled={generateVideoLoading}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-20"
                      />
                    </div>

                    {/* 提示文字 */}
                    <div className="mt-3 text-center">
                      <span className="text-xs text-gray-400">可选 1-{availableFissionOptions.length} 条</span>
                    </div>
                  </div>
                )}

                {/* 无可用选项时的提示 */}
                {availableFissionOptions.length === 0 && (
                  <div className="mt-2 text-sm text-gray-500 text-center py-2">
                    {mirrorStatusMessage || '暂无可用的裂变选项'}
                  </div>
                )}
              </div>

              {/* 费用提示 */}
              <div className="rounded-2xl bg-amber-50/80 border border-amber-200/60 px-5 py-3 flex flex-col items-center justify-center gap-2 text-sm">
                <div className="flex items-center gap-2 justify-center">
                  <span className="material-icons-round text-amber-500 text-lg">payments</span>
                  <span className="text-amber-800 font-medium whitespace-nowrap">
                    预计消耗 <span className="font-bold text-primary">{fissionCreditCost}</span> 积分
                  </span>
                </div>
                <span className="text-xs text-amber-600/70">{clipVideos.length + Math.ceil(clipVideos.length / 2)} 个分镜（图片+视频）· 生成后不可撤销 · 最多 12 条裂变，后续不另收费</span>
              </div>
            </div>

            {/* 底部操作按钮 */}
            <div className="px-8 pb-6 flex gap-3">
              <button
                onClick={() => { if (!generateVideoLoading) setFissionModalOpen(false); }}
                disabled={generateVideoLoading}
                className={`flex-1 py-3 rounded-2xl text-sm font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors ${generateVideoLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                取消
              </button>
              <button
                onClick={async () => {
                  if (generateVideoLoading) return;
                  const selectedCount = fissionCount; // 捕获当前选择的数量
                  setFissionModalOpen(false);
                  // 根据当前状态选择执行逻辑
                  if (fissionButtonState.action === 'auto') {
                    // 裂变完成，触发合并（如已有确认弹窗则直接确认）
                    if (pendingMergeConfirm) {
                      confirmMerge();
                    } else {
                      handleStartMerge();
                    }
                  } else if (fissionButtonState.action === 'continue') {
                    // 再次裂变：仅执行组合+合并
                    handleContinueFissionNew();
                  } else if (fissionButtonState.action === 'retry_async' || fissionButtonState.action === 'new') {
                    // retry_async：重新启动完整裂变流程
                    // new：首次裂变，完整流程
                    // 传递选择的数量，绕过状态更新延迟
                    handleGenerateVideo(selectedCount);
                  }
                  // 延迟一帧让 ref 元素渲染后再滚动
                  requestAnimationFrame(() => {
                    fissionResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  });
                }}
                disabled={generateVideoLoading || !originalVideoUrl || !canFission}
                className={`flex-[2] py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 ${
                  generateVideoLoading || !canFission
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-primary to-orange-500 text-white shadow-lg shadow-primary/25 hover:from-primary-hover hover:to-orange-600 hover:shadow-xl hover:shadow-primary/30'
                }`}
              >
                <>
                  <span className="material-icons-round text-base">auto_awesome</span>
                  {fissionButtonState.text} ({fissionCount} 条)
                </>
              </button>
            </div>
          </div>
        </div>
      )}

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
            <button
              className="absolute -top-10 right-0 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
              onClick={() => setImagePreview(null)}
            >
              <span className="material-icons-round text-2xl">close</span>
            </button>
            <div className="text-center text-white/80 text-sm mb-3">
              {imagePreview.frames[imagePreview.currentIndex]?.title ?? `图片 ${imagePreview.currentIndex + 1}`}
              <span className="ml-2 text-white/60">
                ({imagePreview.currentIndex + 1} / {imagePreview.frames.length})
              </span>
            </div>
            <div className="relative flex items-center justify-center">
              {imagePreview.frames.length > 1 && (
                <button
                  className="absolute -left-12 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors z-10"
                  onClick={handleImagePreviewPrev}
                >
                  <span className="material-icons-round text-3xl">chevron_left</span>
                </button>
              )}
              <img
                src={imagePreview.frames[imagePreview.currentIndex]?.imageUrl ?? ''}
                alt={imagePreview.frames[imagePreview.currentIndex]?.title ?? '预览图片'}
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              />
              {imagePreview.frames.length > 1 && (
                <button
                  className="absolute -right-12 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors z-10"
                  onClick={handleImagePreviewNext}
                >
                  <span className="material-icons-round text-3xl">chevron_right</span>
                </button>
              )}
            </div>
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

      {/* 底部操作栏 */}
      <div className="fixed bottom-6 left-0 right-0 lg:left-[400px] z-40 flex justify-center pointer-events-none">
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-2xl px-3 py-2.5 shadow-xl shadow-gray-200/50 pointer-events-auto flex items-center gap-2 max-w-[90%] md:max-w-none">
          {/* 返回上一步 */}
          <Button variant="ghost" onClick={() => { if (projectId) navigate(`/create/${projectId}/step5`); }} className="rounded-xl px-3 text-gray-500 hover:text-gray-900 hover:bg-gray-50 whitespace-nowrap shrink-0">
            <span className="material-icons-round text-lg">arrow_back</span>
            <span className="hidden md:inline ml-1">上一步</span>
          </Button>

          <div className="h-5 w-px bg-gray-200" />

          {/* 选择操作 - 有视频时显示 */}
          {completedVideos.length > 0 && (
            <>
              {/* 全选按钮 */}
              <Button variant="ghost" onClick={() => { const allIds = completedVideos.map(v => v.id); setSelectedVideoIds(allIds); }} className="rounded-xl px-3 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 whitespace-nowrap shrink-0">
                <span className="material-icons-round text-sm">select_all</span>
                全选
              </Button>

              {/* 清空选择 */}
              {selectedVideoIds.length > 0 && (
                <Button variant="ghost" onClick={() => setSelectedVideoIds([])} className="rounded-xl px-3 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 whitespace-nowrap shrink-0">
                  清空
                </Button>
              )}

              <div className="h-5 w-px bg-gray-200" />
            </>
          )}

          {/* 选择数量提示 */}
          {selectedVideoIds.length > 0 && (
            <span className="text-xs text-primary font-medium">
              已选 {selectedVideoIds.length} 个
            </span>
          )}

          {/* 下载选中按钮 */}
          {completedVideos.length > 0 && (
            <Button onClick={handleBatchDownload} disabled={selectedVideoIds.length === 0} className="rounded-xl px-5 bg-primary hover:bg-primary-hover text-white shadow-md shadow-primary/25 whitespace-nowrap shrink-0 transition-transform animate-pulse-scale">
              <span className="material-icons-round text-base">download</span>
              <span className="hidden sm:inline ml-1">下载{selectedVideoIds.length > 0 ? ` (${selectedVideoIds.length})` : ''}</span>
            </Button>
          )}

          <div className="h-5 w-px bg-gray-200" />

          {/* 裂变按钮 */}
          <Button onClick={() => {
            if (fissionButtonState.action === 'auto') {
              if (pendingMergeConfirm) {
                confirmMerge();
              } else {
                handleStartMerge();
              }
            } else if (fissionButtonState.action === 'partial_complete') {
              setPartialCompleteModalOpen(true);
            } else if (fissionButtonState.action === 'retry_async' || fissionButtonState.action === 'continue' || fissionButtonState.action === 'new') {
              // retry_async、continue、new 都打开弹窗，让用户选择裂变数量后再执行
              setFissionModalOpen(true);
            }
          }} disabled={fissionButtonState.disabled} className="rounded-xl px-5 bg-gradient-to-r from-primary to-orange-500 hover:from-primary-hover hover:to-orange-600 text-white shadow-md shadow-primary/25 whitespace-nowrap shrink-0">
            {/* 裂变中显示旋转动画 */}
            {fissionButtonState.disabled && (fissionButtonState.text === '裂变中...' || fissionButtonState.text === '组合中...') ? (
              <span className="flex items-center gap-2">
                <span className="material-icons-round text-base animate-spin">refresh</span>
                <span className="hidden sm:inline">{fissionButtonState.text}</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="hidden sm:inline">{fissionButtonState.text}</span>
                <span className="material-icons-round text-base sm:ml-1">auto_awesome</span>
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* 合并确认弹窗：ready_for_merge 后提示用户确认 */}
      {pendingMergeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-[scaleIn_0.2s_ease-out]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                <span className="material-icons-round text-teal-600 text-xl">check_circle</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">准备合并</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              所有前置工作已完成，是否现在开始合并视频？
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelMerge}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                稍后再说
              </button>
              <button
                onClick={confirmMerge}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-orange-500 text-white text-sm font-bold hover:from-primary-hover hover:to-orange-600 shadow-md shadow-primary/25 transition-all"
              >
                开始合并
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
