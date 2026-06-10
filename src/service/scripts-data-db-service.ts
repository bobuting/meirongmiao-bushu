/**
 * 视频脚本数据数据库服务
 * 从数据库 nrm_script_data 表查询数据
 * DDL 采用传统列式存储 + JSONB 辅助列
 *
 * 注意：DDL 中没有 payload_json 列，查询/写入使用 DDL 定义的传统列
 * 注意：shot_breakdown 已迁移到独立表 nrm_shot_breakdown
 * 注意：已迁移到通过 repos 访问数据库，不再直接使用 pool.query
 */

import type { ShotPromptsJson } from "../contracts/shot-prompt-engineer-contract.js";
import type { ShotBreakdownItem, EditingAnalysis } from "../contracts/shot-breakdown-contract.js";
import { getLogger } from "../core/logger/index.js";
import type { PgRepositoryCollection } from "../repositories/pg/index.js";

const log = getLogger("scripts-data-db-service");

/**
 * Skill code 到 source 字段的映射
 * 用于在持久化时根据 Skill 来源推断 source 类型
 */
export const SKILL_CODE_TO_SOURCE: Record<string, string> = {
  video_step3_script_generation: "video_step3",
  fashion_script_generation: "fashion_script",
  custom_scenario_script_generation: "custom_scenario_script",
  script_effectiveness_generation: "effectiveness_script",
  fission_story_generation: "fission",
  emotion_archetype: "emotion_archetype",
  video_storyboard_analysis: "video_storyboard_analysis",
  // 兼容旧数据
  hot_trend_video: "hot_trend_video",
};

/**
 * 根据 skillCode 推断 source 字段
 * @param skillCode Skill 代码
 * @returns source 字段值，如果未找到映射则返回 null
 */
export function inferSourceFromSkillCode(skillCode: string | undefined): string | null {
  if (!skillCode) return null;
  return SKILL_CODE_TO_SOURCE[skillCode] ?? null;
}

/**
 * 视频脚本 payload 结构
 * 参考: .claude/doc/skills-doc/hot-script/video-script/video-script-input.md
 */
export interface VideoScriptPayload {
  video_info?: {
    title?: string;
    /** 备选标题数组，3个最优标题，用于 Step5 交付发布展示 */
    title_candidates?: string[];
    duration_seconds?: number;
    source?: string;
    time_of_day?: string;
    weather?: string;
    main_scene?: string;
    analysis_date?: string;
  };
  video_analysis: {
    title?: string;
    theme?: string;
    summary?: string;
    emotion?: {
      primary?: string;
      secondary?: string[];
      emotion_arc?: string;
    };
    video_type?: string;
    video_style?: string;
    target_audience?: string;
    key_elements?: string[];
    on_screen_presence?: {
      has_real_person?: boolean;
      person_count?: number;
      person_details?: Array<{
        person_id: number;
        description?: string;
        age?: number;
        gender?: string;
        screen_time_ratio?: number;
        appearance_notes?: string;
      }>;
      exposure_level?: string;
      exposure_description?: string;
    };
    fashion_placement?: {
      suitable?: boolean;
      reason?: string;
      recommended_styles?: Array<{
        style: string;
        fit_score?: number;
        reason?: string;
        recommended_items?: string[];
      }>;
      placement_notes?: string;
    };
    atmosphere?: string;
  };
  /** 镜头分镜数据（已迁移到独立表 nrm_shot_breakdown，插入时仍使用此字段） */
  shot_breakdown?: ShotBreakdownItem[];
  editing_analysis?: EditingAnalysis;
  /** 主场景（从 shot_breakdown 或 LLM 输出提取） */
  main_scene?: string;
  /** 氛围描述（从 shot_breakdown 或 LLM 输出提取） */
  atmosphere?: string;
}

/**
 * 查询结果 - 直接暴露 DDL 列
 */
