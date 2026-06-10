/**
 * 字典常量定义 - 前后端共享
 * 使用 const assertion 保证类型安全
 */

// ==================== 用户角色 ====================
export const ROLE = {
  USER: 'user',
  ADMIN: 'admin',
} as const;

export type Role = typeof ROLE[keyof typeof ROLE];

export const ROLE_LABELS: Record<Role, string> = {
  [ROLE.USER]: '普通用户',
  [ROLE.ADMIN]: '管理员',
};

// ==================== 服饰分类（系统核心概念） ====================
export const GARMENT_CATEGORY = {
  TOP: 'top',
  BOTTOM: 'bottom',
  SHOES: 'shoes',
  ACCESSORY: 'accessory',
  SUIT: 'suit',
  DRESS: 'dress',
  OUTER: 'outer',
} as const;

export type GarmentCategory = typeof GARMENT_CATEGORY[keyof typeof GARMENT_CATEGORY];

export const GARMENT_CATEGORY_LABELS: Record<GarmentCategory, string> = {
  [GARMENT_CATEGORY.TOP]: '上装',
  [GARMENT_CATEGORY.BOTTOM]: '下装',
  [GARMENT_CATEGORY.SHOES]: '鞋履',
  [GARMENT_CATEGORY.ACCESSORY]: '配饰',
  [GARMENT_CATEGORY.SUIT]: '套装',
  [GARMENT_CATEGORY.DRESS]: '连衣裙',
  [GARMENT_CATEGORY.OUTER]: '外套',
};

/** 服饰分类关键词（用于 AI 分析识别） */
export const GARMENT_CATEGORY_KEYWORDS: Record<GarmentCategory, string[]> = {
  top: ["上装", "上衣", "衬衫", "针织", "T恤", "短袖"],
  bottom: ["下装", "裤", "半裙", "长裙", "牛仔", "西裤"],
  shoes: ["鞋", "鞋履", "运动鞋", "德训鞋", "乐福", "高跟", "靴"],
  accessory: ["配饰", "包", "项链", "耳环", "首饰", "手链", "帽", "围巾"],
  suit: ["套装", "上下装", "造型", "穿搭"],
  dress: ["连衣裙", "裙子", "长裙", "中裙", "短裙", "礼服"],
  outer: ["外套", "夹克", "风衣", "大衣", "西装外套", "针织开衫"],
};

/** 服饰分类图标 */
export const GARMENT_CATEGORY_ICON: Record<GarmentCategory, string> = {
  top: "checkroom",
  bottom: "dry_cleaning",
  shoes: "hiking",
  accessory: "watch",
  suit: "layers",
  dress: "female",
  outer: "ac_unit",
};

// ==================== 角色类型 ====================
export const CHARACTER_KIND = {
  BASIC: 'basic',
  IMAGE: 'image',
  VIDEO: 'video',
} as const;

export type CharacterKind = typeof CHARACTER_KIND[keyof typeof CHARACTER_KIND];

export const CHARACTER_KIND_LABELS: Record<CharacterKind, string> = {
  [CHARACTER_KIND.BASIC]: '基础角色',
  [CHARACTER_KIND.IMAGE]: '图片角色',
  [CHARACTER_KIND.VIDEO]: '视频角色',
};

// ==================== 角色视角 ====================
export const CHARACTER_VIEW_KEY = {
  FRONT: 'front',
  LEFT: 'left',
  RIGHT: 'right',
  BACK: 'back',
  CLOSEUP: 'closeup',
} as const;

export type CharacterViewKey = typeof CHARACTER_VIEW_KEY[keyof typeof CHARACTER_VIEW_KEY];

export const CHARACTER_VIEW_KEY_LABELS: Record<CharacterViewKey, string> = {
  [CHARACTER_VIEW_KEY.FRONT]: '正面',
  [CHARACTER_VIEW_KEY.LEFT]: '左侧',
  [CHARACTER_VIEW_KEY.RIGHT]: '右侧',
  [CHARACTER_VIEW_KEY.BACK]: '背面',
  [CHARACTER_VIEW_KEY.CLOSEUP]: '特写',
};

// ==================== 角色视角状态 ====================
export const CHARACTER_VIEW_STATE = {
  PENDING: 'pending',
  GENERATING: 'generating',
  READY: 'ready',
  FAILED: 'failed',
} as const;

