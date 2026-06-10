import { z } from 'zod';

/**
 * fission_story_generation 输入参数 Schema
 */
export const inputSchema = z.object({
  // ========== 原视频脚本（完整JSON，必需） ==========
  originalScript: z.object({
    video_info: z.object({
      title: z.string().optional(),
      duration_seconds: z.number().optional(),
      source: z.string().optional(),
      time_of_day: z.string().optional(),
      weather: z.string().optional(),
      main_scene: z.string().optional(),
    }).passthrough(),
    video_analysis: z.object({
      title: z.string().optional(),
      theme: z.string().optional(),
      summary: z.string().optional(),
      emotion: z.object({
        primary: z.string().optional(),
        secondary: z.array(z.string()).optional(),
        emotion_arc: z.string().optional(),
      }).optional(),
      atmosphere: z.string().optional(),
    }).passthrough().optional(),
    shot_breakdown: z.array(z.object({
      shot_id: z.number(),
      shot_type: z.string(),
      camera_movement: z.string(),
      shot_description: z.string(),
      subjects: z.array(z.any()),
      visual: z.any(),
      audio: z.any(),
      timecode: z.any().optional(),
      transition_in: z.any().optional(),
      transition_out: z.any().optional(),
    }).passthrough()),
    editing_analysis: z.any().optional(),
  }).passthrough(),

  // ========== 扩写插入位置（必需） ==========
  insertPositions: z.array(z.number()).min(1, "至少需要1个插入位置"),

  // ========== 兼容 ==========
  userPrompt: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;