import { z } from 'zod';

/**
 * 输入参数 Schema
 */
export const inputSchema = z.object({
  ethnicity: z.string().optional(),
  age: z.string().optional(),
  gender: z.string().optional(),
  style: z.string().optional(),
  bodyType: z.string().optional(),
  faceShape: z.string().optional(),
  facialFeatures: z.string().optional(),
  eyebrows: z.string().optional(),
  eyes: z.string().optional(),
  eyeExpression: z.string().optional(),
  nose: z.string().optional(),
  lips: z.string().optional(),
  chin: z.string().optional(),
  skinTone: z.string().optional(),
  hairStyle: z.string().optional(),
  uniqueFeatures: z.string().optional(),
  characterPreset: z.string().optional(),
  outfitInfo: z.string().optional(),
  outfitMatching: z.string().optional(),
  characterImageUrl: z.string().optional(),
  outfitImageUrl: z.string().optional(),
  // 混血特征字段
  mixedEthnicity: z.boolean().optional(),
  primaryEthnicity: z.string().optional(),
  secondaryEthnicity: z.string().optional(),
  mixedIntensity: z.enum(['strong', 'light']).optional(),
  // 种族特征描述
  ethnicityBaseline: z.string().optional(),
  // 审美特征库注入
  aestheticFeatures: z.object({
    eyeShape: z.string().optional(),
    faceContour: z.string().optional(),
    skinTexture: z.string().optional(),
    overallStyle: z.string().optional(),
  }).optional(),
  trendPeriod: z.string().optional(),
});

export type Input = z.infer<typeof inputSchema>;