export type CharacterViewState = typeof CHARACTER_VIEW_STATE[keyof typeof CHARACTER_VIEW_STATE];

export const CHARACTER_VIEW_STATE_LABELS: Record<CharacterViewState, string> = {
  [CHARACTER_VIEW_STATE.PENDING]: '待处理',
  [CHARACTER_VIEW_STATE.GENERATING]: '生成中',
  [CHARACTER_VIEW_STATE.READY]: '已完成',
  [CHARACTER_VIEW_STATE.FAILED]: '失败',
};

export const CHARACTER_VIEW_STATE_COLORS: Record<CharacterViewState, string> = {
  [CHARACTER_VIEW_STATE.PENDING]: 'gray',
  [CHARACTER_VIEW_STATE.GENERATING]: 'blue',
  [CHARACTER_VIEW_STATE.READY]: 'green',
  [CHARACTER_VIEW_STATE.FAILED]: 'red',
};

// ==================== 供应商类型 ====================
export const PROVIDER_TYPE = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
} as const;

export type ProviderType = typeof PROVIDER_TYPE[keyof typeof PROVIDER_TYPE];

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  [PROVIDER_TYPE.TEXT]: '文本模型',
  [PROVIDER_TYPE.IMAGE]: '图片生成',
  [PROVIDER_TYPE.VIDEO]: '视频生成',
};

// ==================== 项目状态 ====================
export const PROJECT_STATUS = {
  DRAFT: 'DRAFT',
  GARMENT_UPLOADED: 'GARMENT_UPLOADED',           // Step1: 服饰已上传
  OUTFIT_SELECTED: 'OUTFIT_SELECTED',              // Step1: 穿搭已选择
  OUTFIT_CONFIRMED: 'OUTFIT_CONFIRMED',            // Step1: 穿搭已确认（进入定妆阶段）
  ROLE_DIRECTION_CONFIRMED: 'ROLE_DIRECTION_CONFIRMED', // Step1: 角色方向已确认
  CHARACTER_VIEW_READY: 'CHARACTER_VIEW_READY',
  CHARACTER_SELECTED: 'CHARACTER_SELECTED',
  CHARACTER_CONFIRMED: 'CHARACTER_CONFIRMED',
  SCRIPT_GENERATED: 'SCRIPT_GENERATED',
  SCRIPT_SELECTED: 'SCRIPT_SELECTED',
  SCRIPT_CONFIRMED: 'SCRIPT_CONFIRMED',
  STORYBOARDING: 'STORYBOARDING',
  STORYBOARD_PREVIEW_COMPLETED: 'STORYBOARD_PREVIEW_COMPLETED',
  FILMING: 'FILMING',
  CLIPS_READY: 'CLIPS_READY',
  FISSIONING: 'FISSIONING',
  READY_TO_PUBLISH: 'READY_TO_PUBLISH',
  PUBLISHED: 'PUBLISHED',
} as const;

export type ProjectStatus = typeof PROJECT_STATUS[keyof typeof PROJECT_STATUS];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  [PROJECT_STATUS.DRAFT]: '草稿',
  [PROJECT_STATUS.GARMENT_UPLOADED]: '服饰已上传',
  [PROJECT_STATUS.OUTFIT_SELECTED]: '穿搭已选择',
  [PROJECT_STATUS.OUTFIT_CONFIRMED]: '穿搭已确认',
  [PROJECT_STATUS.ROLE_DIRECTION_CONFIRMED]: '角色方向已确认',
  [PROJECT_STATUS.CHARACTER_VIEW_READY]: '五视图已生成',
  [PROJECT_STATUS.CHARACTER_SELECTED]: '角色已选择',
  [PROJECT_STATUS.CHARACTER_CONFIRMED]: '角色已确认',
  [PROJECT_STATUS.SCRIPT_GENERATED]: '脚本已生成',
  [PROJECT_STATUS.SCRIPT_SELECTED]: '脚本已选择',
  [PROJECT_STATUS.SCRIPT_CONFIRMED]: '脚本已确认',
  [PROJECT_STATUS.STORYBOARDING]: '分镜生成中',
  [PROJECT_STATUS.STORYBOARD_PREVIEW_COMPLETED]: '分镜预览已完成',
  [PROJECT_STATUS.FILMING]: '视频生成中',
  [PROJECT_STATUS.CLIPS_READY]: '分镜就绪',
  [PROJECT_STATUS.FISSIONING]: '裂变中',
  [PROJECT_STATUS.READY_TO_PUBLISH]: '待发布',
  [PROJECT_STATUS.PUBLISHED]: '已发布',
};

