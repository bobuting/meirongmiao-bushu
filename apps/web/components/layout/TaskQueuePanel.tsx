/**
 * 任务队列面板组件
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAppStore, type GlobalTaskItem } from '../../store/useAppStore';
import { TaskQueueItemRow } from './TaskQueueItemRow';
import { backendApi } from '../../services/backendApi';
import { useConfirm } from '../ui/ConfirmDialog';
import { GlobalTaskType, SYSTEM_TASK_TYPE_SET, TaskStatus } from './taskQueueConfig';

interface TaskQueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTaskCount: number;
}

/** 根据任务类型计算跳转路径 */
function getTaskNavigatePath(task: GlobalTaskItem): string {
  if (!task.projectId) return '/reverse';

  switch (task.type) {
    // 图片项目 Step2 五视图
    case GlobalTaskType.IMAGE_STEP2_FIVE_VIEW:
    case GlobalTaskType.IMAGE_STEP2_BATCH_FIVE_VIEW:
      return `/image-create/${task.projectId}/step2`;

    // 视频项目 Step2 五视图
    case GlobalTaskType.STEP2_FIVE_VIEW:
    case GlobalTaskType.STEP2_BATCH_FIVE_VIEW:
      return `/create/${task.projectId}/step2`;

    // 图片项目 Step3 模特图
    case GlobalTaskType.IMAGE_STEP3_MODEL_PHOTO:
    case GlobalTaskType.IMAGE_STEP3_MODEL_PLAN:
    case GlobalTaskType.IMAGE_STEP3_SINGLE_PHOTO:
      return `/image-create/${task.projectId}/step3`;

    // 图片项目 Step4 电商详情页
    case GlobalTaskType.IMAGE_STEP4_SECTION_PLAN:
    case GlobalTaskType.IMAGE_STEP4_SECTION_REPLAN:
    case GlobalTaskType.IMAGE_STEP4_GENERATE_ALL:
    case GlobalTaskType.IMAGE_STEP4_SINGLE_SECTION:
      return `/image-create/${task.projectId}/step4`;

    // 视频项目 Step4
    case GlobalTaskType.STEP4_CLIP_SUBMIT:
    case GlobalTaskType.STEP4_VIDEO:
      return `/create/${task.projectId}/step4`;

    // 视频项目 Step6 裂变
    case GlobalTaskType.STEP6_FISSION:
    case GlobalTaskType.STEP6_FISSION_NEW_STORY:
    case GlobalTaskType.STEP6_FISSION_SHOT_PROMPTS:
    case GlobalTaskType.STEP6_FISSION_ITEM_IMAGE:
    case GlobalTaskType.STEP6_FISSION_ITEM_VIDEO_SUBMIT:
    case GlobalTaskType.STEP6_FISSION_COMBINATION:
      return `/create/${task.projectId}/step6`;

    // 换装项目
    case GlobalTaskType.OUTFIT_CHANGE:
    case GlobalTaskType.OUTFIT_CHANGE_UNDERSTAND:
    case GlobalTaskType.OUTFIT_CHANGE_ADAPT_VIDEO_EDIT:
    case GlobalTaskType.OUTFIT_CHANGE_GEN_VIDEO_EDIT:
      return `/outfit-create/${task.projectId}/step4`;

    // 视频项目 Step3 脚本+分镜（所有 step3_ 开头的类型）
    case GlobalTaskType.STEP3_SCRIPTS_GENERATION:
    case GlobalTaskType.STEP3_LIBRARY:
    case GlobalTaskType.STEP3_VIDEO:
    case GlobalTaskType.STEP3_REALTIME:
    case GlobalTaskType.STEP3_EFFECTIVENESS:
    case GlobalTaskType.STEP3_CUSTOM:
    case GlobalTaskType.STEP3_FASHION:
    case GlobalTaskType.STEP3_EMOTION_ARCHETYPE:
    case GlobalTaskType.STEP3_AESTHETIC:
    case GlobalTaskType.STEP3_PRODUCT_SHOWCASE:
    case GlobalTaskType.STEP3_STORY_THEME:
    case GlobalTaskType.STEP3_REVERSE_REWRITE:
    case GlobalTaskType.STEP3_BATCH_PREVIEW:
    case GlobalTaskType.STEP3_SHOT_PROMPT:
    case GlobalTaskType.STEP3_FRAME_PREVIEW:
      return `/create/${task.projectId}/step3`;

    // 系统任务（无跳转路径）
    case GlobalTaskType.STEP4_CLIP_QUERY:
    case GlobalTaskType.OUTFIT_CHANGE_GEN_VIDEO_EDIT_QUERY:
    case GlobalTaskType.STEP6_FISSION_ITEM_VIDEO_QUERY:
      return '/reverse';

    // 反推任务（无 projectId）
    case GlobalTaskType.LLM_REVERSE:
      return '/reverse';

    default:
      return '/reverse';
  }
}

