/**
 * 项目上下文模块 - 类型定义
 * 供脚本生成、图片生成、视频生成等场景复用
 */

/**
 * 角色方向信息（来自 Step2 定妆选择）
 * 注意：styleSummary 是过渡提示，不应传给 LLM
 */
export interface SelectedRoleDirection {
  /** 风格关键词，如 ["复古运动", "工装元素", "中性色调"] */
  styleWords: string[];
  /** 角色方向ID */
  directionId?: string;
  /** 性别 */
  gender?: "male" | "female";
  /** 年龄 */
  age?: number;
  /** 置信度 */
  confidence?: number;
  /** 头像URL */
  portraitUrl?: string;
  /** 种族/地区 */
  ethnicityOrRegion?: string;
  /** 过渡提示（Step1→Step2），不应传给 LLM */
  styleSummary?: string;
}

/**
 * 角色信息
 */
export interface ProjectCharacter {
  /** 角色库ID */
  libraryCharacterId: string;
  /** 角色名称 */
  name: string;
  /** 性别 */
  gender: "male" | "female" | null;
  /** 年龄 */
  age: number | null;
  /** 风格 */
  style: string | null;
  /** 标签 */
  tags: string[];
  /** 缩略图 URL */
  thumbnailUrl: string | null;
  /** 五视图 URL */
  fiveViewOssImageUrl: string | null;
}

/**
 * 服饰单品信息
 */
export interface ProjectGarment {
  /** 服饰资产ID */
  garmentAssetId: string;
  /** 名称 */
  name: string;
  /** 类别：top/bottom/shoes/accessory */
  category: string;
  /** 描述 */
  description: string | null;
  /** 风格 */
  style: string | null;
  /** 场合 */
  occasion: string | null;
  /** 主图 URL */
  mainImageUrl: string | null;
  /** 平铺图 URL */
  flatLayImageUrl: string | null;
}

/**
 * 穿搭方案信息
 */
export interface ProjectOutfit {
  /** 穿搭方案ID */
  outfitPlanId: string;
  /** 标题 */
  title: string | null;
  /** 风格名称 */
  styleName: string | null;
  /** 风格标签 */
  tags: string[];
  /** 分析 */
  analysis: string | null;
  /** 优化后的提示词 */
  optimizedPrompt: string | null;
  /** 适用场景 */
  suitableScene: string | null;
}

/**
 * 项目上下文 - 供脚本生成、图片生成、视频生成等场景复用
 */
export interface ProjectContext {
  // ========== 项目基本信息 ==========
  projectId: string;
  projectName: string;

  // ========== 角色信息（已选中的） ==========
  character: ProjectCharacter | null;

  /** 角色方向（Step2 定妆选择，包含 styleWords） */
  selectedRoleDirection: SelectedRoleDirection | null;

  // ========== 服饰单品列表 ==========
  garments: ProjectGarment[];

  // ========== 穿搭方案（已选中的） ==========
  selectedOutfit: ProjectOutfit | null;

  // ========== 聚合字段（便捷访问） ==========
  /** 服饰风格：优先 selectedOutfit.tags，其次 garments.style 聚合 */
  clothingStyles: string[];

  /** 角色描述：character.style */
  characterDescription: string;

  /** 搭配参考：selectedOutfit.analysis 或 optimizedPrompt */
  matchingReference: string;

  /** 服饰描述：garments.name + description 聚合 */
  outfitDescription: string;
}

/**
 * 项目上下文提取选项
 */
export interface ProjectContextOptions {
  /** 是否包含服饰图片URL，默认 true */
  includeGarmentImages?: boolean;
  /** 是否包含角色五视图URL，默认 false */
  includeCharacterFiveView?: boolean;
}
