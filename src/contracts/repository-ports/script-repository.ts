import type { ScriptVersion } from "../types.js";

/** 脚本仓库端口 — 旧 ScriptVersion，逐步迁移到 scripts_data */
export interface IScriptVersionRepository {
  findById(id: string): Promise<ScriptVersion | null>;
  findByProjectId(projectId: string): Promise<ScriptVersion[]>;
  findLatestByProjectId(projectId: string): Promise<ScriptVersion | null>;
  list(): Promise<ScriptVersion[]>;
  upsert(script: ScriptVersion): Promise<void>;
  delete(id: string): Promise<void>;
  /** 查询用户脚本 ID 列表（按创建时间倒序，用于排除公共脚本） */
  findIdsByUserId(userId: string): Promise<string[]>;
}
