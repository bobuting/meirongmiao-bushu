import type { ProviderRouteKey as ProviderRouteKeyContract } from "./provider-route-policy-contract.js";
import type { ProjectPageContentSnapshotEnvelope } from "./project-page-content-snapshot.js";
import type { ProjectBackgroundGenerationTaskState } from "./project-background-generation-task.js";
import type { ReverseStoryboardPanelViewModel } from "./reverse-storyboard-report.js";
import type { SquarePublishCategory } from "./square-publish-category.js";
import type { Step1LibraryCategory, Step1OutfitModuleCategory } from "./step1-outfit-module-contract.js";
import type { OutfitItemType } from "./outfit-plan.dto.js";
import type { AgeGroupRange } from "../constants/age-groups.js";

export type Role = "user" | "admin";

// AssetCategory 已改用 Step1OutfitModuleCategory（step1-outfit-module-contract.ts）
// GarmentAssetCategory 包含服饰分类 + 视频类型
export type GarmentAssetCategory = Step1LibraryCategory | "video";

// ============ 服饰适穿属性（对齐统一年龄段） ============
/** 适穿年龄范围（对齐统一年龄段定义，见 src/constants/age-groups.ts）
 * - 0-1: 新生儿
 * - 2-3: 婴童
 * - 4-6: 幼童
 * - 7-12: 儿童
 * - 13-17: 青少年
 * - 18-25: 年轻成人
 * - 26-30: 成人
 * - all: 全年龄段
 */
export type TargetAgeRange = AgeGroupRange | "all";

/** 适穿性别 */
export type TargetGender = "male" | "female" | "unisex";

export type CharacterKind = "basic" | "image" | "video";
export type CharacterViewKey = "front" | "left" | "right" | "back" | "closeup";
export type CharacterViewState = "pending" | "generating" | "ready" | "failed";

export type ProviderType = "text" | "image" | "video";

export type ProviderRouteKey = ProviderRouteKeyContract;

/** 路由策略类型已统一为 ProviderType（text/image/video） */

// ============ 视频项目状态（6 步流程） ============
// Step1 细分状态：GARMENT_UPLOADED → ROLE_DIRECTION_CONFIRMED → OUTFIT_SELECTED → OUTFIT_CONFIRMED → CHARACTER_VIEW_READY
export type VideoProjectStatus =
  | "DRAFT"
  | "GARMENT_UPLOADED"           // Step1: 服饰已上传
  | "ROLE_DIRECTION_CONFIRMED"   // Step1: 角色方向已确认
  | "OUTFIT_SELECTED"            // Step1: 穿搭已选择
  | "OUTFIT_CONFIRMED"           // Step1: 穿搭已确认（点击生成定妆）
  | "CHARACTER_VIEW_READY"       // Step2: 角色视图就绪
  | "CHARACTER_SELECTED"
  | "CHARACTER_CONFIRMED"
  | "SCRIPT_GENERATED"
  | "SCRIPT_SELECTED"
  | "SCRIPT_CONFIRMED"
  | "STORYBOARDING"
  | "STORYBOARD_PREVIEW_COMPLETED"
  | "FILMING"
  | "CLIPS_READY"
  | "FISSIONING"
  | "READY_TO_PUBLISH"
  | "PUBLISHED";

/** 视频项目状态流转顺序 */
export const VIDEO_PROJECT_STATUS_ORDER: readonly VideoProjectStatus[] = [
  "DRAFT",
  "GARMENT_UPLOADED",
  "ROLE_DIRECTION_CONFIRMED",
  "OUTFIT_SELECTED",
  "OUTFIT_CONFIRMED",
  "CHARACTER_VIEW_READY",
  "CHARACTER_SELECTED",
  "CHARACTER_CONFIRMED",
  "SCRIPT_GENERATED",
  "SCRIPT_SELECTED",
  "SCRIPT_CONFIRMED",
  "STORYBOARDING",
  "STORYBOARD_PREVIEW_COMPLETED",
  "FILMING",
  "CLIPS_READY",
  "READY_TO_PUBLISH",
  "PUBLISHED",
  "FISSIONING",
] as const;

// ============ 图片项目状态（4 步流程） ============
// Step1 细分状态：IMAGE_GARMENT_UPLOADED → IMAGE_ROLE_DIRECTION_CONFIRMED → IMAGE_OUTFIT_SELECTED → IMAGE_OUTFIT_CONFIRMED → IMAGE_CHARACTER_VIEW_READY
export type ImageProjectStatus =
  | "IMAGE_DRAFT"
  | "IMAGE_GARMENT_UPLOADED"           // Step1: 服饰已上传
  | "IMAGE_ROLE_DIRECTION_CONFIRMED"   // Step1: 角色方向已确认
  | "IMAGE_OUTFIT_SELECTED"            // Step1: 穿搭已选择
  | "IMAGE_OUTFIT_CONFIRMED"           // Step1: 穿搭已确认（点击生成定妆）
  | "IMAGE_CHARACTER_VIEW_READY"       // Step2: 角色视图就绪
  | "IMAGE_CHARACTER_SELECTED"
  | "IMAGE_CHARACTER_CONFIRMED"
  | "IMAGE_MODEL_PHOTOS_READY"
  | "IMAGE_DETAIL_PAGE_GENERATED"
  | "IMAGE_READY_TO_PUBLISH"
  | "IMAGE_PUBLISHED";

/** 图片项目状态流转顺序 */
export const IMAGE_PROJECT_STATUS_ORDER: readonly ImageProjectStatus[] = [
  "IMAGE_DRAFT",
  "IMAGE_GARMENT_UPLOADED",
  "IMAGE_ROLE_DIRECTION_CONFIRMED",
  "IMAGE_OUTFIT_SELECTED",
  "IMAGE_OUTFIT_CONFIRMED",
  "IMAGE_CHARACTER_VIEW_READY",
  "IMAGE_CHARACTER_SELECTED",
  "IMAGE_CHARACTER_CONFIRMED",
  "IMAGE_MODEL_PHOTOS_READY",
  "IMAGE_DETAIL_PAGE_GENERATED",
  "IMAGE_READY_TO_PUBLISH",
  "IMAGE_PUBLISHED",
] as const;

// ============ 兼容旧代码：统一项目状态类型 ============
/** @deprecated 使用 VideoProjectStatus 或 ImageProjectStatus 替代 */
export type ProjectStatus = VideoProjectStatus;

/** @deprecated 使用 isVideoStatusBeyond 或 isImageStatusBeyond 替代 */
const PROJECT_STATUS_ORDER = VIDEO_PROJECT_STATUS_ORDER;

/** 判断视频项目状态是否已越过指定阶段 */
export function isVideoStatusBeyond(current: string | undefined | null, threshold: VideoProjectStatus): boolean {
  if (!current) return false;
  return VIDEO_PROJECT_STATUS_ORDER.indexOf(current as VideoProjectStatus) > VIDEO_PROJECT_STATUS_ORDER.indexOf(threshold);
}

/** 判断视频项目状态是否已达到或越过指定阶段 */
export function isVideoStatusAtOrBeyond(current: string | undefined | null, threshold: VideoProjectStatus): boolean {
  if (!current) return false;
  return VIDEO_PROJECT_STATUS_ORDER.indexOf(current as VideoProjectStatus) >= VIDEO_PROJECT_STATUS_ORDER.indexOf(threshold);
}

/** 判断图片项目状态是否已越过指定阶段 */
export function isImageStatusBeyond(current: string | undefined | null, threshold: ImageProjectStatus): boolean {
  if (!current) return false;
  return IMAGE_PROJECT_STATUS_ORDER.indexOf(current as ImageProjectStatus) > IMAGE_PROJECT_STATUS_ORDER.indexOf(threshold);
}

/** 判断图片项目状态是否已达到或越过指定阶段 */
export function isImageStatusAtOrBeyond(current: string | undefined | null, threshold: ImageProjectStatus): boolean {
  if (!current) return false;
  return IMAGE_PROJECT_STATUS_ORDER.indexOf(current as ImageProjectStatus) >= IMAGE_PROJECT_STATUS_ORDER.indexOf(threshold);
}

/** @deprecated 使用 isVideoStatusBeyond 或 isImageStatusBeyond 替代 */
export function isStatusBeyond(current: ProjectStatus | undefined | null, threshold: ProjectStatus): boolean {
  return isVideoStatusBeyond(current, threshold);
}

/** @deprecated 使用 isVideoStatusAtOrBeyond 或 isImageStatusAtOrBeyond 替代 */
export function isStatusAtOrBeyond(current: ProjectStatus | undefined | null, threshold: ProjectStatus): boolean {
  return isVideoStatusAtOrBeyond(current, threshold);
}

export type ScriptSourceType = "template" | "original" | "reverse";

export type ReviewStatus = "pending" | "approved" | "rejected" | "needs_changes";
export type ReviewDecisionStatus = Exclude<ReviewStatus, "pending">;

export type VideoJobStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "timeout";

/** Step4 视频任务输入（序列化到 nrm_async_jobs.input） */
export interface Step4VideoJobInput {
  targetSceneIndex?: number;
  source?: "auto" | "manual";
  /** 分镜总数，创建时确定且运行期不变；写入 input（而非 result）避免竞态窗口下执行器读到 0 */
  totalClipCount?: number;
}

/** Step4 视频任务结果（存储在 nrm_async_jobs.result JSONB） */
export interface Step4VideoJobResult {
  totalClipCount?: number;
  completedClipCount?: number;
  videoUrls?: string[];
  externalTaskIds?: string[];
  providerAuditIds?: string[];
  providerId?: string | null;
  model?: string | null;
  clipGeneration?: number;
  attempts: number;
  startedAt: number;
  durationMinutes: number;
  retryNotBefore?: number;
  isAdvancing?: boolean;
  advancingStartedAt?: number;
  enqueuedAt?: number;
}

