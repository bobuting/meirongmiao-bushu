/**
 * 儿童角色五视图生成 Skill 输入参数 Schema
 *
 * 用于验证和类型推断儿童角色五视图生成的输入参数
 */

import { z } from "zod";

// ========== 混血强度枚举 ==========

/**
 * 混血强度枚举
 * - strong: 明显混血特征（显式混血标记或区域推断）
 * - light: 轻微混血增强（30%概率随机混血）
 */
export const MixedIntensityEnum = z.enum(["strong", "light"]);

// ========== 儿童角色五视图生成输入参数 Schema ==========

/**
 * 儿童角色五视图生成输入参数 Schema
 *
 * 包含基础角色信息、服饰信息、混血特征配置、审美特征库注入等
 */
export const ChildFiveViewGenerationSchema = z.object({
  // ========== 基础角色信息 ==========

  /** 种族（如 Asian, Caucasian, Mixed Asian+Caucasian） */
  ethnicity: z.string().optional().describe("种族（如 Asian, Caucasian, Mixed Asian+Caucasian）"),

  /** 年龄（儿童角色建议 6-12） */
  age: z.union([z.string(), z.number()]).optional().describe("年龄（儿童角色建议 6-12）"),

  /** 性别（girl/boy） */
  gender: z.string().optional().describe("性别（girl/boy）"),

  /** 风格描述 */
  style: z.string().optional().describe("风格描述"),

  /** 体型 */
  bodyType: z.string().optional().describe("体型"),

  // ========== 角色预设（Step1 选择的角色方向） ==========

  /** 角色预设文本（包含 gender, age, styleWords） */
  characterPreset: z.string().optional().describe("角色预设文本（包含 gender, age, styleWords）"),

  // ========== 服饰信息 ==========

  /** 服饰描述文本（上装/下装/鞋子/配饰详情） */
  outfitInfo: z.string().optional().describe("服饰描述文本（上装/下装/鞋子/配饰详情）"),

  /** 已选搭配信息 */
  outfitMatching: z.string().optional().describe("已选搭配信息"),

  // ========== 参考图片 ==========

  /** 角色头像 URL（OSS 链接） */
  characterImageUrl: z.string().url().optional().describe("角色头像 URL（OSS 链接）"),

  /** 服饰平铺图 URL（多个用逗号分隔） */
  outfitImageUrl: z.string().optional().describe("服饰平铺图 URL（多个用逗号分隔）"),

  // ========== 混血特征配置（后端自动解析） ==========

  /** 是否混血（后端自动判断） */
  mixedEthnicity: z.boolean().optional().describe("是否混血（后端自动判断）"),

  /** 主要种族成分 */
  primaryEthnicity: z.string().optional().describe("主要种族成分"),

  /** 次要种族成分 */
  secondaryEthnicity: z.string().optional().describe("次要种族成分"),

  /** 混血强度（strong/light） */
  mixedIntensity: MixedIntensityEnum.optional().describe("混血强度（strong/light）"),

  // ========== 审美特征库注入（动态） ==========

  /** 当前主流审美特征（与成人模板统一字段） */
  aestheticFeatures: z
    .object({
      /** 眼型特征（眼型 + 眼色组合描述） */
      eyeShape: z.string().optional(),
      /** 面部轮廓特征 */
      faceContour: z.string().optional(),
      /** 皮肤质感特征 */
      skinTexture: z.string().optional(),
      /** 整体风格特征 */
      overallStyle: z.string().optional(),
    })
    .optional()
    .describe("当前主流审美特征"),

  /** 年龄段键（NEWBORN/INFANT/TODDLER/KID/TEEN，由后端根据 age 自动计算） */
  ageRange: z.enum(["NEWBORN", "INFANT", "TODDLER", "KID", "TEEN"]).optional().describe("年龄段键"),

  /** 趋势周期（如 2026-q1） */
  trendPeriod: z.string().optional().describe("趋势周期（如 2026-q1）"),

  /** 种族特征描述（只注入匹配的那一条） */
  ethnicityBaseline: z.string().optional().describe("种族特征描述"),

  // ========== 项目信息 ==========

  /** 项目 ID（用于查询服饰平铺图） */
  projectId: z.string().uuid().optional().describe("项目 ID（用于查询服饰平铺图）"),

  /** 角色 ID */
  characterId: z.string().uuid().optional().describe("角色 ID"),
});

// ========== 类型导出 ==========

/**
 * 儿童角色五视图生成输入参数类型
 * 从 Schema 自动推断
 */
export type ChildFiveViewGenerationInput = z.infer<typeof ChildFiveViewGenerationSchema>;
