import { z } from 'zod';

/**
 * 分镜提示词工程师输入参数 Schema
 *
 * 输入完整脚本数据，系统将自动提取 video_info、video_analysis、shot_breakdown 等信息
 */

// ========== 脚本数据结构定义 ==========

/** 视频基本信息 */
const VideoInfoSchema = z.object({
  title: z.string().optional().describe('脚本标题'),
  duration_seconds: z.number().optional().describe('总时长（秒）'),
  source: z.string().optional().describe('来源说明'),
  time_of_day: z.string().optional().describe('时间段：早晨/上午/中午/下午/傍晚/夜晚/深夜'),
  weather: z.string().optional().describe('天气：晴天/阴天/雨天/雪天/雾天/多云'),
  main_scene: z.string().optional().describe('主场景'),
});

/** 情绪信息 */
const EmotionSchema = z.object({
  primary: z.string().optional().describe('主要情绪'),
  secondary: z.array(z.string()).optional().describe('次要情绪列表'),
  emotion_arc: z.string().optional().describe('情绪变化曲线'),
});

/** 人物详情 */
const PersonDetailSchema = z.object({
  person_id: z.number().optional(),
  description: z.string().optional().describe('角色描述'),
  age: z.number().optional(),
  gender: z.enum(['male', 'female']).optional(),
  screen_time_ratio: z.number().optional(),
  appearance_notes: z.string().optional(),
});

/** 出镜信息 */
const OnScreenPresenceSchema = z.object({
  has_real_person: z.boolean().optional(),
  person_count: z.number().optional(),
  person_details: z.array(PersonDetailSchema).optional(),
  exposure_level: z.string().optional(),
  exposure_description: z.string().optional(),
});

/** 服饰植入信息 */
const FashionPlacementSchema = z.object({
  suitable: z.boolean().optional(),
  reason: z.string().optional(),
  recommended_styles: z.array(z.string()).optional(),
  placement_notes: z.string().optional(),
});

/** 视频分析 */
const VideoAnalysisSchema = z.object({
  title: z.string().optional(),
  theme: z.string().optional().describe('故事核心'),
  summary: z.string().optional().describe('叙事摘要'),
  emotion: EmotionSchema.optional(),
  video_type: z.string().optional().describe('视频类型'),
  video_style: z.string().optional().describe('视觉风格'),
  target_audience: z.string().optional().describe('目标受众'),
  key_elements: z.array(z.string()).optional().describe('关键元素'),
  on_screen_presence: OnScreenPresenceSchema.optional(),
  fashion_placement: FashionPlacementSchema.optional(),
  atmosphere: z.string().optional().describe('氛围场景'),
});

/** 剪辑分析 */
const EditingAnalysisSchema = z.object({
  total_shots: z.number().optional(),
  average_shot_duration: z.number().optional(),
  longest_shot_seconds: z.number().optional(),
  shortest_shot_seconds: z.number().optional(),
  editing_rhythm: z.string().optional(),
  pacing: z.string().optional(),
  cut_style: z.string().optional(),
});

/** 完整脚本数据 */
const ScriptDataSchema = z.object({
  video_info: VideoInfoSchema.optional(),
  video_analysis: VideoAnalysisSchema.optional(),
  shot_breakdown: z.array(z.any()).describe('分镜数组，每个元素包含完整的镜头信息'),
  editing_analysis: EditingAnalysisSchema.optional(),
}).describe('完整的脚本 JSON 数据，包含 video_info、video_analysis、shot_breakdown、editing_analysis');

// ========== 输入参数 Schema ==========

export const inputSchema = z.object({
  // 完整脚本数据（必需）
  scriptData: ScriptDataSchema.describe('完整的脚本 JSON 数据'),

  // 角色参考（脚本数据之外，需单独传入）
  characterReferenceImages: z.array(z.string())
    .optional()
    .describe('角色参考图片 URL 列表（五视图，用于锚定角色造型、外貌、气质）'),

  characterDescription: z.string()
    .optional()
    .describe('角色补充描述（用于补充参考图中无法体现的特征）'),

  // 服饰参考（脚本数据之外，需单独传入）
  garmentReferenceImages: z.array(z.string())
    .optional()
    .describe('服饰参考图片 URL 列表（平铺图，用于锚定服饰细节、材质、款式）'),

  // 覆盖项（可选，用于覆盖脚本中的默认值）
  aspectRatio: z.string()
    .optional()
    .default('9:16')
    .describe('画面比例，如 9:16、16:9、1:1，默认 9:16'),
});

export type Input = z.infer<typeof inputSchema>;
