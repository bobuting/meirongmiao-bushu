/**
 * Step3 场景化种草脚本生成 - LLM Prompt 构建
 * 提示词内容通过提示词管理系统（DB 模板 custom_scenario_script_generation）统一管理
 * 本文件只负责构建变量数据
 */

import type {
  CustomScriptScenario,
  DiversityCombination,
  FiveDimensionHotTrends,
  DirectorPersona,
  StoryConcept,
} from "./types.js";
import type { CharacterDirectionInfo } from "../shared/character-prompt-builder.js";
import { skillLoader } from "../../../services/skills/index.js";

/** 提示词模板 code */
const PROMPT_CODE_CUSTOM_SCRIPT = "custom_scenario_script_generation";

/** 随机种子帮助函数 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 生成随机多样性组合 */
export function generateRandomDiversityCombination(): DiversityCombination {
  return {
    narrativeStructure: pickRandom([
      "倒叙", "多线叙事", "开放式结局", "碎片化蒙太奇", "反转式",
      "悬念递进", "静默叙事", "一镜到底", "循环叙事", "对比平行", "误会递进",
    ] as const),
    characterRelationship: pickRandom([
      "单人", "双人互动", "与陌生人互动", "与动物互动", "自我对话",
      "亲子互动", "闺蜜互动", "情侣互动", "群像",
    ] as const),
    coreEmotion: pickRandom([
      "温暖治愈", "俏皮轻快", "文艺伤感", "神秘悬念", "励志向上",
      "苦涩甜蜜", "荒诞幽默", "燃感热血", "惬意慵懒", "感伤怀旧",
    ] as const),
    visualStyle: pickRandom([
      "日系清新", "胶片复古", "极简现代", "梦幻柔焦", "纪实抓拍",
      "赛博朋克", "暗黑美学", "国风雅致", "电影感调色", "Lo-fi低保真",
    ] as const),
    sceneStrategy: pickRandom([
      "单一场景+时间变化", "多场景叙事", "连续动作跨场景", "虚实结合（梦境/回忆）",
      "固定机位+时间压缩", "跟随式长镜头", "对比场景切换", "季节/时段流转",
    ] as const),
    openingStyle: pickRandom([
      "声音先入", "特写细节", "全景环境", "黑屏字幕", "悬念空镜",
      "动作冲击", "倒叙高潮", "对白切入", "字幕独白",
    ] as const),
    endingStyle: pickRandom([
      "开放式", "反转", "定格", "诗意留白", "首尾呼应",
      "情绪升华", "彩蛋揭示", "打破第四面墙",
    ] as const),
  };
}

/** 热点描述（供 concept-generator 复用） */
export function buildHotTrendDescription(hotTrends: FiveDimensionHotTrends): string {
  const parts: string[] = [];
  if (hotTrends.festival?.length) parts.push(`节日/节气：${hotTrends.festival.join("、")}`);
  if (hotTrends.entertainment?.length) parts.push(`影视/音乐：${hotTrends.entertainment.join("、")}`);
  if (hotTrends.socialEmotion?.length) parts.push(`社会情绪：${hotTrends.socialEmotion.join("、")}`);
  if (hotTrends.challenge?.length) parts.push(`挑战/玩法：${hotTrends.challenge.join("、")}`);
  if (hotTrends.crossover?.length) parts.push(`跨界融合：${hotTrends.crossover.join("、")}`);
  return parts.length > 0 ? parts.join("\n") : "无特定热点，请自由创作";
}

/**
 * 从提示词管理系统加载系统/用户提示词（阶段2：完整脚本扩写）
 * 系统提示词（规则）和输出格式由 DB 模板管理
 * 用户提示词传变量参数：概念 + 导演人格 + 金标样本 + 多样性组合
 */
export async function loadCustomScriptPrompt(input: {
  scenario: CustomScriptScenario;
  diversity: DiversityCombination;
  hotTrends: FiveDimensionHotTrends;
  outfitDescription?: string;
  characterDescription?: string;
  userKeywords?: string[];
  matchingReference?: string;
  clothingStyles?: string[];
  selectedRoleDirection?: CharacterDirectionInfo | null;
  /** 阶段1生成的故事概念 */
  concept?: StoryConcept | null;
  /** 导演人格 */
  directorPersona?: DirectorPersona | null;
  /** 金标样本格式化文本 */
  goldenExamplesText?: string | null;
  /** 角色性别 */
  characterGender?: "male" | "female" | "uncertain";
  /** 场景库+硬编码合并后的推荐场景文本 */
  recommendedScenes?: string;
}): Promise<{ systemPrompt: string; userPrompt: string }> {
  const { scenario, diversity, hotTrends, outfitDescription, characterDescription, userKeywords, matchingReference, clothingStyles, selectedRoleDirection, concept, directorPersona, goldenExamplesText, characterGender, recommendedScenes } = input;

  const hotTrendText = buildHotTrendDescription(hotTrends);

  const keywordHint = userKeywords?.length
    ? userKeywords.join("、")
    : undefined;

  const { system, user } = await skillLoader.render(PROMPT_CODE_CUSTOM_SCRIPT, {
    variables: {
      characterGender,
      characterDescription,
      outfitDescription,
      matchingReference,
      clothingStyles,
      selectedRoleDirection,
      hotTrendText,
      concept,
      directorPersona,
      goldenExamplesText,
      scenario,
      diversity,
      keywordHint,
      recommendedScenes,
    },
  });
  return { systemPrompt: system, userPrompt: user };
}