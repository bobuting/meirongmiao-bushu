/**
 * 任务队列项组件
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GlobalTaskItem } from '../../store/useAppStore';
import { TASK_TYPE_LABELS, TASK_STAGE_CONFIG, TaskStatus, GlobalTaskType } from './taskQueueConfig';
import { STRATEGY_TYPE_LABELS } from '../../utils/strategyTypeLabels';

/**
 * 假进度 Hook：running 状态下缓慢递增进度条，避免长时间不动
 * 从当前 stage 进度值缓慢爬升到上限，stage 变化时重置
 */
function useFakeProgress(isRunning: boolean, baseProgress: number) {
  const [fake, setFake] = useState(baseProgress);
  const baseRef = useRef(baseProgress);

  // stage 对应的 base 变化时重置
  useEffect(() => {
    baseRef.current = baseProgress;
    setFake(baseProgress);
  }, [baseProgress]);

  // running 时每 2 秒 +1，上限为 base + 25（不超过 95）
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setFake(prev => {
        const cap = Math.min(baseRef.current + 25, 95);
        return prev < cap ? prev + 1 : prev;
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [isRunning]);

  return isRunning ? fake : baseProgress;
}

/** 尝试解析 input JSON（可能被后端截断导致不完整） */
function tryParseInput(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // 截断的 JSON（后端 trimInput 以 "..." 结尾）：尝试补全再解析
    if (raw.endsWith('...')) {
      try {
        let patched = raw.replace(/\.\.\.+$/, '');
        const openBraces = (patched.match(/{/g) || []).length;
        const closeBraces = (patched.match(/}/g) || []).length;
        for (let i = 0; i < openBraces - closeBraces; i++) patched += '}';
        const openBrackets = (patched.match(/\[/g) || []).length;
        const closeBrackets = (patched.match(/]/g) || []).length;
        for (let i = 0; i < openBrackets - closeBrackets; i++) patched += ']';
        if (!patched.endsWith('"') && !patched.endsWith('}') && !patched.endsWith(']')) patched += '"';
        return JSON.parse(patched) as Record<string, unknown>;
      } catch { /* 无法修复 */ }
    }
    return null;
  }
}