// 图片项目状态常量
export const IMAGE_PROJECT_STATUS = {
  IMAGE_DRAFT: 'IMAGE_DRAFT',
  IMAGE_GARMENT_UPLOADED: 'IMAGE_GARMENT_UPLOADED',
  IMAGE_ROLE_DIRECTION_CONFIRMED: 'IMAGE_ROLE_DIRECTION_CONFIRMED',
  IMAGE_OUTFIT_SELECTED: 'IMAGE_OUTFIT_SELECTED',
  IMAGE_OUTFIT_CONFIRMED: 'IMAGE_OUTFIT_CONFIRMED',
  IMAGE_CHARACTER_VIEW_READY: 'IMAGE_CHARACTER_VIEW_READY',
  IMAGE_CHARACTER_SELECTED: 'IMAGE_CHARACTER_SELECTED',
  IMAGE_CHARACTER_CONFIRMED: 'IMAGE_CHARACTER_CONFIRMED',
  IMAGE_MODEL_PHOTOS_READY: 'IMAGE_MODEL_PHOTOS_READY',
  IMAGE_DETAIL_PAGE_GENERATED: 'IMAGE_DETAIL_PAGE_GENERATED',
  IMAGE_READY_TO_PUBLISH: 'IMAGE_READY_TO_PUBLISH',
  IMAGE_PUBLISHED: 'IMAGE_PUBLISHED',
} as const;

export type ImageProjectStatusKey = typeof IMAGE_PROJECT_STATUS[keyof typeof IMAGE_PROJECT_STATUS];

// 图片项目状态标签映射
export const IMAGE_PROJECT_STATUS_LABELS: Record<ImageProjectStatusKey, string> = {
  IMAGE_DRAFT: '草稿',
  IMAGE_GARMENT_UPLOADED: '服饰已上传',
  IMAGE_ROLE_DIRECTION_CONFIRMED: '角色预设已确认',
  IMAGE_OUTFIT_SELECTED: '穿搭已选择',
  IMAGE_OUTFIT_CONFIRMED: '穿搭已确认',
  IMAGE_CHARACTER_VIEW_READY: '角色视图已生成',
  IMAGE_CHARACTER_SELECTED: '角色已选择',
  IMAGE_CHARACTER_CONFIRMED: '角色已确认',
  IMAGE_MODEL_PHOTOS_READY: '模特图已生成',
  IMAGE_DETAIL_PAGE_GENERATED: '详情页已生成',
  IMAGE_READY_TO_PUBLISH: '待发布',
  IMAGE_PUBLISHED: '已发布',
};

// "生成中"聚合状态：排除草稿和终态（DRAFT / READY_TO_PUBLISH / PUBLISHED 及对应图片状态）
const PROCESSING_EXCLUDE: Set<string> = new Set([
  PROJECT_STATUS.DRAFT, PROJECT_STATUS.READY_TO_PUBLISH, PROJECT_STATUS.PUBLISHED,
  IMAGE_PROJECT_STATUS.IMAGE_DRAFT, IMAGE_PROJECT_STATUS.IMAGE_READY_TO_PUBLISH, IMAGE_PROJECT_STATUS.IMAGE_PUBLISHED,
]);
export const PROCESSING_STATUSES: readonly string[] = [
  ...Object.values(PROJECT_STATUS).filter(s => !PROCESSING_EXCLUDE.has(s)),
  ...Object.values(IMAGE_PROJECT_STATUS).filter(s => !PROCESSING_EXCLUDE.has(s)),
];

