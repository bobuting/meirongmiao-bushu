/**
 * 任务队列配置
 * 定义各任务类型的显示标签和阶段进度
 */

import { STRATEGY_TYPE_LABELS } from "../../utils/strategyTypeLabels";

/** 任务状态枚举 */
export enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  EXPIRED = "expired",
}

/** 全局任务类型枚举 — 覆盖所有后端 executor 注册的 job type */
export enum GlobalTaskType {
  // 反推
  LLM_REVERSE = "llm_reverse",
  // Step2 角色定妆（视频项目）
  STEP2_BATCH_FIVE_VIEW = "step2_batch_five_view",
  STEP2_FIVE_VIEW = "step2_five_view",
  // Step2 角色定妆（图片项目）
  IMAGE_STEP2_BATCH_FIVE_VIEW = "image_step2_batch_five_view",
  IMAGE_STEP2_FIVE_VIEW = "image_step2_five_view",
  // Step3 脚本+分镜
  STEP3_SCRIPTS_GENERATION = "step3_scripts_generation",
  STEP3_LIBRARY = "step3_library",
  STEP3_VIDEO = "step3_video",
  STEP3_REALTIME = "step3_realtime",
  STEP3_EFFECTIVENESS = "step3_effectiveness",
  STEP3_CUSTOM = "step3_custom",
  STEP3_FASHION = "step3_fashion",
  STEP3_EMOTION_ARCHETYPE = "step3_emotion_archetype",
  STEP3_AESTHETIC = "step3_aesthetic",
  STEP3_PRODUCT_SHOWCASE = "step3_product_showcase",
  STEP3_STORY_THEME = "step3_story_theme",
  STEP3_RESONANCE = "step3_resonance",
  STEP3_REVERSE_REWRITE = "step3_reverse_rewrite",
  STEP3_BATCH_PREVIEW = "step3_batch_preview",
  STEP3_SHOT_PROMPT = "step3_shot_prompt",
  STEP3_FRAME_PREVIEW = "step3_frame_preview",
  // Step4 视频生成
  STEP4_CLIP_SUBMIT = "step4_clip_submit",
  STEP4_CLIP_QUERY = "step4_clip_query",
  STEP4_VIDEO = "step4_video",
  // 图片项目 Step3 模特图
  IMAGE_STEP3_MODEL_PHOTO = "image_step3_model_photo",
  IMAGE_STEP3_MODEL_PLAN = "image_step3_model_plan",
  IMAGE_STEP3_SINGLE_PHOTO = "image_step3_single_photo",
  IMAGE_STEP3_MULTI_PERSON = "image_step3_multi_person",
  IMAGE_STEP3_MULTI_PERSON_PLAN = "image_step3_multi_person_plan",
  // 图片项目 Step4 电商详情页
  IMAGE_STEP4_LONG_IMAGE_SUBMIT = "image_step4_long_image_submit",
  IMAGE_STEP4_LONG_IMAGE_QUERY = "image_step4_long_image_query",
  // 换装项目
  OUTFIT_CHANGE = "outfit_change",
  OUTFIT_CHANGE_UNDERSTAND = "outfit_change_understand",
  OUTFIT_CHANGE_ADAPT_VIDEO_EDIT = "outfit_change_adapt_video_edit",
  OUTFIT_CHANGE_GEN_VIDEO_EDIT = "outfit_change_gen_video_edit",
  OUTFIT_CHANGE_GEN_VIDEO_EDIT_QUERY = "outfit_change_gen_video_edit_query",
  // Step6 裂变
  STEP6_FISSION = "step6_fission",
  STEP6_FISSION_NEW_STORY = "step6_fission_new_story",
  STEP6_FISSION_SHOT_PROMPTS = "step6_fission_shot_prompts",
  STEP6_FISSION_ITEM_IMAGE = "step6_fission_item_image",
  STEP6_FISSION_ITEM_VIDEO_SUBMIT = "step6_fission_item_video_submit",
  STEP6_FISSION_ITEM_VIDEO_QUERY = "step6_fission_item_video_query",
  STEP6_FISSION_COMBINATION = "step6_fission_combination",
}