/** 从 task.input JSON 中提取可读标题 */
function extractTaskTitle(task: GlobalTaskItem): string {
  const input = tryParseInput(task.input);
  if (!input) {
    return TASK_TYPE_LABELS[task.type as GlobalTaskType] || '任务处理中';
  }

  switch (task.type) {
    case 'step2_batch_five_view':
    case 'image_step2_batch_five_view': {
      const slots = Array.isArray(input.slots) ? input.slots : [];
      return slots.length > 0 ? `共 ${slots.length} 个角色` : '批量五视图';
    }
    case 'step2_five_view':
    case 'image_step2_five_view': {
      const slot = Number(input.slot);
      if (Number.isFinite(slot) && slot >= 1 && slot <= 3) {
        return `角色 ${slot}`;
      }
      return '五视图';
    }
    case 'step3_reverse_rewrite': {
      const projectId = String(input.projectId || '');
      return projectId.length > 8 ? `项目 ${projectId.slice(-8)}` : '反推改写';
    }
    case 'step4_video': {
      const totalClips = typeof input.clipCount === 'number' ? input.clipCount : 1;
      const targetSceneIndex = input.targetSceneIndex;
      if (typeof targetSceneIndex === 'number') {
        return `重试镜头 ${targetSceneIndex + 1}`;
      }
      return totalClips > 1 ? `共 ${totalClips} 个镜头` : '视频生成';
    }
    case 'image_step3_model_photo':
      return input.characterDescription ? String(input.characterDescription).slice(0, 20) : '模特图';
    case 'image_step3_single_photo': {
      const poseLabel = input.poseLabel as string | undefined;
      const bgLabel = input.bgLabel as string | undefined;
      if (poseLabel || bgLabel) {
        return `${poseLabel || ''} ${bgLabel || ''}`.trim().slice(0, 20);
      }
      return '单张模特图';
    }
    case 'llm_reverse': {
      let displayText = '';
      try {
        const parsed = JSON.parse(task.input) as { url?: string; filename?: string };
        if (parsed.filename && parsed.filename.trim()) {
          displayText = parsed.filename.trim();
        } else if (parsed.url) {
          displayText = parsed.url;
        }
      } catch {
        displayText = task.input;
      }
      if (displayText.length > 30) {
        return `${displayText.slice(0, 15)}...${displayText.slice(-10)}`;
      }
      return displayText || 'LLM 反推';
    }
    case 'step3_batch_preview': {
      const frameIndexes = Array.isArray(input.frameIndexes) ? input.frameIndexes : [];
      return frameIndexes.length > 0 ? `共 ${frameIndexes.length} 个分镜` : '分镜预览';
    }
    case 'step3_shot_prompt':
      return '专业提示词';
    case 'step3_frame_preview': {
      const frameIndex = Number(input.frameIndex);
      return Number.isFinite(frameIndex) ? `分镜 ${frameIndex}` : '帧预览';
    }
    case 'outfit_change':
      return 'AI 换装视频';
    case 'outfit_change_understand':
      return '换装理解';
    case 'outfit_change_adapt_video_edit': {
      const segmentIndex = Number(input.segmentIndex);
      return Number.isFinite(segmentIndex) ? `切片适配 ${segmentIndex + 1}` : '切片适配';
    }
    case 'outfit_change_gen_video_edit': {
      const segmentIndex = Number(input.segmentIndex);
      return Number.isFinite(segmentIndex) ? `视频编辑 ${segmentIndex + 1}` : '视频编辑';
    }
    case 'step6_fission':
      return '裂变任务';
    case 'step6_fission_item_image': {
      const itemIndex = Number(input.itemIndex);
      const taskTypeLabel = input.taskType === 'new_story' ? STRATEGY_TYPE_LABELS.new_story : '重新演绎';
      const idx = Number.isFinite(itemIndex) ? itemIndex + 1 : '?';
      return `${taskTypeLabel} 分镜${idx} 图片`;
    }
    case 'step6_fission_item_video_submit': {
      const itemIndex = Number(input.itemIndex);
      const taskTypeLabel = input.taskType === 'new_story' ? STRATEGY_TYPE_LABELS.new_story : '重新演绎';
      const idx = Number.isFinite(itemIndex) ? itemIndex + 1 : '?';
      return `${taskTypeLabel} 分镜${idx} 视频`;
    }
    case 'step6_fission_shot_prompts':
      return '裂变提示词生成';
    case 'step6_fission_new_story':
      return '裂变新故事生成';
    case 'step6_fission_combination':
      return '裂变组合方案';
    default:
      // Step3 脚本相关（其他 step3_ 类型）
      if (task.type.startsWith('step3_')) {
        return TASK_TYPE_LABELS[task.type as GlobalTaskType] || '脚本生成';
      }
      // 其他类型：尝试取 title/name/content 字段
      const fallback = input.title ?? input.name ?? input.content ?? null;
      if (typeof fallback === 'string' && fallback.trim()) {
        const text = fallback.trim();
        return text.length > 30 ? text.slice(0, 30) + '...' : text;
      }
      return TASK_TYPE_LABELS[task.type as GlobalTaskType] || '任务处理中';
  }
}

