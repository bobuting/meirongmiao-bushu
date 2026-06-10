import { create } from "zustand";
import type { Character, Project, RuntimeThemeState, Theme, VideoAsset } from "../types";
import type { Step1OutfitModule } from "../../../src/contracts/step1-outfit-module-contract";
import type { Step1RoleDirectionCard } from "../../../src/contracts/step1-joint-reverse-contract";
import { STRATEGY_TYPE_LABELS } from "../utils/strategyTypeLabels";
import { GlobalTaskType, TaskStatus } from "../components/layout/taskQueueConfig";

// 保存状态类型
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SessionUser {
  id: string;
  email: string;
  role: "user" | "admin";
}

export type TaskNotificationCategory = "styled-view" | "storyboard" | "clip" | "final-video" | "reverse-script" | "step3-script" | "step3-batch-preview" | "step3-shot-prompt" | "outfit-change" | "fission";

export interface TaskNotification {
  id: string;
  category: TaskNotificationCategory;
  title: string;
  detail: string;
  targetPath: string | null;
  projectId: string | null;
  projectName: string | null;
  projectStatus: string | null;
  /** 反推完成时携带的脚本库 ID，用于自动弹出卡片 */
  libraryScriptId?: string | null;
  toastDurationMs?: number | null;
  createdAt: number;
  read: boolean;
  dedupeKey?: string;
}

/** Step3 任务类型中文标签（从统一标签映射表生成） */
const STEP3_TASK_LABELS: Record<string, string> = {
  step3_library: STRATEGY_TYPE_LABELS.library,
  step3_video: STRATEGY_TYPE_LABELS.video,
  step3_realtime: STRATEGY_TYPE_LABELS.realtime,
  step3_effectiveness: STRATEGY_TYPE_LABELS.effectiveness,
  step3_custom: STRATEGY_TYPE_LABELS.custom,
  step3_fashion: STRATEGY_TYPE_LABELS.fashion,
  step3_emotion_archetype: STRATEGY_TYPE_LABELS.emotion_archetype,
  step3_aesthetic: STRATEGY_TYPE_LABELS.aesthetic,
  step3_product_showcase: STRATEGY_TYPE_LABELS.product_showcase,
  step3_story_theme: STRATEGY_TYPE_LABELS.story_theme,
  step3_resonance: STRATEGY_TYPE_LABELS.resonance,
  step3_batch_preview: "分镜预览生成",
  step3_frame_preview: "帧预览生成",
};

/** 异步任务场景类型 — 覆盖所有后端 executor 注册的 job type */
export type AsyncJobType =
  | 'llm_reverse'    // LLM 反推（一键复刻）
  | 'step2_five_view' // Step2 五视图生成
  | 'step2_batch_five_view' // Step2 批量五视图
  | 'step3_scripts_generation' // Step3 脚本批量生成（父任务）
  | 'step3_shot_prompt' // Step3 专业提示词生成
  | 'step3_batch_preview' // Step3 批量分镜预览
  | 'step3_frame_preview' // Step3 单帧预览
  | 'step3_library'  // Step3 库存精选生成
  | 'step3_video'    // Step3 视频热榜生成
  | 'step3_realtime' // Step3 实时热榜生成
  | 'step3_effectiveness' // Step3 实时智能生成
  | 'step3_custom'   // Step3 场景化脚本生成
  | 'step3_fashion'  // Step3 时尚大片生成
  | 'step3_emotion_archetype' // Step3 情感原型生成
  | 'step3_aesthetic' // Step3 生活美学生成
  | 'step3_product_showcase' // Step3 产品展示生成
  | 'step3_story_theme' // Step3 主题叙事生成
  | 'step3_resonance' // Step3 共鸣故事生成
  | 'step3_reverse_rewrite' // Step3 反推脚本改写
  | 'step4_video'    // Step4 视频生成（父任务）
  | 'step4_clip_submit'    // Step4 视频片段提交（子任务）
  | 'step4_clip_query' // Step4 视频片段查询（系统）
  | 'step6_fission'  // Step6 裂变父任务
  | 'step6_fission_new_story' // Step6 裂变新故事
  | 'step6_fission_shot_prompts' // Step6 裂变提示词生成
  | 'step6_fission_item_image' // Step6 裂变图片
  | 'step6_fission_item_video_submit' // Step6 裂变视频提交
  | 'step6_fission_item_video_query' // Step6 裂变视频查询（系统）
  | 'step6_fission_combination' // Step6 裂变组合方案
  | 'outfit_change'  // 换装任务
  | 'outfit_change_understand' // 换装理解（系统）
  | 'outfit_change_adapt_video_edit' // 换装切片适配
  | 'outfit_change_gen_video_edit' // 换装视频编辑
  | 'outfit_change_gen_video_edit_query' // 换装视频编辑查询（系统）
  | 'image_step3_model_photo' // 图片项目主图生成
  | 'image_step3_model_plan' // 图片项目主图规划
  | 'image_step3_single_photo'; // 图片项目单张模特图

/** 全局任务队列项 — Zustand 镜像后端 DB 状态，所有页面共享 */
export interface GlobalTaskItem {
  id: string;
  type: string;
  status: TaskStatus;
  stage: string | null;
  input: string;
  /** 关联项目 ID（Step3 等业务） */
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
  result?: Record<string, unknown> | null;
  error?: { code: string; message: string } | null;
  /** 父任务 ID（从 input 解析，用于视觉分组） */
  parentJobId?: string | null;
}

interface ThemeState {
  currentTheme: RuntimeThemeState | null;
  availableThemes: Theme[];
  themeLoading: boolean;
  themeError: string | null;
  themeInitialized: boolean;
}

