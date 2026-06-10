/**
 * 统一脚本服务
 * 基于 nrm_script_data 表实现脚本管理
 */

import { randomUUID } from "node:crypto";
import type { ScriptData, ScriptTypeValue, VideoType } from "../../contracts/types.js";
import type { IScriptLibraryService } from "../../contracts/services.js";
import type { RepositoryCollection } from "../../repositories/index.js";
import { AppError } from "../../core/errors.js";

export class UnifiedScriptService implements IScriptLibraryService {
  constructor(
    private readonly repos: RepositoryCollection,
  ) {}

  async create(
    userId: string,
    params: {
      projectId?: string;
      title: string;
      content: string;
      type: ScriptTypeValue;
      tags?: string[];
      sourceScriptId?: string;
      previousScriptId?: string;
      /** LLM 反推结构化分析数据（用于填充 nrm_script_data 的分析字段） */
      analysis?: {
        theme?: string;
        summary?: string;
        primaryEmotion?: string;
        videoType?: string;
        videoStyle?: string;
        fashionSuitable?: boolean;
        fashionReason?: string;
        emotionDetail?: Record<string, unknown>;
        onScreenPresence?: Record<string, unknown>;
        fashionStyles?: Record<string, unknown>[];
        editingAnalysis?: Record<string, unknown>;
        durationSeconds?: number;
        sourceOssUrl?: string;
        source?: string;
      };
    },
  ): Promise<ScriptData> {
    const id = randomUUID();

    const script = await this.repos.scriptData.create({
      id,
      userId,
      title: params.title.trim(),
      content: params.content.trim(),
      type: params.type,
      projectId: params.projectId,
      sourceScriptId: params.sourceScriptId,
      previousScriptId: params.previousScriptId,
      tags: params.tags ?? [],
      analysis: params.analysis,
    });

    return script;
  }

  async findById(scriptId: string): Promise<ScriptData | null> {
    return this.repos.scriptData.findById(scriptId);
  }

  async listByProjectId(projectId: string): Promise<ScriptData[]> {
    return this.repos.scriptData.findByProjectId(projectId);
  }

  async listByUserId(userId: string): Promise<ScriptData[]> {
    return this.repos.scriptData.findByUserId(userId);
  }

  /** 列出所有脚本（管理后台用） */
  async list(): Promise<ScriptData[]> {
    // 通过 pool 直接查询，因为 scriptData 仓库没有 listAll 方法
    const result = await this.repos.scriptData["pool"]?.query(
      "SELECT * FROM nrm_script_data ORDER BY updated_at DESC"
    );
    if (!result) return [];
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      type: row.type as ScriptTypeValue,
      title: row.title as string,
      theme: row.theme as string | null,
      summary: row.summary as string | null,
      videoType: row.video_type as VideoType | null,
      videoStyle: row.video_style as string | null,
      targetAudience: row.target_audience as string | null,
      fashionSuitable: row.fashion_suitable as boolean | null,
      fashionReason: row.fashion_reason as string | null,
      emotionDetail: row.emotion_detail as string | null,
      onScreenPresence: row.on_screen_presence as string | null,
      fashionStyles: row.fashion_styles as string | null,
      editingAnalysis: row.editing_analysis as unknown | null,
      durationSeconds: row.duration_seconds as number | null,
      primaryEmotion: row.primary_emotion as string | null,
      sourceOssUrl: row.source_oss_url as string | null,
      source: row.source as string | null,
      mainScene: row.main_scene as string | null,
      timeOfDay: row.time_of_day as string | null,
      weather: row.weather as string | null,
      atmosphere: row.atmosphere as string | null,
      userId: (row.user_id as string) ?? "",
      projectId: row.project_id as string | null,
      sourceScriptId: row.source_script_id as string | null,
      previousScriptId: row.previous_script_id as string | null,
      tags: (row.tags as string[]) ?? [],
      content: (row.content as string) ?? "",
      updatedAt: Number(row.updated_at),
      createdAt: Number(row.created_at),
    }));
  }

  async update(
    userId: string,
    scriptId: string,
    params: {
      title?: string;
      content?: string;
      tags?: string[];
    },
  ): Promise<ScriptData> {
    const script = await this.repos.scriptData.findById(scriptId);
    if (!script) {
      throw new AppError(404, "SCRIPT_NOT_FOUND", "脚本不存在");
    }
    if (script.userId !== userId) {
      throw new AppError(403, "FORBIDDEN", "无权修改此脚本");
    }

    const updated = await this.repos.scriptData.update(scriptId, {
      title: params.title?.trim() ?? script.title,
      content: params.content?.trim() ?? script.content,
      tags: params.tags ?? script.tags,
    });

    return updated;
  }

  async remove(userId: string, scriptId: string): Promise<void> {
    const script = await this.repos.scriptData.findById(scriptId);
    if (!script) {
      throw new AppError(404, "SCRIPT_NOT_FOUND", "脚本不存在");
    }
    if (script.userId !== userId) {
      throw new AppError(403, "FORBIDDEN", "无权删除此脚本");
    }

    // 检查是否为项目选中脚本
    if (script.projectId) {
      const project = await this.repos.projects.findById(script.projectId);
      if (project && project.activeScriptId === scriptId) {
        throw new AppError(400, "SCRIPT_IS_ACTIVE", "无法删除当前选中的脚本，请先切换其他脚本");
      }
    }

    await this.repos.scriptData.delete(scriptId);
  }

  async batchRemove(userId: string, scriptIds: string[]): Promise<{ deleted: number }> {
    let deleted = 0;
    for (const scriptId of scriptIds) {
      try {
        await this.remove(userId, scriptId);
        deleted += 1;
      } catch {
        // 忽略失败项，继续删除其他
      }
    }
    return { deleted };
  }
}