export type Resolution = "720p" | "1080p";

export interface AppConfig {
  videoMusicEnabled: boolean;
  videoMusicAllowedAtmospheres: string;
  videoMusicDefaultAtmospheres: string;
  videoMusicPathPrefix: string;
  videoMusicPublicBaseUrl: string;
  videoMusicVisitUrl: string;
  lockoutAttempts: number;
  lockoutMinutes: number;
  sessionTtlHours: number; // 会话有效期（小时）
  sessionAutoRenewMinutesBeforeExpiry: number; // 距过期 N 分钟内自动续期
  scriptMaxDurationSec: number;
  mockCreditDefault: number;
  creditValidityDays: number;
  providerErrorLogRetentionDays: number;
  reverseFetchStageOrder: string;
  reverseExternalApiPriority: string;
  apifyReverseApiUrl: string;
  apifyReverseApiToken: string;
  tikhubVideoHotApiUrl: string;
  tikhubRealtimeHotApiUrl: string;
  tikhubReverseApiUrl: string;
  tikhubApiToken: string;
  anytocopyReverseApiUrl: string;
  anytocopyReverseApiToken: string;
  anytocopyEnabled: boolean;
  douhotVideoHotApiUrl: string;
  douyinHotHubRealtimeUrl: string;
  hotTrendRealtimeTopN: number;
  hotTrendVideoTopN: number;

  hotTrendRealtimeSyncIntervalHours: number;
  hotTrendVideoSyncIntervalHours: number;
  hotTrendVideoDateWindowHours: number;
  hotTrendPromptVersion: string;
  hotTrendDailyReportEnabled: boolean;  // 每日热点报告预计算开关
  hotTrendDailyReportHour: number;  // 每日报告生成时间（小时，0-23）
  squareCreatorDiscoveryEnabled: boolean;  // 达人自动发现开关
  squareCreatorDiscoveryHour: number;  // 达人发现执行时间（小时，0-23）
  squareTemplateAutoPublishEnabled: boolean;  // 模板自动发布开关
  squareTemplateAutoPublishHour: number;  // 模板自动发布执行时间（小时，0-23）
  adminLlmDebugBubbleEnabled: boolean;
  // 图片下载超时时间（毫秒），用于从外部 URL 下载 AI 生成的图片
  imageDownloadTimeoutMs: number;
  // 视频下载超时时间（毫秒），用于从外部 URL 下载视频文件
  videoDownloadTimeoutMs: number;
  // 音乐下载超时时间（毫秒），用于从外部 URL 下载音频文件
  audioDownloadTimeoutMs: number;
  ossEndpoint: string;
  ossRegion: string;
  ossAccessKeyId: string;
  ossSecretAccessKey: string;
  ossBucketName: string;
  ossForcePathStyle: boolean;
  ossPublicBaseUrl: string;
}

export interface User extends SoftDeletable {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: number;
  failedAttempts: number;
  lockUntil: number | null;
  companyName?: string; // 公司名称
}

export interface Session {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number; // 会话过期时间戳（毫秒）
}

export interface Project extends SoftDeletable {
  id: string;
  userId: string;
  name: string;
  status: VideoProjectStatus | ImageProjectStatus; // 根据 projectKind 使用对应的状态类型
  selectedOutfitPlanId: string | null;
  activeScriptId: string | null;    // 当前选中的脚本ID
  createdAt: number;
  updatedAt: number;
  thumbnailUrl: string;
  formatLabel: string;
  durationSec: number;
  views: number;
  lastVisitedStep: number;
  lastReverseTaskId: string | null;
  lastReverseScriptVersionId: string | null;
  projectKind: "image" | "video" | "reverse" | "outfit_change"; // 项目类型
  reverseScriptId: string | null; // 反推脚本ID（仅反推项目）
  exportUrl: string | null; // 视频导出 URL
  selectedCharacterId: string | null; // 当前选中的角色库角色ID
  selectedRoleDirection: {
    directionId: string;
    styleSummary: string;
    portraitUrl: string | null;
    confidence: number;
    ethnicityOrRegion?: string | null;
    gender?: "male" | "female" | "unknown" | null;
    age?: number | null;
    styleWords?: string[] | null;
  } | null; // 当前选中的角色方向（JSONB）
  coverImageUrl: string | null; // 项目封面URL（成片截帧或角色图，统一封面字段）
  videoCoverImageUrl: string | null; // 视频封面图片URL（Step4视频项目使用）
  garmentImageUrl: string | null; // 服饰主图URL（项目关联的服饰图片）
  publishTitle: string | null; // Step5 发布标题（用户选择或编辑后的标题）
}

/**
 * 项目服饰分配（替代原 UploadAsset 和 ProjectGarmentAssoc）
 *
 * 记录每个项目中各槽位（上装/下装/鞋子/配饰）的服饰信息。
 * 支持两种来源：
 * 1. 用户服装库：garmentAssetId 指向 nrm_garment_assets
 * 2. 临时上传：file_name、size_mb、image_url 直接存储
 */
export interface ProjectGarment {
  id: string;
  projectId: string;
  userId: string;
  /** 服饰分类：top(上装)/bottom(下装)/shoes(鞋子)/accessory(配饰)，来自 GarmentAsset.category */
  category: string | null;
  /** 关联的服装库资产ID，来自用户服装库时必填 */
  garmentAssetId: string | null;
  /** 文件名，临时上传时使用 */
  fileName: string | null;
  /** 文件大小（MB），临时上传时使用 */
  sizeMb: number | null;
  /** 图片URL，展示时使用 */
  imageUrl: string | null;
  createdAt: number;
  updatedAt: number;
  /** @deprecated 服装分类，用于偏好计算，已迁移到 GarmentAsset.category */
  apparelCategory?: SquarePublishCategory;
}

/**
 * @deprecated 使用 ProjectGarment 替代
 * 保留类型别名以兼容现有代码
 */
export type UploadAsset = ProjectGarment & {
  /** @deprecated 已迁移到 ProjectGarment.imageUrl */
  libraryAssetId?: string | null;
};

/**
 * @deprecated 使用 ProjectGarment 替代
 * 原项目服饰关联表已合并到 ProjectGarment
 */