/** 用户任务类型显示标签（用户可见） */
export const TASK_TYPE_LABELS: Record<GlobalTaskType, string> = {
  // 反推
  [GlobalTaskType.LLM_REVERSE]: "LLM 反推",
  // Step2 角色定妆（视频项目）
  [GlobalTaskType.STEP2_BATCH_FIVE_VIEW]: "批量五视图",
  [GlobalTaskType.STEP2_FIVE_VIEW]: "五视图生成",
  // Step2 角色定妆（图片项目）
  [GlobalTaskType.IMAGE_STEP2_BATCH_FIVE_VIEW]: "批量五视图",
  [GlobalTaskType.IMAGE_STEP2_FIVE_VIEW]: "五视图生成",
  // Step3 脚本+分镜
  [GlobalTaskType.STEP3_SCRIPTS_GENERATION]: "脚本批量生成",
  [GlobalTaskType.STEP3_LIBRARY]: STRATEGY_TYPE_LABELS.library,
  [GlobalTaskType.STEP3_VIDEO]: STRATEGY_TYPE_LABELS.video,
  [GlobalTaskType.STEP3_REALTIME]: STRATEGY_TYPE_LABELS.realtime,
  [GlobalTaskType.STEP3_EFFECTIVENESS]: STRATEGY_TYPE_LABELS.effectiveness,
  [GlobalTaskType.STEP3_CUSTOM]: STRATEGY_TYPE_LABELS.custom,
  [GlobalTaskType.STEP3_FASHION]: STRATEGY_TYPE_LABELS.fashion,
  [GlobalTaskType.STEP3_EMOTION_ARCHETYPE]: STRATEGY_TYPE_LABELS.emotion_archetype,
  [GlobalTaskType.STEP3_AESTHETIC]: STRATEGY_TYPE_LABELS.aesthetic,
  [GlobalTaskType.STEP3_PRODUCT_SHOWCASE]: STRATEGY_TYPE_LABELS.product_showcase,
  [GlobalTaskType.STEP3_STORY_THEME]: STRATEGY_TYPE_LABELS.story_theme,
  [GlobalTaskType.STEP3_RESONANCE]: STRATEGY_TYPE_LABELS.resonance,
  [GlobalTaskType.STEP3_REVERSE_REWRITE]: "反推脚本改写",
  [GlobalTaskType.STEP3_BATCH_PREVIEW]: "分镜预览生成",
  [GlobalTaskType.STEP3_SHOT_PROMPT]: "专业提示词生成",
  [GlobalTaskType.STEP3_FRAME_PREVIEW]: "帧预览",
  // Step4 视频生成
  [GlobalTaskType.STEP4_CLIP_SUBMIT]: "视频片段提交",
  [GlobalTaskType.STEP4_CLIP_QUERY]: "视频片段查询",
  [GlobalTaskType.STEP4_VIDEO]: "视频生成",
  // 图片项目 Step3 模特图
  [GlobalTaskType.IMAGE_STEP3_MODEL_PHOTO]: "主图生成",
  [GlobalTaskType.IMAGE_STEP3_MODEL_PLAN]: "主图规划",
  [GlobalTaskType.IMAGE_STEP3_SINGLE_PHOTO]: "单张模特图",
  [GlobalTaskType.IMAGE_STEP3_MULTI_PERSON]: "多人模特图生成",
  [GlobalTaskType.IMAGE_STEP3_MULTI_PERSON_PLAN]: "多人模特图规划",
  // 图片项目 Step4 电商详情页
  [GlobalTaskType.IMAGE_STEP4_LONG_IMAGE_SUBMIT]: "长图生成",
  [GlobalTaskType.IMAGE_STEP4_LONG_IMAGE_QUERY]: "长图状态查询",
  // 换装项目
  [GlobalTaskType.OUTFIT_CHANGE]: "AI 换装",
  [GlobalTaskType.OUTFIT_CHANGE_UNDERSTAND]: "换装理解",
  [GlobalTaskType.OUTFIT_CHANGE_ADAPT_VIDEO_EDIT]: "换装切片适配",
  [GlobalTaskType.OUTFIT_CHANGE_GEN_VIDEO_EDIT]: "换装视频编辑",
  [GlobalTaskType.OUTFIT_CHANGE_GEN_VIDEO_EDIT_QUERY]: "换装视频编辑查询",
  // Step6 裂变
  [GlobalTaskType.STEP6_FISSION]: "裂变任务",
  [GlobalTaskType.STEP6_FISSION_NEW_STORY]: "裂变新故事",
  [GlobalTaskType.STEP6_FISSION_SHOT_PROMPTS]: "裂变提示词生成",
  [GlobalTaskType.STEP6_FISSION_ITEM_IMAGE]: "裂变图片",
  [GlobalTaskType.STEP6_FISSION_ITEM_VIDEO_SUBMIT]: "裂变视频提交",
  [GlobalTaskType.STEP6_FISSION_ITEM_VIDEO_QUERY]: "裂变视频查询",
  [GlobalTaskType.STEP6_FISSION_COMBINATION]: "裂变组合方案",
};

