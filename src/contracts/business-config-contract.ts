/**
 * 业务配置模块契约
 * 定义业务模块标识、各模块配置类型及默认值
 */

/** 评分闭环配置：控制评分结果是否回注到库存筛选和脚本生成 */
export interface ScoringLoopConfig {
  /** 闭环总开关：启用后评分结果参与库存筛选、弱项反馈注入、低分淘汰 */
  enabled: boolean;
  /** 库存筛选最低分：低于此分数的脚本不进入 library 推荐池 */
  minScoreForLibrary: number;
  /** 低分淘汰阈值：低于此分数标记为 deprecated */
  deprecationThreshold: number;
  /** 弱项反馈注入开关：将 commonWeaknesses 注入脚本生成 Skill */
  weaknessFeedbackEnabled: boolean;
}

/** 业务模块标识 */
export type BusinessModule =
  | "global_task"
  | "step1_outfit"
  | "step2_character"
  | "step3_image"
  | "step3_script"
  | "step4_video"
  | "step5_publish"
  | "step6_fission"
  | "scoring_loop";

/** 全局任务调度配置 */
export interface GlobalTaskConfig {
  /** 全局最大并发执行任务数（所有用户所有类型，仅计算 running） */
  maxGlobalConcurrent: number;
  /** 单用户最大并发执行任务数（所有类型合计，仅计算 running） */
  maxPerUserConcurrent: number;
  /** 全局排队最大长度（pending 任务数上限，超限直接拒绝） */
  maxQueueSize: number;
  /** 单用户最大排队任务数（pending 状态，超限直接拒绝） */
  maxPerUserQueued: number;
  /** 队列超时时间（分钟）- pending 任务超过此时间自动失败 */
  queueTimeoutMinutes: number;
}

/** Step1 穿搭配置 */
export interface Step1OutfitConfig {
  /** 穿搭推荐重试次数 */
  outfitRecommendRetryCount: number;
}

/** Step2 角色定妆配置 */
export interface Step2CharacterConfig {
  /** 五视图重新生成次数 */
  fiveViewRegenCount: number;
}

/** Step3 图片配置 */
export interface Step3ImageConfig {
  /** 图片重新生成次数限制 */
  imageRegenLimit: number;
  /** 脚本刷新推荐次数 */
  scriptRefreshRecommendCount: number;
}

/** Step3 脚本生成配置 */
export interface Step3ScriptConfig {
  /** 同项目最大并发策略数（同时执行 LLM 的策略数量） */
  strategyConcurrency: number;
}

/** Step4 视频生成配置 */
export interface Step4VideoConfig {
  /** 每个分镜场景生成的视频变体数量 */
  batchGenerateCount: number;
  /** 单视频生成失败重试次数 */
  retryCount: number;
}

/** Step5 发布配置 */
export interface Step5PublishConfig {
  /** 发布超时时间（毫秒） */
  publishTimeoutMs: number;
}

/** Step6 裂变配置 */
export interface Step6FissionConfig {
  /** 裂变单图重试次数 */
  fissionImageRetryCount: number;
  /** 裂变单视频重试次数 */
  fissionVideoRetryCount: number;
  /** 全局任务重试次数 */
  globalTaskRetryCount: number;
}

/** 各模块配置类型的联合映射 */
export type BusinessConfigMap = {
  global_task: GlobalTaskConfig;
  step1_outfit: Step1OutfitConfig;
  step2_character: Step2CharacterConfig;
  step3_image: Step3ImageConfig;
  step3_script: Step3ScriptConfig;
  step4_video: Step4VideoConfig;
  step5_publish: Step5PublishConfig;
  step6_fission: Step6FissionConfig;
  scoring_loop: ScoringLoopConfig;
};

/** 模块说明映射 */
export const BUSINESS_MODULE_DESCRIPTIONS: Record<BusinessModule, string> = {
  global_task: "全局任务调度",
  step1_outfit: "Step1 穿搭配置",
  step2_character: "Step2 角色定妆配置",
  step3_image: "Step3 图片配置",
  step3_script: "Step3 脚本生成配置",
  step4_video: "Step4 视频生成配置",
  step5_publish: "Step5 发布配置",
  step6_fission: "Step6 裂变配置",
  scoring_loop: "评分闭环配置",
};

/** 全局任务调度配置默认值 */
export const DEFAULT_GLOBAL_TASK_CONFIG: GlobalTaskConfig = {
  maxGlobalConcurrent: 10,
  maxPerUserConcurrent: 3,
  maxQueueSize: 100,
  maxPerUserQueued: 5,
  queueTimeoutMinutes: 60,
};

/** Step1 穿搭配置默认值 */
export const DEFAULT_STEP1_OUTFIT_CONFIG: Step1OutfitConfig = {
  outfitRecommendRetryCount: 5,
};

/** Step2 角色定妆配置默认值 */
export const DEFAULT_STEP2_CHARACTER_CONFIG: Step2CharacterConfig = {
  fiveViewRegenCount: 5,
};

/** Step3 图片配置默认值 */
export const DEFAULT_STEP3_IMAGE_CONFIG: Step3ImageConfig = {
  imageRegenLimit: 5,
  scriptRefreshRecommendCount: 5,
};

/** Step3 脚本生成配置默认值 */
export const DEFAULT_STEP3_SCRIPT_CONFIG: Step3ScriptConfig = {
  strategyConcurrency: 2,
};

/** Step4 视频配置默认值 */
export const DEFAULT_STEP4_VIDEO_CONFIG: Step4VideoConfig = {
  batchGenerateCount: 3,
  retryCount: 2,
};

/** Step5 发布配置默认值 */
export const DEFAULT_STEP5_PUBLISH_CONFIG: Step5PublishConfig = {
  publishTimeoutMs: 60000,
};

/** Step6 裂变配置默认值 */
export const DEFAULT_STEP6_FISSION_CONFIG: Step6FissionConfig = {
  fissionImageRetryCount: 3,
  fissionVideoRetryCount: 3,
  globalTaskRetryCount: 2,
};

/** 评分闭环配置默认值（默认关闭，需要管理后台手动开启） */
export const DEFAULT_SCORING_LOOP_CONFIG: ScoringLoopConfig = {
  enabled: false,
  minScoreForLibrary: 50,
  deprecationThreshold: 40,
  weaknessFeedbackEnabled: true,
};

/** 获取模块默认配置 */
export function getDefaultConfigForModule(module: BusinessModule): BusinessConfigMap[BusinessModule] {
  switch (module) {
    case "global_task":
      return DEFAULT_GLOBAL_TASK_CONFIG;
    case "step1_outfit":
      return DEFAULT_STEP1_OUTFIT_CONFIG;
    case "step2_character":
      return DEFAULT_STEP2_CHARACTER_CONFIG;
    case "step3_image":
      return DEFAULT_STEP3_IMAGE_CONFIG;
    case "step3_script":
      return DEFAULT_STEP3_SCRIPT_CONFIG;
    case "step4_video":
      return DEFAULT_STEP4_VIDEO_CONFIG;
    case "step5_publish":
      return DEFAULT_STEP5_PUBLISH_CONFIG;
    case "step6_fission":
      return DEFAULT_STEP6_FISSION_CONFIG;
    case "scoring_loop":
      return DEFAULT_SCORING_LOOP_CONFIG;
  }
}
