/**
 * 项目上下文服务
 *
 * 从数据库获取项目的完整上下文信息，供以下场景复用：
 * - library 脚本生成
 * - video 脚本生成
 * - realtime 脚本生成
 * - effectiveness 脚本生成
 * - 图片生成
 * - 视频生成
 */

import type {
  ProjectContext,
  ProjectContextOptions,
  ProjectCharacter,
  ProjectGarment,
  ProjectOutfit,
  SelectedRoleDirection,
} from "./types.js";
import { GARMENT_CATEGORY_LABELS } from "../../contant-config/shared_dict.js";
import type { GarmentCategory } from "../../contant-config/shared_dict.js";
import type { PgProjectRepository } from "../../repositories/pg/project-pg-repository.js";

/**
 * 项目上下文服务
 */
export class ProjectContextService {
  constructor(private readonly projectRepo: PgProjectRepository) {}

  /**
   * 获取项目上下文
   *
   * @param projectId 项目ID
   * @param options 提取选项
   * @returns 项目上下文
   */
  async getProjectContext(
    projectId: string,
    options: ProjectContextOptions = {}
  ): Promise<ProjectContext> {
    const {
      includeGarmentImages = true,
      includeCharacterFiveView = false,
    } = options;

    // 并行查询
    const [mainRow, garmentsRows] = await Promise.all([
      this.projectRepo.queryProjectContext(projectId),
      this.projectRepo.queryProjectGarments(projectId),
    ]);

    if (!mainRow) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // 解析角色信息
    const character = this.parseCharacter(mainRow, includeCharacterFiveView);

    // 解析角色方向（Step2 定妆选择）
    const selectedRoleDirection = this.parseSelectedRoleDirection(mainRow.selected_role_direction);

    // 解析服饰列表
    const garments = this.parseGarments(garmentsRows, includeGarmentImages);

    // 解析穿搭方案（主查询中已通过 CTE 获取）
    let selectedOutfit: ProjectOutfit | null = null;
    if (mainRow.outfit_plan_id) {
      selectedOutfit = {
        outfitPlanId: mainRow.outfit_plan_id as string,
        title: mainRow.outfit_title as string | null,
        styleName: mainRow.style_name as string | null,
        tags: this.parseJsonArray(mainRow.outfit_tags),
        analysis: mainRow.analysis as string | null,
        optimizedPrompt: mainRow.optimized_prompt as string | null,
        suitableScene: mainRow.suitable_scene as string | null,
      };
    }

    // 如果没有选中的穿搭方案，尝试获取第一条有效的
    if (!selectedOutfit) {
      selectedOutfit = await this.fetchFallbackOutfit(projectId);
    }

    // 构建聚合字段
    const clothingStyles = this.buildClothingStyles(selectedOutfit, garments);
    const characterDescription = this.buildCharacterDescription(character, selectedRoleDirection);
    const matchingReference = this.buildMatchingReference(selectedOutfit);
    const outfitDescription = this.buildOutfitDescription(garments);

    return {
      projectId: mainRow.project_id as string,
      projectName: mainRow.project_name as string,
      character,
      selectedRoleDirection,
      garments,
      selectedOutfit,
      clothingStyles,
      characterDescription,
      matchingReference,
      outfitDescription,
    };
  }

  /**
   * 解析角色信息
   */
  private parseCharacter(
    row: Record<string, unknown>,
    includeFiveView: boolean
  ): ProjectCharacter | null {
    if (!row.character_id) {
      return null;
    }

    return {
      libraryCharacterId: row.character_id as string,
      name: row.character_name as string,
      gender: this.parseGender(row.gender as string | null),
      age: row.age != null ? Number(row.age) || null : null,
      style: row.character_style as string | null,
      tags: this.parseJsonArray(row.character_tags),
      thumbnailUrl: row.character_thumbnail as string | null,
      fiveViewOssImageUrl: includeFiveView
        ? (row.five_view_oss_image_url as string | null)
        : null,
    };
  }

  /**
   * 解析角色方向（Step2 定妆选择）
   * 注意：styleSummary 是过渡提示，不应传给 LLM
   */
  private parseSelectedRoleDirection(value: unknown): SelectedRoleDirection | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const data = value as Record<string, unknown>;
    // 必须有 directionId 才有效
    if (!data.directionId || typeof data.directionId !== "string") {
      return null;
    }