interface ProjectBackgroundGenerationTaskState {
  taskId: string | null;
  phase: "idle" | "running" | "completed" | "failed";
  progress: number;
  startedAt: number | null;
  updatedAt: number | null;
  resultRefs: string[];
  error: {
    code: string | null;
    message: string | null;
  } | null;
}

/** 数据库对齐的项目字段（映射 nrm_projects 表） */
export interface ProjectState {
  projectId: string | null;
  projectName: string | null;
  projectStatus: string | null;
  projectKind: "image" | "video" | "reverse" | "outfit_change";
  reverseScriptId: string | null;
  selectedOutfitPlanId: string | null;
  selectedPreviewId: string | null;
  selectedCharacterId: string | null;
  selectedRoleDirection: Record<string, unknown> | null;
  activeScriptId: string | null;
  exportUrl: string | null;
  coverImageUrl: string | null;
  videoCoverImageUrl: string | null;
  lastVisitedStep: number;
  lastReverseTaskId: string | null;
  lastReverseScriptVersionId: string | null;
}

interface AppState {
  sidebarCollapsed: boolean;
  hasNotification: boolean;
  taskNotifications: TaskNotification[];
  activeToastNotificationId: string | null;
  token: string | null;
  adminToken: string | null;
  currentUser: SessionUser | null;
  credits: { balance: number; expiresAt: number } | null;
  /** 按 projectId 隔离的项目状态（workflow 已废弃，保留空结构） */
  projectStateMap: Record<string, { workflow: Record<string, unknown>; projectData: ProjectState }>;
  /** 当前活跃项目 ID */
  activeProjectId: string | null;
  theme: ThemeState;
  saveStatus: SaveStatus;

  // 401 重登录弹窗状态
  authModalVisible: boolean;
  authModalLocked: boolean; // 弹窗锁定状态，防止并发 401 重复弹窗
  authModalLoggingIn: boolean; // 正在登录中，防止登录过程中弹窗被关闭或重复触发
  authModalPendingRetry: {
    method: string;
    path: string;
    body?: unknown;
  } | null;

  dataLoaded: {
    projects: boolean;
    assets: boolean;
    characters: boolean;
  };
  projects: Project[];
  assets: VideoAsset[];
  characters: Character[];

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setHasNotification: (has: boolean) => void;
  pushTaskNotification: (notification: {
    category: TaskNotificationCategory;
    title: string;
    detail: string;
    targetPath: string | null;
    projectId?: string | null;
    projectName?: string | null;
    projectStatus?: string | null;
    libraryScriptId?: string | null;
    toastDurationMs?: number;
    dedupeKey?: string;
  }) => void;
  markTaskNotificationRead: (id: string) => void;
  markAllTaskNotificationsRead: () => void;
  dismissTaskToast: () => void;
  setCurrentUser: (user: SessionUser | null) => void;
  setSession: (token: string | null, user: SessionUser | null) => void;
  setAdminToken: (token: string | null) => void;
  setCredits: (credits: { balance: number; expiresAt: number } | null) => void;
  // 项目隔离状态操作
  setActiveProject: (projectId: string) => void;
  updateWorkflowForProject: (projectId: string, patch: Record<string, unknown>) => void;
  updateProjectDataForProject: (projectId: string, data: Partial<ProjectState>) => void;
  clearProjectState: (projectId: string) => void;
  logout: () => void;

  // 401 重登录弹窗方法
  showReLoginModal: (method: string, path: string, body?: unknown) => void;
  hideReLoginModal: () => void;
  setAuthModalLoggingIn: (loggingIn: boolean) => void;
  setCurrentTheme: (theme: RuntimeThemeState | null) => void;
  setAvailableThemes: (themes: Theme[]) => void;
  setThemeLoading: (loading: boolean) => void;
  setThemeError: (error: string | null) => void;
  setThemeInitialized: (initialized: boolean) => void;
  updateThemeSystemName: (systemName: string) => void;
  updateThemeLogo: (logoUrl: string) => void;
  resetThemeState: () => void;
  setSaveStatus: (status: SaveStatus) => void;

  globalTimerStartTime: number | null;
  globalLoading: boolean;
  /** 引用计数：跟踪同时进行的 loading 操作数量 */
  globalLoadingCount: number;
  globalTimerMessageIndex: number;

  setGlobalTimerStart: () => void;
  showGlobalLoading: () => void;
  hideGlobalLoading: () => void;
  nextTimerMessage: () => void;

  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  deleteProject: (id: string) => void;
  setAssets: (assets: VideoAsset[]) => void;
  addAsset: (asset: VideoAsset) => void;
  deleteAsset: (id: string) => void;
  updateAsset: (asset: VideoAsset) => void;
  setCharacters: (characters: Character[]) => void;
  addCharacter: (character: Character) => void;
  deleteCharacter: (id: string) => void;
  updateCharacter: (character: Character) => void;

  // 项目列表过滤状态（跨页面导航持久化，被 navigate("/projects") 清空 URL 时恢复）
  projectListFilter: {
    filter: string;
    projectKindFilter: string | null;
    searchTerm: string;
    page: number;
  };
  setProjectListFilter: (patch: Partial<AppState["projectListFilter"]>) => void;

  // 全局任务队列（从后端 DB 读取，Zustand 作为全局共享状态）
  globalTaskQueue: GlobalTaskItem[];
  /** 标记 globalTaskQueue 是否已完成首次加载（防止刷新时自动触发逻辑误判） */
  globalTaskQueueInitialized: boolean;
  setGlobalTaskQueue: (tasks: GlobalTaskItem[]) => void;
  setGlobalTaskQueueInitialized: (initialized: boolean) => void;
  refreshGlobalTasks: () => Promise<void>;
}