/** 根据项目状态映射到对应的 Step 编号 */
export const PROJECT_STATUS_TO_STEP: Record<ProjectStatus, number> = {
  [PROJECT_STATUS.DRAFT]: 1,
  [PROJECT_STATUS.GARMENT_UPLOADED]: 1,
  [PROJECT_STATUS.OUTFIT_SELECTED]: 1,
  [PROJECT_STATUS.OUTFIT_CONFIRMED]: 2,
  [PROJECT_STATUS.ROLE_DIRECTION_CONFIRMED]: 1,
  [PROJECT_STATUS.CHARACTER_VIEW_READY]: 2,
  [PROJECT_STATUS.CHARACTER_SELECTED]: 2,
  [PROJECT_STATUS.CHARACTER_CONFIRMED]: 2,
  [PROJECT_STATUS.SCRIPT_GENERATED]: 3,
  [PROJECT_STATUS.SCRIPT_SELECTED]: 3,
  [PROJECT_STATUS.SCRIPT_CONFIRMED]: 3,
  [PROJECT_STATUS.STORYBOARDING]: 4,
  [PROJECT_STATUS.STORYBOARD_PREVIEW_COMPLETED]: 4,
  [PROJECT_STATUS.FILMING]: 5,
  [PROJECT_STATUS.CLIPS_READY]: 5,
  [PROJECT_STATUS.FISSIONING]: 6,
  [PROJECT_STATUS.READY_TO_PUBLISH]: 5,
  [PROJECT_STATUS.PUBLISHED]: 5,
};

// ==================== 脚本来源类型 ====================
export const SCRIPT_SOURCE_TYPE = {
  TEMPLATE: 'template',
  ORIGINAL: 'original',
  REVERSE: 'reverse',
} as const;

export type ScriptSourceType = typeof SCRIPT_SOURCE_TYPE[keyof typeof SCRIPT_SOURCE_TYPE];

export const SCRIPT_SOURCE_TYPE_LABELS: Record<ScriptSourceType, string> = {
  [SCRIPT_SOURCE_TYPE.TEMPLATE]: '模板',
  [SCRIPT_SOURCE_TYPE.ORIGINAL]: '原创',
  [SCRIPT_SOURCE_TYPE.REVERSE]: '逆向解析',
};

// ==================== 审核状态 ====================
export const REVIEW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  NEEDS_CHANGES: 'needs_changes',
} as const;

export type ReviewStatus = typeof REVIEW_STATUS[keyof typeof REVIEW_STATUS];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  [REVIEW_STATUS.PENDING]: '待审核',
  [REVIEW_STATUS.APPROVED]: '已通过',
  [REVIEW_STATUS.REJECTED]: '已拒绝',
  [REVIEW_STATUS.NEEDS_CHANGES]: '需修改',
};

export const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  [REVIEW_STATUS.PENDING]: 'orange',
  [REVIEW_STATUS.APPROVED]: 'green',
  [REVIEW_STATUS.REJECTED]: 'red',
  [REVIEW_STATUS.NEEDS_CHANGES]: 'blue',
};

// ==================== 视频任务状态 ====================
export const VIDEO_JOB_STATUS = {
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
} as const;

export type VideoJobStatus = typeof VIDEO_JOB_STATUS[keyof typeof VIDEO_JOB_STATUS];

export const VIDEO_JOB_STATUS_LABELS: Record<VideoJobStatus, string> = {
  [VIDEO_JOB_STATUS.RUNNING]: '运行中',
  [VIDEO_JOB_STATUS.SUCCEEDED]: '成功',
  [VIDEO_JOB_STATUS.FAILED]: '失败',
  [VIDEO_JOB_STATUS.TIMEOUT]: '超时',
};

// ==================== 分辨率 ====================
export const RESOLUTION = {
  P720: '720p',
  P1080: '1080p',
} as const;

export type Resolution = typeof RESOLUTION[keyof typeof RESOLUTION];

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  [RESOLUTION.P720]: '720p',
  [RESOLUTION.P1080]: '1080p',
};

// ==================== 主题分类 ====================
export const THEME_CATEGORY = {
  TECH: 'tech',
  ECOMMERCE: 'ecommerce',
  FASHION: 'fashion',
  KIDS: 'kids',
  CUSTOM: 'custom',
} as const;

export type ThemeCategory = typeof THEME_CATEGORY[keyof typeof THEME_CATEGORY];

export const THEME_CATEGORY_LABELS: Record<ThemeCategory, string> = {
  [THEME_CATEGORY.TECH]: '科技',
  [THEME_CATEGORY.ECOMMERCE]: '电商',
  [THEME_CATEGORY.FASHION]: '时尚',
  [THEME_CATEGORY.KIDS]: '儿童',
  [THEME_CATEGORY.CUSTOM]: '自定义',
};