export interface VideoScriptDataRecord {
  id: string;
  type: number;
  updatedAt: number;
  /** video_info.title */
  title: string | null;
  /** video_info.title_candidates 备选标题数组 */
  titleCandidates: string[] | null;
  /** video_info.duration_seconds */
  durationSeconds: number | null;
  /** video_info.source */
  source: string | null;
  /** video_info.time_of_day */
  timeOfDay: string | null;
  /** video_info.weather */
  weather: string | null;
  /** video_analysis.theme */
  theme: string | null;
  /** video_analysis.summary */
  summary: string | null;
  /** video_analysis.emotion.primary */
  primaryEmotion: string | null;
  /** video_analysis.video_type */
  videoType: string | null;
  /** video_analysis.video_style */
  videoStyle: string | null;
  /** video_analysis.target_audience */
  targetAudience: string | null;
  /** video_analysis.fashion_placement.suitable */
  fashionSuitable: boolean | null;
  /** video_analysis.fashion_placement.reason */
  fashionReason: string | null;
  /** video_analysis.emotion (完整 JSONB) */
  emotionDetail: Record<string, unknown> | null;
  /** video_analysis.on_screen_presence (完整 JSONB) */
  onScreenPresence: Record<string, unknown> | null;
  /** video_analysis.fashion_placement.recommended_styles (完整 JSONB) */
  fashionStyles: Record<string, unknown> | null;
  /** editing_analysis (完整 JSONB) */
  editingAnalysis: Record<string, unknown> | null;
  /** 来源脚本ID */
  sourceScriptId: string | null;
  /** 关联项目ID */
  projectId: string | null;
  /** 原视频 OSS 地址 */
  sourceOssUrl: string | null;
  /** 重写前的原脚本ID */
  previousScriptId: string | null;
  /** 主场景 */
  mainScene: string | null;
  /** 氛围描述 */
  atmosphere: string | null;
  /** 创建时间 */
  createdAt: number;
  /** 镜头提示词 (可选) */
  shotPrompts?: ShotPromptsJson | null;
  /** 是否被选中 */
  isSelected: boolean;
  /** 是否已确认 */
  isConfirmed: boolean;
  /** 关键元素数组 */
  keyElements: string[] | null;
  /** 服饰植入备注 */
  placementNotes: string | null;
  /** 脚本正文（镜头标题，如"镜头 1\n镜头 2..."） */
  content: string | null;
  /** 脚本详情正文（basic: 前缀的分镜旁白+画面描述） */
  basicInfo: string | null;
  /** 分镜 JSONB 数据 */
  storyboard: Record<string, unknown> | null;
  /** 标签数组 */
  tags: string[] | null;
  /** 计算属性：嵌套 payload 结构（shot_breakdown 已迁移到独立表，需单独查询） */
  payload: {
    video_info?: VideoScriptPayload["video_info"];
    video_analysis: VideoScriptPayload["video_analysis"];
    editing_analysis?: VideoScriptPayload["editing_analysis"];
  };
}

/**
 * 插入脚本数据项
 */
export interface InsertScriptDataItem {
  /** 主键ID */
  id: string;
  /** 脚本类型：2=库存, 3=视频, 4=实时, 5=智能, 6=新故事 */
  type: number;
  /** 脚本内容 */
  payloadJson: VideoScriptPayload;
  /** 来源 Skill 代码（用于推断 source 字段） */
  skillCode?: string;
  /** 来源脚本ID（可选） */
  sourceScriptId?: string | null;
  /** 关联项目ID（可选） */
  projectId?: string | null;
  /** 用户ID（可选，来自 nrm_project.user_id） */
  userId?: string | null;
  /** OSS视频源地址（可选） */
  sourceOssUrl?: string | null;
  /** 重写前的原脚本ID（可选，指向 nrm_script_data.id） */
  previousScriptId?: string | null;
  /** 是否被选中 */
  isSelected?: boolean;
  /** 是否已确认 */
  isConfirmed?: boolean;
}

