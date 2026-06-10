import type { Project } from "../types.js";

/** 项目仓库端口 */
export interface IProjectRepository {
  findById(id: string): Promise<Project | null>;
  findByUserId(userId: string): Promise<Project[]>;
  upsert(project: Project): Promise<void>;
  delete(id: string): Promise<void>;
  /** 伪删除：设置 deleted_at 和 deleted_by */
  softDelete(id: string, deletedBy: string): Promise<void>;

  /** 分页查询用户项目 */
  findByUserIdPaginated(
    userId: string,
    options?: {
      page?: number;
      pageSize?: number;
      status?: string;
      projectKind?: 'image' | 'video' | 'reverse' | 'outfit_change';
      search?: string;
    }
  ): Promise<{
    projects: Project[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }>;

  /** 查询使用了指定角色的项目（通过 selected_character_id） */
  findBySelectedCharacterId(characterId: string): Promise<Project[]>;
}