/** 将任务列表按父子关系分组，父任务携带子任务列表 */
function groupTasksByParent(tasks: GlobalTaskItem[]): Array<{
  task: GlobalTaskItem;
  children: GlobalTaskItem[];
  isParent: boolean;
}> {
  const taskMap = new Map<string, GlobalTaskItem>();
  const result: Array<{ task: GlobalTaskItem; children: GlobalTaskItem[]; isParent: boolean }> = [];

  // 建立 ID → task 映射
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  // 已处理的任务 ID
  const processed = new Set<string>();

  // 按父任务分组
  const childrenByParent = new Map<string, GlobalTaskItem[]>();
  for (const task of tasks) {
    if (task.parentJobId) {
      const children = childrenByParent.get(task.parentJobId) || [];
      children.push(task);
      childrenByParent.set(task.parentJobId, children);
    }
  }

  // 系统任务不展示给用户（查询轮询、快速完成的内部任务）
  const HIDDEN_CHILD_TYPES = SYSTEM_TASK_TYPE_SET;

  // 处理任务列表
  for (const task of tasks) {
    if (processed.has(task.id)) continue;

    // 跳过父任务在列表中的子任务（由父任务统一处理）
    if (task.parentJobId && taskMap.has(task.parentJobId)) continue;

    // 过滤掉不需要显示的子任务类型
    const children = (childrenByParent.get(task.id) || [])
      .filter(c => !HIDDEN_CHILD_TYPES.has(c.type));
    const isParent = children.length > 0;

    result.push({ task, children, isParent });
    processed.add(task.id);

    // 标记子任务已处理（包括被过滤的）
    for (const child of childrenByParent.get(task.id) || []) {
      processed.add(child.id);
    }
  }

  return result;
}

/** 计算活跃任务数：只统计子任务数量（排除父任务） */
function countActiveTasks(tasks: GlobalTaskItem[]): number {
  const taskIds = new Set(tasks.map(t => t.id));
  // 收集在列表中有子任务的父任务 ID（这些父任务不参与计数）
  const parentIdsInList = new Set<string>();
  for (const task of tasks) {
    if (task.parentJobId && taskIds.has(task.parentJobId)) {
      parentIdsInList.add(task.parentJobId);
    }
  }
  let count = 0;
  for (const task of tasks) {
    if (task.status !== TaskStatus.RUNNING) continue;
    // 父任务：有子任务在列表中时跳过（不计数）
    if (parentIdsInList.has(task.id)) continue;
    // 子任务或独立任务：正常计数
    count++;
  }
  return count;
}

export function TaskQueuePanel({ isOpen, onClose, activeTaskCount }: TaskQueuePanelProps) {
  const navigate = useNavigate();
  const globalTaskQueue = useAppStore((state) => state.globalTaskQueue);
  const currentUser = useAppStore((state) => state.currentUser);
  const token = useAppStore((state) => state.token);
  const refreshGlobalTasks = useAppStore((state) => state.refreshGlobalTasks);
  const { confirm } = useConfirm();
  const [isClearing, setIsClearing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 按父子关系分组（先过滤掉系统任务）
  const visibleTasks = useMemo(() =>
    globalTaskQueue.filter(task => !SYSTEM_TASK_TYPE_SET.has(task.type)),
    [globalTaskQueue]
  );
  const groupedTasks = useMemo(() => groupTasksByParent(visibleTasks), [visibleTasks]);

  // 重新计算活跃任务数（排除有子任务的父任务 + 系统任务）
  const realActiveCount = useMemo(() => countActiveTasks(visibleTasks), [visibleTasks]);

  // 是否显示清理按钮（管理员 + 有任务）
  const showClearButton = currentUser?.role === 'admin' && globalTaskQueue.length > 0;

  // 刷新任务列表
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshGlobalTasks();
    } finally {
      setIsRefreshing(false);
    }
  };

  // 清理所有任务
  const handleClearTasks = async () => {
    const confirmed = await confirm(
      '确定要停止并清理所有任务吗？此操作不可撤销。',
      '清理所有任务'
    );

    if (!confirmed) return;

    setIsClearing(true);
    try {
      const result = await backendApi.adminClearTasks(token!);
      if (result.ok) {
        // 刷新任务队列
        await refreshGlobalTasks();
        onClose();
      }
    } catch (error) {
      console.error('[TaskQueuePanel] 清理任务失败:', error);
    } finally {
      setIsClearing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 z-[55]"
        onClick={onClose}
      />
      {/* 面板主体 */}
      <div className="fixed top-16 right-4 md:right-6 z-[60] w-80 md:w-96 max-h-[75vh] rounded-2xl bg-white shadow-2xl border border-gray-200/80 flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-lg text-gray-700">task_alt</span>
            <h3 className="text-sm font-bold text-gray-900">任务队列</h3>
            {realActiveCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold">
                {realActiveCount} 进行中
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* 刷新按钮 */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-7 h-7 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center disabled:opacity-50"
              title="刷新任务列表"
            >
              <span className={`material-icons-round text-base text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`}>refresh</span>
            </button>
            {/* 管理员清理按钮 */}
            {showClearButton && (
              <button
                onClick={handleClearTasks}
                disabled={isClearing}
                className="px-2 py-1 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="停止并清理所有任务"
              >
                {isClearing ? (
                  <span className="material-icons-round text-sm animate-spin">refresh</span>
                ) : (
                  <span className="material-icons-round text-sm">delete_sweep</span>
                )}
                清理
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center"
            >
              <span className="material-icons-round text-base text-gray-400">close</span>
            </button>
          </div>
        </div>

        {/* 任务列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
          {globalTaskQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <span className="material-icons-round text-3xl mb-2">inbox</span>
              <p className="text-xs">暂无任务</p>
            </div>
          ) : (
            groupedTasks.map((item) => {
              const { task, children, isParent } = item;
              // 父任务的跳转路径，子任务复用（子任务属于同一项目同一阶段）
              const parentNavigate = () => navigate(getTaskNavigatePath(task));

              // 父任务或独立任务（携带子任务列表用于折叠）
              return (
                <TaskQueueItemRow
                  key={task.id}
                  task={task}
                  isParent={isParent}
                  children={children}
                  onClick={parentNavigate}
                  childOnClick={parentNavigate}
                />
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