export type ProjectGarmentAssoc = {
  id: string;
  projectId: string;
  garmentAssetId: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * 图片分类结果
 */
export interface AssetClassificationResult {
  category: import("./step1-outfit-module-contract.js").Step1OutfitModuleCategory;
  viewLabel: import("./step1-outfit-module-contract.js").Step1OutfitViewLabel;
  confidence: number;
  reason: string;
  /** 检测到的服饰区域（用于平铺图遮罩预处理） */
  garmentRegions?: GarmentAsset["garmentRegions"];
}

/** 用户服饰资产 */
export interface GarmentAsset extends SoftDeletable {
  id: string;
  userId: string;                    // 用户ID，公共资产用 "system"
  name: string;                      // 服饰名称
  type: "image" | "video";           // 类型
  category: GarmentAssetCategory;    // 服装类别（服饰分类 + 视频类型）
  mainImageUrl: string;              // 主图
  subImageUrl1: string | null;       // 副图1
  subImageUrl2: string | null;       // 副图2
  subImageUrl3: string | null;       // 副图3
  flatLayImageUrl: string | null;    // AI 生成的正反面平铺图
  maskedImageUrl: string | null;     // 遮罩预处理后的图片URL（用于排查logo误遮盖）
  sizeMb: number | null;             // 文件大小
  source: string | null;             // 来源：manual / step1-upload / step1-module
  description: string | null;        // 服饰描述
  mainColor: string | null;          // 主色
  material: string | null;           // 材质
  pattern: string | null;            // 图案
  fit: string | null;                // 版型
  length: string | null;             // 长度
  neckline: string | null;           // 领型
  sleeve: string | null;             // 袖型
  style: string | null;              // 风格
  occasion: string | null;           // 场合
  /** 同款变体组ID，相同款式不同颜色共享同一组ID（仅项目内有效） */
  variantGroupId: string | null;
  /** 本变体的颜色名称（如"白色""黑色"） */
  variantColor: string | null;
  /** 是否为变体组的主色（基准款，第一件上传的为主色） */
  isPrimaryVariant: boolean;
  aiCategory: string | null;         // AI识别类别
  aiViewLabel: string | null;        // AI视角标签：main / detail
  aiConfidence: number | null;       // AI置信度（0~1）
  aiReason: string | null;           // AI分类原因
  /** 检测到的服饰区域（用于平铺图生成遮罩预处理） */
  garmentRegions?: Array<{
    index: number;                   // 序号（0-based）
    category: string;                // 服饰类别
    isMainSubject: boolean;          // 是否为主体服饰
    visibility: "full" | "partial" | "cropped";  // 可见度
    confidence: number;              // 检测置信度
    boundingBox: {                   // 边界框（相对坐标 0~1）
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  /** 电商卖点（从单品图片分析提取，驱动 Step4 详情页规划） */
  sellingPoints?: Array<{
    point: string;     // 卖点描述（中文），如"高腰设计拉长腿部比例"
    category: string;  // 分类：面料 | 工艺 | 版型 | 设计 | 搭配 | 场景
    priority: number;  // 1=核心卖点，2=次要卖点
    /** 图形类型（用于详情页图形元素渲染） */
    graphicsType?: GraphicsType;
    /** 视觉指导（图形渲染参考，20 字内） */
    visualGuidance?: string;
  }>;
  /** 适穿年龄范围（对齐 Step1 角色预设年龄段） */
  targetAgeRange: TargetAgeRange | null;
  /** 适穿性别 */
  targetGender: TargetGender | null;
  createdAt: number;
  updatedAt: number;
}

/** 返回服饰图片，优先使用用户上传的主图，兜底使用 AI 生成的平铺图 */
export function resolveGarmentImageUrl(asset: { mainImageUrl: string; flatLayImageUrl: string | null }): string {
  if (asset.mainImageUrl?.trim()) {
    return asset.mainImageUrl.trim();
  }
  if (asset.flatLayImageUrl?.trim()) {
    return asset.flatLayImageUrl.trim();
  }
  throw new Error(`服饰资产缺少图片（mainImageUrl 和 flatLayImageUrl 均为空）`);
}

export interface VideoMusic extends SoftDeletable {
  id: string;
  title: string;
  musicUrl: string;
  localPath: string | null;
  sourceUrl: string | null;
  atmospheres: string[];
  durationSec: number | null;
  artist: string | null;
  album: string | null;
  coverUrl: string | null;
  genre?: string | null;
  creatorId?: string | null;
  createdAt: number;
  updatedAt: number;
}

/** 搭配方案（独立实体，可被多项目复用） */
export interface OutfitPlan extends SoftDeletable {
  id: string;
  userId: string;
  /** 关联项目ID（兼容旧数据，新数据通过 nrm_project_outfit_plans 关联） */
  projectId?: string;
  /** 关联的服饰资产ID（焦点单品） */
  garmentAssetId?: string;
  /** 用户上传的服饰资产ID列表 */
  assetIds: string[];
  index: number;
  title?: string;
  reason?: string;
  styleName?: string;
  /** LLM 分析内容 */
  analysis?: string;
  /** 优化的提示词，用于 Step2 角色生成 */
  optimizedPrompt?: string;
  analysisPrompt?: string;
  /** 适用场景 */
  suitableScene?: string;
  /** 风格标签（3个，如 Gorpcore、多巴胺、机能风） */
  tags?: string[];
  /** 服饰单品数组 */
  items?: Array<{
    type: OutfitItemType;
    name: string;
    style: string;
    description: string;
    assetId?: string; // 用户上传的服饰带 assetId
  }>;
  trendSummary?: string;
  /** Gemini Grounding 搜索来源 */
  groundingSources?: Array<{ title: string; url: string }>;
}

/** 项目与搭配方案的关联（多对多） */
export interface ProjectOutfitPlanAssoc {
  id: string;
  projectId: string;
  outfitPlanId: string;
  selected: boolean;
  createdAt: number;
}

export interface CharacterPreset {
  id: string;
  name: string;
  tags: string[];
}

export interface CharacterViewDraft {
  key: CharacterViewKey;
  label: string;
  prompt: string;
  referenceImages?: string[];
  ratio?: "1:1" | "3:4" | "9:16" | "16:9";
  resolution?: "1k" | "2k" | "4k";
  status: CharacterViewState;
  candidates: string[];
  selectedImageUrl: string | null;
  confirmSource: "candidate" | "drag" | "upload";
  confirmed: boolean;
  errorMessage: string | null;
  logs: string[];
  updatedAt: number;
}

export interface CharacterViewSession {
  status: "idle" | "running" | "completed";
  total: number;
  generated: number;
  confirmed: number;
  startedAt: number;
  updatedAt: number;
  logs: string[];
  views: CharacterViewDraft[];
}

export interface LibraryCharacter extends SoftDeletable {
  id: string;
  userId: string;
  name: string;
  kind: CharacterKind;
  status: "processing" | "ready";
  thumbnailUrl: string;
  tags: string[];
  /** @deprecated 仅读取兼容，不再写入 */
  views: string[];
  viewSession?: CharacterViewSession | null;
  videoPreview: string | null;
  /** 五视图图板 OSS 图片地址 */
  fiveViewOssImageUrl: string | null;
  /** 当前激活的五视图记录 ID */
  activeFiveViewId: string | null;
  createdAt: number;
  updatedAt: number;
  // 角色分析字段（统一归一化后的格式）
  ethnicity?: string | null;
  age?: number | null;
  gender?: "male" | "female" | null;
  style?: string | null;
  bodyType?: string | null;
  faceShape?: string | null;
  facialFeatures?: string | null;
  eyebrows?: string | null;
  eyes?: string | null;
  eyeExpression?: string | null;
  nose?: string | null;
  lips?: string | null;
  chin?: string | null;
  skinTone?: string | null;
  hairStyle?: string | null;
  uniqueFeatures?: string | null;
}

/** 项目角色关联：记录项目使用的角色库角色 */
export interface ProjectCharacter extends SoftDeletable {
  id: string;
  projectId: string;
  libraryCharacterId: string;
  role: "main" | "secondary";
  sourceType: "generated" | "library"; // 角色来源：generated=生成角色，library=角色库推荐
  isSelected: boolean;
  generationSlot: number | null; // 生成槽位（1/2/3），用于排序
  createdAt: number;
  updatedAt: number;
}

export interface ScriptVersion {
  id: string;
  projectId: string;
  userId: string;
  sourceType: ScriptSourceType;
  durationSec: number;
  version: number;
  payload: {
    basicInfo: string;
    roleTable: string;
    outfitTable: string;
    storyboard: string;
  };
  createdAt: number;
}

// ============================================================================
// 脚本类型常量 (前后端公共)
// ============================================================================

/** 脚本类型枚举 */
export const ScriptType = {
  /** 普通脚本 */
  NORMAL: 0,
  /** 反推脚本 */
  REVERSE: 1,
  /** 库存精选 — 从 nrm_script_data 匹配改写 */
  LIBRARY: 2,
  /** 视频热榜 — step3-video-script 模块生成 */
  VIDEO: 3,
  /** 实时热榜 — LLM 实时生成 */
  REALTIME: 4,
  /** 智能生成 — ScriptGenerator 反思循环生成 */
  EFFECTIVENESS: 5,
  /** 新故事 — 裂变阶段 LLM 生成新故事 */
  NEW_STORY: 6,
  /** 场景化种草 — 基于场景故事+多样性组合的 LLM 实时生成 */
  CUSTOM: 7,
  /** 时尚大片 — 高端穿搭/走秀/LOOK展示风格的两阶段生成 */
  FASHION: 8,
  /** 情感原型 — 基于情感原型的两段式生成（大纲+分镜） */
  EMOTION_ARCHETYPE: 9,
  /** 生活美学 — 情感叙事与视觉展示平衡的时尚博主内容 */
  AESTHETIC: 10,
  /** 产品展示 — 单模特多角度多场景多动作的产品导向带货脚本 */
  PRODUCT_SHOWCASE: 11,
  /** 主题叙事 — 热点×情感原型碰撞的三段式生成（主题→大纲→分镜） */
  STORY_THEME: 12,
  /** 共鸣故事 — 真人故事+服饰自然融入的两阶段生成（概念→分镜） */
  RESONANCE: 13,
} as const;

export type ScriptTypeValue = typeof ScriptType[keyof typeof ScriptType];

// ============================================================================
// 策略类型（脚本类型的语义分组，用于前端展示）
// ============================================================================

/** 策略类型枚举（字符串，用于前端展示） */
export const StrategyType = {
  LIBRARY: "library",
  VIDEO: "video",
  REALTIME: "realtime",
  EFFECTIVENESS: "effectiveness",
  NEW_STORY: "new_story",
  CUSTOM: "custom",
  FASHION: "fashion",
  EMOTION_ARCHETYPE: "emotion_archetype",
  AESTHETIC: "aesthetic",
  PRODUCT_SHOWCASE: "product_showcase",
  STORY_THEME: "story_theme",
  RESONANCE: "resonance",
} as const;

export type StrategyTypeValue = typeof StrategyType[keyof typeof StrategyType];

/** ScriptType → StrategyType 映射表 */
export const SCRIPT_TYPE_TO_STRATEGY: Record<ScriptTypeValue, StrategyTypeValue> = {
  [ScriptType.NORMAL]: StrategyType.LIBRARY,
  [ScriptType.REVERSE]: StrategyType.LIBRARY,
  [ScriptType.LIBRARY]: StrategyType.LIBRARY,
  [ScriptType.VIDEO]: StrategyType.VIDEO,
  [ScriptType.REALTIME]: StrategyType.REALTIME,
  [ScriptType.EFFECTIVENESS]: StrategyType.EFFECTIVENESS,
  [ScriptType.NEW_STORY]: StrategyType.NEW_STORY,
  [ScriptType.CUSTOM]: StrategyType.CUSTOM,
  [ScriptType.FASHION]: StrategyType.FASHION,
  [ScriptType.EMOTION_ARCHETYPE]: StrategyType.EMOTION_ARCHETYPE,
  [ScriptType.AESTHETIC]: StrategyType.AESTHETIC,
  [ScriptType.PRODUCT_SHOWCASE]: StrategyType.PRODUCT_SHOWCASE,
  [ScriptType.STORY_THEME]: StrategyType.STORY_THEME,
  [ScriptType.RESONANCE]: StrategyType.RESONANCE,
};

/** StrategyType 显示标签映射表 */
export const STRATEGY_TYPE_LABELS: Record<StrategyTypeValue, string> = {
  [StrategyType.LIBRARY]: "库存精选",
  [StrategyType.VIDEO]: "视频热榜",
  [StrategyType.REALTIME]: "实时热榜",
  [StrategyType.EFFECTIVENESS]: "实时智能",
  [StrategyType.NEW_STORY]: "新故事",
  [StrategyType.CUSTOM]: "场景化脚本",
  [StrategyType.FASHION]: "时尚大片",
  [StrategyType.EMOTION_ARCHETYPE]: "情感原型",
  [StrategyType.AESTHETIC]: "生活美学",
  [StrategyType.PRODUCT_SHOWCASE]: "产品展示",
  [StrategyType.STORY_THEME]: "主题叙事",
  [StrategyType.RESONANCE]: "共鸣故事",
};

/** 将 ScriptType 转换为 StrategyType */
export function scriptTypeToStrategy(type: ScriptTypeValue): StrategyTypeValue {
  return SCRIPT_TYPE_TO_STRATEGY[type];
}

/** 获取 StrategyType 的显示标签 */
export function getStrategyTypeLabel(strategyType: StrategyTypeValue): string {
  return STRATEGY_TYPE_LABELS[strategyType] ?? "未标注";
}

// ============================================================================
// 脚本数据表 (nrm_script_data)
// ============================================================================

/** 视频类型枚举（对应视频分析返回的 video_type 字段） */
export enum VideoType {
  /** 剧情/短剧 */
  DRAMA = "剧情/短剧",
  /** 日常Vlog */
  VLOG = "日常Vlog",
  /** 氛围感/OOTD */
  OOTD = "氛围感/OOTD",
  /** 情侣/闺蜜/亲子 */
  RELATIONSHIP = "情侣/闺蜜/亲子",
  /** 季节/节日/热点 */
  SEASONAL = "季节/节日/热点",
  /** 旅行/探店 */
  TRAVEL = "旅行/探店",
}

/**
 * 脚本数据接口
 * 统一脚本库的核心数据结构，支持多类型脚本存储与重写链路追踪
 */
export interface ScriptData {
  id: string;
  type: ScriptTypeValue;           // 脚本类型（0-5）
  title: string;
  theme: string | null;
  summary: string | null;
  videoType: VideoType | null;       // 视频类型
  videoStyle: string | null;
  targetAudience: string | null;
  fashionSuitable: boolean | null;
  fashionReason: string | null;
  emotionDetail: string | null;
  onScreenPresence: string | null;
  fashionStyles: string | null;
  editingAnalysis: unknown | null;
  // === 场景信息 ===
  mainScene: string | null;
  timeOfDay: string | null;
  weather: string | null;
  atmosphere: string | null;
  // === 分析元数据 ===
  durationSeconds: number | null;
  primaryEmotion: string | null;
  sourceOssUrl: string | null;
  source: string | null;
  // === 用户归属与关联 ===
  userId: string;                   // 脚本归属用户，NOT NULL
  projectId: string | null;         // 脚本归属项目，可为 NULL
  // === 重写链路追踪 ===
  sourceScriptId: string | null;    // 重写链源脚本ID
  previousScriptId: string | null;  // 直接前驱脚本ID
  // === 内容与标签 ===
  tags: string[];                   // 用户自定义标签
  content: string;                  // 脚本正文内容
  // === 时间戳 ===
  updatedAt: number;
  createdAt: number;
}

// ============================================================================

export interface LibraryScript extends SoftDeletable {
  id: string;
  userId: string;
  title: string;
  tags: string[];
  content: string;
  type?: ScriptTypeValue; // 脚本类型
  reverseContext?: LibraryScriptReverseContext | null;
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface LibraryScriptVersion {
  id: string;
  scriptId: string;
  userId: string;
  version: number;
  title: string;
  tags: string[];
  content: string;
  type?: ScriptTypeValue; // 脚本类型
  reverseContext?: LibraryScriptReverseContext | null;
  createdAt: number;
}

export interface LibraryScriptReverseSourceMeta {
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

export interface LibraryScriptReverseContext {
  keywords: string[];
  sourceMeta: LibraryScriptReverseSourceMeta;
  storyboardPanel?: ReverseStoryboardPanelViewModel | null;
}

export interface StoryboardFrame extends SoftDeletable {
  id: string;
  projectId: string;
  scriptVersionId: string | null;
  index: number;
  imageUrl: string;
  variants?: string[];
  selectedVariantIndex?: number;
}

export interface VideoJob extends SoftDeletable {
  retryNotBefore?: number;
  isAdvancing?: boolean;
  /** isAdvancing 开始时间戳，用于超时检测 */
  advancingStartedAt?: number;
  id: string;
  projectId: string;
  userId: string;
  status: VideoJobStatus;
  attempts: number;
  startedAt: number;
  durationMinutes: number;
  totalClipCount?: number;
  completedClipCount?: number;
  videoUrls?: string[];
  externalTaskIds?: string[];
  providerAuditIds?: string[];
  /** 单片段重试任务的目标镜头索引（从 0 开始），undefined 表示批量任务 */
  targetSceneIndex?: number;
  /** 进入排队队列的时间戳（毫秒），用于排队超时计算 */
  enqueuedAt?: number;
  /** 创建时的 scene 代际编号，用于判断视频是否属于当前生成周期 */
  clipGeneration?: number;
  providerId?: string | null;
  model?: string | null;
  error?: {
    code: string;
    message: string;
  } | null;
}

export interface ReverseTask {
  id: string;
  userId: string;
  projectId: string;
  source: "douyin_url" | "video_url" | "local_file";
  input: string;
  status: "success" | "fallback_required";
  scriptVersionId: string | null;
  fallbackReason: "private_or_invalid_url" | null;
  traceId?: string | null;
  resolvedVideoUrl?: string | null;
  resolvedByStage?: ReverseFetchStage | null;
  createdAt: number;
}

export type ReverseFetchStage =
  | "S1_CUSTOM_COOKIE"
  | "S2_PUBLIC_POOL"
  | "S3_PLAYWRIGHT_GUEST"
  | "S4_USER_QR_COOKIE"
  | "S5_EXTERNAL_API"
  | "S6_LOCAL_FILE";

export type ReverseFetchReasonCode =
  | "OK"
  | "INVALID_URL"
  | "CREDENTIAL_MISSING"
  | "UPSTREAM_HTTP_ERROR"
  | "UPSTREAM_UNAUTHORIZED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_EMPTY"
  | "PLAYWRIGHT_UNAVAILABLE"
  | "QR_LOGIN_REQUIRED"
  | "EXTERNAL_API_DISABLED"
  | "LOCAL_FILE_REQUIRED"
  | "UNKNOWN";

export type ReverseNextAction =
  | "retry_stage"
  | "open_qr_login"
  | "upload_cookie"
  | "upload_video_file"
  | "none";

export interface ReverseAttempt {
  id: string;
  traceId: string;
  taskId: string | null;
  userId: string;
  projectId: string;
  inputUrl: string;
  stage: ReverseFetchStage;
  provider: string;
  status: "success" | "failed";
  reasonCode: ReverseFetchReasonCode;
  elapsedMs: number;
  retryable: boolean;
  nextAction: ReverseNextAction;
  detail: string | null;
  createdAt: number;
}

export interface ReverseTrace {
  id: string;
  userId: string;
  projectId: string;
  inputUrl: string;
  stageOrder: ReverseFetchStage[];
  finalStage: ReverseFetchStage;
  success: boolean;
  resolvedVideoUrl: string | null;
  scriptHints?: {
    source: string;
    overviews: string[];
    itemCount: number;
    primaryItem?: {
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
    } | null;
  } | null;
  createdAt: number;
  updatedAt: number;
}

export type SourceCredentialScope = "custom_cookie" | "public_pool" | "playwright_guest" | "user_qr_cookie" | "external_api";

export interface SourceCredential {
  id: string;
  userId: string;
  scope: SourceCredentialScope;
  provider: string;
  keyHint: string;
  cipherText: string;
  maskedValue: string;
  expiresAt: number | null;
  revokedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type TrendTopicType = "realtime" | "video";
export type TrendWindow = "24h" | "7d" | "30d";

export interface TrendEntry {
  id: string;
  source: string;
  trendType: TrendTopicType;
  dateWindow: TrendWindow;
  normalizedKey: string;
  title: string;
  url: string;
  itemId?: string | null;
  trend: "up" | "down" | "flat";
  rank: number;
  hash: string;
  syncedAt: number;
  rawPayload?: Record<string, unknown> | null;
}

export interface TrendSyncJob {
  id: string;
  trendType: TrendTopicType;
  source: string;
  dateWindow: TrendWindow;
  status: "running" | "success" | "failed";
  startedAt: number;
  finishedAt: number | null;
  elapsedMs: number | null;
  topicCount: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ReviewRequest {
  id: string;
  userId: string;
  resourceType: "reverse_script";
  resourceId: string;
  squareCategory: "男装" | "女装" | "男童装" | "女童装" | null;
  status: ReviewStatus;
  published: boolean;
  createdAt: number;
  reviewedAt: number | null;
  reviewedBy: string | null;
}

export interface PublicResource {
  id: string;
  resourceType: "reverse_script";
  resourceId: string;
  ownerUserId: string;
  squareCategory: "男装" | "女装" | "男童装" | "女童装" | null;
  publishedAt: number;
}

export interface CreditAccount extends SoftDeletable {
  userId: string;
  balance: number;
  expiresAt: number;
}

/** 积分冻结记录（防止并发白嫖） */
export interface CreditFreeze {
  id: string;
  userId: string;
  amount: number;
  frozenAt: number;
  expiresAt: number;
  status: "frozen" | "deducted" | "refunded" | "expired";
  routeKey?: string;
  operation?: string;
  projectId?: string;
  actualCost?: number;
  refundedAmount?: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface AuditLog {
  id: string;
  actorUserId: string;
  action: string;
  targetId: string;
  meta?: Record<string, unknown>;
  createdAt: number;
}

export interface DeadLetter {
  id: string;
  type: "video_job";
  resourceId: string;
  reason: "failed" | "timeout" | "max_retries_exceeded";
  attempts: number;
  createdAt: number;
  meta?: Record<string, unknown>;
}
/** Provider 调用协议（统一枚举：覆盖 LLM 文本/理解 + 视频/图像生成） */
export const ProviderCallMode = {
  /** OpenAI 兼容协议（/chat/completions） */
  OPENAI: "openai",
  /** Gemini 原生协议（/v1/models/...:generateContent） */
  GEMINI: "gemini",
  /** 百炼 DashScope 文本原生协议（/api/v1/services/aigc/text-generation/generation） */
  DASHSCOPE: "dashscope",
  /** 百炼 DashScope 流式协议（SSE，支持 thinking + 联网搜索 + 搜索来源同时返回） */
  DASHSCOPE_STREAM: "dashscope-stream",
  /** 可灵 Kling 视频生成-云雾（/v1/videos/generations） */
  KLING_VIDEO_YUNWU: "kling-video-yunwu",
  /** 可灵 Kling 视频编辑-云雾（多模态视频编辑，支持图片+文本换装） */
  KLING_VIDEO_EDIT_YUNWU: "kling-video-edit-yunwu",
  /** 可灵 Kling Omni-Video-云雾（单步视频编辑，video_list + image_list） */
  KLING_OMNI_VIDEO_YUNWU: "kling-omni-video-yunwu",
  /** 可灵 Kling Omni-Video-DataEyes（/kling/v1/videos/omni-video，格式与云雾一致） */
  KLING_OMNI_VIDEO_DATAEYES: "kling-omni-video-dataeyes",
  /** 可灵 Kling 视频生成-官方直连（/v1/videos，OpenAI 兼容格式） */
  KLING_VIDEO_OFFICIAL: "kling-video-official",
  /** VEO Google 视频生成-云雾通义（/v1/video/create，JSON 格式） */
  VEO_VIDEO_YUNWU_TONGYI: "veo-video-yunwu-tongyi",
  /** VEO Google 视频生成-云雾 OpenAI 格式（/v1/videos，multipart/form-data） */
  VEO_VIDEO_YUNWU_OPENAI: "veo-video-yunwu-openai",
  /** 豆包 Seedance 视频生成-云雾（/api/v1/contents/generations/tasks） */
  DOUBAO_SEEDANCE_VIDEO_YUNWU: "doubao-seedance-video-yunwu",
  /** 万相视频生成-百炼 DashScope（/api/v1/services/aigc/video-generation/video-synthesis） */
  WANX_VIDEO_BAILIAN: "wanx-video-bailian",
  /** 万相视频换人-百炼 DashScope（/api/v1/services/aigc/image2video/video-synthesis，wan2.2-animate-mix） */
  WANXIANG_VIDEO_MIX_BAILIAN: "wanxiang-video-mix-bailian",
  /** 快乐马视频生成-百炼 DashScope（/api/v1/services/aigc/video-generation/video-synthesis，参考生视频多图指代） */
  HAPPYHORSE_VIDEO_BAILIAN: "happyhorse-video-bailian",
  /** 快乐马视频编辑-百炼 DashScope（/api/v1/services/aigc/video-generation/video-synthesis，视频+参考图编辑换装） */
  HAPPYHORSE_VIDEO_EDIT_BAILIAN: "happyhorse-video-edit-bailian",
  /** Grok 视频生成-云雾（/v1/video/create，统一视频格式） */
  GROK_VIDEO_YUNWU: "grok-video-yunwu",
  /** Grok Imagine 视频生成-云雾（/v1/videos/generations，OpenAI 视频格式） */
  GROK_IMAGINE_VIDEO_YUNWU: "grok-imagine-video-yunwu",
  /** Grok Imagine 视频生成-DataEyes（/grok/v1/videos/generations，参考图字符串数组格式） */
  GROK_IMAGINE_VIDEO_DATAEYES: "grok-imagine-video-dataeyes",
  /** Grok 视频生成-才翔AI（/v1/media/generate，嵌套 params 格式） */
  GROK_VIDEO_CAIXIANG: "grok-video-caixiang",
  /** VEO 视频生成-才翔AI（/v1/media/generate，嵌套 params 格式） */
  VEO_VIDEO_CAIXIANG: "veo-video-caixiang",
  /** AnimateAnyone 图片检测-百炼（人物图片合规检测，Step 1） */
  ANIMATE_ANYONE_DETECT_BAILIAN: "animate-anyone-detect-bailian",
  /** AnimateAnyone 模板生成-百炼（从视频提取动作模板，Step 2） */
  ANIMATE_ANYONE_TEMPLATE_BAILIAN: "animate-anyone-template-bailian",
  /** AnimateAnyone 视频生成-百炼（图片+模板生成动作视频，Step 3） */
  ANIMATE_ANYONE_VIDEO_BAILIAN: "animate-anyone-video-bailian",
  /** OpenAI 兼容协议-视觉理解（图生文，用于图像描述、视觉问答等） */
  OPENAI_IMAGE_TO_TEXT: "openai-image-to-text",
  /** Gemini 图片生成协议（/v1/models/...:generateContent，返回 base64 图片） */
  GEMINI_IMAGE: "gemini-to-image",
  /** Gemini 图片生成协议-inline_data 模式（图片下载后 base64 内联发送，避免 file_uri 兼容问题） */
  GEMINI_IMAGE_INLINE: "gemini-to-image-inline",
  /** Nano Banana 图片生成协议（/api/{modelPath} 任务制，需轮询状态） */
  NANO_BANANA_IMAGE: "nano-banana-image",
  /** 火山方舟 Seedream 图片生成协议（OpenAI 兼容 /api/v3/images/generations） */
  SEEDREAM_IMAGE_ARK: "seedream-image-ark",
  /** 云雾 Seedream 图片生成协议（OpenAI 兼容 /v1/images/generations，doubao-seedream 模型） */
  SEEDREAM_IMAGE_ARK_YUNWU: "seedream-image-ark-yunwu",
  /** 万相图片生成-百炼 DashScope（/api/v1/services/aigc/multimodal-generation/generation） */
  WANX_IMAGE_BAILIAN: "wanx-image-bailian",
  /** OpenAI 图片生成协议（/v1/images/generations，gpt-image-2 等模型） */
  OPENAI_IMAGE: "openai-image",
  /** OpenAI 图片生成-才翔AI（/v1/media/generate，异步轮询，gpt-image-2 模型） */
  OPENAI_IMAGE_CAIXIANG: "openai-image-caixiang",
  /** Grok 图片生成协议-云雾（/v1/chat/completions，JSON Chat Completions 格式，grok-4.2-image 模型） */
  GROK_IMAGE: "grok-image",
  /** Grok 图片编辑协议-云雾（/v1/images/edits，multipart/form-data，支持参考图 + 分辨率/质量参数） */
  GROK_IMAGE_EDIT: "grok-image-edit",
  /** OpenAI 图片编辑协议（/v1/images/edits，multipart/form-data，支持多图编辑，gpt-image-2 等模型） */
  OPENAI_IMAGE_EDIT: "openai-image-edit",
  /** 阿里云市场万相营造商详长图（异步 submit+poll，AppCode 认证） */
  ALICLOUD_MARKET_IMAGE: "alicloud-market-image",
} as const;

export type ProviderCallMode = typeof ProviderCallMode[keyof typeof ProviderCallMode];

/** ProviderType → 可用 CallMode 映射（创建 Provider 时按类型筛选协议） */
export const PROVIDER_TYPE_CALL_MODES: Record<ProviderType, ProviderCallMode[]> = {
  text: [ProviderCallMode.OPENAI, ProviderCallMode.GEMINI, ProviderCallMode.DASHSCOPE, ProviderCallMode.DASHSCOPE_STREAM],
  image: [ProviderCallMode.OPENAI, ProviderCallMode.GEMINI, ProviderCallMode.OPENAI_IMAGE_TO_TEXT, ProviderCallMode.GEMINI_IMAGE, ProviderCallMode.GEMINI_IMAGE_INLINE, ProviderCallMode.NANO_BANANA_IMAGE, ProviderCallMode.SEEDREAM_IMAGE_ARK, ProviderCallMode.SEEDREAM_IMAGE_ARK_YUNWU, ProviderCallMode.WANX_IMAGE_BAILIAN, ProviderCallMode.OPENAI_IMAGE, ProviderCallMode.OPENAI_IMAGE_CAIXIANG, ProviderCallMode.GROK_IMAGE, ProviderCallMode.GROK_IMAGE_EDIT, ProviderCallMode.OPENAI_IMAGE_EDIT, ProviderCallMode.ALICLOUD_MARKET_IMAGE],
  video: [ProviderCallMode.KLING_VIDEO_YUNWU, ProviderCallMode.KLING_VIDEO_EDIT_YUNWU, ProviderCallMode.KLING_VIDEO_OFFICIAL, ProviderCallMode.KLING_OMNI_VIDEO_YUNWU, ProviderCallMode.KLING_OMNI_VIDEO_DATAEYES, ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI, ProviderCallMode.VEO_VIDEO_YUNWU_OPENAI, ProviderCallMode.DOUBAO_SEEDANCE_VIDEO_YUNWU, ProviderCallMode.WANX_VIDEO_BAILIAN, ProviderCallMode.WANXIANG_VIDEO_MIX_BAILIAN, ProviderCallMode.HAPPYHORSE_VIDEO_BAILIAN, ProviderCallMode.HAPPYHORSE_VIDEO_EDIT_BAILIAN, ProviderCallMode.GROK_VIDEO_YUNWU, ProviderCallMode.GROK_IMAGINE_VIDEO_YUNWU, ProviderCallMode.GROK_IMAGINE_VIDEO_DATAEYES, ProviderCallMode.GROK_VIDEO_CAIXIANG, ProviderCallMode.VEO_VIDEO_CAIXIANG, ProviderCallMode.ANIMATE_ANYONE_DETECT_BAILIAN, ProviderCallMode.ANIMATE_ANYONE_TEMPLATE_BAILIAN, ProviderCallMode.ANIMATE_ANYONE_VIDEO_BAILIAN],
};

/** CallMode → 可选模型标识（用于前端下拉选择，值即实际传给 API 的 model 字段） */
export interface ModelEntry {
  value: string;
  label: string;
}

/** 按 ProviderType 直接分组的模型枚举，去重合并所有 CallMode 下的模型 */
export const PROVIDER_TYPE_MODELS: Record<ProviderType, ModelEntry[]> = {
  text: [
    { value: "qwen3.6-plus", label: "Qwen 3.6 Plus" },
    { value: "qwen3-max", label: "Qwen3 Max" },
    { value: "qwen-max", label: "Qwen Max" },
    { value: "qwen-plus", label: "Qwen Plus" },
    { value: "deepseek-ai/DeepSeek-V3.2", label: "DeepSeek V3.2" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
    { value: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
  ],
  image: [
    { value: "qwen3.6-plus", label: "Qwen 3.6 Plus（视觉理解）" },
    { value: "gpt-4o", label: "GPT-4o（视觉理解）" },
    { value: "gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image" },
    { value: "gemini-3-flash-image-preview", label: "Gemini 3 Flash Image" },
    { value: "jimeng-4.5", label: "即梦 4.5" },
    { value: "text_to_image", label: "文生图" },
    { value: "image_to_image", label: "图生图" },
    { value: "doubao-seedream-5-0-260128", label: "Seedream 5.0" },
    { value: "wan2.7-image-pro", label: "万相 2.7 Image Pro" },
    { value: "wanx2.1-t2i-turbo", label: "万相 2.1 Turbo" },
    { value: "wanx2.1-t2i-plus", label: "万相 2.1 Plus" },
    { value: "grok-4.2-image", label: "Grok 4.2 Image" },
  ],
  video: [
    { value: "kling-v3-omni", label: "可灵 V3 Omni" },
    { value: "kling-v2-master", label: "可灵 V2 Master" },
    { value: "kling-v1-5", label: "可灵 V1.5" },
    { value: "kling-v1-pro", label: "可灵 V1 Pro" },
    { value: "kling-multi-image-to-video-v1", label: "可灵多图生视频 V1" },
    { value: "kling-video-o3-pro", label: "可灵 O3 Pro（换装编辑）" },
    { value: "veo3.1", label: "VEO 3.1" },
    { value: "veo3.1-fast", label: "VEO 3.1 Fast" },
    { value: "veo3.1-pro", label: "VEO 3.1 Pro" },
    { value: "veo3.1-4k", label: "VEO 3.1 4K" },
    { value: "veo_3_1-components", label: "VEO 3.1 Components" },
    { value: "doubao-seedance-1-5-pro-251215", label: "Seedance 1.5 Pro" },
    { value: "wan2.7-r2v", label: "万相 2.7 参考生视频" },
    { value: "wan2.7-i2v", label: "万相 2.7 图生视频" },
    { value: "wan2.7-t2v", label: "万相 2.7 文生视频" },
    { value: "wan2.6-i2v-flash", label: "万相 2.6 Flash 图生视频" },
    { value: "wan2.6-t2v", label: "万相 2.6 文生视频" },
    { value: "happyhorse-1.0-r2v", label: "快乐马 1.0 参考生视频" },
    { value: "grok-video-3", label: "Grok Video 3" },
    { value: "grok-imagine-video", label: "Grok Imagine Video" },
    { value: "grok-imagine-video-1.5-preview", label: "Grok Imagine Video 1.5 Preview" },
    { value: "happyhorse-1.0-video-edit", label: "快乐马 1.0 视频编辑" },
    { value: "wan2.2-animate-mix", label: "万相 2.2 视频换人" },
    { value: "animate-anyone-detect-gen2", label: "AnimateAnyone 图片检测" },
    { value: "animate-anyone-template-gen2", label: "AnimateAnyone 模板生成" },
    { value: "animate-anyone-gen2", label: "AnimateAnyone 视频生成" },
  ],
};

export interface ProviderConfig extends SoftDeletable {
  id: string;
  name: string;
  type: ProviderType;
  vendor: string;
  baseUrl: string;
  model: string;
  callMode: ProviderCallMode;
  /** 访问标识（如 AWS Access Key ID / 可灵 AccessKey），用于 JWT 认证等场景 */
  accessKey?: string | null;
  /** 备注说明 */
  remark?: string | null;
  options?: {
    geminiGroundingEnabled?: boolean;
    geminiFallbackModels?: string[];
  };
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Provider 仓库记录（完整版，用于 ProviderAdminService） */
export type Provider = ProviderConfig;

export interface ProviderSecret extends SoftDeletable {
  id: string;
  providerId: string;
  keyHint: string | null; // 表中无此字段，允许 null
  cipherText: string;
  regionPrefix: string | null;
  createdAt: number;
}

/** Provider Secret 关联视图（无 ID，用于查询关联） */
export interface ProviderSecretView {
  providerId: string;
  cipherText: string;
  updatedAt: number;
}

export interface ProviderRoutingPolicy extends SoftDeletable {
  id: string;
  routeKey: ProviderRouteKey;
  type: ProviderType;
  primaryProviderId: string;
  fallbackProviderIds: string[];
  timeoutMs: number;
  retryCount: number;
  enabled: boolean;
  description: string;  // 业务场景说明
  sortOrder: number;    // 排序权重
  updatedAt: number;
}

/** Provider Policy 简化版（用于仓库层） */
export interface ProviderPolicyRecord {
  id: string;
  routeKey: ProviderRouteKey;
  providerId: string;
  priority: number;
  enabled: boolean;
  createdAt: number;
}

export interface ProviderCallAudit {
  id: string;
  providerId: string;
  routeKey: ProviderRouteKey;
  requestId?: string | null;
  status: "pending" | "success" | "error" | "timeout";
  latencyMs: number;
  timeoutMs?: number | null;
  slowRequest?: boolean;
  cost: number;
  errorCode: string | null;
  errorMessage: string | null;
  requestSummary?: string | null;
  responseSummary?: string | null;
  createdAt: number;

  // 新增调试字段（可选，向后兼容）
  callContext?: string | null;           // 调用上下文：业务场景 + 代码位置 + 调用栈
  messagesJson?: string | null;          // 完整 messages 数组（JSON）
  queryParamsJson?: string | null;        // URL query 参数（JSON）
  actualModel?: string | null;           // 实际调用的模型名称
  providerVendor?: string | null;        // Provider vendor
  providerBaseUrl?: string | null;       // Provider baseUrl
  actualEndpoint?: string | null;        // 实际调用的完整 API URL（endpoint）
  requestHeadersJson?: string | null;    // 请求头（JSON）
  requestBodyJson?: string | null;       // 请求体摘要（JSON）
  inputTokens?: number | null;           // 输入 token 数量
  outputTokens?: number | null;          // 输出 token 数量
  ttftMs?: number | null;                // 首 token 时间
  projectId?: string | null;             // 关联项目 ID
  userId?: string | null;                // 调用用户 ID
  asyncJobId?: string | null;            // 关联用户任务 ID（用于成本追溯）
  attemptsJson?: string | null;          // 重试链路详情（JSON 数组）
  callMode?: ProviderCallMode | null;    // 调用协议（openai/gemini/dashscope 等）
}

export type ThemeCategory = "tech" | "ecommerce" | "fashion" | "kids" | "custom";

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primaryLight: string;
  accent: string;
  accentHover: string;
  accentActive: string;
  secondary: string;
  background: string;
  backgroundWarm: string;
  surface: string;
  text: {
    primary: string;
    secondary: string;
    muted: string;
  };
  border: string;
  borderFocus: string;
}

export interface ThemeGradients {
  primary: string;
  primaryHover: string;
  primaryActive: string;
}

export interface ThemeFonts {
  main: string;
  display: string;
}

export interface ThemeAnimations {
  transitionSpeed: string;
  hoverTransform: string;
}

export interface ThemeConfig {
  colors: ThemeColors;
  gradients: ThemeGradients;
  fonts: ThemeFonts;
  animations: ThemeAnimations;
}

export interface Theme {
  id: string;
  name: string;
  displayName: string;
  category: ThemeCategory;
  isSystem: boolean;
  isEnabled: boolean;
  config: ThemeConfig;
  logoUrl?: string;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserThemePreference {
  userId: string;
  themeId: string;
  systemName: string;
  customConfig?: Partial<ThemeConfig>;
  customLogoUrl?: string;
  updatedAt: number;
}

export type FissionType = "storyboard_recombine" | "homogenize_optimize" | "ai_new_story";

export type FissionVideoStatus = "pending" | "processing" | "completed" | "failed";

export interface TransitionInfo {
  type: string;
  durationFrames: number;  // FreeCut 帧数模式
  random?: boolean;
}

export interface FissionVideo {
  id: string;
  projectId: string;
  fissionType: FissionType;
  thumbnailUrl: string | null;
  videoPath: string | null;
  storyboardIds: string;
  storyboardUrls?: string[];
  transitionInfo: TransitionInfo | null;
  audioUrl: string | null;
  durationSec: number | null;
  speed: number | null;
  status: FissionVideoStatus;
  errorMessage: string | null;
  fissionVideoStatusId: string | null;
  creatorId: string;
  createdAt: number;
  updatedAt: number;
  /** 是否弃用 */
  isDeprecated: boolean;
  /** 弃用时间戳（毫秒） */
  deprecatedAt: number | null;
  /** 弃用操作者ID */
  deprecatedBy: string | null;
}

export type FissionStoryboardStatus =
  | "pending"
  | "generating_story"
  | "generating_images"
  | "generating_videos"
  | "completed"
  | "failed";

export interface FissionStoryboardPayload {
  characterInfo: {
    name?: string;
    description?: string;
    avatar?: string;
    [key: string]: unknown;
  };
  oldStory: string;
  newStory: string;
  storyboardImages: string[];
  storyboardVideos: string[];
}

export interface FissionStoryboard {
  id: string;
  projectId: string;
  creatorId: string;
  fissionType: "ai_new_story";
  payload: FissionStoryboardPayload;
  status: FissionStoryboardStatus;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// 角色五视图
// ============================================================================

export type CharacterFiveViewStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface CharacterFiveView {
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
// 电商详情页 Section 规划 (图片项目 Step4)
// ============================================================================

/** Section 类型 */
export type SectionType =
  | "outfit_overview"        // 搭配总览
  | "detail_showcase"        // 细节展示
  | "scene_application"      // 场景应用
  | "material_texture"       // 材质纹理
  | "size_comparison"        // 尺码对比
  | "call_to_action"         // 行动号召
  | "brand_story"            // 品牌故事
  | "styling_guide"          // 穿搭指南
  | "detail_closeup"         // 细节特写
  | "outfit_recommendation"  // 搭配推荐
  | "user_review"            // 用户评价
  | "hot_sales"              // 热销商品
  | "quality_cert"           // 质量认证
  | "price_display";         // 价格展示

/** Section 状态 */
export type SectionStatus =
  | "idle"          // 待生成
  | "planning"      // 规划中
  | "generating"    // 图片生成中
  | "ready"         // 已完成
  | "failed";       // 生成失败

/** 文字显示模式（唯一模式：Canvas 绘制自定义文字） */
export type TextDisplayMode = "custom_overlay";

/** 文字样式配置 */
export interface TextStyleConfig {
  /** 字号（像素） */
  fontSize: number;
  /** 字体颜色（十六进制，如 #1e293b） */
  color: string;
  /** 对齐方式 */
  align: "left" | "center" | "right";
  /** 位置 */
  position: "top" | "bottom" | "left" | "right";
  /** 是否显示背景 */
  showBackground: boolean;
  /** 背景颜色（十六进制） */
  backgroundColor?: string;
  /** 上下间距（像素） */
  paddingY: number;
  /** 左右间距（像素） */
  paddingX: number;
  /** 字体族（如 sans-serif, SimHei 等） */
  fontFamily?: string;
  /** 字间距（像素，0-10） */
  letterSpacing?: number;
  /** 行高（倍数，1.0-2.0） */
  lineHeight?: number;
  /** 字重（normal/bold/数字 400-700） */
  fontWeight?: string | number;
  /** 文字效果（none/shadow/glow/outline） */
  textEffect?: "none" | "shadow" | "glow" | "outline";
  /** 效果颜色（如阴影颜色） */
  effectColor?: string;
}

/** Section 文字显示配置（Canvas 绘制模式） */
export interface TextDisplayConfig {
  /** 显示模式（固定为 custom_overlay） */
  mode: TextDisplayMode;
  /** 是否显示文字（默认 true） */
  enabled: boolean;
  /** 标题样式配置 */
  titleStyle?: TextStyleConfig;
  /** 文案样式配置 */
  copyStyle?: TextStyleConfig;
  /** 版式模板ID（HTML-based渲染） */
  layoutTemplateId?: string;
}

// ============================================================================
// 排版配置（LayoutConfig）— 图形元素 + 文字排版 + 商品区域
// ============================================================================

/** 图形元素预设类型（前端 Canvas/SVG 可渲染的 35 种图形） */
export type GraphicsType =
  // --- 原始 8 种（面料/版型/工艺） ---
  | "air_flow"              // 气流线条（透气/轻薄）
  | "elastic_arrow"         // 弹性箭头（高弹/回弹）
  | "quality_stamp"         // 品质印章（精工/品质）
  | "silhouette_line"       // 轮廓线条（修身/版型）
  | "soft_curve"            // 柔软曲线（舒适/亲肤）
  | "stitch_mark"           // 针脚标注（缝线/工艺）
  | "scene_icon"            // 场景图标（场景/百搭）
  | "size_frame"            // 尺码框线（尺码/对比）
  // --- 标注类（Annotation）---
  | "arrow_callout"         // 箭头标注（带标签的箭头指向）
  | "highlight_spot"        // 聚焦高亮（脉冲圆圈聚焦效果）
  | "crosshair_mark"        // 十字准星（精确定位标注）
  | "circle_callout"        // 圆形标注（虚线圈 + 标签）
  | "magnifier"             // 放大镜（局部放大效果框）
  // --- 标签类（Badge/Tag）---
  | "sale_ribbon"           // 促销角标（折角 ribbon 标签）
  | "tag_label"             // 标签贴（胶带/贴纸效果标签）
  | "number_badge"          // 数字徽章（圆形数字标记）
  | "hot_mark"              // 热卖标记（火焰/热门标记）
  | "star_rating"           // 星级评分（星星评分展示）
  // --- 装饰类（Decoration）---
  | "dot_pattern"           // 圆点装饰（散落圆点背景装饰）
  | "wave_line"             // 波浪线（流动波浪装饰线）
  | "geometric_shape"       // 几何图形（三角/菱形/六边形装饰）
  | "light_glow"            // 光晕效果（柔和光晕聚光）
  | "sparkle"               // 闪光装饰（星光/闪光点缀）
  // --- 版式装饰类（Layout Decoration - 杂志/海报风格）---
  | "divider_line"          // 分割线（横线/竖线分割）
  | "corner_ornament"       // 角标装饰（四角装饰图案）
  | "quote_mark"            // 引号装饰（大引号视觉元素）
  | "border_frame"          // 边框线条（装饰边框）
  | "decorative_icon"       // 装饰图标（小图标点缀）
  // --- 氛围装饰类（Atmosphere Decoration - 精致氛围感）---
  | "feather"               // 小羽毛（轻盈/自然氛围）
  | "pen_tip"               // 小笔尖（书写/创作氛围）
  | "butterfly"             // 小蝴蝶（灵动/优雅氛围）
  | "heart_icon"            // 小爱心（情感/温暖氛围）
  | "leaf_decor"            // 小树叶（自然/清新氛围）
  | "sparkle_star"          // 星光点缀（梦幻/闪耀氛围）
  | "ribbon_decor"          // 丝带装饰（优雅/礼物氛围）
  | "flower_decor"          // 小花朵（浪漫/美好氛围）
  | "music_note"            // 音符装饰（艺术/活力氛围）
  | "crown_decor"           // 小皇冠（尊贵/高级氛围）
  // --- 功能图标类（Feature Icon）---
  | "waterproof_shield"     // 防水盾牌（盾牌 + 水滴图标）
  | "uv_protection"         // 防晒标识（太阳 + 防护标识）
  | "eco_leaf"              // 环保标识（叶子/天然标识）
  | "thermo_icon"           // 保暖标识（温度计/保暖图标）
  // --- 测量引导类（Measurement）---
  | "measure_line"          // 测量线（双向箭头测量标注）
  | "compare_frame"         // 对比框（左右/上下对比框）
  | "check_mark"            // 勾选标记（对勾/认证标记）
  | "custom_image"          // 自选图片（用户上传的图片）
  | "price_tag";            // 价格标签（商品价格标签）

/** 排版模板（HTML 模板 ID）*/
export type LayoutTemplate =
  | "bottom-gradient-classic"  // 底部渐变叠加（经典电商）
  | "top-solid-light"          // 顶部白底叠加（清新风格）
  | "center-no-overlay"        // 居中无遮罩（极简风格）
  | "left-aligned-magazine"    // 左侧叠加（杂志风格）
  | "bottom-pill-social"       // 底部胶囊叠加（小红书风格）
  | "top-right-diagonal"       // 右上角叠加（对角布局）
  | "fullscreen-dark-center"   // 全屏遮罩居中（电影海报风格）
  | "dual-block-split"         // 双区块叠加（标题上+文案下）
  | "bottom-price-tag"         // 底部价格标签（促销引导）
  | "gradient-left-text"       // 左渐变文字（搭配展示）
  | "blur-center"              // 氛围模糊（中心模糊遮罩）
  | "diagonal-gradient";       // 对角渐变（动感展示）

/** 单个图形元素配置 */
export interface GraphicsElement {
  /** 图形预设类型 */
  type: GraphicsType;
  /** 相对位置 X（0.0-1.0） */
  x: number;
  /** 相对位置 Y（0.0-1.0） */
  y: number;
  /** 相对宽度（0.0-1.0） */
  width: number;
  /** 相对高度（0.0-1.0） */
  height: number;
  /** 旋转角度（度） */
  rotation?: number;
  /** 不透明度（0.0-1.0） */
  opacity?: number;
  /** 主色（十六进制） */
  color?: string;
  /** 副色/渐变色（十六进制） */
  secondaryColor?: string;
  /** 可选标签文字 */
  label?: string;
  /** 自选图片 URL（仅 custom_image 类型） */
  imageUrl?: string;
}

/** 艺术字风格预设 */
export type ArtTextStyle =
  | "outline"        // 描边空心字
  | "shadow"         // 立体阴影字
  | "gradient"       // 渐变填充字
  | "neon"           // 霓虹发光字
  | "neon_pulse"     // 霓虹脉冲字（带动画）
  | "stamp"          // 印章风格字
  | "retro_stamp"    // 复古印章字（粗框 + 粗体）
  | "handwrite"      // 手写风格字
  | "graffiti_tag"   // 街头涂鸦字
  | "metallic_3d"    // 金属立体浮雕字
  | "glitter_spark"  // 闪光闪烁字
  | "fire_burn"      // 火焰燃烧字（SVG filter）
  | "ice_crystal"    // 冰晶冻结字（SVG filter）
  | "water_drop"     // 水滴溶解字（SVG filter）
  | "electric_arc"   // 电弧闪电字
  | "paper_cut"      // 剪纸镂空字
  | "bubble_pop"     // 气泡膨胀字
  | "gold_emboss";   // 金币浮雕字

/** 艺术字弧度控制配置 */
export interface ArtTextCurve {
  /** 弧度类型 */
  type: "arc" | "wave" | "bow";
  /** 弧度强度（0.0-1.0，0 为直线，1 为最大弧度） */
  intensity: number;
  /** 弧度方向 */
  direction: "up" | "down";
}

/** 艺术字元素（区别于图形元素，包含文字内容） */
export interface ArtTextElement {
  /** 元素类型标识 */
  type: "art_text";
  /** 艺术字风格 */
  style: ArtTextStyle;
  /** 文字内容（最多 8 字） */
  content: string;
  /** 相对位置 X（0.0-1.0） */
  x: number;
  /** 相对位置 Y（0.0-1.0） */
  y: number;
  /** 相对宽度（0.0-1.0） */
  width: number;
  /** 相对高度（0.0-1.0） */
  height: number;
  /** 旋转角度（度） */
  rotation?: number;
  /** 不透明度（0.0-1.0） */
  opacity?: number;
  /** 主色（十六进制） */
  color?: string;
  /** 副色/渐变色（十六进制） */
  secondaryColor?: string;
  /** 相对字号（相对于元素高度，0.5-1.0） */
  fontSize?: number;
  /** 字体名称 */
  fontFamily?: string;
  /** 弧度控制（可选，默认为直线） */
  curve?: ArtTextCurve;
}

/** 普通文字叠加元素（杂志级排版，支持横排/竖排） */
export interface OverlayTextElement {
  /** 元素类型标识 */
  type: "overlay_text";
  /** 文字内容（5-15字，适合标题短语） */
  content: string;
  /** 相对位置 X（0.0-1.0） */
  x: number;
  /** 相对位置 Y（0.0-1.0） */
  y: number;
  /** 相对宽度（0.0-1.0） */
  width: number;
  /** 相对高度（0.0-1.0） */
  height: number;
  /** 排版方向：横排 / 竖排 */
  direction: "horizontal" | "vertical";
  /** 相对字号（0.5-1.0，基准 24px） */
  fontSize?: number;
  /** 字体族：黑体/雅黑/Helvetica */
  fontFamily?: "simhei" | "yahei" | "helvetica";
  /** 字重：普通/加粗 */
  fontWeight?: "normal" | "bold";
  /** 字间距（px，基准 2px） */
  letterSpacing?: number;
  /** 行高（多行时使用，1.4-1.6） */
  lineHeight?: number;
  /** 主色（十六进制） */
  color?: string;
  /** 背景色（可选，半透明背景） */
  backgroundColor?: string;
  /** 背景透明度（0.0-1.0） */
  backgroundOpacity?: number;
  /** 整体透明度（0.0-1.0） */
  opacity?: number;
  /** 旋转角度（度） */
  rotation?: number;
  /** 对齐方式（横排时使用） */
  align?: "left" | "center" | "right";
  /** 文字阴影 */
  shadow?: boolean;
  /** 阴影颜色 */
  shadowColor?: string;
  /** 自动尺寸：前端根据实际文字渲染计算 width/height，覆盖后端初始值 */
  autoSize?: boolean;
}

/** 图形层元素联合类型 */
export type GraphicsLayerElement = GraphicsElement | ArtTextElement | OverlayTextElement;

/** 文字排版位置配置 */
export interface TextLayoutPosition {
  /** 相对 X 位置（0.0-1.0） */
  x: number;
  /** 相对 Y 位置（0.0-1.0） */
  y: number;
  /** 相对宽度（0.0-1.0） */
  width: number;
  /** 对齐方式 */
  align: "left" | "center" | "right";
}

/** 文字排版配置 */
export interface TextLayout {
  template: LayoutTemplate;
  /** 标题位置 */
  titlePosition: TextLayoutPosition;
  /** 文案位置 */
  copyPosition: TextLayoutPosition;
}

/** 图形层排版配置 */
export interface GraphicsLayout {
  /** 图形元素数组（含图形和艺术字） */
  elements: GraphicsLayerElement[];
}

/** 商品区域边界（图形元素应避开此区域） */
export interface ProductArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 完整排版配置（存储在 PageSection.layoutConfig） */
export interface LayoutConfig {
  /** 排版模板 */
  template: LayoutTemplate;
  /** 文字排版 */
  textLayout: TextLayout;
  /** 图形元素 */
  graphicsLayout: GraphicsLayout;
  /** 商品区域 */
  productArea?: ProductArea;
}

/**
 * 页面 Section（nrm_page_sections）
 * 电商详情页的每个区块，如搭配总览、细节展示、场景应用等
 */
export interface PageSection {
  id: string;
  projectId: string;
  /** Section 标识（如 outfit_overview_1） */
  sectionKey: string;
  /** Section 类型 */
  sectionType: SectionType;
  /** 区块标题 */
  title: string | null;
  /** 区块目标描述 */
  goal: string | null;
  /** 文案内容 */
  copy: string | null;
  /** 图片生成视觉提示词（纯净商品图描述） */
  visualPrompt: string | null;
  /** 排序 */
  sortOrder: number;
  /** 状态 */
  status: SectionStatus;
  /** 当前激活的图片资产ID */
  currentImageAssetId: string | null;
  /** 可编辑数据（文案修改等） */
  editableData: Record<string, unknown> | null;
  /** 文字显示配置（旧机制，保留兼容） */
  displayConfig: TextDisplayConfig | null;
  /** 排版配置（图形元素 + 文字位置） */
  layoutConfig: LayoutConfig | null;
  /** 软删除时间戳 */
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Section 图片版本（nrm_section_versions）
 * 每次重新生成图片时创建一个版本，支持版本回溯
 */
export interface SectionVersion {
  id: string;
  sectionId: string;
  projectId: string;
  /** 版本号（从 1 开始递增） */
  versionNumber: number;
  /** 生成时使用的提示词快照 */
  promptSnapshot: Record<string, unknown> | null;
  /** 文案快照 */
  copySnapshot: Record<string, unknown> | null;
  /** 生成的图片资产ID */
  imageAssetId: string | null;
  /** 是否为当前激活版本 */
  isActive: boolean;
  createdAt: number;
}

/** 伪删除实体接口 */
export interface SoftDeletable {
  deletedAt?: number | null;
  deletedBy?: string | null;
}

// ============================================================================
// 模特图（图片项目 Step 3）
// ============================================================================

export type ModelPhotoStatus = 'pending' | 'generating' | 'success' | 'failed';

/** 图片项目关系模式（单人/多人模特图） */
export type ImageRelationMode = "single" | "multi";

export interface ModelPhoto {
  id: string;
  projectId: string;
  imageUrl: string | null;
  poseLabel: string;          // 如 "正面全身站立"
  bgLabel: string;            // 如 "纯色渐变棚拍"
  isSelected: boolean;        // 用户是否选入素材池
  status: ModelPhotoStatus;
  errorMessage: string | null;
  order: number;
  /** 出镜角色 ID 列表（多人模式下使用） */
  characterIds?: string[];
  /** 颜色分配：characterId → variantAssetId 映射（多人多色模式下使用） */
  colorAssignments?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

/** Logo 位置类型 */
export type LogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** 图片项目扩展信息，存储图片项目独有字段 */
export interface ImageProjectExt {
  id: string;
  projectId: string;
  /** 用户上传的 Logo OSS URL */
  logoUrl: string | null;
  /** Logo 位置 */
  logoPosition: LogoPosition;
  /** Logo 宽度比例（相对于图片宽度，0.10 表示占图片宽度的 10%） */
  logoWidthRatio: number;
  /** Logo 最小宽度 px（避免在小图上太小） */
  logoMinWidth: number;
  /** Logo 最大宽度 px（避免在大图上太大） */
  logoMaxWidth: number;
  /** Logo 边距 px */
  logoMargin: number;
  /** Logo 透明度 0.0-1.0 */
  logoOpacity: number;
  /** 最后一次合成的长图下载 URL */
  stitchImageUrl: string | null;
  /** 最后一次合成的配置哈希（基于图片ID和顺序） */
  stitchHash: string | null;
  /** 最后一次合成时间戳 */
  stitchUpdatedAt: number | null;
  /** 万相营造生成的商详长图 URL */
  longImageUrl: string | null;
  /** 万相营造 Pro 版 Sketch 源文件 URL */
  longImageSketchUrl: string | null;
  /** 多人关系模式（图片项目 Step2 选择） */
  imageRelationMode: ImageRelationMode | null;
  createdAt: number;
  updatedAt: number;
}

/** 长图生成历史记录 */
export interface LongImageGeneration {
  id: string;
  projectId: string;
  templateId: string | null;
  templateName: string | null;
  imageUrl: string;
  sketchUrl: string | null;
  isActive: boolean;
  createdAt: number;
}

/** 视频项目业务数据（脚本策略匹配等视频项目独有数据） */
export interface VideoProjectBusinessData {
  id: string;
  projectId: string;
  /** 首次匹配的可用脚本策略列表 */
  availableStrategies: string[];
  /** 角色年龄分组：infant/toddler/child/teen/adult */
  ageGroup: string | null;
  /** 角色年龄数值 */
  characterAge: number | null;
  createdAt: number;
  updatedAt: number;
}

/** 项目-视频音乐关联记录 */
export interface ProjectVideoMusic {
  /** 记录ID */
  id: string;
  /** 项目ID */
  projectId: string;
  /** 音乐ID（关联 nrm_video_musics 表） */
  musicId: string;
  /** 音乐URL快照（播放地址，不受音乐库变更影响） */
  musicUrl: string;
  /** 音量（0.00-1.00） */
  volume: number;
  /** 淡入时长（秒） */
  fadeInSec: number;
  /** 淡出时长（秒） */
  fadeOutSec: number;
  /** 是否选中（当前播放） */
  isSelected: boolean;
  /** 音乐标题 */
  title: string | null;
  /** 氛围标签数组 */
  atmospheres: string[];
  /** 艺术家 */
  artist: string | null;
  /** 时长（秒） */
  durationSec: number | null;
  /** 封面图URL */
  coverUrl: string | null;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
}





