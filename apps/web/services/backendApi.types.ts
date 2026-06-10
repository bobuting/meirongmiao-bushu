/**
 * backendApi 类型定义模块
 * 从 backendApi.ts 提取的所有类型、接口和 DTO
 */

import type {
  MyLibraryPagedResponse,
  UserScriptRecordDto,
  MyStoryboardLibraryRecordDto,
} from "../../../src/contracts/my-library-api";
import type { ReverseStoryboardPanelViewModel } from "../../../src/contracts/reverse-storyboard-report";
import type { ScriptDto, ScriptStrategyType, ScriptSuitability } from "@contracts/script.dto";
import type { Theme, ThemeConfig } from "../types";

// ============================================================================
// 基础类型
// ============================================================================

export type UserRole = "user" | "admin";

// ProviderRouteKey 类型定义（与后端 contracts/provider-route-keys.ts 保持一致）
export const PROVIDER_ROUTE_KEYS = [
  // Step1 服饰
  "step1_fashion_search",
  "step1_fashion_analysis",
  "step1_role_preset",
  // Step3 脚本
  "step3_script_generation",
  "step3_storyboard_image",
  // Step4 分镜视频
  "step4_storyboard_video",
  // Step5 成片
  "step4_clip_video_generation",
  // 广场/热榜反推
  "square_video_reverse",
  "hot_trend_video_reverse",
  // 库管理
  "library_portrait_detect",
  // 能力实验室
  "text_generation",
  "image_generation",
  "video_generation",
] as const;

export type ProviderRouteKey = (typeof PROVIDER_ROUTE_KEYS)[number];

export type CharacterViewKey = "front" | "left" | "right" | "back" | "closeup";
export type CharacterViewState = "pending" | "generating" | "ready" | "failed";

export type ApiMode = "real" | "mock" | "hybrid";

export type ApiFeature =
  | "auth"
  | "projects"
  | "uploads"
  | "outfit"
  | "characters"
  | "scripts"
  | "storyboard"
  | "video"
  | "export"
  | "reverse"
  | "review"
  | "square"
  | "me"
  | "admin"
  | "library";

// ============================================================================
// 用户与认证
// ============================================================================

export interface LoginUser {
  id: string;
  email: string;
  role: UserRole;
}

interface _ApiErrorPayload {
  code?: string;
  message?: string;
  requestId?: string;
  request_id?: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  requestId: string | null;