const TOKEN_KEY = "vogue_ai_token";
const USER_KEY = "vogue_ai_user";
const ADMIN_TOKEN_KEY = "vogue_ai_admin_token";
const PROJECT_FLOW_ACTIVE_SESSION_KEY = "vogue_ai_active_project_flow";
const TIMER_MESSAGE_COUNT = 10;
const MAX_TASK_NOTIFICATIONS = 50;

function readJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const emptyWorkflow = (): Record<string, unknown> => ({}); // 已废弃，保留空实现以兼容

export const emptyProjectData = (): ProjectState => ({
  projectId: null,
  projectName: null,
  projectStatus: null,
  projectKind: "video",
  reverseScriptId: null,
  selectedOutfitPlanId: null,
  selectedPreviewId: null,
  selectedCharacterId: null,
  selectedRoleDirection: null,
  activeScriptId: null,
  exportUrl: null,
  coverImageUrl: null,
  videoCoverImageUrl: null,
  lastVisitedStep: 0,
  lastReverseTaskId: null,
  lastReverseScriptVersionId: null,
});

const emptyThemeState = (): ThemeState => ({
  currentTheme: null,
  availableThemes: [],
  themeLoading: false,
  themeError: null,
  themeInitialized: false,
});

function createTaskNotificationId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useAppStore = create<AppState>((set) => ({
  // 移动端初始折叠，防止首次渲染时的布局抖动
  sidebarCollapsed: (function() {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return true;
    }
    return false;
  })(),
  hasNotification: false,
  taskNotifications: [],
  activeToastNotificationId: null,
  token: sessionStorage.getItem(TOKEN_KEY),
  adminToken: localStorage.getItem(ADMIN_TOKEN_KEY),
  currentUser: readJson<SessionUser>(sessionStorage.getItem(USER_KEY)),
  credits: null,
  projectStateMap: {},
  activeProjectId: null,
  theme: emptyThemeState(),
  saveStatus: 'idle',

  // 全局计时器
  globalTimerStartTime: null,
  globalLoading: false,
  globalLoadingCount: 0,
  globalTimerMessageIndex: 0,

  // 401 重登录弹窗
  authModalVisible: false,
  authModalLocked: false, // 弹窗锁定状态
  authModalLoggingIn: false, // 正在登录中
  authModalPendingRetry: null,

  dataLoaded: {
    projects: false,
    assets: false,
    characters: false,
  },
  projects: [],
  assets: [],
  characters: [],

  // 项目列表过滤状态（跨页面导航持久化）
  projectListFilter: {
    filter: "全部",
    projectKindFilter: null,
    searchTerm: "",
    page: 1,
  },
  setProjectListFilter: (patch) =>
    set((s) => ({
      projectListFilter: { ...s.projectListFilter, ...patch },
    })),

  // ============================================================================
  // 全局任务队列（从后端 DB 读取，全局共享）
  // ============================================================================
  globalTaskQueue: [],
  /** 标记 globalTaskQueue 是否已完成首次加载（防止刷新时自动触发逻辑误判空数组） */
  globalTaskQueueInitialized: false,
  setGlobalTaskQueue: (tasks) => set({ globalTaskQueue: tasks }),
  setGlobalTaskQueueInitialized: (initialized) => set({ globalTaskQueueInitialized: initialized }),
  refreshGlobalTasks: async () => {
    const store = useAppStore.getState();
    if (!store.token) return;
    try {
      const resp = await fetch(`/neirongmiao/api/async-jobs/my`, {
        headers: { Authorization: `Bearer ${store.token}` },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const tasks: GlobalTaskItem[] = (data.jobs || []).map((j: any) => {
        // 优先使用后端独立字段，回退到 input JSON 解析
        let parentJobId: string | null = j.parentJobId ?? null;
        if (!parentJobId) {
          try {
            const inputObj = JSON.parse(j.input) as Record<string, unknown>;
            parentJobId = (inputObj.parentJobId as string) ?? null;
          } catch { /* ignore */ }
        }
        return {
          id: j.id,
          type: j.jobType || 'llm_reverse',
          status: j.status,
          stage: j.stage || null,
          input: j.input,
          projectId: j.projectId || null,
          createdAt: j.createdAt,
          updatedAt: j.updatedAt,
          result: j.result,
          error: j.error,
          parentJobId,
        };
      });
      // 首次加载成功后设置 initialized 标记
      set({ globalTaskQueue: tasks, globalTaskQueueInitialized: true });

      // 检查是否有新完成/失败的任务，推送通知
      const prevTasks = store.globalTaskQueue;
      for (const task of tasks) {
        const prev = prevTasks.find((p) => p.id === task.id);
        if (prev && prev.status === TaskStatus.RUNNING && task.status === TaskStatus.COMPLETED) {
          switch (task.type) {
            // Step3 分镜预览
            case GlobalTaskType.STEP3_BATCH_PREVIEW:
            case GlobalTaskType.STEP3_FRAME_PREVIEW:
              store.pushTaskNotification({
                category: "step3-batch-preview",
                title: "分镜预览完成",
                detail: "分镜预览图片已生成，可返回查看",
                targetPath: task.projectId ? `/create/${task.projectId}/step3` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP3_SHOT_PROMPT:
              store.pushTaskNotification({
                category: "step3-shot-prompt",
                title: "专业提示词生成完成",
                detail: "分镜专业提示词已生成，正在创建帧预览任务",
                targetPath: task.projectId ? `/create/${task.projectId}/step3` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            // 图片项目 Step3 模特图（单人/多人）
            case GlobalTaskType.IMAGE_STEP3_MODEL_PHOTO:
            case GlobalTaskType.IMAGE_STEP3_MULTI_PERSON: {
              const result = task.result as Record<string, unknown> | undefined;
              // 从 childResults 中过滤 single_photo 类型统计图片数量
              const childResults = (result?.childResults as Array<{ jobType: string; status: string }> | undefined) ?? [];
              const photoChildren = childResults.filter((c) => c.jobType === GlobalTaskType.IMAGE_STEP3_SINGLE_PHOTO);
              const successCount = photoChildren.filter((c) => c.status === "completed").length;
              const failedCount = photoChildren.filter((c) => c.status === "failed").length;
              store.pushTaskNotification({
                category: "clip",
                title: "模特图生成完成",
                detail: `共 ${successCount + failedCount} 张，成功 ${successCount} 张`,
                targetPath: task.projectId ? `/image-create/${task.projectId}/step3` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            }
            case GlobalTaskType.IMAGE_STEP3_MODEL_PLAN:
            case GlobalTaskType.IMAGE_STEP3_MULTI_PERSON_PLAN: {
              const result = task.result as Record<string, unknown> | undefined;
              const photoCount = (result?.photoCount as number) ?? 0;
              store.pushTaskNotification({
                category: "clip",
                title: "主图规划完成",
                detail: `共规划 ${photoCount} 张模特图，正在生成中`,
                targetPath: task.projectId ? `/image-create/${task.projectId}/step3` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            }
            case GlobalTaskType.IMAGE_STEP3_SINGLE_PHOTO:
              store.pushTaskNotification({
                category: "clip",
                title: "单张模特图生成完成",
                detail: "模特图已生成完成",
                targetPath: task.projectId ? `/image-create/${task.projectId}/step3` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            // 图片项目 Step4 电商详情页
            case GlobalTaskType.IMAGE_STEP4_GENERATE_ALL: {
              const result = task.result as Record<string, unknown> | undefined;
              const successCount = (result?.successCount as number) ?? 0;
              const failedCount = (result?.failedCount as number) ?? 0;
              store.pushTaskNotification({
                category: "clip",
                title: "详情页生成完成",
                detail: `共 ${successCount + failedCount} 个模块，成功 ${successCount} 个`,
                targetPath: task.projectId ? `/image-create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
              });
              break;
            }
            case GlobalTaskType.IMAGE_STEP4_SECTION_PLAN: {
              const result = task.result as Record<string, unknown> | undefined;
              const sectionCount = (result?.sectionCount as number) ?? 0;
              store.pushTaskNotification({
                category: "clip",
                title: "AI 规划完成",
                detail: `共 ${sectionCount} 个模块，点击「生成全部」开始制作`,
                targetPath: task.projectId ? `/image-create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
              });
              break;
            }
            case GlobalTaskType.IMAGE_STEP4_SECTION_REPLAN: {
              const result = task.result as Record<string, unknown> | undefined;
              const sectionCount = (result?.sectionCount as number) ?? 1;
              store.pushTaskNotification({
                category: "clip",
                title: "模块重新规划完成",
                detail: `模块已重新规划，正在生成图片`,
                targetPath: task.projectId ? `/image-create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
              });
              break;
            }
            case GlobalTaskType.IMAGE_STEP4_SINGLE_SECTION:
              store.pushTaskNotification({
                category: "clip",
                title: "模块生成完成",
                detail: "模块图片已生成完成",
                targetPath: task.projectId ? `/image-create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
              });
              break;
            // 视频项目 Step4
            case GlobalTaskType.STEP4_CLIP_SUBMIT:
              store.pushTaskNotification({
                category: "clip",
                title: "视频片段生成完成",
                detail: "任务已完成，可返回项目查看",
                targetPath: task.projectId ? `/create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP4_VIDEO:
              store.pushTaskNotification({
                category: "clip",
                title: "视频生成完成",
                detail: "视频生成任务已完成",
                targetPath: task.projectId ? `/create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP4_CLIP_QUERY:
              // 系统任务（视频状态查询）：不弹通知
              break;
            // Step2 五视图
            case GlobalTaskType.STEP2_FIVE_VIEW:
              store.pushTaskNotification({
                category: "clip",
                title: "五视图生成完成",
                detail: "角色五视图已生成完成",
                targetPath: task.projectId ? `/create/${task.projectId}/step2` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.IMAGE_STEP2_FIVE_VIEW:
              store.pushTaskNotification({
                category: "clip",
                title: "五视图生成完成",
                detail: "角色五视图已生成完成",
                targetPath: task.projectId ? `/image-create/${task.projectId}/step2` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP2_BATCH_FIVE_VIEW: {
              const result = task.result as Record<string, unknown> | undefined;
              const completedCount = (result?.completedCount as number) ?? 0;
              const failedCount = (result?.failedCount as number) ?? 0;
              store.pushTaskNotification({
                category: "clip",
                title: "批量五视图生成完成",
                detail: `成功 ${completedCount} 个${failedCount > 0 ? `，失败 ${failedCount} 个` : ''}`,
                targetPath: task.projectId ? `/create/${task.projectId}/step2` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            }
            case GlobalTaskType.IMAGE_STEP2_BATCH_FIVE_VIEW: {
              const result = task.result as Record<string, unknown> | undefined;
              const completedCount = (result?.completedCount as number) ?? 0;
              const failedCount = (result?.failedCount as number) ?? 0;
              store.pushTaskNotification({
                category: "clip",
                title: "批量五视图生成完成",
                detail: `成功 ${completedCount} 个${failedCount > 0 ? `，失败 ${failedCount} 个` : ''}`,
                targetPath: task.projectId ? `/image-create/${task.projectId}/step2` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            }
            // 换装项目
            case GlobalTaskType.OUTFIT_CHANGE:
              store.pushTaskNotification({
                category: "outfit-change",
                title: "换装任务完成",
                detail: "换装视频已生成",
                targetPath: task.projectId ? `/outfit-create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.OUTFIT_CHANGE_UNDERSTAND:
              // 系统任务：不弹通知，由下一个任务（adapt_video_edit）触发通知
              break;
            case GlobalTaskType.OUTFIT_CHANGE_ADAPT_VIDEO_EDIT:
              store.pushTaskNotification({
                category: "outfit-change",
                title: "切片适配完成",
                detail: "视频切片与参考图适配完成",
                targetPath: task.projectId ? `/outfit-create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.OUTFIT_CHANGE_GEN_VIDEO_EDIT_QUERY:
              // 系统任务（query）：不弹通知，由父任务或上一个任务触发通知
              break;
            case GlobalTaskType.OUTFIT_CHANGE_GEN_VIDEO_EDIT:
              // 只处理用户任务（有 videoTaskId），系统任务 query 不弹通知
              if (task.result?.videoTaskId) {
                store.pushTaskNotification({
                  category: "outfit-change",
                  title: "换装视频编辑完成",
                  detail: "视频编辑任务已完成",
                  targetPath: task.projectId ? `/outfit-create/${task.projectId}/step4` : null,
                  projectId: task.projectId ?? null,
                  toastDurationMs: 5000,
                });
              }
              break;
            // Step6 裂变
            case GlobalTaskType.STEP6_FISSION:
              store.pushTaskNotification({
                category: "fission",
                title: "裂变任务全部完成",
                detail: "裂变任务全部完成",
                targetPath: task.projectId ? `/create/${task.projectId}/step6` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP6_FISSION_NEW_STORY:
              store.pushTaskNotification({
                category: "fission",
                title: "新故事脚本生成完成",
                detail: "新故事脚本生成完成",
                targetPath: task.projectId ? `/create/${task.projectId}/step6` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP6_FISSION_SHOT_PROMPTS:
              store.pushTaskNotification({
                category: "fission",
                title: "裂变提示词生成完成",
                detail: "裂变提示词生成完成",
                targetPath: task.projectId ? `/create/${task.projectId}/step6` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP6_FISSION_ITEM_IMAGE:
              store.pushTaskNotification({
                category: "fission",
                title: "裂变图片生成完成",
                detail: "裂变图片生成完成",
                targetPath: task.projectId ? `/create/${task.projectId}/step6` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP6_FISSION_ITEM_VIDEO_SUBMIT:
              store.pushTaskNotification({
                category: "fission",
                title: "裂变视频生成完成",
                detail: "裂变视频生成完成",
                targetPath: task.projectId ? `/create/${task.projectId}/step6` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP6_FISSION_COMBINATION:
              store.pushTaskNotification({
                category: "fission",
                title: "裂变组合方案生成完成",
                detail: "裂变组合方案生成完成",
                targetPath: task.projectId ? `/create/${task.projectId}/step6` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP6_FISSION_ITEM_VIDEO_QUERY:
              // 系统任务：不弹通知
              break;
            // Step3 脚本（所有未在上方特殊处理的类型）
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
              store.pushTaskNotification({
                category: "step3-script",
                title: "脚本生成完成",
                detail: "脚本生成已完成",
                targetPath: task.projectId ? `/create/${task.projectId}/step3` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            // 反推任务
            case GlobalTaskType.LLM_REVERSE:
              // 反推完成通知在 reverse 相关组件处理
              break;
            default:
              // 默认通知：未匹配的任务类型显示"任务完成"
              store.pushTaskNotification({
                category: "clip",
                title: "任务完成",
                detail: `任务已完成`,
                targetPath: null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
          }
        } else if (prev && prev.status === TaskStatus.RUNNING && task.status === TaskStatus.FAILED) {
          switch (task.type) {
            // Step3 分镜预览失败
            case GlobalTaskType.STEP3_BATCH_PREVIEW:
              store.pushTaskNotification({
                category: "step3-batch-preview",
                title: "分镜预览生成失败",
                detail: task.error?.message || '分镜预览生成失败',
                targetPath: task.projectId ? `/create/${task.projectId}/step3` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP3_FRAME_PREVIEW:
              store.pushTaskNotification({
                category: "step3-batch-preview",
                title: "帧预览生成失败",
                detail: task.error?.message || '帧预览生成失败',
                targetPath: task.projectId ? `/create/${task.projectId}/step3` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP3_SHOT_PROMPT:
              store.pushTaskNotification({
                category: "step3-shot-prompt",
                title: "专业提示词生成失败",
                detail: task.error?.message || '专业提示词生成失败',
                targetPath: task.projectId ? `/create/${task.projectId}/step3` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            // 图片项目 Step3 模特图失败（单人/多人）
            case GlobalTaskType.IMAGE_STEP3_MODEL_PLAN:
            case GlobalTaskType.IMAGE_STEP3_MULTI_PERSON_PLAN:
              store.pushTaskNotification({
                category: "clip",
                title: "主图规划失败",
                detail: task.error?.message || '规划失败，请重试',
                targetPath: task.projectId ? `/image-create/${task.projectId}/step3` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.IMAGE_STEP3_MODEL_PHOTO:
            case GlobalTaskType.IMAGE_STEP3_MULTI_PERSON:
              store.pushTaskNotification({
                category: "clip",
                title: "模特图生成失败",
                detail: task.error?.message || '生成失败，请重试',
                targetPath: task.projectId ? `/image-create/${task.projectId}/step3` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.IMAGE_STEP3_SINGLE_PHOTO:
              store.pushTaskNotification({
                category: "clip",
                title: "单张模特图生成失败",
                detail: task.error?.message || '生成失败，请重试',
                targetPath: task.projectId ? `/image-create/${task.projectId}/step3` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            // 图片项目 Step4 电商详情页失败
            case GlobalTaskType.IMAGE_STEP4_GENERATE_ALL:
              store.pushTaskNotification({
                category: "clip",
                title: "详情页生成失败",
                detail: task.error?.message || '生成失败，请重试',
                targetPath: task.projectId ? `/image-create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
              });
              break;
            case GlobalTaskType.IMAGE_STEP4_SECTION_PLAN:
            case GlobalTaskType.IMAGE_STEP4_SECTION_REPLAN:
              store.pushTaskNotification({
                category: "clip",
                title: "AI 规划失败",
                detail: task.error?.message || '规划失败，请重试',
                targetPath: task.projectId ? `/image-create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
              });
              break;
            case GlobalTaskType.IMAGE_STEP4_SINGLE_SECTION:
              store.pushTaskNotification({
                category: "clip",
                title: "模块生成失败",
                detail: task.error?.message || '模块生成失败，请重试',
                targetPath: task.projectId ? `/image-create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
              });
              break;
            // 视频项目 Step4 失败
            case GlobalTaskType.STEP4_CLIP_SUBMIT:
              store.pushTaskNotification({
                category: "clip",
                title: "视频片段生成失败",
                detail: task.error?.message || '视频生成失败，请重试',
                targetPath: task.projectId ? `/create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP4_VIDEO:
              store.pushTaskNotification({
                category: "clip",
                title: "视频生成失败",
                detail: task.error?.message || '视频生成失败，请重试',
                targetPath: task.projectId ? `/create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP4_CLIP_QUERY:
              // 系统任务失败（视频状态查询）：不弹通知
              break;
            // Step2 五视图失败
            case GlobalTaskType.STEP2_FIVE_VIEW:
              store.pushTaskNotification({
                category: "clip",
                title: "五视图生成失败",
                detail: task.error?.message || '五视图生成失败，请重试',
                targetPath: task.projectId ? `/create/${task.projectId}/step2` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP2_BATCH_FIVE_VIEW:
              store.pushTaskNotification({
                category: "clip",
                title: "批量五视图生成失败",
                detail: task.error?.message || '批量五视图生成失败，请重试',
                targetPath: task.projectId ? `/create/${task.projectId}/step2` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.IMAGE_STEP2_FIVE_VIEW:
              store.pushTaskNotification({
                category: "clip",
                title: "五视图生成失败",
                detail: task.error?.message || '五视图生成失败，请重试',
                targetPath: task.projectId ? `/image-create/${task.projectId}/step2` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.IMAGE_STEP2_BATCH_FIVE_VIEW:
              store.pushTaskNotification({
                category: "clip",
                title: "批量五视图生成失败",
                detail: task.error?.message || '批量五视图生成失败，请重试',
                targetPath: task.projectId ? `/image-create/${task.projectId}/step2` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            // 换装项目失败
            case GlobalTaskType.OUTFIT_CHANGE:
              store.pushTaskNotification({
                category: "outfit-change",
                title: "换装任务失败",
                detail: task.error?.message || '换装视频生成失败，请重试',
                targetPath: task.projectId ? `/outfit-create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.OUTFIT_CHANGE_UNDERSTAND:
              // 系统任务失败：不弹通知，由下一个任务失败时统一通知
              break;
            case GlobalTaskType.OUTFIT_CHANGE_ADAPT_VIDEO_EDIT:
              store.pushTaskNotification({
                category: "outfit-change",
                title: "切片适配失败",
                detail: task.error?.message || '视频切片适配失败，请重试',
                targetPath: task.projectId ? `/outfit-create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.OUTFIT_CHANGE_GEN_VIDEO_EDIT:
              store.pushTaskNotification({
                category: "outfit-change",
                title: "换装视频编辑失败",
                detail: task.error?.message || '视频编辑失败，请重试',
                targetPath: task.projectId ? `/outfit-create/${task.projectId}/step4` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.OUTFIT_CHANGE_GEN_VIDEO_EDIT_QUERY:
              // 系统任务失败：不弹通知
              break;
            // Step6 裂变失败
            case GlobalTaskType.STEP6_FISSION:
              store.pushTaskNotification({
                category: "fission",
                title: "裂变任务失败",
                detail: task.error?.message || '裂变任务失败，请重试',
                targetPath: task.projectId ? `/create/${task.projectId}/step6` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP6_FISSION_NEW_STORY:
              store.pushTaskNotification({
                category: "fission",
                title: "新故事脚本生成失败",
                detail: task.error?.message || '新故事脚本生成失败',
                targetPath: task.projectId ? `/create/${task.projectId}/step6` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP6_FISSION_SHOT_PROMPTS:
              store.pushTaskNotification({
                category: "fission",
                title: "裂变提示词生成失败",
                detail: task.error?.message || '裂变提示词生成失败',
                targetPath: task.projectId ? `/create/${task.projectId}/step6` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP6_FISSION_ITEM_IMAGE:
              store.pushTaskNotification({
                category: "fission",
                title: "裂变图片生成失败",
                detail: task.error?.message || '裂变图片生成失败',
                targetPath: task.projectId ? `/create/${task.projectId}/step6` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP6_FISSION_ITEM_VIDEO_SUBMIT:
              store.pushTaskNotification({
                category: "fission",
                title: "裂变视频生成失败",
                detail: task.error?.message || '裂变视频生成失败',
                targetPath: task.projectId ? `/create/${task.projectId}/step6` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP6_FISSION_COMBINATION:
              store.pushTaskNotification({
                category: "fission",
                title: "裂变组合方案生成失败",
                detail: task.error?.message || '裂变组合方案生成失败',
                targetPath: task.projectId ? `/create/${task.projectId}/step6` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            case GlobalTaskType.STEP6_FISSION_ITEM_VIDEO_QUERY:
              // 系统任务：不弹通知
              break;
            // Step3 脚本失败（所有未在上方特殊处理的类型）
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
              store.pushTaskNotification({
                category: "step3-script",
                title: "脚本生成失败",
                detail: task.error?.message || '脚本生成失败',
                targetPath: task.projectId ? `/create/${task.projectId}/step3` : null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
            default:
              // 默认通知：未匹配的任务类型显示"任务失败"
              store.pushTaskNotification({
                category: "clip",
                title: "任务失败",
                detail: task.error?.message || '任务失败，请重试',
                targetPath: null,
                projectId: task.projectId ?? null,
                toastDurationMs: 5000,
              });
              break;
          }
        }
      }
    } catch (err) {
      console.error('[refreshGlobalTasks] 轮询失败:', err);
    }
  },

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setHasNotification: (has) => set({ hasNotification: has }),
  pushTaskNotification: (notification) =>
    set((state) => {
      const dedupeKey = notification.dedupeKey?.trim();
      if (dedupeKey) {
        const existing = state.taskNotifications.find((item) => item.dedupeKey === dedupeKey);
        if (existing) {
          const refreshed: TaskNotification = {
            ...existing,
            title: notification.title,
            detail: notification.detail,
            targetPath: notification.targetPath,
            category: notification.category,
            projectId: notification.projectId ?? null,
            projectName: notification.projectName ?? null,
            projectStatus: notification.projectStatus ?? null,
            libraryScriptId: notification.libraryScriptId ?? null,
            toastDurationMs: notification.toastDurationMs ?? existing.toastDurationMs ?? null,
            createdAt: Date.now(),
            read: false,
          };
          const nextNotifications = [
            refreshed,
            ...state.taskNotifications.filter((item) => item.id !== existing.id),
          ].slice(0, MAX_TASK_NOTIFICATIONS);
          return {
            taskNotifications: nextNotifications,
            activeToastNotificationId: refreshed.id,
            hasNotification: true,
          };
        }
      }

      const nextNotification: TaskNotification = {
        id: createTaskNotificationId(),
        category: notification.category,
        title: notification.title,
        detail: notification.detail,
        targetPath: notification.targetPath,
        projectId: notification.projectId ?? null,
        projectName: notification.projectName ?? null,
        projectStatus: notification.projectStatus ?? null,
        libraryScriptId: notification.libraryScriptId ?? null,
        toastDurationMs: notification.toastDurationMs ?? null,
        createdAt: Date.now(),
        read: false,
        dedupeKey: dedupeKey || undefined,
      };

      const nextNotifications = [nextNotification, ...state.taskNotifications].slice(
        0,
        MAX_TASK_NOTIFICATIONS,
      );
      return {
        taskNotifications: nextNotifications,
        activeToastNotificationId: nextNotification.id,
        hasNotification: true,
      };
    }),
  markTaskNotificationRead: (id) =>
    set((state) => {
      const nextNotifications = state.taskNotifications.map((item) =>
        item.id === id ? { ...item, read: true } : item,
      );
      const hasUnread = nextNotifications.some((item) => !item.read);
      return {
        taskNotifications: nextNotifications,
        hasNotification: hasUnread,
      };
    }),
  markAllTaskNotificationsRead: () =>
    set((state) => ({
      taskNotifications: state.taskNotifications.map((item) => ({ ...item, read: true })),
      hasNotification: false,
    })),
  dismissTaskToast: () => set({ activeToastNotificationId: null }),
  setCurrentUser: (user) =>
    set(() => {
      if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      else sessionStorage.removeItem(USER_KEY);
      return { currentUser: user };
    }),
  setSession: (token, user) =>
    set(() => {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);

      if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      else sessionStorage.removeItem(USER_KEY);

      return {
        token,
        currentUser: user,
        // 登录成功后清除弹窗相关状态
        authModalVisible: false,
        authModalLocked: false,
        authModalLoggingIn: false,
        authModalPendingRetry: null,
      };
    }),
  setAdminToken: (token) =>
    set(() => {
      if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
      else localStorage.removeItem(ADMIN_TOKEN_KEY);
      return { adminToken: token };
    }),
  setCredits: (credits) => set({ credits }),
  setActiveProject: (projectId) =>
    set({ activeProjectId: projectId }),
  updateWorkflowForProject: (projectId, patch) =>
    set((state) => {
      const existing = state.projectStateMap[projectId] ?? {
        workflow: emptyWorkflow(),
        projectData: emptyProjectData(),
      };
      return {
        projectStateMap: {
          ...state.projectStateMap,
          [projectId]: {
            ...existing,
            workflow: { ...existing.workflow, ...patch },
          },
        },
      };
    }),
  updateProjectDataForProject: (projectId, data) =>
    set((state) => {
      const existing = state.projectStateMap[projectId] ?? {
        workflow: emptyWorkflow(),
        projectData: emptyProjectData(),
      };
      return {
        projectStateMap: {
          ...state.projectStateMap,
          [projectId]: {
            ...existing,
            projectData: { ...existing.projectData, ...data },
          },
        },
      };
    }),
  clearProjectState: (projectId) =>
    set((state) => {
      const { [projectId]: _, ...rest } = state.projectStateMap;
      return {
        projectStateMap: rest,
        activeProjectId: state.activeProjectId === projectId ? null : state.activeProjectId,
      };
    }),
  logout: () =>
    set(() => {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      // 清除项目活跃会话，防止退出登录后恢复旧项目
      localStorage.removeItem(PROJECT_FLOW_ACTIVE_SESSION_KEY);
      return {
        token: null,
        adminToken: null,
        currentUser: null,
        credits: null,
        projectStateMap: {},
        activeProjectId: null,
        theme: emptyThemeState(),
        hasNotification: false,
        taskNotifications: [],
        activeToastNotificationId: null,
        globalTimerStartTime: null,
        globalLoading: false,
        globalLoadingCount: 0,
        globalTimerMessageIndex: 0,
        globalTaskQueue: [],
      };
    }),

  // 401 重登录弹窗
  showReLoginModal: (method, path, body) =>
    set((state) => {
      // 去重：如果已经弹出过、已锁定、或正在登录中，不重复显示
      if (state.authModalVisible || state.authModalLocked || state.authModalLoggingIn) return state;
      // 不清除 token 和 currentUser，防止 RequireAuth 路由守卫跳转到登录页
      // 登录成功后 setSession 会覆盖旧值
      return {
        authModalVisible: true,
        authModalLocked: true, // 锁定弹窗，防止并发 401 重复弹窗
        authModalPendingRetry: { method, path, body },
      };
    }),
  hideReLoginModal: () =>
    set((state) => {
      // 如果正在登录中，不允许关闭弹窗
      if (state.authModalLoggingIn) {
        return state;
      }
      return {
        authModalVisible: false,
        authModalLocked: false, // 解锁，允许后续 401 触发弹窗
        authModalLoggingIn: false, // 重置登录中状态
        authModalPendingRetry: null,
      };
    }),

  setAuthModalLoggingIn: (loggingIn) =>
    set({ authModalLoggingIn: loggingIn }),

  setCurrentTheme: (theme) =>
    set((state) => ({
      theme: {
        ...state.theme,
        currentTheme: theme,
      },
    })),
  setAvailableThemes: (themes) =>
    set((state) => ({
      theme: {
        ...state.theme,
        availableThemes: themes,
      },
    })),
  setThemeLoading: (loading) =>
    set((state) => ({
      theme: {
        ...state.theme,
        themeLoading: loading,
      },
    })),
  setThemeError: (error) =>
    set((state) => ({
      theme: {
        ...state.theme,
        themeError: error,
      },
    })),
  setThemeInitialized: (initialized) =>
    set((state) => ({
      theme: {
        ...state.theme,
        themeInitialized: initialized,
      },
    })),
  updateThemeSystemName: (systemName) =>
    set((state) => {
      if (!state.theme.currentTheme) return state;
      return {
        theme: {
          ...state.theme,
          currentTheme: {
            ...state.theme.currentTheme,
            systemName,
          },
        },
      };
    }),
  updateThemeLogo: (logoUrl) =>
    set((state) => {
      if (!state.theme.currentTheme) return state;
      return {
        theme: {
          ...state.theme,
          currentTheme: {
            ...state.theme.currentTheme,
            logoUrl,
          },
        },
      };
    }),
  resetThemeState: () => set({ theme: emptyThemeState() }),
  setSaveStatus: (status) => set({ saveStatus: status }),

  setProjects: (projects) =>
    set((state) => ({
      projects,
      dataLoaded: { ...state.dataLoaded, projects: true },
    })),
  addProject: (project) => set((state) => ({ projects: [project, ...state.projects] })),
  deleteProject: (id) => set((state) => ({ projects: state.projects.filter((p) => p.id !== id) })),
  setAssets: (assets) =>
    set((state) => ({
      assets,
      dataLoaded: { ...state.dataLoaded, assets: true },
    })),
  addAsset: (asset) => set((state) => ({ assets: [...state.assets, asset] })),
  deleteAsset: (id) => set((state) => ({ assets: state.assets.filter((a) => a.id !== id) })),
  updateAsset: (asset) =>
    set((state) => ({
      assets: state.assets.map((a) => (a.id === asset.id ? asset : a)),
    })),
  setCharacters: (characters) =>
    set((state) => ({
      characters,
      dataLoaded: { ...state.dataLoaded, characters: true },
    })),
  addCharacter: (character) => set((state) => ({ characters: [character, ...state.characters] })),
  deleteCharacter: (id) => set((state) => ({ characters: state.characters.filter((c) => c.id !== id) })),
  updateCharacter: (character) =>
    set((state) => ({
      characters: state.characters.map((c) => (c.id === character.id ? character : c)),
    })),

  // 全局计时器 actions
  setGlobalTimerStart: () => {
    set({ globalTimerStartTime: Date.now(), globalTimerMessageIndex: 0 });
  },
  showGlobalLoading: () => {
    set((s) => {
      const count = s.globalLoadingCount + 1;
      return { globalLoadingCount: count, globalLoading: count > 0 };
    });
  },
  hideGlobalLoading: () => {
    set((s) => {
      const count = Math.max(0, s.globalLoadingCount - 1);
      return { globalLoadingCount: count, globalLoading: count > 0 };
    });
  },
  nextTimerMessage: () => {
    set((state) => ({
      globalTimerMessageIndex: (state.globalTimerMessageIndex + 1) % TIMER_MESSAGE_COUNT,
    }));
  },

}));
