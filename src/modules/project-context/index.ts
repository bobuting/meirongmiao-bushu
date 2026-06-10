/**
 * 项目上下文模块
 *
 * 从数据库获取项目的完整上下文信息，供以下场景复用：
 * - library 脚本生成
 * - video 脚本生成
 * - realtime 脚本生成
 * - effectiveness 脚本生成
 * - 图片生成
 * - 视频生成
 */

export { ProjectContextService, createProjectContextService } from "./project-context-service.js";
export type {
  ProjectContext,
  ProjectContextOptions,
  ProjectCharacter,
  ProjectGarment,
  ProjectOutfit,
} from "./types.js";