/** 获取任务完成后的描述文案 */
function getCompletedDescription(task: GlobalTaskItem): string {
  switch (task.type) {
    case 'step2_five_view':
    case 'image_step2_five_view': {
      const result = task.result as Record<string, unknown> | undefined;
      const characterName = (result?.characterName as string) ?? '';
      return characterName ? `角色「${characterName}」已生成` : '五视图已生成完成';
    }
    case 'step2_batch_five_view':
    case 'image_step2_batch_five_view': {
      const result = task.result as Record<string, unknown> | undefined;
      const completedCount = (result?.completedCount as number) ?? 0;
      const failedCount = (result?.failedCount as number) ?? 0;
      if (completedCount > 0 && failedCount > 0) {
        return `成功 ${completedCount} 个，失败 ${failedCount} 个`;
      }
      return completedCount > 0 ? `已成功生成 ${completedCount} 个角色` : '批量五视图已完成';
    }
    case 'step3_reverse_rewrite': {
      const result = task.result as Record<string, unknown> | undefined;
      const segmentCount = (result?.scriptSegmentCount as number) ?? 0;
      return segmentCount > 0 ? `已生成 ${segmentCount} 个分镜` : '脚本改写完成';
    }
    case 'step3_shot_prompt': {
      const result = task.result as Record<string, unknown> | undefined;
      const shotsCount = (result?.shotsCount as number) ?? 0;
      return shotsCount > 0 ? `已生成 ${shotsCount} 个分镜提示词` : '专业提示词已生成';
    }
    case 'step3_batch_preview':
    case 'step3_frame_preview':
      return '分镜预览已完成';
    case 'step4_video': {
      const result = task.result as Record<string, unknown> | undefined;
      const totalClips = (result?.totalClipCount as number) ?? 0;
      const completedClips = (result?.completedClipCount as number) ?? 0;
      if (completedClips > 0 && completedClips < totalClips) {
        return `已生成 ${completedClips}/${totalClips} 个镜头`;
      }
      return totalClips > 1 ? `已生成 ${totalClips} 个镜头` : '视频已生成完成';
    }
    case 'image_step3_model_photo': {
      const result = task.result as Record<string, unknown> | undefined;
      const success = (result?.successCount as number) ?? 0;
      const failed = (result?.failedCount as number) ?? 0;
      return `共 ${success + failed} 张，成功 ${success} 张`;
    }
    case 'image_step3_single_photo':
      return '模特图已生成';
    case 'outfit_change':
      return '换装视频已生成';
    case 'outfit_change_understand':
      return '视频理解已完成';
    case 'outfit_change_adapt_video_edit':
      return '切片适配已完成';
    case 'outfit_change_gen_video_edit':
      return '换装视频已生成';
    case 'step6_fission':
      return '裂变任务已完成';
    case 'step6_fission_item_image': {
      const result = task.result as Record<string, unknown> | undefined;
      return result?.imageUrl ? '图片已生成' : '图片生成完成';
    }
    case 'step6_fission_item_video_submit': {
      const result = task.result as Record<string, unknown> | undefined;
      return result?.videoUrl ? '视频已生成' : '视频生成完成';
    }
    case 'step6_fission_shot_prompts':
      return '裂变提示词生成完成';
    case 'step6_fission_new_story':
      return '新故事生成完成';
    case 'step6_fission_combination':
      return '裂变组合方案已生成';
    case 'llm_reverse': {
      const result = task.result as Record<string, unknown> | undefined;
      const scriptId = result?.scriptId as string | undefined;
      return scriptId ? '反推完成，已生成脚本' : '视频分析完成';
    }
    default:
      // Step3 脚本相关（其他 step3_ 类型）
      if (task.type.startsWith('step3_')) {
        const result = task.result as Record<string, unknown> | undefined;
        const scriptIds = (result?.resultScriptIds as string[]) ?? [];
        return scriptIds.length > 0 ? `已生成 ${scriptIds.length} 条脚本` : '脚本生成完成';
      }
      return '任务已完成';
  }
}

