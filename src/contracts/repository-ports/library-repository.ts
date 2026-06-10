import type {
  CharacterFiveView,
  LibraryCharacter,
  LibraryScript,
  LibraryScriptVersion,
  ModelPhoto,
  PageSection,
  ProjectCharacter,
  SectionVersion,
} from "../types.js";
import type { ReverseStoryboardLibraryItem } from "../reverse-storyboard-report.js";
import type { ReverseStoryboardLibraryVersionRecord } from "../reverse-storyboard-library-api.js";
import type {
  SmartStoryboardLibraryItem,
  SmartStoryboardLibraryVersionRecord,
} from "../smart-storyboard-library-api.js";

/** 库存角色仓库端口 */
export interface ILibraryCharacterRepository {
  findById(id: string): Promise<LibraryCharacter | null>;
  findByUserId(userId: string): Promise<LibraryCharacter[]>;
  findByUserIdPaged(
    userId: string,
    options?: {
      page?: number;
      pageSize?: number;
      gender?: string;
      tags?: string[];
      keyword?: string;
      hasFiveView?: boolean;
    },
  ): Promise<{
    items: LibraryCharacter[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  }>;
  upsert(character: LibraryCharacter): Promise<void>;
  delete(id: string): Promise<void>;
  /** 伪删除：设置 deleted_at 和 deleted_by */
  softDelete(id: string, deletedBy: string): Promise<void>;
}

/** 库存脚本仓库端口 */
export interface ILibraryScriptRepository {
  findById(id: string): Promise<LibraryScript | null>;
  findByUserId(userId: string): Promise<LibraryScript[]>;
  upsert(script: LibraryScript): Promise<void>;
  delete(id: string): Promise<void>;
  /** 伪删除：设置 deleted_at 和 deleted_by */
  softDelete(id: string, deletedBy: string): Promise<void>;
}

/** 库存脚本版本仓库端口 */
export interface ILibraryScriptVersionRepository {
  findById(id: string): Promise<LibraryScriptVersion | null>;
  findByScriptId(scriptId: string): Promise<LibraryScriptVersion[]>;
  upsert(version: LibraryScriptVersion): Promise<void>;
  delete(id: string): Promise<void>;
  /** 按脚本 ID 删除所有版本 */
  deleteByScriptId(scriptId: string): Promise<void>;
}

/** 反向分镜库仓库端口 */
export interface IReverseStoryboardLibraryRepository {
  findById(id: string): Promise<ReverseStoryboardLibraryItem | null>;
  list(): Promise<ReverseStoryboardLibraryItem[]>;
  upsert(item: ReverseStoryboardLibraryItem): Promise<void>;
  delete(id: string): Promise<void>;
  /** 检查 ID 是否已存在 */
  exists(id: string): Promise<boolean>;
}

export interface IReverseStoryboardLibraryVersionRepository {
  findById(id: string): Promise<ReverseStoryboardLibraryVersionRecord | null>;
  findByItemId(itemId: string): Promise<ReverseStoryboardLibraryVersionRecord[]>;
  upsert(version: ReverseStoryboardLibraryVersionRecord): Promise<void>;
  delete(id: string): Promise<void>;
  /** 按条目 ID 删除所有版本 */
  deleteByItemId(itemId: string): Promise<void>;
}

/** 智能分镜库仓库端口 */
export interface ISmartStoryboardLibraryRepository {
  findById(id: string): Promise<SmartStoryboardLibraryItem | null>;
  list(): Promise<SmartStoryboardLibraryItem[]>;
  upsert(item: SmartStoryboardLibraryItem): Promise<void>;
  delete(id: string): Promise<void>;
  /** 检查 ID 是否已存在 */
  exists(id: string): Promise<boolean>;
}

export interface ISmartStoryboardLibraryVersionRepository {
  findById(id: string): Promise<SmartStoryboardLibraryVersionRecord | null>;
  findByItemId(itemId: string): Promise<SmartStoryboardLibraryVersionRecord[]>;
  upsert(version: SmartStoryboardLibraryVersionRecord): Promise<void>;
  delete(id: string): Promise<void>;
  /** 按条目 ID 删除所有版本 */
  deleteByItemId(itemId: string): Promise<void>;
}

/** 角色五视图仓库端口 */
export interface ICharacterFiveViewRepository {
  findById(id: string): Promise<CharacterFiveView | null>;
  findByCharacterId(characterId: string): Promise<CharacterFiveView[]>;
  findActiveByCharacterId(characterId: string): Promise<CharacterFiveView | null>;
  create(view: CharacterFiveView): Promise<void>;
  update(view: CharacterFiveView): Promise<void>;
  delete(id: string): Promise<void>;
  setActive(characterId: string, viewId: string): Promise<void>;
}

/** 项目角色关联仓库端口 */
export interface IProjectCharacterRepository {
  findByProjectId(projectId: string): Promise<ProjectCharacter[]>;
  findByProjectAndLibraryCharacterId(projectId: string, libraryCharacterId: string): Promise<ProjectCharacter | null>;
  findById(id: string): Promise<ProjectCharacter | null>;
  create(record: ProjectCharacter): Promise<void>;
  update(record: ProjectCharacter): Promise<void>;
  softDelete(id: string, deletedBy: string): Promise<void>;
  setSelected(projectId: string, libraryCharacterId: string): Promise<void>;
  clearSelected(projectId: string): Promise<void>;
  /** 检查角色是否被项目使用（未删除的关联） */
  findByLibraryCharacterId(libraryCharacterId: string): Promise<ProjectCharacter[]>;
}

/** 模特图仓库端口（图片项目 Step 3） */
export interface IModelPhotoRepository {
  findById(id: string): Promise<ModelPhoto | null>;
  findByProjectId(projectId: string): Promise<ModelPhoto[]>;
  findMinSortOrder(projectId: string): Promise<number>;
  findMaxSortOrder(projectId: string): Promise<number>;
  create(photo: ModelPhoto): Promise<void>;
  update(photo: ModelPhoto): Promise<void>;
  bulkCreate(photos: ModelPhoto[]): Promise<void>;
  updateFields(id: string, fields: Partial<ModelPhoto>): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
  deleteById(photoId: string): Promise<void>;
  countSelected(projectId: string): Promise<number>;
}

/** 页面 Section 仓库端口 */
export interface IPageSectionRepository {
  findById(id: string): Promise<PageSection | null>;
  findByProjectId(projectId: string): Promise<PageSection[]>;
  findBySectionKey(projectId: string, sectionKey: string): Promise<PageSection | null>;
  create(section: PageSection): Promise<void>;
  update(section: PageSection): Promise<void>;
  delete(id: string): Promise<void>;
  /** 批量更新排序 */
  updateSortOrder(sectionId: string, sortOrder: number): Promise<void>;
  /** 更新当前激活图片 */
  updateCurrentImage(sectionId: string, imageAssetId: string | null): Promise<void>;
}

/** Section 版本仓库端口 */
export interface ISectionVersionRepository {
  findById(id: string): Promise<SectionVersion | null>;
  findBySectionId(sectionId: string): Promise<SectionVersion[]>;
  findActiveBySectionId(sectionId: string): Promise<SectionVersion | null>;
  findActiveByProjectId(projectId: string): Promise<SectionVersion[]>;
  create(version: SectionVersion): Promise<void>;
  update(version: SectionVersion): Promise<void>;
  delete(id: string): Promise<void>;
  /** 切换激活版本：取消旧版本激活，激活新版本 */
  activate(versionId: string): Promise<void>;
  /** 获取 Section 的下一个版本号 */
  nextVersionNumber(sectionId: string): Promise<number>;
}