  constructor(status: number, code: string, message: string, requestId: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

// ============================================================================
// 角色与视图
// ============================================================================

export interface CharacterViewDraftDto {
  key: CharacterViewKey;
  label: string;
  prompt: string;
  referenceImages?: string[];
  ratio?: "1:1" | "3:4" | "9:16" | "16:9";
  resolution?: "1k" | "2k" | "4k";
  status: CharacterViewState;
  candidates: string[];
  selectedImageUrl: string | null;
  confirmSource?: "candidate" | "drag" | "upload";
  confirmed: boolean;
  errorMessage: string | null;
  logs: string[];
  updatedAt: number;
}

export interface CharacterViewSessionDto {
  status: "idle" | "running" | "completed";
  total: number;
  generated: number;
  confirmed: number;
  startedAt: number;
  updatedAt: number;
  logs: string[];
  views: CharacterViewDraftDto[];
}

export interface LibraryCharacterDto {
  id: string;
  name: string;
  kind: "basic" | "image" | "video";
  status: "processing" | "ready";
  thumbnailUrl: string;
  tags: string[];
  /** @deprecated 仅读取兼容，不再写入 */
  views: string[];
  fiveViewOssImageUrl: string | null;
  viewSession?: CharacterViewSessionDto | null;
  videoPreview: string | null;
  /** 激活五视图的状态（来自 nrm_character_five_views 表） */
  activeFiveViewStatus?: "pending" | "processing" | "ready" | "failed" | null;
  // 角色分析字段（统一归一化后的格式）
  gender?: "male" | "female" | null;
  age?: number | null;
}

/** 角色列表分页查询参数 */
export interface ListLibraryCharactersParams {
  page?: number;
  pageSize?: number;
  gender?: string;
  tags?: string[];
  keyword?: string;
}

/** 角色列表分页返回结果 */
export interface ListLibraryCharactersResult {
  items: LibraryCharacterDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

// ============================================================================
// Step1 图像分类
// ============================================================================

export type Step1ImageClassificationCategory =
  | "top"
  | "bottom"
  | "shoes"
  | "accessory"
  | "dress"
  | "outer"
  | "suit"
  | "background"
  | "person"
  | "other"
  | "unknown";

export type Step1ImageClassificationViewLabel = "main" | "front" | "side" | "back" | "detail" | "unknown";

export interface Step1ImageClassificationResultDto {
  mode: "provider" | "heuristic" | "fallback";
  classification: {
    category: Step1ImageClassificationCategory;
    confidence: number;
    viewLabel: Step1ImageClassificationViewLabel;
    reason: string;
  };
  classificationFeedback: {
    category: Step1ImageClassificationCategory;
    confidence: number;
    viewLabel: Step1ImageClassificationViewLabel;
    reason: string;
    mode: string;
  } | null;
  multiViewWarning: string | null;
  isClothingImage: boolean;
  clothingImageReason: string | null;
  // 检测到的服饰区域（用于平铺图遮罩预处理）
  garments?: Array<{
    index: number;
    category: Step1ImageClassificationCategory;
    isMainSubject: boolean;
    visibility: "full" | "partial" | "cropped";
    confidence: number;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  // 服饰分析结果（可选）
  clothingTitle?: string | null;
  clothingDescription?: string | null;
  clothingStyle?: string[] | null;
  // 服饰详细属性（可选，需要后端 LLM 分类支持）
  clothingAttributes?: {
    mainColor?: string | null;
    material?: string | null;
    pattern?: string | null;
    fit?: string | null;
    length?: string | null;
    neckline?: string | null;
    sleeve?: string | null;
    style?: string | null;
    occasion?: string | null;
  } | null;
  /** 电商卖点（用于 Step4 详情页规划） */
  sellingPoints?: Array<{
    point: string;
    category: string;
    priority: number;
  }>;
  /** 图片项目专属：分类成功后自动创建的服饰资产 ID */
  assetId?: string | null;
}
export interface ImageGarmentAnalysisResultDto {
  mode: "llm" | "heuristic";
  isClothingImage: boolean;
  classification: {
    category: Step1ImageClassificationCategory;
    confidence: number;
    viewLabel: Step1ImageClassificationViewLabel;
    reason: string | null;
  };
  /** 检测到的服饰区域（用于平铺图遮罩预处理） */
  garments: Array<{
    index: number;
    category: Step1ImageClassificationCategory;
    isMainSubject: boolean;
    visibility: "full" | "partial" | "cropped";
    confidence: number;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  clothingTitle: string | null;
  clothingDescription: string | null;
  clothingStyle: string[] | null;
  clothingAttributes: {
    mainColor: string | null;
    material: string | null;
    pattern: string | null;
    fit: string | null;
    length: string | null;
    neckline: string | null;
    sleeve: string | null;
    style: string | null;
    occasion: string | null;
  } | null;
  sellingPoints: Array<{
    point: string;
    category: string;
    priority: number;
  }>;
  multiViewWarning: string | null;
}

export interface Step1RemoveBgResultDto {
  taskId: string;
  status: "succeeded" | "failed";
  mode: "provider" | "fallback";
  sourceImageUrl: string;
  outputImageUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

// ============================================================================
// Step3 脚本候选
// ============================================================================

export type Step3CandidateLockState =
  | "idle"
  | "snapshot_ready"
  | "selected_unconfirmed"
  | "confirmed_locked"
  | "admin_unlocked";

export type Step3CandidateGenerationMode = "real" | "degraded";

/** 分镜段落 DTO（对应 nrm_shot_breakdown 表） */
export interface ShotBreakdownDto {
  title: string;
  content: string;
  visualCue: string;
  visualPrompt?: string;
  shotSize?: string;
  dialogue?: string;
  action?: string;
  durationSec?: number;
  summary?: string;
}

export interface Step3CandidateSnapshotDto {
  items: ScriptDto[];
  recommendedCount: number;
  tryCount: number;
  totalCount: number;
  snapshotId: string;
  createdAt: number;
  generationMode: Step3CandidateGenerationMode;
}

export interface Step3CandidateConfirmSegmentDto {
  index: number;
  durationSec: number;
  sceneDescription: string;
  cameraMovement: string;
  visualStyle: string;
  transitionType: string;
  audioHint: string;
}

/** Step3 候选确认请求参数 */
export interface Step3CandidateConfirmRequestDto {
  snapshotId: string;
  candidateId: string;
  expectedLockVersion: number;
  segments?: Step3CandidateConfirmSegmentDto[];
}

/** Step3 候选确认响应 */
export interface Step3CandidateConfirmResponseDto {
  snapshot: Step3CandidateSnapshotDto;
  scriptSegmentCount: number;
  scriptSegments: Array<{
    title: string;
    content: string;
    visualCue: string;
    visualPrompt: string;
  }>;
}

// ============================================================================
// 逆向解析
// ============================================================================

export interface LibraryScriptReverseSourceMetaDto {
  url: string | null;
  title: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  createTime: number | null;
  playCount: number | null;
  commentCount: number | null;
  diggCount: number | null;
  shareCount: number | null;
  collectCount: number | null;
  recommendCount: number | null;
  nickname: string | null;
  duration: number | null;
  scriptText: string | null;
}

export interface LibraryScriptReverseContextDto {
  keywords: string[];
  sourceMeta: LibraryScriptReverseSourceMetaDto;
  storyboardPanel?: ReverseStoryboardPanelViewModel | null;
}

export interface ReverseParseV2PrimaryItemDto {
  url: string | null;
  title: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  createTime: number | null;
  playCount: number | null;
  commentCount: number | null;
  diggCount: number | null;
  shareCount: number | null;
  collectCount: number | null;
  recommendCount: number | null;
  nickname: string | null;
  duration: number | null;
  scriptText: string | null;
}

export interface ReverseParseV2ResultDto {
  id?: string;
  projectId?: string | null;
  input?: string;
  status?: string;
  scriptVersionId?: string | null;
  libraryScriptId?: string | null;
  reverseStoryboardLibraryId?: string | null;
  storyboardPanel?: ReverseStoryboardPanelViewModel | null;
  libraryScript?: {
    id: string;
    title: string;
    content: string;
    tags: string[];
    date: number;
  } | null;
  resolvedVideoUrl?: string | null;
  fallback?: boolean;
  code?: string;
  message?: string;
  traceId?: string;
  inputMode?: "douyin_url" | "video_url" | "upload_file";
  scriptHints?: {
    source: string;
    overviews: string[];
    itemCount: number;
    primaryItem?: ReverseParseV2PrimaryItemDto | null;
  } | null;
  attempts?: Array<{
    stage: string;
    provider: string;
    status: string;
    reasonCode: string;
    detail?: string | null;
  }>;
  nextAction?: {
    mode: string;
    acceptedExtensions?: string[];
  };
}

export interface ReverseParseV2JobDto {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed" | "expired";
  createdAt: number;
  updatedAt: number;
  inputMode: "douyin_url" | "video_url" | "upload_file";
  projectId: string | null;
  input: string;
  result: ReverseParseV2ResultDto | null;
  error: {
    code: string;
    message: string;
  } | null;
}

// ============================================================================
// LLM 反推异步 Job
// ============================================================================

/** Job 处理阶段 */
export type LlmReverseJobStage =
  | "resolving"    // 解析视频 URL
  | "downloading"  // 下载视频
  | "uploading"    // 上传 OSS
  | "analyzing"    // LLM 多模态分析
  | "persisting";  // 持久化到脚本库

/** LLM 反推任务创建响应 */
export interface LlmReverseJobCreateResponse {
  jobId: string;
  status: "pending";
}

/** LLM 反推任务查询响应 */
export interface LlmReverseJobQueryResponse {
  status: "pending" | "running" | "completed" | "failed" | "expired";
  stage?: LlmReverseJobStage | null;
  result?: ReverseParseV2ResultDto;
  error?: { code: string; message: string };
}

// ============================================================================
// 内容库查询
// ============================================================================

export interface MyLibraryQueryDto {
  page?: number;
  pageSize?: number;
  keyword?: string;
  tags?: string[];
  sourceType?: string;
  updatedAfter?: number;
  updatedBefore?: number;
}

// ============================================================================
// 项目后台任务
// ============================================================================

export type ProjectBackgroundGenerationTaskPhase = "idle" | "running" | "completed" | "failed";

export interface ProjectBackgroundGenerationTaskStateDto {
  taskId: string | null;
  phase: ProjectBackgroundGenerationTaskPhase;
  progress: number;
  startedAt: number | null;
  updatedAt: number | null;
  resultRefs: string[];
  error: {
    code: string | null;
    message: string | null;
  } | null;
}

// ============================================================================
// 配置别名映射
// ============================================================================

export const FEATURE_ALIAS: Record<string, ApiFeature> = {
  auth: "auth",
  projects: "projects",
  project: "projects",
  uploads: "uploads",
  upload: "uploads",
  outfit: "outfit",
  outfits: "outfit",
  characters: "characters",
  character: "characters",
  scripts: "scripts",
  script: "scripts",
  storyboard: "storyboard",
  storyboards: "storyboard",
  video: "video",
  "video-jobs": "video",
  videojobs: "video",
  export: "export",
  reverse: "reverse",
  review: "review",
  reviews: "review",
  square: "square",
  me: "me",
  admin: "admin",
  library: "library",
  assets: "library",
  characters_library: "library",
  scripts_library: "library",
};

export const ALL_FEATURES: ApiFeature[] = [
  "auth",
  "projects",
  "uploads",
  "outfit",
  "characters",
  "scripts",
  "storyboard",
  "video",
  "export",
  "reverse",
  "review",
  "square",
  "me",
  "admin",
  "library",
];

// ============================================================================
// 角色五视图
// ============================================================================

export type CharacterFiveViewStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface CharacterFiveViewDto {
  id: string;
  characterId: string;
  imageUrl: string | null;
  status: CharacterFiveViewStatus;
  isActive: boolean;
  prompt: string | null;
  model: string | null;
  generationParams: Record<string, unknown> | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// BackendApi 接口（方法签名）
// ============================================================================

// ============================================================================
// BackendApi 接口（方法签名）
// ============================================================================

// 从 realApi 导入完整类型
import type { RealBackendApi } from './realApi/index';

/**
 * BackendApi 接口等同于 RealBackendApi
 * 包含所有 API 方法签名
 */
export type BackendApi = RealBackendApi;

/**
 * API 方法名称类型
 */
export type ApiMethodName = keyof BackendApi;

/**
 * 用户主题偏好响应（后端 /themes/current 返回格式）
 */
export interface UserThemeResponse {
  userId: string;
  themeId: string;
  systemName: string;
  customConfig?: Partial<ThemeConfig>;
  customLogoUrl: string;
  updatedAt: number;
  theme: Theme;
}

// ============================================================================
// 项目迁移相关类型
// ============================================================================

/** 迁移预览响应 */
export interface MigratePreviewResponse {
  success: true;
  data: {
    projectInfo: {
      id: string;
      name: string;
      projectKind: string;
      status: string;
    };
    structureCheck: {
      status: 'ok' | 'warning';
      details: Array<{
        table: string;
        issue: string;
      }>;
    };
    tables: Array<{
      tableName: string;
      sourceCount: number;
      existsCount: number;
    }>;
    totalSource: number;
    totalExists: number;
    totalToInsert: number;
  };
}

/** 迁移执行响应 */
export interface MigrateExecuteResponse {
  success: true;
  data: {
    inserted: number;
    skipped: number;
    details: Array<{
      tableName: string;
      inserted: number;
      skipped: number;
    }>;
  };
}