// ==================== 裂变类型 ====================
export const FISSION_TYPE = {
  STORYBOARD_RECOMBINE: 'storyboard_recombine',
  HOMOGENIZE_OPTIMIZE: 'homogenize_optimize',
  AI_NEW_STORY: 'ai_new_story',
} as const;

export type FissionType = typeof FISSION_TYPE[keyof typeof FISSION_TYPE];

export const FISSION_TYPE_LABELS: Record<FissionType, string> = {
  [FISSION_TYPE.STORYBOARD_RECOMBINE]: '分镜重组',
  [FISSION_TYPE.HOMOGENIZE_OPTIMIZE]: '同质化优化',
  [FISSION_TYPE.AI_NEW_STORY]: 'AI新故事',
};

// ==================== 裂变视频状态 ====================
export const FISSION_VIDEO_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type FissionVideoStatus = typeof FISSION_VIDEO_STATUS[keyof typeof FISSION_VIDEO_STATUS];

export const FISSION_VIDEO_STATUS_LABELS: Record<FissionVideoStatus, string> = {
  [FISSION_VIDEO_STATUS.PENDING]: '待处理',
  [FISSION_VIDEO_STATUS.PROCESSING]: '处理中',
  [FISSION_VIDEO_STATUS.COMPLETED]: '已完成',
  [FISSION_VIDEO_STATUS.FAILED]: '失败',
};

// ==================== 热榜话题类型 ====================
export const TREND_TOPIC_TYPE = {
  REALTIME: 'realtime',
  VIDEO: 'video',
} as const;

export type TrendTopicType = typeof TREND_TOPIC_TYPE[keyof typeof TREND_TOPIC_TYPE];

export const TREND_TOPIC_TYPE_LABELS: Record<TrendTopicType, string> = {
  [TREND_TOPIC_TYPE.REALTIME]: '实时热榜',
  [TREND_TOPIC_TYPE.VIDEO]: '视频热榜',
};

// ==================== 热榜时间窗口 ====================
export const TREND_WINDOW = {
  H24: '24h',
  D7: '7d',
  D30: '30d',
} as const;

export type TrendWindow = typeof TREND_WINDOW[keyof typeof TREND_WINDOW];

export const TREND_WINDOW_LABELS: Record<TrendWindow, string> = {
  [TREND_WINDOW.H24]: '24小时',
  [TREND_WINDOW.D7]: '7天',
  [TREND_WINDOW.D30]: '30天',
};

// ==================== 广场发布分类 ====================
export const SQUARE_PUBLISH_CATEGORY = {
  MEN: '男装',
  WOMEN: '女装',
  BOYS: '男童装',
  GIRLS: '女童装',
} as const;

export type SquarePublishCategory = typeof SQUARE_PUBLISH_CATEGORY[keyof typeof SQUARE_PUBLISH_CATEGORY];

export const SQUARE_PUBLISH_CATEGORY_LABELS: Record<SquarePublishCategory, string> = {
  [SQUARE_PUBLISH_CATEGORY.MEN]: '男装',
  [SQUARE_PUBLISH_CATEGORY.WOMEN]: '女装',
  [SQUARE_PUBLISH_CATEGORY.BOYS]: '男童装',
  [SQUARE_PUBLISH_CATEGORY.GIRLS]: '女童装',
};

// ==================== 步骤提示词类型 ====================
/**
 * 步骤提示词类型
 * 用于存储各步骤的分析提示词和返回内容
 */
export const STEP_PROMPT_TYPE = {
  HOTSPOT_EXTRACT: 'hotspot_extract',       // 提取热点信息
  HOTSPOT_ANALYSIS: 'hotspot_analysis',     // 热点深度分析
  CHARACTER_ANALYSIS: 'character_analysis', // 角色形象分析
  SCRIPT_CREATION: 'script_creation',       // 脚本创作
} as const;

export type StepPromptType = typeof STEP_PROMPT_TYPE[keyof typeof STEP_PROMPT_TYPE];

export const STEP_PROMPT_TYPE_LABELS: Record<StepPromptType, string> = {
  [STEP_PROMPT_TYPE.HOTSPOT_EXTRACT]: '提取热点信息',
  [STEP_PROMPT_TYPE.HOTSPOT_ANALYSIS]: '热点深度分析',
  [STEP_PROMPT_TYPE.CHARACTER_ANALYSIS]: '角色形象分析',
  [STEP_PROMPT_TYPE.SCRIPT_CREATION]: '脚本创作',
};

