/**
 * 分镜专业提示词服务
 * 封装生成、存储、查询逻辑
 */

import type { Pool } from "pg";
import type { AppContext } from "../core/app-context.js";
import type {
  ShotPromptsType,
  ShotPromptsRecord,
  IShotPromptsRepository,
} from "../contracts/shot-prompts-contract.js";
import type {
  GenerateShotPromptsRequest,
  ShotPromptsJson,
} from "../contracts/shot-prompt-engineer-contract.js";
import { createShotPromptsRepository } from "../repositories/pg/shot-prompts-pg-repository.js";
import { ProviderRouteKeys } from "../contracts/provider-route-keys.js";
import { SHOT_PROMPTS_TYPE } from "../contracts/shot-prompts-contract.js";

/**
 * 分镜专业提示词服务接口
 */
export interface IShotPromptsService {
  /**
   * 生成并保存专业提示词
   * @param params 生成参数
   * @param type 类型：origin | fission
   * @param userId 用户 ID
   * @returns 生成的记录
   */
  generateAndSave(
    params: GenerateShotPromptsRequest,
    type: ShotPromptsType,
    userId: string
  ): Promise<ShotPromptsRecord>;

  /**
   * 获取激活版本
   */
  getActive(projectId: string, type: ShotPromptsType): Promise<ShotPromptsRecord | null>;

  /**
   * 获取指定 ID
   */
  getById(id: string): Promise<ShotPromptsRecord | null>;

  /**
   * 获取历史版本
   */
  listHistory(projectId: string, type: ShotPromptsType, limit?: number): Promise<ShotPromptsRecord[]>;

  /**
   * 软删除项目所有记录
   */
  softDeleteByProjectId(projectId: string, userId: string, type?: ShotPromptsType): Promise<number>;
}

/**
 * 分镜专业提示词服务实现
 */
export class ShotPromptsService implements IShotPromptsService {
  private repo: IShotPromptsRepository;
  private ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.repo = createShotPromptsRepository(ctx.pool);
  }

  async generateAndSave(
    params: GenerateShotPromptsRequest,
    type: ShotPromptsType,
    userId: string
  ): Promise<ShotPromptsRecord> {
    // 幂等检查：已有活跃记录则直接返回，避免重复生成
    const existing = await this.repo.getActive({ projectId: params.projectId!, type });
    if (existing) {
      return existing;
    }

    // 1. 动态导入 generateShotPrompts（避免循环依赖）
    const { generateShotPrompts } = await import("../modules/video-step/step3/shot-prompt-engineer-service.js");

    // 2. 调用生成逻辑（传入完整 AppContext，包含 repos 用于 LLM provider 解析）
    // 裂变类型使用独立的 fission_storyboard_prompt 路由键
    const routeKey = type === SHOT_PROMPTS_TYPE.FISSION
      ? ProviderRouteKeys.FISSION_STORYBOARD_PROMPT
      : undefined;
    const result = await generateShotPrompts(this.ctx, params, routeKey);

    if (!result.success || !result.data) {
      throw new Error(result.error || "生成分镜专业提示词失败");
    }

    const shotPromptsJson = result.data;

    // 3. 保存到新表
    const record = await this.repo.create({
      projectId: params.projectId!,
      scriptDataId: params.scriptDataId,
      type,
      shots: shotPromptsJson.shots,
      characterAnchors: shotPromptsJson.character_anchors,
      emotionalArc: shotPromptsJson.emotional_arc,
      consistencyNotes: shotPromptsJson.consistency_notes,
      inputSnapshot: shotPromptsJson.input_snapshot,
      generatedAt: shotPromptsJson.generated_at,
      createdBy: userId,
    });


    return record;
  }

  async getActive(projectId: string, type: ShotPromptsType): Promise<ShotPromptsRecord | null> {
    return this.repo.getActive({ projectId, type });
  }

  async getById(id: string): Promise<ShotPromptsRecord | null> {
    return this.repo.getById(id);
  }

  async listHistory(projectId: string, type: ShotPromptsType, limit?: number): Promise<ShotPromptsRecord[]> {
    return this.repo.listHistory({ projectId, type, limit });
  }

  async softDeleteByProjectId(projectId: string, userId: string, type?: ShotPromptsType): Promise<number> {
    return this.repo.softDeleteByProjectId(projectId, userId, type);
  }
}

// 单例实例
let _instance: IShotPromptsService | null = null;

/**
 * 获取 ShotPromptsService 单例
 */
export function getShotPromptsService(ctx: AppContext): IShotPromptsService {
  if (!_instance) {
    _instance = new ShotPromptsService(ctx);
  }
  return _instance;
}

/**
 * 将 video_prompt 的运动参数混合到提示词中
 * 格式：[服饰保留锚点] Camera: [motion] (detail), Intensity: [level]. [原始prompt]. Avoid: [negative]
 */
export function buildEnhancedVideoPrompt(videoPrompt: {
  prompt?: string;
  camera_motion?: string;
  camera_motion_detail?: string;
  motion_intensity?: string;
  negative_prompt?: string;
}, clothingRetentionAnchors?: string[]): string {
  const basePrompt = videoPrompt.prompt?.trim() || "";
  if (!basePrompt) return basePrompt;

  // 服饰保留锚点：SPE 未生成时从 character_anchors 注入（置于最前面，确保模型最高优先级）
  // 注入全部角色锚点：安全网仅当 SPE 完全遗漏时触发，SPE 已生成的精确锚点不会被覆盖
  let anchorPrefix = "";
  if (clothingRetentionAnchors?.length && !/maintain\s+wearing/i.test(basePrompt)) {
    anchorPrefix = clothingRetentionAnchors.join(" ") + " ";
  }

  // 前缀：镜头运动 + 运动强度
  const parts: string[] = [];
  const motion = videoPrompt.camera_motion?.trim();
  const detail = videoPrompt.camera_motion_detail?.trim();
  const intensity = videoPrompt.motion_intensity?.trim();

  if (motion) {
    let motionDesc = `Camera: ${motion}`;
    if (detail) motionDesc += ` (${detail})`;
    if (intensity) motionDesc += `, Intensity: ${intensity}`;
    parts.push(motionDesc);
  }

  const cameraPrefix = parts.length > 0 ? parts.join(", ") + ". " : "";
  let result = anchorPrefix + cameraPrefix + basePrompt;

  // 后缀：反向提示词（视频 API 不支持独立 negative_prompt）
  // BGM 排除兜底：确保历史数据和新数据都有 BGM 排除
  const BGM_EXCLUSION = "no background music, no BGM, no soundtrack, no musical score, no accompanying music, without background music, without BGM, without soundtrack, without musical score, without accompanying music";
  let negative = videoPrompt.negative_prompt?.trim() || "";
  if (negative && !/background music|BGM|soundtrack/i.test(negative)) {
    negative = `${negative}, ${BGM_EXCLUSION}`;
  } else if (!negative) {
    negative = BGM_EXCLUSION;
  }
  result += `. Avoid: ${negative}`;

  return result;
}