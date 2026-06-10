/**
 * 项目提示词数据服务：从数据库获取角色和服饰数据，构建提示词所需的文本描述
 *
 * 用于五视图生成等场景，统一数据获取逻辑，避免前端传递大段文本
 */

import type { IProjectRepository } from "../contracts/repository-ports/index.js";
import type { IGarmentAssetRepository, IProjectGarmentAssocRepository } from "../contracts/repository-ports/garment-repository.js";
import type { GarmentAsset, Project } from "../contracts/types.js";
import { resolveGarmentImageUrl } from "../contracts/types.js";
import { assertCondition } from "../core/errors.js";
import { mapStep1RolePresetToEnglishCoreFeatures, type Step2RoleCoreFeaturesResult } from "./step2-role-core-features-mapper.js";

/** 角色方向预设（从 nrm_projects.selected_role_direction 读取） */
interface SelectedRoleDirection {
  directionId: string;
  title: string;
  styleSummary: string;
  portraitUrl: string | null;
  confidence: number;
  ethnicityOrRegion?: string | null;
  gender?: "male" | "female" | "unknown" | null;
  age?: number | null;
  styleWords?: string[] | null;
}

/** 角色提示词数据 */
export interface CharacterPromptData {
  /** 角色方向 ID */
  directionId: string;
  /** 英文角色核心特征描述（用于 LLM 提示词） */
  coreFeatures: string;
  /** 角色参考图 URL */
  referenceImageUrl: string | null;
  /** 原始角色方向数据 */
  roleDirection: SelectedRoleDirection;
  /** 映射结果（包含 anchor 和 descriptors） */
  mappingResult: Step2RoleCoreFeaturesResult;
}

/** 服饰提示词数据 */
export interface GarmentPromptData {
  /** 服饰搭配描述（用于 LLM 提示词） */
  phase1Outfit: string;
  /** 原始服饰数据 */
  garmentAssets: GarmentAsset[];
  /** 服饰参考图 URL 列表（优先使用平铺图） */
  referenceImageUrls: string[];
}

/** 项目提示词数据服务 */
export class ProjectPromptDataService {
  constructor(
    private readonly repos: {
      projects: IProjectRepository;
      projectGarmentAssocs: IProjectGarmentAssocRepository;
      garmentAssets: IGarmentAssetRepository;
    },
  ) {}

  /**
   * 获取项目的角色提示词数据
   * 优先从 nrm_projects.selected_role_direction 获取（Step1 选择的角色预设）
   *
   * @param projectId 项目 ID
   * @returns 角色提示词数据
   * @throws AppError 如果项目无角色预设或缺少必要字段
   */
  async getCharacterPromptDataForProject(projectId: string): Promise<CharacterPromptData> {
    // 1. 查询项目详情，获取 selected_role_direction
    const project = await this.repos.projects.findById(projectId);
    assertCondition(
      Boolean(project),
      404,
      "PROJECT_NOT_FOUND",
      "项目不存在",
    );

    const roleDirection = project!.selectedRoleDirection as SelectedRoleDirection | null;
    assertCondition(
      Boolean(roleDirection),
      400,
      "NO_SELECTED_ROLE_DIRECTION",
      "请先在 Step1 选择角色预设",
    );

    // 2. 校验性别字段（必须存在）
    assertCondition(
      Boolean(roleDirection!.gender),
      400,
      "CHARACTER_GENDER_REQUIRED",
      "角色预设缺少性别信息，请重新选择",
    );

    // 3. 构建 coreFeatures
    const coreFeaturesResult = buildCoreFeaturesFromRoleDirection(roleDirection!);

    return {
      directionId: roleDirection!.directionId,
      coreFeatures: coreFeaturesResult.coreFeatures,
      referenceImageUrl: roleDirection!.portraitUrl,
      roleDirection: roleDirection!,
      mappingResult: coreFeaturesResult,
    };
  }