/** 系统任务类型（用户不可见，内部轮询/查询用） */
export const SYSTEM_TASK_TYPES: Partial<Record<GlobalTaskType, string>> = {
  [GlobalTaskType.OUTFIT_CHANGE_UNDERSTAND]: "换装理解（系统）",
  [GlobalTaskType.OUTFIT_CHANGE_GEN_VIDEO_EDIT_QUERY]: "换装视频编辑查询",
  [GlobalTaskType.STEP4_CLIP_QUERY]: "视频片段查询",
  [GlobalTaskType.STEP6_FISSION_ITEM_VIDEO_QUERY]: "裂变视频查询",
  [GlobalTaskType.IMAGE_STEP4_LONG_IMAGE_QUERY]: "长图状态查询",
};

/** 系统任务的 job type 集合，用于面板过滤 */
export const SYSTEM_TASK_TYPE_SET = new Set<string>([
  GlobalTaskType.OUTFIT_CHANGE_UNDERSTAND,
  GlobalTaskType.OUTFIT_CHANGE_GEN_VIDEO_EDIT_QUERY,
  GlobalTaskType.STEP4_CLIP_QUERY,
  GlobalTaskType.STEP6_FISSION_ITEM_VIDEO_QUERY,
  GlobalTaskType.IMAGE_STEP4_LONG_IMAGE_QUERY,
]);