    return {
      styleWords: Array.isArray(data.styleWords)
        ? data.styleWords.filter((v): v is string => typeof v === "string")
        : [],
      directionId: typeof data.directionId === "string" ? data.directionId : undefined,
      gender: data.gender === "male" || data.gender === "female" ? data.gender : undefined,
      age: typeof data.age === "number" ? data.age : undefined,
      confidence: typeof data.confidence === "number" ? data.confidence : undefined,
      portraitUrl: typeof data.portraitUrl === "string" ? data.portraitUrl : undefined,
      ethnicityOrRegion: typeof data.ethnicityOrRegion === "string" ? data.ethnicityOrRegion : undefined,
      // styleSummary 是过渡提示，保留但不使用
      styleSummary: typeof data.styleSummary === "string" ? data.styleSummary : undefined,
    };
  }

  /**
   * 解析服饰列表
   */
  private parseGarments(
    rows: Array<Record<string, unknown>>,
    includeImages: boolean
  ): ProjectGarment[] {
    return rows.map((row) => ({
      garmentAssetId: row.garment_asset_id as string,
      name: row.name as string,
      category: row.category as string,
      description: row.description as string | null,
      style: row.style as string | null,
      occasion: row.occasion as string | null,
      mainImageUrl: includeImages ? (row.main_image_url as string | null) : null,
      flatLayImageUrl: includeImages ? (row.flat_lay_image_url as string | null) : null,
    }));
  }

  /**
   * 获取备用穿搭方案（当没有 selected=true 时）
   */
  private async fetchFallbackOutfit(projectId: string): Promise<ProjectOutfit | null> {
    const row = await this.projectRepo.queryFallbackOutfit(projectId);
    if (!row) {
      return null;
    }
    return {
      outfitPlanId: row.outfit_plan_id as string,
      title: row.title as string | null,
      styleName: row.style_name as string | null,
      tags: this.parseJsonArray(row.tags),
      analysis: row.analysis as string | null,
      optimizedPrompt: row.optimized_prompt as string | null,
      suitableScene: row.suitable_scene as string | null,
    };
  }

  /**
   * 构建服饰风格列表
   * 优先级：selectedOutfit.tags > garments.style 聚合
   */
  private buildClothingStyles(
    selectedOutfit: ProjectOutfit | null,
    garments: ProjectGarment[]
  ): string[] {
    // 优先从穿搭方案获取风格标签
    if (selectedOutfit?.tags && selectedOutfit.tags.length > 0) {
      return [...new Set(selectedOutfit.tags)];
    }

    // 备用：从服饰 style 字段聚合
    const styles = new Set<string>();
    for (const garment of garments) {
      if (garment.style) {
        // style 可能是 "时尚休闲/轻复古" 这样的格式，需要拆分
        garment.style.split(/[\/,，、]/).forEach((s) => {
          const trimmed = s.trim();
          if (trimmed) {
            styles.add(trimmed);
          }
        });
      }
    }
    return [...styles];
  }

  /**
   * 构建角色描述
   * 整合 library_characters 信息 + selectedRoleDirection（Step2 定妆选择）
   */
  private buildCharacterDescription(
    character: ProjectCharacter | null,
    selectedRoleDirection: SelectedRoleDirection | null
  ): string {
    const parts: string[] = [];

    // 优先使用 selectedRoleDirection 的信息（Step2 定妆选择）
    if (selectedRoleDirection) {
      if (selectedRoleDirection.styleWords.length > 0) {
        parts.push(`关键词：${selectedRoleDirection.styleWords.join("、")}`);
      }
    }

    // 补充 library_characters 的信息
    if (character) {
      if (character.name && !selectedRoleDirection) {
        parts.push(character.name);
      }
      if (character.gender) {
        parts.push(`性别：${character.gender === "male" ? "男" : "女"}`);
      }
      if (character.age) {
        parts.push(`年龄段：${character.age}`);
      }
      if (character.style && !selectedRoleDirection) {
        parts.push(`风格：${character.style}`);
      }
      if (character.tags.length > 0 && !selectedRoleDirection) {
        parts.push(`标签：${character.tags.join("、")}`);
      }
    }

    return parts.join("，");
  }

  /**
   * 构建搭配参考
   */
  private buildMatchingReference(selectedOutfit: ProjectOutfit | null): string {
    if (!selectedOutfit) {
      return "";
    }
    return selectedOutfit.analysis || selectedOutfit.optimizedPrompt || "";
  }

  /**
   * 构建服饰描述
   * 包含服饰类别标签和镜头焦点提示，让 LLM 根据服饰类型调整视觉重心
   */
  private buildOutfitDescription(garments: ProjectGarment[]): string {
    if (garments.length === 0) return "";

    // 服饰类别对应的视觉焦点区域
    const categoryFocusMap: Record<string, string> = {
      top: "上半身特写",
      bottom: "腰腿部动态",
      shoes: "足部和步伐",
      accessory: "佩戴部位特写",
      suit: "全身效果",
      dress: "全身及裙摆动态",
      outer: "外套版型和上半身",
    };

    const items = garments.map((g) => {
      const category = g.category || "";
      const label =
        GARMENT_CATEGORY_LABELS[category as GarmentCategory];
      const prefix = label ? `【${label}】` : "";
      const parts = [`${prefix}${g.name}`];
      if (g.description) {
        parts.push(g.description);
      }
      return parts.join("：");
    });

    // 根据服饰类别生成镜头焦点提示
    const focusHints = [
      ...new Set(
        garments
          .map((g) => categoryFocusMap[g.category])
          .filter(Boolean)
      ),
    ];

    let result = items.join("\n\n");
    if (focusHints.length > 0) {
      result += `\n\n镜头焦点：展示时请侧重${focusHints.join("、")}的视觉呈现。`;
    }

    return result;
  }

  /**
   * 解析性别
   */
  private parseGender(value: string | null): "male" | "female" | null {
    if (!value) {
      return null;
    }
    const lower = value.toLowerCase();
    if (lower === "male" || lower === "男" || lower === "男性") {
      return "male";
    }
    if (lower === "female" || lower === "女" || lower === "女性") {
      return "female";
    }
    return null;
  }

  /**
   * 解析 JSON 数组字段
   */
  private parseJsonArray(value: unknown): string[] {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === "string");
    }
    return [];
  }
}

/**
 * 创建项目上下文服务实例
 */
export function createProjectContextService(projectRepo: PgProjectRepository): ProjectContextService {
  return new ProjectContextService(projectRepo);
}