// ==================== 提示词模板类型 ====================
export const PROMPT_TYPE = {
  HOTSPOT_ANALYSIS: 'hotspot_analysis',
  CHARACTER_ANALYSIS: 'character_analysis',
  SCRIPT_GENERATION: 'script_generation',
  IMAGE_ANALYSIS: 'image_analysis',
  VIDEO_SCRIPT: 'video_script',
  OUTFIT_RECOMMENDATION: 'outfit_recommendation',
  STYLING_DESIGN: 'styling_design',
  VIDEO_GENERATION: 'video_generation',
  SYSTEM_PROMPT: 'system_prompt',
  CONTENT_REVIEW: 'content_review',
  OTHER: 'other',
} as const;

export type PromptType = typeof PROMPT_TYPE[keyof typeof PROMPT_TYPE];

export const PROMPT_TYPE_LABELS: Record<PromptType, string> = {
  [PROMPT_TYPE.HOTSPOT_ANALYSIS]: '热点分析',
  [PROMPT_TYPE.CHARACTER_ANALYSIS]: '角色分析',
  [PROMPT_TYPE.SCRIPT_GENERATION]: '脚本生成',
  [PROMPT_TYPE.IMAGE_ANALYSIS]: '图片分析',
  [PROMPT_TYPE.VIDEO_SCRIPT]: '视频脚本',
  [PROMPT_TYPE.OUTFIT_RECOMMENDATION]: '服装搭配',
  [PROMPT_TYPE.STYLING_DESIGN]: '定妆设计',
  [PROMPT_TYPE.VIDEO_GENERATION]: '成片生成',
  [PROMPT_TYPE.SYSTEM_PROMPT]: '系统提示词',
  [PROMPT_TYPE.CONTENT_REVIEW]: '内容审核',
  [PROMPT_TYPE.OTHER]: '其他',
};

/** 提示词类型选项列表（用于前端下拉） */
export const PROMPT_TYPE_OPTIONS: Array<{ value: PromptType; label: string }> = [
  { value: PROMPT_TYPE.HOTSPOT_ANALYSIS, label: '热点分析' },
  { value: PROMPT_TYPE.CHARACTER_ANALYSIS, label: '角色分析' },
  { value: PROMPT_TYPE.SCRIPT_GENERATION, label: '脚本生成' },
  { value: PROMPT_TYPE.IMAGE_ANALYSIS, label: '图片分析' },
  { value: PROMPT_TYPE.VIDEO_SCRIPT, label: '视频脚本' },
  { value: PROMPT_TYPE.OUTFIT_RECOMMENDATION, label: '服装搭配' },
  { value: PROMPT_TYPE.STYLING_DESIGN, label: '定妆设计' },
  { value: PROMPT_TYPE.VIDEO_GENERATION, label: '成片生成' },
  { value: PROMPT_TYPE.SYSTEM_PROMPT, label: '系统提示词' },
  { value: PROMPT_TYPE.CONTENT_REVIEW, label: '内容审核' },
  { value: PROMPT_TYPE.OTHER, label: '其他' },
];

// ==================== Prompt模式 ====================
export const PROMPT_MODE = {
  CODE: 'code',
  LLM: 'llm',
} as const;

export type PromptMode = typeof PROMPT_MODE[keyof typeof PROMPT_MODE];

export const PROMPT_MODE_LABELS: Record<PromptMode, string> = {
  [PROMPT_MODE.CODE]: '代码模式',
  [PROMPT_MODE.LLM]: 'LLM模式',
};

// ==================== Step3 脚本生成流水线类型 ====================

/**
 * 流水线阶段标识
 */
export const PIPELINE_STAGE = {
  STAGE1_INPUT_PARSER: 'stage1_input_parser',
  STAGE2_HOTSPOT_ANALYZER: 'stage2_hotspot_analyzer',
  STAGE3_CHARACTER_ANALYZER: 'stage3_character_analyzer',
  STAGE4_SCRIPT_CREATOR: 'stage4_script_creator',
  STAGE5_QUALITY_CHECKER: 'stage5_quality_checker',
  STAGE6_OUTPUT_FORMATTER: 'stage6_output_formatter',
} as const;

export type PipelineStage = typeof PIPELINE_STAGE[keyof typeof PIPELINE_STAGE];