export function TaskQueueItemRow({
  task,
  onClick,
  childOnClick,
  isChild = false,
  isParent = false,
  children = [],
  defaultExpanded = true,
}: {
  task: GlobalTaskItem;
  onClick: () => void;
  /** 子任务的点击回调（不传则子任务不可点击） */
  childOnClick?: () => void;
  /** 是否为子任务（缩进显示） */
  isChild?: boolean;
  /** 是否为父任务（有子任务） */
  isParent?: boolean;
  /** 子任务列表（用于折叠显示） */
  children?: GlobalTaskItem[];
  /** 默认是否展开 */
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const isRunning = task.status === TaskStatus.RUNNING;
  const isCompleted = task.status === TaskStatus.COMPLETED;
  const isFailed = task.status === TaskStatus.FAILED;
  const isPending = task.status === TaskStatus.PENDING;
  const isExpired = task.status === TaskStatus.EXPIRED;

  // 有子任务时，父任务的进度根据子任务计算
  const childProgress = useMemo(() => {
    if (!isParent || children.length === 0) return null;
    const completed = children.filter(c => c.status === TaskStatus.COMPLETED).length;
    const failed = children.filter(c => c.status === TaskStatus.FAILED).length;
    const running = children.filter(c => c.status === TaskStatus.RUNNING).length;
    const total = children.length;
    return { completed, failed, running, total };
  }, [isParent, children]);

  let statusIcon: string;
  let statusColor: string;
  if (isPending) {
    statusIcon = 'schedule';
    statusColor = 'text-gray-500';
  } else if (isRunning) {
    statusIcon = 'hourglass_empty';
    statusColor = 'text-sky-600';
  } else if (isCompleted) {
    statusIcon = 'check_circle';
    statusColor = 'text-emerald-600';
  } else if (isFailed) {
    statusIcon = 'error';
    statusColor = 'text-rose-600';
  } else {
    statusIcon = 'block';
    statusColor = 'text-gray-400';
  }

  const stageConfig = TASK_STAGE_CONFIG[task.type as GlobalTaskType];
  // 有子任务时使用子任务进度，否则使用 stage 进度
  const baseProgress = childProgress
    ? Math.round((childProgress.completed + childProgress.failed) / childProgress.total * 100)
    : (isRunning ? (stageConfig?.progress[task.stage || ''] ?? 5) : (isCompleted ? 100 : 0));
  // 假进度：让 running 任务的进度条缓慢移动（有子任务时用真实进度）
  const fakeProgress = useFakeProgress(isRunning, baseProgress);
  const progress = childProgress ? baseProgress : fakeProgress;
  const title = extractTaskTitle(task);

  // image_step3_model_photo：从 result 提取进度数据
  const photoProgress = useMemo(() => {
    if (task.type !== 'image_step3_model_photo' || !task.result) return null;
    const r = task.result;
    return {
      completed: (r.completedCount as number) ?? 0,
      failed: (r.failedCount as number) ?? 0,
      total: (r.total as number) ?? 0,
    };
  }, [task.type, task.result]);

  // stage 可能为 "generating 8/10" 格式，先提取基础 stage 再查 labels
  const baseStage = task.stage?.replace(/ \d+\/\d+$/, '') ?? '';
  // 已完成/已失败的任务 stage 为 null，应显示状态而非默认"处理中"
  const stageLabel = task.stage
    ? stageConfig?.labels[task.stage] || stageConfig?.labels[baseStage] || task.stage
    : (task.status === TaskStatus.COMPLETED ? '已完成' : task.status === TaskStatus.FAILED ? '已失败' : '处理中');

  // 父任务折叠/展开图标
  const expandIcon = isParent && children.length > 0 ? (
    <button
      onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
      className="flex items-center justify-center w-5 h-5 rounded-md hover:bg-sky-100 transition-all"
      title={expanded ? '收起子任务' : '展开子任务'}
    >
      <span className={`material-icons-round text-sm text-sky-500 transition-transform duration-200 ${expanded ? '' : 'rotate-180'}`}>
        expand_less
      </span>
    </button>
  ) : null;

  return (
    <div className="flex flex-col">
      <div
        className={`rounded-xl border transition-colors ${
          isChild
            ? 'p-2 text-[10px] bg-gray-50/30 border-gray-100'
            : 'p-3 text-xs'
        } ${
          isRunning
            ? isParent
              ? 'bg-sky-50/80 border-sky-200 hover:bg-sky-100/80 cursor-pointer'
              : 'bg-sky-50/50 border-sky-100 hover:bg-sky-50 cursor-pointer'
            : isCompleted
              ? isParent
                ? 'bg-emerald-50/60 border-emerald-200 hover:bg-emerald-50/80 cursor-pointer'
                : 'bg-emerald-50/30 border-emerald-100 hover:bg-emerald-50/60 cursor-pointer'
              : isFailed
                ? 'bg-rose-50/30 border-rose-100'
                : isPending
                  ? 'bg-gray-50/50 border-gray-100'
                  : 'bg-gray-50/30 border-gray-100'
        } ${isParent ? 'border-l-[3px] border-l-sky-500 shadow-sm' : ''}`}
        onClick={() => { if (isRunning || isCompleted) onClick(); }}
      >
        {/* 头部：类型标签 + 状态图标 */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {/* 父任务显示文件夹图标 */}
            {isParent && (
              <span className="material-icons-round text-sm text-sky-500 shrink-0">folder</span>
            )}
            {/* 类型标签 */}
            <span className={`px-1 py-0.5 rounded text-[9px] font-bold shrink-0 ${
              isParent ? 'bg-sky-100 text-sky-700' : isChild ? 'bg-gray-100 text-gray-600' : 'bg-sky-100 text-sky-700'
            }`}>
              {TASK_TYPE_LABELS[task.type as GlobalTaskType] || task.type}
            </span>
            {/* 父任务显示展开图标 */}
            {isParent && expandIcon && (
              <span className="shrink-0">{expandIcon}</span>
            )}
            <span className={`font-medium text-gray-700 line-clamp-1 truncate ${isChild ? 'text-[10px]' : 'text-xs'}`}>
              {isParent && childProgress
                ? `${title}`
                : title}
            </span>
            {/* 父任务子任务进度 badge */}
            {isParent && childProgress && (
              <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                childProgress.completed === childProgress.total
                  ? 'bg-emerald-100 text-emerald-700'
                  : childProgress.failed > 0
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-sky-100 text-sky-700'
              }`}>
                {childProgress.completed}/{childProgress.total}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {isRunning && (
              <span className="material-icons-round text-sm animate-spin text-sky-500">progress_activity</span>
            )}
            <span className={`material-icons-round ${isChild ? 'text-xs' : 'text-sm'} ${statusColor}`}>{statusIcon}</span>
          </div>
        </div>

        {/* 进度展示 */}
        {isRunning && task.type === 'image_step3_model_photo' && photoProgress && photoProgress.total > 0 ? (
          <>
            {/* 模特图方格网格 */}
            <div className="grid gap-[3px] mb-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(photoProgress.total, 10)}, 1fr)` }}>
              {Array.from({ length: photoProgress.total }, (_, i) => {
                const done = i < photoProgress.completed;
                const fail = i >= photoProgress.completed && i < photoProgress.completed + photoProgress.failed;
                return (
                  <div
                    key={i}
                    className={`aspect-square rounded-[3px] transition-all duration-300 ${
                      done
                        ? 'bg-emerald-400'
                        : fail
                          ? 'bg-rose-300'
                          : 'bg-gray-200 animate-pulse'
                    }`}
                    title={done ? '已完成' : fail ? '失败' : '生成中'}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500">{stageLabel}</span>
              <span className="text-[10px] font-semibold text-sky-600">
                {photoProgress.completed + photoProgress.failed}/{photoProgress.total}
              </span>
            </div>
          </>
        ) : isRunning ? (
          <>
            <div className={`rounded-full bg-gray-200/60 overflow-hidden mb-1 ${isChild ? 'h-1' : 'h-1.5'}`}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500">
                {childProgress
                  ? task.type === 'step6_fission_shot_prompts'
                    ? `${Math.floor(childProgress.completed / 2)}/${Math.floor(childProgress.total / 2)} 个分镜完成`
                    : `${childProgress.completed} 完成, ${childProgress.running} 运行中`
                  : (task.stage ? stageConfig?.labels[task.stage] || task.stage : '处理中')}
              </span>
              <span className="text-[10px] font-semibold text-sky-600">{Math.round(progress)}%</span>
            </div>
          </>
        ) : null}

        {/* 待处理 */}
        {isPending && (
          <p className="text-[10px] text-gray-400 mt-1">等待处理...</p>
        )}

        {/* 完成/失败信息 */}
        {isCompleted && (
          <p className="text-[10px] text-gray-500 mt-1">
            {childProgress
              ? task.type === 'step6_fission_shot_prompts'
                ? `全部完成：${Math.floor(childProgress.completed / 2)}/${Math.floor(childProgress.total / 2)} 个分镜`
                : `全部完成：${childProgress.completed}/${childProgress.total} 个策略`
              : getCompletedDescription(task)}
          </p>
        )}
        {isFailed && (
          <p className="text-[10px] text-rose-600 mt-1 line-clamp-1">{task.error?.message || '任务失败'}</p>
        )}
        {isExpired && (
          <p className="text-[10px] text-gray-400 mt-1">任务已过期</p>
        )}
      </div>

      {/* 子任务列表（折叠显示） */}
      {isParent && children.length > 0 && (
        <div className={`overflow-hidden transition-all duration-200 ease-in-out ${
          expanded ? 'max-h-[5000px] opacity-100 mt-1' : 'max-h-0 opacity-0'
        }`}>
          <div className="ml-4 flex flex-col gap-1">
            {children.map(child => (
              <TaskQueueItemRow
                key={child.id}
                task={child}
                onClick={childOnClick ?? (() => {})}
                isChild={true}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
