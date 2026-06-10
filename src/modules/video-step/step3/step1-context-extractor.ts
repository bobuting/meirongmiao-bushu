/**
 * Step1 上下文统一提取器
 * 从 projectData 中提取角色描述、搭配参考、服饰描述、服饰风格
 * 供 library / video / realtime 三种脚本生成方式复用
 */

/**
 * 服饰单品信息
 */
export interface ClothingItem {
  /** 服饰类型：上装/下装/鞋履/配饰 */
  type: string;
  /** 服饰名称 */
  name: string;
  /** 服饰描述 */
  description: string;
  /** 风格标签 */
  styles: string[];
}

/**
 * Step1 上下文提取结果
 */
export interface Step1Context {
  /** 角色描述（step1HiddenRoleSettingPrompt 中 "后续定妆整体提示词:" 和 "\nStep1搭配参考:" 之间的内容） */
  characterDescription: string;
  /** 搭配参考（step1HiddenRoleSettingPrompt 中 "Step1搭配参考:" 后面的内容） */
  matchingReference: string;
  /** 服饰描述（step1OutfitModules 的 subjectName + \n + subjectDescription，多个用 \n\n 分隔） */
  outfitDescription: string;
  /** 服饰风格（step1OutfitModules 中 mainImage.clothingStyle 数组，去重） */
  clothingStyles: string[];
  /** 服饰单品列表 */
  clothingItems: ClothingItem[];
  /** 角色性别（从 step1RoleDirectionCards 获取） */
  gender: "male" | "female" | "uncertain";
  /** 角色年龄（从 step1RoleDirectionCards 获取） */
  age: number | null;
  /** 风格词（从 step1RoleDirectionCards 获取） */
  styleWords: string[];
}

/**
 * 从 projectData 中提取 Step1 上下文
 *
 * 数据来源示例：
 * - step1HiddenRoleSettingPrompt: "后续定妆整体提示词: fresh and bright，Asian，女，16岁...\nStep1搭配参考: Full-body fashion..."
 * - step1OutfitModules: [{ subjectName, subjectDescription, mainImage: { clothingStyle: [] } }]
 * - step1RoleDirectionCards: [{ gender, age, styleWords, ... }]
 * - step1SelectedRoleDirectionId: 选中的角色方向 ID
 *
 * @param projectData 工作流状态中的 projectData 对象
 */
export function extractStep1Context(
  projectData: Record<string, unknown> | null | undefined,
): Step1Context {
  const result: Step1Context = {
    characterDescription: "",
    matchingReference: "",
    outfitDescription: "",
    clothingStyles: [],
    clothingItems: [],
    gender: "uncertain",
    age: null,
    styleWords: [],
  };

  if (!projectData) {
    return result;
  }

  // 1. 提取 step1HiddenRoleSettingPrompt
  const hiddenPrompt = projectData.step1HiddenRoleSettingPrompt;
  if (typeof hiddenPrompt === "string") {
    // 提取角色描述：后续定妆整体提示词: 和 \nStep1搭配参考: 之间的内容
    const descMatch = hiddenPrompt.match(/后续定妆整体提示词\s*[：:]\s*(.+?)(?:\n\s*Step1搭配参考|$)/u);
    if (descMatch) {
      result.characterDescription = descMatch[1].trim();
    }

    // 提取搭配参考：Step1搭配参考: 后面的内容
    const refMatch = hiddenPrompt.match(/Step1搭配参考\s*[：:]\s*(.+)$/u);
    if (refMatch) {
      result.matchingReference = refMatch[1].trim();
    }
  }

  // 2. 从 step1RoleDirectionCards + step1SelectedRoleDirectionId 获取精准角色信息
  const selectedId = projectData.step1SelectedRoleDirectionId;
  const cards = projectData.step1RoleDirectionCards;
  if (typeof selectedId === "string" && Array.isArray(cards)) {
    const selectedCard = cards.find(
      (c: Record<string, unknown>) => c.directionId === selectedId
    );
    if (selectedCard) {
      // 提取性别
      const cardGender = (selectedCard as Record<string, unknown>).gender;
      result.gender =
        cardGender === "male" || cardGender === "female"
          ? cardGender
          : "uncertain";

      // 提取年龄
      const cardAge = (selectedCard as Record<string, unknown>).age;
      result.age = typeof cardAge === "number" ? cardAge : null;

      // 提取风格词
      const cardStyleWords = (selectedCard as Record<string, unknown>).styleWords;
      if (Array.isArray(cardStyleWords)) {
        result.styleWords = cardStyleWords.filter(
          (s): s is string => typeof s === "string" && s.trim().length > 0
        );
      }
    }
  }

  // 3. 提取 step1OutfitModules
  const modules = projectData.step1OutfitModules;
  if (Array.isArray(modules) && modules.length > 0) {
    const styles: string[] = [];
    const clothingItems: ClothingItem[] = [];
    const outfitParts: string[] = [];

    for (const module of modules) {
      const mod = module as Record<string, unknown>;

      // 提取 subjectName 和 subjectDescription
      const subjectName = typeof mod.subjectName === "string" ? mod.subjectName : "";
      const subjectDesc = typeof mod.subjectDescription === "string" ? mod.subjectDescription : "";
      const subjectType = typeof mod.subjectType === "string" ? mod.subjectType : "";

      if (subjectName || subjectDesc) {
        outfitParts.push([subjectName, subjectDesc].filter(Boolean).join("\n"));
      }

      // 提取 clothingStyle（从 mainImage）
      const mainImage = mod.mainImage as Record<string, unknown> | null | undefined;
      if (mainImage) {
        // 提取风格
        const clothingStyle = mainImage.clothingStyle;
        if (Array.isArray(clothingStyle)) {
          for (const s of clothingStyle) {
            if (typeof s === "string" && s.trim()) {
              styles.push(s.trim());
            }
          }
        }

        // 提取服饰单品信息
        const clothingTitle =
          typeof mainImage.clothingTitle === "string"
            ? mainImage.clothingTitle
            : subjectName;
        const clothingDescription =
          typeof mainImage.clothingDescription === "string"
            ? mainImage.clothingDescription
            : subjectDesc;
        const classification = mainImage.classification as Record<string, unknown> | null;

        // 从 classification 或 mainImage 获取风格
        const itemStyles: string[] = [];
        const styleSource = classification?.clothingStyle ?? clothingStyle;
        if (Array.isArray(styleSource)) {
          for (const s of styleSource) {
            if (typeof s === "string" && s.trim()) {
              itemStyles.push(s.trim());
            }
          }
        }

        if (clothingTitle) {
          clothingItems.push({
            type: subjectType || "unknown",
            name: clothingTitle,
            description: clothingDescription || "",
            styles: itemStyles,
          });
        }
      }

      // 提取 clothingStyle（从 otherViews）
      const otherViews = mod.otherViews;
      if (Array.isArray(otherViews)) {
        for (const view of otherViews) {
          const v = view as Record<string, unknown>;
          if (Array.isArray(v.clothingStyle)) {
            for (const s of v.clothingStyle) {
              if (typeof s === "string" && s.trim()) {
                styles.push(s.trim());
              }
            }
          }
        }
      }
    }

    result.outfitDescription = outfitParts.join("\n\n");
    result.clothingStyles = [...new Set(styles)];
    result.clothingItems = clothingItems;
  }

  return result;
}