/**
 * 服饰模块摘要信息
 * 从 step1OutfitModules 中提取，用于角色分析的服饰提示词
 */
export interface OutfitModuleSummary {
  /** 衣服外观/名称 */
  subjectName: string;
  /** 衣服外观总结/描述 */
  subjectDescription: string;
  /** 搭配参考（从 step1HiddenRoleSettingPrompt 中提取） */
  matchingReference?: string;
}

/**
 * 阶段1：输入解析结果
 * 包含项目信息、角色信息、热点数据、服饰模块信息
 */
export interface STAGE1_RESULT {
  /** 项目ID */
  projectId: string;
  /** 角色引用信息（核心：包含原始角色描述，来自五视图系统引用池） */
  characterReference: {
    id: string;
    projectId: string;
    userId: string;
    imageUrl: string;
    label?: string;
    /** 角色性别，直接来自 projectContext.character.gender，不靠推断 */
    gender?: "male" | "female" | "uncertain";
    viewKey?: import("../contracts/types.js").CharacterViewKey;
  };
  /** 角色详细描述（来自 step1HiddenRoleSettingPrompt，用于角色分析） */
  characterDescription?: string;
  /** 服饰模块信息（来自 step1OutfitModules） */
  outfitModules?: OutfitModuleSummary[];
  /** 服饰风格列表（从 step1OutfitModules.mainImage.clothingStyle 提取，用于场景匹配约束） */
  clothingStyles?: string[];
  /** 服饰描述（从 projectContext.outfitDescription） */
  outfitDescription?: string;
  /** 搭配描述（从 projectContext.matchingReference） */
  matchingReference?: string;
  /** 角色方向（不含 styleSummary，由 buildCharacterPromptFromProject 统一构建） */
  selectedRoleDirection?: import("../modules/video-step/shared/character-prompt-builder.js").CharacterDirectionInfo | null;
  /** 热点数据 */
  hotspots: import("../contracts/types.js").TrendEntry[];
  /** LLM依赖 */
  llmDeps: {
    requestLlmPlainText: (systemPrompt: string, userPrompt: string, temperature: number) => Promise<string>;
  };
}

/**
 * 性别验证报告
 */
export interface GENDER_VALIDATION_REPORT {
  /** 脚本ID */
  scriptId: string;
  /** 是否通过 */
  passed: boolean;
  /** 期望性别 */
  expectedGender: 'male' | 'female' | 'uncertain';
  /** 发现的男性代词 */
  foundMalePronouns: string[];
  /** 发现的女性代词 */
  foundFemalePronouns: string[];
  /** 违规项 */
  violations: string[];
}

/**
 * 铁律检查报告
 */
export interface IRON_LAWS_VALIDATION_REPORT {
  /** 脚本ID */
  scriptId: string;
  /** 是否通过 */
  passed: boolean;
  /** 各项检查结果 */
  details: {
    noClothingCloseup: boolean;
    consistency: boolean;
    strongHook: boolean;
    properDuration: boolean;
    properShotCount: boolean;
    aestheticCompliance: boolean;
  };
  /** 违规项列表 */
  violations: string[];
}

/**
 * 阶段5：质量检查结果
 * 包含验证后的脚本和各类验证报告
 */
export interface STAGE5_RESULT {
  /** 验证后的脚本 */
  validatedScripts: Array<Record<string, unknown>>;
  /** 性别验证报告 */
  genderValidationReports: GENDER_VALIDATION_REPORT[];
  /** 铁律验证报告 */
  ironLawsValidationReports: IRON_LAWS_VALIDATION_REPORT[];
  /** 总体验证结果 */
  overallPassed: boolean;
}

/**
 * 流水线执行状态
 */
export const PIPELINE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type PipelineStatus = typeof PIPELINE_STATUS[keyof typeof PIPELINE_STATUS];

/**
 * 流水线执行报告
 */
export interface PIPELINE_EXECUTION_REPORT {
  /** 流水线ID */
  pipelineId: string;
  /** 项目ID */
  projectId: string;
  /** 执行状态 */
  status: PipelineStatus;
  /** 各阶段执行时间 */
  stageTimings: {
    stage1: number;
    stage2: number;
    stage3: number;
    stage4: number;
    stage5: number;
    stage6: number;
  };
  /** 错误信息 */
  error?: string;
  /** 创建时间 */
  createdAt: number;
}