/**
 * 查询选项
 */
export interface QueryScriptsDataOptions {
  /** 脚本类型，默认 1 */
  type?: number;
  /** 最大数量，默认 100 */
  limit?: number;
  /** 是否按时间倒序，默认 true */
  orderByTimeDesc?: boolean;
  /** 排除的脚本ID列表（避免重复推荐） */
  excludeIds?: string[];
  /** 时间范围过滤：只查询 updated_at >= minUpdatedAt 的脚本（可选） */
  minUpdatedAt?: number;
}

/**
 * 非 type 查询选项
 */
export interface QueryTypeNotOptions {
  /** 排除的类型，默认 1 */
  excludeType?: number;
  /** 最大数量，默认 100 */
  limit?: number;
  /** 是否按时间倒序，默认 true */
  orderByTimeDesc?: boolean;
  /** 排除的脚本ID列表（避免重复推荐） */
  excludeIds?: string[];
}

/** 解析 JSON 数组字段（title_candidates 等） */
function parseJsonArray(value: unknown): string[] | null {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 从 DDL 行映射为 VideoScriptDataRecord */
function mapRow(row: Record<string, unknown>): VideoScriptDataRecord {
  // 解析 shot_prompts JSONB
  let shotPrompts: ShotPromptsJson | null = null;
  if (row.shot_prompts) {
    try {
      shotPrompts = typeof row.shot_prompts === 'string'
        ? JSON.parse(row.shot_prompts)
        : row.shot_prompts as ShotPromptsJson;
    } catch {
      shotPrompts = null;
    }
  }

  return {
    id: row.id as string,
    type: row.type as number,
    updatedAt: Number(row.updated_at),
    title: row.title as string | null,
    titleCandidates: parseJsonArray(row.title_candidates),
    durationSeconds: row.duration_seconds as number | null,
    source: row.source as string | null,
    timeOfDay: row.time_of_day as string | null,
    weather: row.weather as string | null,
    theme: row.theme as string | null,
    summary: row.summary as string | null,
    primaryEmotion: row.primary_emotion as string | null,
    videoType: row.video_type as string | null,
    videoStyle: row.video_style as string | null,
    targetAudience: row.target_audience as string | null,
    fashionSuitable: row.fashion_suitable as boolean | null,
    fashionReason: row.fashion_reason as string | null,
    emotionDetail: row.emotion_detail as Record<string, unknown> | null,
    onScreenPresence: row.on_screen_presence as Record<string, unknown> | null,
    fashionStyles: row.fashion_styles as Record<string, unknown> | null,
    editingAnalysis: row.editing_analysis as Record<string, unknown> | null,
    sourceScriptId: row.source_script_id as string | null,
    projectId: row.project_id as string | null,
    sourceOssUrl: row.source_oss_url as string | null,
    previousScriptId: row.previous_script_id as string | null,
    mainScene: row.main_scene as string | null,
    atmosphere: row.atmosphere as string | null,
    createdAt: Number(row.created_at ?? row.updated_at),
    shotPrompts,
    isSelected: row.is_selected as boolean ?? false,
    isConfirmed: row.is_confirmed as boolean ?? false,
    keyElements: row.key_elements as string[] | null,
    placementNotes: row.placement_notes as string | null,
    content: row.content as string | null,
    basicInfo: row.basic_info as string | null,
    storyboard: row.storyboard as Record<string, unknown> | null,
    tags: row.tags as string[] | null,
    payload: {
      video_info: {
        title: row.title as string | null ?? undefined,
        title_candidates: parseJsonArray(row.title_candidates) ?? undefined,
        duration_seconds: row.duration_seconds as number | null ?? undefined,
        source: row.source as string | null ?? undefined,
        time_of_day: row.time_of_day as string | null ?? undefined,
        weather: row.weather as string | null ?? undefined,
        main_scene: row.main_scene as string | null ?? undefined,
      },
      video_analysis: {
        title: row.title as string | null ?? undefined,
        theme: row.theme as string | null ?? undefined,
        summary: row.summary as string | null ?? undefined,
        video_type: row.video_type as string | null ?? undefined,
        video_style: row.video_style as string | null ?? undefined,
        target_audience: row.target_audience as string | null ?? undefined,
        emotion: row.emotion_detail as Record<string, unknown> | null ?? undefined,
        atmosphere: row.atmosphere as string | null ?? undefined,
      },
      editing_analysis: row.editing_analysis as Record<string, unknown> | null ?? undefined,
    },
  };
}

/**
 * 视频脚本数据服务接口
 */
export interface IScriptsDataDbService {
  queryByType(options: QueryScriptsDataOptions): Promise<VideoScriptDataRecord[]>;
  queryTypeNot(options: QueryTypeNotOptions): Promise<VideoScriptDataRecord[]>;
  getById(id: string): Promise<VideoScriptDataRecord | null>;
  /** 批量按ID查询脚本数据 */
  getByIds(ids: string[]): Promise<Map<string, VideoScriptDataRecord>>;
  countByType(type: number): Promise<number>;
  /** 按项目+类型统计脚本数量 */
  countByTypeAndProjectId(type: number, projectId: string): Promise<number>;
  batchInsertIfNotExists(items: InsertScriptDataItem[]): Promise<number>;
  queryByProjectId(projectId: string, limit?: number): Promise<VideoScriptDataRecord[]>;
  /** 更新镜头提示词 */
  updateShotPrompts(id: string, shotPrompts: ShotPromptsJson): Promise<boolean>;
  /** 更新镜头提示词和项目ID */
  updateShotPromptsAndProjectId(id: string, shotPrompts: ShotPromptsJson, projectId?: string): Promise<boolean>;
  /** 获取项目最新脚本 */
  getLatestByProjectId(projectId: string): Promise<VideoScriptDataRecord | null>;
  /** 清空项目所有脚本的选中状态 */
  clearProjectSelections(projectId: string): Promise<void>;
  /** 设置脚本为选中状态 */
  setSelected(id: string): Promise<void>;
  /** 设置脚本为确认状态 */
  setConfirmed(id: string): Promise<void>;
  /** 获取项目当前选中的脚本 */
  getSelectedScript(projectId: string): Promise<VideoScriptDataRecord | null>;
  /** 获取项目当前确认的脚本 */
  getConfirmedScript(projectId: string): Promise<VideoScriptDataRecord | null>;
}

/**
 * 视频脚本数据服务实现
 * 从数据库 nrm_script_data 表操作数据（传统字段模式）
 * 已迁移到通过 repos 访问数据库
 */
export class ScriptsDataDbService implements IScriptsDataDbService {
  private repos: PgRepositoryCollection;

  constructor(repos: PgRepositoryCollection) {
    this.repos = repos;
  }

  async queryByType(options: QueryScriptsDataOptions = {}): Promise<VideoScriptDataRecord[]> {
    const { type = 1, limit = 100, orderByTimeDesc = true, excludeIds = [], minUpdatedAt } = options;
    const order = orderByTimeDesc ? "DESC" : "ASC";

    const rows = await this.repos.scriptData.queryByTypeWithFullColumns({
      type, limit, order, excludeIds, minUpdatedAt,
    });
    return rows.map(mapRow);
  }

  async queryTypeNot(options: QueryTypeNotOptions = {}): Promise<VideoScriptDataRecord[]> {
    const { excludeType = 1, limit = 100, orderByTimeDesc = true, excludeIds = [] } = options;
    const order = orderByTimeDesc ? "DESC" : "ASC";

    const rows = await this.repos.scriptData.queryTypeNotWithFullColumns({
      excludeType, limit, order, excludeIds,
    });
    return rows.map(mapRow);
  }

  async getById(id: string): Promise<VideoScriptDataRecord | null> {
    const row = await this.repos.scriptData.findFullColumnsById(id);
    return row ? mapRow(row) : null;
  }

  /** 批量按ID查询脚本数据 */
  async getByIds(ids: string[]): Promise<Map<string, VideoScriptDataRecord>> {
    const result = new Map<string, VideoScriptDataRecord>();
    if (ids.length === 0) {
      return result;
    }

    const rows = await this.repos.scriptData.findFullColumnsByIds(ids);
    for (const row of rows) {
      const record = mapRow(row);
      result.set(record.id, record);
    }
    return result;
  }

  async countByType(type: number): Promise<number> {
    return this.repos.scriptData.countByType(type);
  }

  /** 按项目+类型统计脚本数量 */
  async countByTypeAndProjectId(type: number, projectId: string): Promise<number> {
    return this.repos.scriptData.countByTypeAndProjectId(type, projectId);
  }

  /**
   * 批量插入脚本数据，遇到重复（id）跳过
   * VideoScriptPayload 拆解到 DDL 传统列
   */
  async batchInsertIfNotExists(items: InsertScriptDataItem[]): Promise<number> {
    if (items.length === 0) {
      return 0;
    }

    return this.repos.scriptData.batchInsertFromPayload({
      items,
      shotBreakdowns: this.repos.shotBreakdowns,
    });
  }

  async queryByProjectId(projectId: string, limit: number = 100): Promise<VideoScriptDataRecord[]> {
    const rows = await this.repos.scriptData.findFullColumnsByProjectId(projectId, limit);
    return rows.map(mapRow);
  }

  async updateShotPrompts(id: string, shotPrompts: ShotPromptsJson): Promise<boolean> {
    await this.repos.scriptData.updateShotPrompts(id, JSON.stringify(shotPrompts));
    return true;
  }

  async updateShotPromptsAndProjectId(id: string, shotPrompts: ShotPromptsJson, projectId?: string): Promise<boolean> {
    await this.repos.scriptData.updateShotPromptsAndProjectId(id, JSON.stringify(shotPrompts), projectId ?? null);
    return true;
  }

  async getLatestByProjectId(projectId: string): Promise<VideoScriptDataRecord | null> {
    const row = await this.repos.scriptData.findLatestFullByProjectId(projectId);
    return row ? mapRow(row) : null;
  }

  /** 清空项目所有脚本的选中状态 */
  async clearProjectSelections(projectId: string): Promise<void> {
    await this.repos.scriptData.clearProjectSelections(projectId);
  }

  /** 设置脚本为选中状态 */
  async setSelected(id: string): Promise<void> {
    await this.repos.scriptData.setSelected(id);
  }

  /** 设置脚本为确认状态 */
  async setConfirmed(id: string): Promise<void> {
    await this.repos.scriptData.setConfirmed(id);
  }

  /** 获取项目当前选中的脚本 */
  async getSelectedScript(projectId: string): Promise<VideoScriptDataRecord | null> {
    const row = await this.repos.scriptData.findSelectedFullByProjectId(projectId);
    return row ? mapRow(row) : null;
  }

  /** 获取项目当前确认的脚本 */
  async getConfirmedScript(projectId: string): Promise<VideoScriptDataRecord | null> {
    const row = await this.repos.scriptData.findConfirmedFullByProjectId(projectId);
    return row ? mapRow(row) : null;
  }
}

// 单例实例
let _instance: ScriptsDataDbService | null = null;
let _cachedRepos: PgRepositoryCollection | null = null;

export function getScriptsDataDbService(repos: PgRepositoryCollection): IScriptsDataDbService {
  if (_instance === null || _cachedRepos !== repos) {
    _instance = new ScriptsDataDbService(repos);
    _cachedRepos = repos;
  }
  return _instance;
}