  /**
   * 获取项目的服饰提示词数据
   *
   * @param projectId 项目 ID
   * @returns 服饰提示词数据
   * @throws AppError 如果项目无服饰或服饰缺少描述
   */
  async getGarmentPromptDataForProject(projectId: string): Promise<GarmentPromptData> {
    // 1. 查询项目关联的服饰
    const assocs = await this.repos.projectGarmentAssocs.findByProjectId(projectId);
    assertCondition(
      assocs.length > 0,
      400,
      "NO_PROJECT_GARMENTS",
      "项目未关联服饰，请先上传服饰",
    );

    // 2. 查询服饰详情
    const garmentIds = assocs.map((a) => a.garmentAssetId);
    const garments = await this.repos.garmentAssets.findByIds(garmentIds);
    assertCondition(
      garments.length > 0,
      400,
      "NO_PROJECT_GARMENTS",
      "项目未关联服饰，请先上传服饰",
    );

    // 3. 校验每个服饰都有描述
    for (const g of garments) {
      assertCondition(
        Boolean(g.description?.trim()),
        400,
        "GARMENT_DESCRIPTION_REQUIRED",
        `服饰"${g.name}"缺少描述，请重新进行服饰分类`,
      );
    }

    // 4. 构建服饰描述文本
    const phase1Outfit = buildPhase1OutfitFromGarments(garments);

    // 5. 获取参考图列表（优先平铺图）
    const referenceImageUrls = garments.map((g) => resolveGarmentImageUrl(g));

    return {
      phase1Outfit,
      garmentAssets: garments,
      referenceImageUrls,
    };
  }

  /**
   * 同时获取角色和服饰提示词数据
   *
   * @param projectId 项目 ID
   * @returns 角色和服饰提示词数据
   */
  async getPromptDataForProject(projectId: string): Promise<{
    character: CharacterPromptData;
    garment: GarmentPromptData;
  }> {
    // 并行查询以提高性能
    const [characterData, garmentData] = await Promise.all([
      this.getCharacterPromptDataForProject(projectId),
      this.getGarmentPromptDataForProject(projectId),
    ]);

    return { character: characterData, garment: garmentData };
  }
}

/**
 * 从角色方向预设构建英文核心特征描述
 */
import type { RoleStyleCategory } from "../contant-config/role-style-dict.js";
import { isValidRoleStyle, parseRoleStyleFromText, ROLE_STYLE_OPTIONS, normalizeRoleStyleWords } from "../contant-config/role-style-dict.js";

function buildCoreFeaturesFromRoleDirection(roleDirection: SelectedRoleDirection): Step2RoleCoreFeaturesResult {
  // 构造 Step1RolePreset 格式
  // 验证并转换 styleWords 为角色风格类型
  const validatedStyleWords: RoleStyleCategory[] = normalizeRoleStyleWords(roleDirection.styleWords);

  const preset = {
    presetId: roleDirection.directionId,
    ethnicityOrRegion: normalizeEthnicity(roleDirection.ethnicityOrRegion),
    gender: roleDirection.gender || "unknown",
    age: roleDirection.age || 20,
    styleWords: validatedStyleWords,
  };

  return mapStep1RolePresetToEnglishCoreFeatures(preset);
}

/**
 * 从服饰列表构建穿搭描述
 */
function buildPhase1OutfitFromGarments(garments: GarmentAsset[]): string {
  // 按类别排序：top -> bottom -> shoes -> accessory
  const categoryOrder: Record<string, number> = {
    top: 1,
    bottom: 2,
    shoes: 3,
    accessory: 4,
  };

  const sorted = [...garments].sort((a, b) => {
    const orderA = categoryOrder[a.category] || 99;
    const orderB = categoryOrder[b.category] || 99;
    return orderA - orderB;
  });

  // 构建描述文本
  const descriptions = sorted.map((g) => {
    const parts = [
      g.name,
      g.description, // 已在前置校验中确保存在
      g.mainColor ? `${g.mainColor} color` : null,
      g.material ? `${g.material} material` : null,
      g.style ? `${g.style} style` : null,
    ].filter(Boolean);

    const categoryLabel = getCategoryLabel(g.category);
    return `${categoryLabel}: ${parts.join(", ")}`;
  });

  return descriptions.join(". ");
}

/**
 * 获取类别的中文标签
 */
function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    top: "上装",
    bottom: "下装",
    shoes: "鞋子",
    accessory: "配饰",
  };
  return labels[category] || category;
}

/**
 * 标准化种族/地区字段
 * 只允许 Asian/East Asian/Southeast Asian，非亚洲地区统一映射到 Asian
 */
function normalizeEthnicity(value: string | null | undefined): "Asian" | "East Asian" | "Southeast Asian" {
  if (!value) return "Asian";

  const normalized = value.toLowerCase().trim();
  if (/(southeast asia|southeast asian|东南亚|东南亚裔)/u.test(normalized)) {
    return "Southeast Asian";
  }
  if (/(east asia|east asian|东亚|东亚裔)/u.test(normalized)) {
    return "East Asian";
  }
  // 默认返回 Asian（包括欧洲、拉丁等其他地区）
  return "Asian";
}