/** 每种任务类型的阶段配置（标签 + 进度百分比） */
export const TASK_STAGE_CONFIG: Record<GlobalTaskType, {
  labels: Record<string, string>;
  progress: Record<string, number>;
}> = {
  [GlobalTaskType.LLM_REVERSE]: {
    labels: {
      "解析中": "解析链接",
      "下载中": "下载视频",
      "上传中": "上传云端",
      "分析中": "LLM 分析",
      "持久化中": "保存脚本",
    },
    progress: {
      "解析中": 10, "下载中": 25, "上传中": 50, "分析中": 65, "持久化中": 90,
    },
  },
  [GlobalTaskType.STEP2_BATCH_FIVE_VIEW]: {
    labels: {
      "排队中": "排队等待",
      "生成中": "批量生成中",
      "等待子任务完成": "等待生成完成",
    },
    progress: {
      "排队中": 5,
      "生成中": 50,
      "等待子任务完成": 80,
    },
  },
  [GlobalTaskType.STEP2_FIVE_VIEW]: {
    labels: {
      "排队中": "排队等待",
      "生成中": "生成五视图",
      "上传中": "上传图片",
    },
    progress: {
      "排队中": 5,
      "生成中": 50,
      "上传中": 85,
    },
  },
  [GlobalTaskType.IMAGE_STEP2_BATCH_FIVE_VIEW]: {
    labels: {
      "排队中": "排队等待",
      "生成中": "批量生成中",
      "等待子任务完成": "等待生成完成",
    },
    progress: {
      "排队中": 5,
      "生成中": 50,
      "等待子任务完成": 80,
    },
  },
  [GlobalTaskType.IMAGE_STEP2_FIVE_VIEW]: {
    labels: {
      "排队中": "排队等待",
      "生成中": "生成五视图",
      "上传中": "上传图片",
    },
    progress: {
      "排队中": 5,
      "生成中": 50,
      "上传中": 85,
    },
  },
  [GlobalTaskType.STEP3_SCRIPTS_GENERATION]: {
    labels: {
      "排队中": "排队等待",
      "创建子任务": "创建子任务",
      "生成中": "生成脚本",
    },
    progress: {
      "排队中": 5,
      "创建子任务": 10,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP3_LIBRARY]: {
    labels: {
      "排队中": "排队等待",
      "查询脚本库": "查询脚本库",
      "生成中": "生成脚本库",
    },
    progress: {
      "排队中": 5,
      "查询脚本库": 15,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP3_VIDEO]: {
    labels: {
      "排队中": "排队等待",
      "查询视频脚本": "查询视频脚本",
      "生成中": "生成视频脚本",
    },
    progress: {
      "排队中": 5,
      "查询视频脚本": 15,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP3_REALTIME]: {
    labels: {
      "排队中": "排队等待",
      "解析输入": "解析输入",
      "热点分析": "热点分析",
      "生成脚本": "生成脚本",
      "质量检查": "质量检查",
      "生成中": "生成热点脚本",
    },
    progress: {
      "排队中": 5,
      "解析输入": 10,
      "热点分析": 30,
      "生成脚本": 60,
      "质量检查": 85,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP3_EFFECTIVENESS]: {
    labels: {
      "排队中": "排队等待",
      "准备素材": "准备素材",
      "生成脚本": "生成脚本",
      "优化增强": "优化增强",
      "生成中": "生成效果脚本",
    },
    progress: {
      "排队中": 5,
      "准备素材": 15,
      "生成脚本": 50,
      "优化增强": 80,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP3_CUSTOM]: {
    labels: {
      "排队中": "排队等待",
      "生成概念": "生成概念",
      "扩展脚本": "扩展脚本",
      "生成中": "生成自定义脚本",
    },
    progress: {
      "排队中": 5,
      "生成概念": 20,
      "扩展脚本": 60,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP3_FASHION]: {
    labels: {
      "排队中": "排队等待",
      "生成时尚概念": "生成视觉概念",
      "扩展脚本": "扩写时尚脚本",
      "生成中": `生成${STRATEGY_TYPE_LABELS.fashion}`,
    },
    progress: {
      "排队中": 5,
      "生成时尚概念": 20,
      "扩展脚本": 60,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP3_EMOTION_ARCHETYPE]: {
    labels: {
      "排队中": "排队等待",
      "选择情感原型": `选择${STRATEGY_TYPE_LABELS.emotion_archetype}`,
      "生成大纲": "生成故事大纲",
      "生成分镜": "生成详细分镜",
      "生成中": `生成${STRATEGY_TYPE_LABELS.emotion_archetype}`,
    },
    progress: {
      "排队中": 5,
      "选择情感原型": 10,
      "生成大纲": 35,
      "生成分镜": 70,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP3_AESTHETIC]: {
    labels: {
      "排队中": "排队等待",
      "准备素材": "准备素材",
      "生成脚本": "生成脚本",
      "优化氛围": "优化氛围",
      "生成中": `生成${STRATEGY_TYPE_LABELS.aesthetic}`,
    },
    progress: {
      "排队中": 5,
      "准备素材": 15,
      "生成脚本": 50,
      "优化氛围": 80,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP3_PRODUCT_SHOWCASE]: {
    labels: {
      "排队中": "排队等待",
      "生成展示概念": "生成展示概念",
      "扩展脚本": "扩写展示脚本",
      "生成中": `生成${STRATEGY_TYPE_LABELS.product_showcase}`,
    },
    progress: {
      "排队中": 5,
      "生成展示概念": 20,
      "扩展脚本": 60,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP3_STORY_THEME]: {
    labels: {
      "排队中": "排队等待",
      "选择情感原型": `选择${STRATEGY_TYPE_LABELS.story_theme}`,
      "生成大纲": "生成故事大纲",
      "生成分镜": "生成详细分镜",
      "生成中": `生成${STRATEGY_TYPE_LABELS.story_theme}`,
    },
    progress: {
      "排队中": 5,
      "选择情感原型": 10,
      "生成大纲": 35,
      "生成分镜": 70,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP3_RESONANCE]: {
    labels: {
      "排队中": "排队等待",
      "构思故事概念": `构思${STRATEGY_TYPE_LABELS.resonance}概念`,
      "生成中": `生成${STRATEGY_TYPE_LABELS.resonance}`,
    },
    progress: {
      "排队中": 5,
      "构思故事概念": 20,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP3_REVERSE_REWRITE]: {
    labels: {
      "解析脚本": "解析脚本",
      "LLM 改写": "LLM 改写",
      "保存脚本": "保存脚本",
    },
    progress: {
      "解析脚本": 20,
      "LLM 改写": 50,
      "保存脚本": 85,
    },
  },
  [GlobalTaskType.STEP3_BATCH_PREVIEW]: {
    labels: {
      "排队中": "创建帧任务",
      "生成提示词中": "生成专业提示词",
      "生成中": "生成分镜预览",
      "stopping": "正在停止",
    },
    progress: {
      "排队中": 10,
      "生成提示词中": 20,
      "生成中": 60,
      "stopping": 80,
    },
  },
  [GlobalTaskType.STEP3_SHOT_PROMPT]: {
    labels: {
      "排队中": "排队等待",
      "生成中": "生成提示词",
    },
    progress: {
      "排队中": 10,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP3_FRAME_PREVIEW]: {
    labels: {
      "排队中": "排队等待",
      "生成中": "生成帧预览",
      "完成中": "正在完成",
    },
    progress: {
      "排队中": 10,
      "生成中": 50,
      "完成中": 90,
    },
  },
  [GlobalTaskType.STEP4_CLIP_SUBMIT]: {
    labels: {
      "排队中": "排队等待",
      "提交中": "提交视频任务",
      "生成中": "生成视频中",
    },
    progress: {
      "排队中": 5,
      "提交中": 20,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP4_VIDEO]: {
    labels: {
      "排队中": "排队等待",
      "生成中": "生成视频中",
    },
    progress: {
      "排队中": 5,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP4_CLIP_QUERY]: {
    labels: {
      "排队中": "排队等待",
      "查询中": "查询视频状态",
    },
    progress: {
      "排队中": 5,
      "查询中": 50,
    },
  },
  [GlobalTaskType.IMAGE_STEP3_MODEL_PHOTO]: {
    labels: {
      "创建规划任务": "创建规划任务",
      "等待子任务完成": "等待子任务完成",
    },
    progress: {
      "创建规划任务": 10,
      "等待子任务完成": 30,
    },
  },
  [GlobalTaskType.IMAGE_STEP3_MODEL_PLAN]: {
    labels: {
      "排队中": "排队等待",
      "规划中": "AI 规划方案",
      "创建照片占位": "创建照片占位",
      "创建生成任务": "创建生成任务",
    },
    progress: {
      "排队中": 5,
      "规划中": 30,
      "创建照片占位": 60,
      "创建生成任务": 85,
    },
  },
  [GlobalTaskType.IMAGE_STEP3_SINGLE_PHOTO]: {
    labels: {
      "生成中": "生成模特图中",
    },
    progress: {
      "生成中": 50,
    },
  },
  [GlobalTaskType.IMAGE_STEP3_MULTI_PERSON]: {
    labels: {
      "创建多人规划任务": "创建规划任务",
      "等待多人规划完成": "AI 规划多人方案",
      "等待子任务完成": "等待生成完成",
    },
    progress: {
      "创建多人规划任务": 10,
      "等待多人规划完成": 30,
      "等待子任务完成": 85,
    },
  },
  [GlobalTaskType.IMAGE_STEP3_MULTI_PERSON_PLAN]: {
    labels: {
      "排队中": "排队等待",
      "多人规划中": "AI 规划多人站位",
      "创建多人照片占位": "创建照片占位",
      "创建多人生成任务": "创建生成任务",
    },
    progress: {
      "排队中": 5,
      "多人规划中": 30,
      "创建多人照片占位": 60,
      "创建多人生成任务": 85,
    },
  },
  [GlobalTaskType.IMAGE_STEP3_MULTI_PERSON_PLAN]: {
    labels: {
      "排队中": "排队等待",
      "生成中": "AI 生成长图",
    },
    progress: {
      "排队中": 5,
      "生成中": 50,
    },
  },
  [GlobalTaskType.IMAGE_STEP4_LONG_IMAGE_QUERY]: {
    labels: {
      "查询中": "查询长图状态",
    },
    progress: {
      "查询中": 50,
    },
  },
  [GlobalTaskType.OUTFIT_CHANGE]: {
    labels: {
      "capturing": "采集参考图",
      "understanding": "视频理解",
      "adapting": "角色服装适配",
      "generating": "生成换装视频",
    },
    progress: {
      "capturing": 15,
      "understanding": 35,
      "adapting": 60,
      "generating": 85,
    },
  },
  [GlobalTaskType.OUTFIT_CHANGE_UNDERSTAND]: {
    labels: {
      "排队中": "排队等待",
      "capturing": "采集参考图",
      "understanding": "理解视频内容",
    },
    progress: {
      "排队中": 5,
      "capturing": 30,
      "understanding": 70,
    },
  },
  [GlobalTaskType.OUTFIT_CHANGE_ADAPT_VIDEO_EDIT]: {
    labels: {
      "排队中": "排队等待",
      "splitting": "切片处理",
      "adapting": "参考图生成",
    },
    progress: {
      "排队中": 5,
      "splitting": 30,
      "adapting": 70,
    },
  },
  [GlobalTaskType.OUTFIT_CHANGE_GEN_VIDEO_EDIT]: {
    labels: {
      "排队中": "排队等待",
      "生成中": "生成换装视频",
    },
    progress: {
      "排队中": 5,
      "生成中": 50,
    },
  },
  [GlobalTaskType.OUTFIT_CHANGE_GEN_VIDEO_EDIT_QUERY]: {
    labels: {
      "排队中": "排队等待",
      "查询中": "查询换装视频状态",
    },
    progress: {
      "排队中": 5,
      "查询中": 50,
    },
  },
  [GlobalTaskType.STEP6_FISSION]: {
    labels: {
      "排队中": "排队等待",
      "等待子任务完成": "等待裂变任务完成",
    },
    progress: {
      "排队中": 5,
      "等待子任务完成": 50,
    },
  },
  [GlobalTaskType.STEP6_FISSION_NEW_STORY]: {
    labels: {
      "排队中": "排队等待",
      "生成中": "生成新故事脚本",
    },
    progress: {
      "排队中": 5,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP6_FISSION_SHOT_PROMPTS]: {
    labels: {
      "排队中": "排队等待",
      "生成提示词": "生成分镜提示词",
      "创建子任务": "创建图片/视频任务",
    },
    progress: {
      "排队中": 5,
      "生成提示词": 30,
      "创建子任务": 70,
    },
  },
  [GlobalTaskType.STEP6_FISSION_ITEM_IMAGE]: {
    labels: {
      "排队中": "排队等待",
      "生成中": "生成图片",
      "上传中": "上传图片",
    },
    progress: {
      "排队中": 5,
      "生成中": 50,
      "上传中": 85,
    },
  },
  [GlobalTaskType.STEP6_FISSION_ITEM_VIDEO_SUBMIT]: {
    labels: {
      "排队中": "排队等待",
      "提交中": "提交视频任务",
      "生成中": "生成视频中",
    },
    progress: {
      "排队中": 5,
      "提交中": 20,
      "生成中": 50,
    },
  },
  [GlobalTaskType.STEP6_FISSION_ITEM_VIDEO_QUERY]: {
    labels: {
      "排队中": "排队等待",
      "查询中": "查询裂变视频状态",
    },
    progress: {
      "排队中": 5,
      "查询中": 50,
    },
  },
  [GlobalTaskType.STEP6_FISSION_COMBINATION]: {
    labels: {
      "排队中": "等待分镜完成",
      "生成中": "生成组合方案",
    },
    progress: {
      "排队中": 5,
      "生成中": 50,
    },
  },
};