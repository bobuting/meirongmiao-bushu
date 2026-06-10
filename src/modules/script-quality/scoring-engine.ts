/**
 * 脚本质量评分引擎
 *
 * 从 script-effectiveness/generator.ts 提取的三视角评分逻辑，
 * 支持独立异步调用。评分维度：观众（吸引力）、编导（可执行性）、策略师（传播潜力）。
 *
 * 【策略差异化评分】
 * 不同脚本类型有不同的核心质量标准，通过 STRATEGY_SCORING_CONFIG 配置专属评分维度：
 * - product_showcase: 产品展示力 + 编导可执行性 + 视觉冲击力
 * - fashion: 视觉美学 + 编导可执行性 + 高级感呈现
 * - 其他策略: 使用通用三视角评分（观众/编导/策略师）
 */

import type { ScoringEngineDeps, PerspectiveResult, QualityScoreRecord, ScoringJobInput } from "./scoring-types.js";
import type { ScoringStrategy } from "./scoring-types.js";
import type { AppContext } from "../../core/app-context.js";
import type { ProviderRouteKey } from "../../contracts/provider-route-policy-contract.js";
import { getLogger } from "../../core/logger/index.js";
import { skillLoader } from "../../services/skills/index.js";
import { requestLlmPlainTextWithMetadata } from "../../services/llm/llm-transport.js";

const logger = getLogger("script-quality-scoring-engine");

const SKILL_CODE_SCRIPT_QUALITY_SCORING = "script_quality_scoring";

// ==================== 策略差异化评分配置 ====================

/** 通用三视角评分提示词 */
const VIEWER_PERSPECTIVE_PROMPT = `你从【观众吸引力】视角评估。逐项检查以下扣分点：
①前3秒是否有强视觉冲击或悬念（无则扣15分）；
②情绪弧线是否有明确递进和高潮（平铺扣10分）；
③是否有让观众想转发/评论的触发点（无扣10分）；
④受众定位是否精准到具体人群而非泛泛的"年轻人"（泛定位扣8分）。
strengths 只写确实超出预期的点，weaknesses 必须包含所有触发的扣分项。`;

const DIRECTOR_PERSPECTIVE_PROMPT = `你从【编导可执行性】视角评估。逐项检查以下扣分点：
①每个分镜的场景和动作是否可实际拍摄（不可执行扣10分）；
②分镜之间转场是否有逻辑衔接（突兀扣5分）；
③镜头数量与时长是否匹配（15-30秒需4-8镜头，不匹配扣5分）；
④是否有技术术语或抽象描述替代了可拍摄画面（有则扣10分）。
strengths 只写确实超出预期的点，weaknesses 必须包含所有触发的扣分项。`;

const STRATEGIST_PERSPECTIVE_PROMPT = `你从【策略传播力】视角评估。逐项检查以下扣分点：
①是否有明确的二次传播触发点——话题标签/互动梗/金句（无扣10分）；
②内容是否适配目标平台的传播机制（不适配扣8分）；
③是否有引导用户行动的钩子——关注/收藏/评论引导（无扣8分）；
④品牌/产品植入是否自然不生硬（生硬扣10分）。
strengths 只写确实超出预期的点，weaknesses 必须包含所有触发的扣分项。`;

/** Product Showcase 专属评分提示词 */
const PRODUCT_SHOWCASE_POWER_PROMPT = `你从【产品展示力】视角评估。这是电商带货脚本，服饰就是展示目的。逐项检查以下扣分点：
①是否有多角度覆盖——全身/半身/细节特写至少各出现一次（缺失扣12分）；
②是否有明确的产品卖点展示——弹性/垂感/版型/百搭等卖点是否在动作中体现（无扣10分）；
③是否有细节特写镜头展示面料/质感/工艺（无扣8分）；
④是否有引导用户购买的钩子——价格暗示/限时优惠/穿搭建议（无扣8分）；
⑤动作是否自然展示服饰特点而非机械摆拍（生硬扣10分）。
strengths 只写确实超出预期的展示亮点，weaknesses 必须包含所有触发的扣分项。`;

const VISUAL_IMPACT_PROMPT = `你从【视觉冲击力】视角评估。逐项检查以下扣分点：
①前3秒是否有强视觉冲击——产品出镜/动作吸引/画面美感（无扣15分）；
②画面色彩搭配是否协调且有吸引力（杂乱扣8分）；
③镜头切换节奏是否流畅且有节奏感（突兀扣5分）；
④是否有"爆款画面"潜力——高颜值/强对比/独特构图（无扣10分）。
strengths 只写确实超出预期的视觉亮点，weaknesses 必须包含所有触发的扣分项。`;

/** Fashion 专属评分提示词 */
const FASHION_AESTHETICS_PROMPT = `你从【视觉美学】视角评估。这是时尚大片脚本，追求高级感和视觉美感。逐项检查以下扣分点：
①镜头语言是否高级——运镜流畅/构图考究/景别丰富（平庸扣12分）；
②色调搭配是否有设计感——主色调统一/辅助色点缀/氛围感强（杂乱扣10分）；
③画面是否有"大片感"——模特表现力/场景选择/光影质感（无扣10分）；
④是否避免廉价感——避免过度曝光/俗套构图/土味滤镜（有扣8分）。
strengths 只写确实超出预期的美学亮点，weaknesses 必须包含所有触发的扣分项。`;

const FASHION_PREMIUM_PROMPT = `你从【高级感呈现】视角评估。逐项检查以下扣分点：
①整体氛围是否传达品牌调性——简约/优雅/前卫/复古等风格明确（模糊扣10分）；
②模特表现是否专业——姿态/表情/眼神有张力（业余扣8分）；
③服饰展示是否突出设计亮点——剪裁/细节/搭配清晰可见（无扣10分）；
④节奏是否从容不急躁——避免快切/堆砌/过度特效（急躁扣8分）。
strengths 只写确实超出预期的高级感亮点，weaknesses 必须包含所有触发的扣分项。`;

/** Effectiveness 专属评分提示词 */
const EFFECTIVENESS_PRESENTATION_PROMPT = `你从【展示效果力】视角评估。这是效果导向脚本，追求视觉驱动的展示效果。逐项检查以下扣分点：
①展示类型是否明确体现——OOTD/生活方式/Lookbook/旅行探店/对比测评/穿搭变身（模糊扣12分）；
②服饰是否成为画面视觉焦点——服装占比合理/不被场景淹没/突出展示（无扣10分）；
③展示节奏是否匹配类型——OOTD需快节奏/Lookbook需慢节奏/测评需对比节奏（不匹配扣8分）；
④是否有视觉冲击的"高光时刻"——转身展示/对比切换/穿搭变身瞬间（无扣10分）；
⑤是否避免"只看人不见衣"——人物不过度抢镜/服饰始终是主角（人物抢镜扣8分）。
strengths 只写确实超出预期的展示效果亮点，weaknesses 必须包含所有触发的扣分项。`;

const EFFECTIVENESS_ATTRACTION_PROMPT = `你从【视觉吸引力】视角评估。逐项检查以下扣分点：
①前3秒是否有明确视觉锚点——服饰出镜/风格展示/场景吸引（无扣12分）；
②画面是否有"忍不住看"的吸引力——色彩对比/人物颜值/构图张力（平庸扣10分）；
③节奏是否有节奏感——快慢交替/镜头切换流畅/无拖沓感（拖沓扣8分）；
④是否有让观众想模仿的触发点——穿搭好看/展示方式有趣/场景想尝试（无扣10分）。
strengths 只写确实超出预期的视觉吸引亮点，weaknesses 必须包含所有触发的扣分项。`;

/** Aesthetic 专属评分提示词 */
const AESTHETIC_ATMOSPHERE_PROMPT = `你从【生活氛围营造】视角评估。这是生活美学脚本，追求"服饰是美好生活的一部分"。逐项检查以下扣分点：
①生活场景是否有真实感——居家/咖啡馆/书店/阳台等场景是否真实可信（虚假扣12分）；
②氛围感是否有情感共鸣——温馨/治愈/文艺/舒适等情绪是否传达（无扣10分）；
③服饰是否自然融入场景——不刻意展示/自然出现在生活场景中（生硬扣8分）；
④是否有"想这样生活"的向往感——生活方式吸引/场景想体验/氛围想拥有（无扣10分）；
⑤节奏是否从容舒缓——慢节奏/无急促感/让人放松（急躁扣8分）。
strengths 只写确实超出预期的生活氛围亮点，weaknesses 必须包含所有触发的扣分项。`;

const AESTHETIC_BALANCE_PROMPT = `你从【平衡展示度】视角评估。逐项检查以下扣分点：
①情感叙事与服饰展示是否平衡——既不忽略服饰也不忽略情感（失衡扣12分）；
②服饰是主角还是配角定位是否明确——定位模糊扣8分；
③是否有服饰与生活的融合叙事——服饰出现在生活情节中（生硬扣10分）；
④是否避免"只有展示没有生活"——纯展示脚本扣10分；
⑤是否避免"只有生活没有服饰"——服饰完全不出现扣10分。
strengths 只写确实超出预期的平衡展示亮点，weaknesses 必须包含所有触发的扣分项。`;

/** Custom 专属评分提示词 */
const CUSTOM_EMOTION_PROMPT = `你从【情感共鸣力】视角评估。这是场景化种草脚本，追求情感驱动的种草效果。逐项检查以下扣分点：
①场景是否有代入感——日常Vlog/情侣闺蜜/旅行探店等场景是否真实可信（虚假扣12分）；
②情感叙事是否有共鸣——甜蜜/治愈/友情/亲情等情感是否传达（无扣10分）；
③服饰是否出现在情感关键节点——重要时刻穿重要衣服（无关联扣8分）；
④是否有"我也想这样穿"的种草感——穿搭好看+场景匹配（无扣10分）；
⑤叙事是否自然不刻意——避免硬植入/保持叙事流畅（生硬扣8分）。
strengths 只写确实超出预期的情感共鸣亮点，weaknesses 必须包含所有触发的扣分项。`;

const CUSTOM_MATCH_PROMPT = `你从【场景匹配度】视角评估。逐项检查以下扣分点：
①服饰风格是否匹配场景——场景风格与服装风格一致（不匹配扣10分）；
②服饰是否适配人物关系——情侣装/闺蜜装/亲子装等关系体现（无体现扣8分）；
③服饰是否适配场景氛围——咖啡馆文艺装/办公室通勤装/户外休闲装（不适配扣8分）；
④服饰是否出现在合适的场景节点——场景切换时服装变化合理（不合理扣10分）；
⑤场景是否真实可体验——不虚构场景/使用真实生活场景（虚构扣8分）。
strengths 只写确实超出预期的场景匹配亮点，weaknesses 必须包含所有触发的扣分项。`;

/** Emotion Archetype 专属评分提示词 */
const EMOTION_MATCH_PROMPT = `你从【情感原型匹配】视角评估。这是情感原型驱动脚本，追求情感原型的一致性表达。逐项检查以下扣分点：
①情感原型是否明确体现——成长蜕变/浪漫邂逅/温暖治愈等原型是否清晰（模糊扣12分）；
②情绪弧线是否符合原型模式——原型规定的情绪起点/高潮/终点是否体现（不符合扣10分）；
③关键情节是否匹配原型——原型规定的关键情节点是否出现（缺失扣8分）；
④服饰是否在情感关键节点出现——重要情感时刻服饰有戏份（无关联扣10分）；
⑤情感表达是否真实不虚假——避免过度戏剧化/保持真实感（虚假扣8分）。
strengths 只写确实超出预期的情感原型匹配亮点，weaknesses 必须包含所有触发的扣分项。`;

const EMOTION_ARC_PROMPT = `你从【情绪弧线表达】视角评估。逐项检查以下扣分点：
①情绪起点是否明确——开场的情绪状态是否清晰（模糊扣10分）；
②情绪高潮是否有张力——高潮时刻的情绪是否有冲击力（平淡扣12分）；
③情绪终点是否有收束——结尾的情绪是否合理收束（无收束扣8分）；
④情绪递进是否有节奏——情绪变化有节奏/无突兀跳跃（突兀扣8分）；
⑤服饰是否参与情绪表达——服饰变化体现情绪变化（无参与扣10分）。
strengths 只写确实超出预期的情绪弧线表达亮点，weaknesses 必须包含所有触发的扣分项。`;

/** Story Theme 专属评分提示词 */
const PLOT_QUALITY_PROMPT = `你从【剧情质量】视角评估。这是主题叙事脚本，必须讲述一个有内容剧情的完整故事。逐项检查以下扣分点：
①是否有具体的剧情事件——事件是"发生了什么"而非"感觉到了什么"（无具体事件扣15分）；
②事件之间是否有因果关系——前因后果清晰/不是随机拼接（无因果扣12分）；
③角色是否有前后状态变化——开头和结尾角色状态不同（无变化扣10分）；
④故事是否有完整的起承转合——起因/转折/高潮/结局齐全（缺失扣8分）；
⑤删除任何一个镜头故事是否就不完整——每个镜头都推动剧情（可有可无扣8分）。
strengths 只写确实超出预期的剧情亮点，weaknesses 必须包含所有触发的扣分项。`;

const EVENT_CHAIN_CONSISTENCY_PROMPT = `你从【事件链一致性】视角评估。逐项检查以下扣分点：
①镜头顺序是否遵循事件因果链——前一个镜头的结果推动后一个（断裂扣12分）；
②每个镜头是否服务于一个具体事件——没有无目的的镜头（无目的扣10分）；
③角色造型是否随状态变化——服装配合角色当前状态（脱节扣8分）；
④事件链是否围绕核心冲突——所有事件服务于同一个冲突（偏离扣10分）；
⑤故事是否有社会共鸣——主题贴近社会情绪/有传播潜力（无共鸣扣8分）。
strengths 只写确实超出预期的事件链亮点，weaknesses 必须包含所有触发的扣分项。`;

const STORY_THEME_DIRECTOR_PROMPT = `你从【编导可执行性】视角评估。这是主题叙事脚本（20-60秒/4-12镜头）。逐项检查以下扣分点：
①每个分镜的场景和动作是否可实际拍摄（不可执行扣10分）；
②分镜之间转场是否有因果逻辑衔接（突兀扣5分）；
③镜头数量与时长是否匹配（20-60秒需4-12镜头，不匹配扣5分）；
④是否有技术术语或抽象描述替代了可拍摄画面（有则扣10分）。
strengths 只写确实超出预期的点，weaknesses 必须包含所有触发的扣分项。`;

/** 策略评分配置：每种脚本类型的专属评分维度和权重 */
interface PerspectiveConfig {
  name: string; // 视角标识（用于数据库存储）
  weight: number; // 权重（0-1）
  promptTemplate: string; // 评分提示词模板
  skillVariables: Record<string, string>; // Skill 模板变量映射
}

interface StrategyScoringConfig {
  perspectives: PerspectiveConfig[];
  // 视角名称映射到数据库字段（用于兼容现有字段结构）
  perspectiveFieldMap: Record<string, string>;
}

const STRATEGY_SCORING_CONFIG: Record<ScoringStrategy, StrategyScoringConfig> = {
  // Product Showcase: 产品展示力(40%) + 编导可执行性(30%) + 视觉冲击力(30%)
  product_showcase: {
    perspectives: [
      {
        name: "product_showcase_power",
        weight: 0.4,
        promptTemplate: PRODUCT_SHOWCASE_POWER_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
      {
        name: "director_executability",
        weight: 0.3,
        promptTemplate: DIRECTOR_PERSPECTIVE_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", videoStyle: "videoStyle", scriptContent: "scriptContent" },
      },
      {
        name: "visual_impact",
        weight: 0.3,
        promptTemplate: VISUAL_IMPACT_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
    ],
    perspectiveFieldMap: {
      product_showcase_power: "viewerScore", // 映射到 viewerScore 字段（语义为产品展示力）
      director_executability: "directorScore",
      visual_impact: "strategistScore", // 映射到 strategistScore 字段（语义为视觉冲击力）
    },
  },

  // Fashion: 视觉美学(40%) + 编导可执行性(25%) + 高级感呈现(35%)
  fashion: {
    perspectives: [
      {
        name: "visual_aesthetics",
        weight: 0.4,
        promptTemplate: FASHION_AESTHETICS_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
      {
        name: "director_executability",
        weight: 0.25,
        promptTemplate: DIRECTOR_PERSPECTIVE_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", videoStyle: "videoStyle", scriptContent: "scriptContent" },
      },
      {
        name: "premium_feeling",
        weight: 0.35,
        promptTemplate: FASHION_PREMIUM_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
    ],
    perspectiveFieldMap: {
      visual_aesthetics: "viewerScore", // 映射到 viewerScore 字段（语义为视觉美学）
      director_executability: "directorScore",
      premium_feeling: "strategistScore", // 映射到 strategistScore 字段（语义为高级感呈现）
    },
  },

  // 其他策略：使用通用三视角评分
  library: {
    perspectives: [
      { name: "viewer", weight: 0.3, promptTemplate: VIEWER_PERSPECTIVE_PROMPT, skillVariables: { scriptTitle: "scriptTitle", scriptSummary: "scriptSummary", scriptContent: "scriptContent" } },
      { name: "director", weight: 0.3, promptTemplate: DIRECTOR_PERSPECTIVE_PROMPT, skillVariables: { scriptTitle: "scriptTitle", videoStyle: "videoStyle", scriptContent: "scriptContent" } },
      { name: "strategist", weight: 0.4, promptTemplate: STRATEGIST_PERSPECTIVE_PROMPT, skillVariables: { scriptTitle: "scriptTitle", videoType: "videoType", videoStyle: "videoStyle", scriptContent: "scriptContent" } },
    ],
    perspectiveFieldMap: { viewer: "viewerScore", director: "directorScore", strategist: "strategistScore" },
  },
  video: {
    perspectives: [
      { name: "viewer", weight: 0.3, promptTemplate: VIEWER_PERSPECTIVE_PROMPT, skillVariables: { scriptTitle: "scriptTitle", scriptSummary: "scriptSummary", scriptContent: "scriptContent" } },
      { name: "director", weight: 0.3, promptTemplate: DIRECTOR_PERSPECTIVE_PROMPT, skillVariables: { scriptTitle: "scriptTitle", videoStyle: "videoStyle", scriptContent: "scriptContent" } },
      { name: "strategist", weight: 0.4, promptTemplate: STRATEGIST_PERSPECTIVE_PROMPT, skillVariables: { scriptTitle: "scriptTitle", videoType: "videoType", videoStyle: "videoStyle", scriptContent: "scriptContent" } },
    ],
    perspectiveFieldMap: { viewer: "viewerScore", director: "directorScore", strategist: "strategistScore" },
  },
  realtime: {
    perspectives: [
      { name: "viewer", weight: 0.3, promptTemplate: VIEWER_PERSPECTIVE_PROMPT, skillVariables: { scriptTitle: "scriptTitle", scriptSummary: "scriptSummary", scriptContent: "scriptContent" } },
      { name: "director", weight: 0.3, promptTemplate: DIRECTOR_PERSPECTIVE_PROMPT, skillVariables: { scriptTitle: "scriptTitle", videoStyle: "videoStyle", scriptContent: "scriptContent" } },
      { name: "strategist", weight: 0.4, promptTemplate: STRATEGIST_PERSPECTIVE_PROMPT, skillVariables: { scriptTitle: "scriptTitle", videoType: "videoType", videoStyle: "videoStyle", scriptContent: "scriptContent" } },
    ],
    perspectiveFieldMap: { viewer: "viewerScore", director: "directorScore", strategist: "strategistScore" },
  },

  // Effectiveness: 展示效果力(35%) + 编导可执行性(30%) + 视觉吸引力(35%)
  effectiveness: {
    perspectives: [
      {
        name: "presentation_effect",
        weight: 0.35,
        promptTemplate: EFFECTIVENESS_PRESENTATION_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
      {
        name: "director_executability",
        weight: 0.3,
        promptTemplate: DIRECTOR_PERSPECTIVE_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", videoStyle: "videoStyle", scriptContent: "scriptContent" },
      },
      {
        name: "visual_attraction",
        weight: 0.35,
        promptTemplate: EFFECTIVENESS_ATTRACTION_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
    ],
    perspectiveFieldMap: {
      presentation_effect: "viewerScore", // 映射到 viewerScore 字段（语义为展示效果力）
      director_executability: "directorScore",
      visual_attraction: "strategistScore", // 映射到 strategistScore 字段（语义为视觉吸引力）
    },
  },

  // Custom: 情感共鸣力(35%) + 编导可执行性(25%) + 场景匹配度(40%)
  custom: {
    perspectives: [
      {
        name: "emotion_resonance",
        weight: 0.35,
        promptTemplate: CUSTOM_EMOTION_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
      {
        name: "director_executability",
        weight: 0.25,
        promptTemplate: DIRECTOR_PERSPECTIVE_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", videoStyle: "videoStyle", scriptContent: "scriptContent" },
      },
      {
        name: "scene_matching",
        weight: 0.4,
        promptTemplate: CUSTOM_MATCH_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
    ],
    perspectiveFieldMap: {
      emotion_resonance: "viewerScore", // 映射到 viewerScore 字段（语义为情感共鸣力）
      director_executability: "directorScore",
      scene_matching: "strategistScore", // 映射到 strategistScore 字段（语义为场景匹配度）
    },
  },

  // Emotion Archetype: 情感原型匹配(40%) + 编导可执行性(25%) + 情绪弧线表达(35%)
  emotion_archetype: {
    perspectives: [
      {
        name: "archetype_matching",
        weight: 0.4,
        promptTemplate: EMOTION_MATCH_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
      {
        name: "director_executability",
        weight: 0.25,
        promptTemplate: DIRECTOR_PERSPECTIVE_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", videoStyle: "videoStyle", scriptContent: "scriptContent" },
      },
      {
        name: "emotion_arc_expression",
        weight: 0.35,
        promptTemplate: EMOTION_ARC_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
    ],
    perspectiveFieldMap: {
      archetype_matching: "viewerScore", // 映射到 viewerScore 字段（语义为情感原型匹配）
      director_executability: "directorScore",
      emotion_arc_expression: "strategistScore", // 映射到 strategistScore 字段（语义为情绪弧线表达）
    },
  },

  // Aesthetic: 生活氛围营造(35%) + 编导可执行性(30%) + 平衡展示度(35%)
  aesthetic: {
    perspectives: [
      {
        name: "life_atmosphere",
        weight: 0.35,
        promptTemplate: AESTHETIC_ATMOSPHERE_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
      {
        name: "director_executability",
        weight: 0.3,
        promptTemplate: DIRECTOR_PERSPECTIVE_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", videoStyle: "videoStyle", scriptContent: "scriptContent" },
      },
      {
        name: "balance_presentation",
        weight: 0.35,
        promptTemplate: AESTHETIC_BALANCE_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
    ],
    perspectiveFieldMap: {
      life_atmosphere: "viewerScore", // 映射到 viewerScore 字段（语义为生活氛围营造）
      director_executability: "directorScore",
      balance_presentation: "strategistScore", // 映射到 strategistScore 字段（语义为平衡展示度）
    },
  },

  // Story Theme: 剧情质量(40%) + 编导可执行性(25%) + 事件链一致性(35%)
  story_theme: {
    perspectives: [
      {
        name: "plot_quality",
        weight: 0.4,
        promptTemplate: PLOT_QUALITY_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
      {
        name: "director_executability",
        weight: 0.25,
        promptTemplate: STORY_THEME_DIRECTOR_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", videoStyle: "videoStyle", scriptContent: "scriptContent" },
      },
      {
        name: "event_chain_consistency",
        weight: 0.35,
        promptTemplate: EVENT_CHAIN_CONSISTENCY_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
    ],
    perspectiveFieldMap: {
      plot_quality: "viewerScore", // 映射到 viewerScore 字段（语义为剧情质量）
      director_executability: "directorScore",
      event_chain_consistency: "strategistScore", // 映射到 strategistScore 字段（语义为事件链一致性）
    },
  },
  // Resonance: 剧情质量(50%) + 编导可执行性(50%)
  resonance: {
    perspectives: [
      {
        name: "viewer_engagement",
        weight: 0.5,
        promptTemplate: PLOT_QUALITY_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
      },
      {
        name: "director_executability",
        weight: 0.5,
        promptTemplate: DIRECTOR_PERSPECTIVE_PROMPT,
        skillVariables: { scriptTitle: "scriptTitle", videoStyle: "videoStyle", scriptContent: "scriptContent" },
      },
    ],
    perspectiveFieldMap: {
      viewer_engagement: "viewerScore",
      director_executability: "directorScore",
    },
  },
};

/**
 * 对一条脚本执行完整质量评分
 *
 * 流程：规则评估（即时）→ 根据策略配置执行 LLM 视角并行评估 → 加权综合
 * 如果所有 LLM 评估失败，降级为纯规则评分。
 *
 * 【策略差异化评分】
 * 根据 input.strategy 从 STRATEGY_SCORING_CONFIG 获取专属评分配置：
 * - product_showcase: 使用产品展示力/视觉冲击力等专属维度
 * - fashion: 使用视觉美学/高级感呈现等专属维度
 * - 其他策略: 使用通用三视角评分
 */
export async function scoreScript(
  input: ScoringJobInput,
  deps: ScoringEngineDeps,
  ctx: AppContext,
  routeKey: ProviderRouteKey,
): Promise<QualityScoreRecord> {
  const startedAt = Date.now();

  // 规则评分（不依赖 LLM）
  const ruleResult = ruleBasedScore(input);

  // 获取策略配置
  const strategyConfig = STRATEGY_SCORING_CONFIG[input.strategy];

  // 根据策略配置执行 LLM 视角并行评估
  const perspectivePromises = strategyConfig.perspectives.map((perspective) =>
    evaluatePerspective(input, perspective, ctx, routeKey),
  );

  const settledResults = await Promise.allSettled(perspectivePromises);

  const perspectives: PerspectiveResult[] = settledResults
    .map((r) => {
      if (r.status !== "fulfilled" || !r.value) return null;
      return r.value;
    })
    .filter((r): r is PerspectiveResult => r !== null);

  // 综合：有 LLM 结果时按策略配置加权合成，否则用规则评分
  const hasLlmScores = perspectives.length > 0;

  let score: number;
  let scoreSpread: number | null = null;

  if (hasLlmScores) {
    // 使用策略配置中的权重进行加权合成
    let totalWeight = 0;
    let weightedSum = 0;
    for (const r of perspectives) {
      const perspectiveConfig = strategyConfig.perspectives.find((p) => p.name === r.perspective);
      const w = perspectiveConfig?.weight ?? 0.33;
      weightedSum += r.score * w;
      totalWeight += w;
    }
    score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : ruleResult.score;

    const scores = perspectives.map((r) => r.score);
    scoreSpread = Math.max(...scores) - Math.min(...scores);
  } else {
    score = ruleResult.score;
  }

  const allStrengths = [...new Set(perspectives.flatMap((r) => r.strengths))];
  const allWeaknesses = [...new Set(perspectives.flatMap((r) => r.weaknesses))];
  const allSuggestions = [...new Set(perspectives.flatMap((r) => r.suggestions))];

  // 视角分歧过大时记录为弱点
  if (scoreSpread !== null && scoreSpread > 25 && perspectives.length >= 2) {
    const scores = perspectives.map((r) => r.score);
    allWeaknesses.push(`各视角分歧较大（最高${Math.max(...scores)}分 vs 最低${Math.min(...scores)}分）`);
  }

  // 根据策略配置的 perspectiveFieldMap 映射到数据库字段
  const perspectiveScores: Record<string, number | null> = {};
  for (const r of perspectives) {
    const fieldName = strategyConfig.perspectiveFieldMap[r.perspective];
    if (fieldName) {
      perspectiveScores[fieldName] = r.score;
    }
  }

  const durationMs = Date.now() - startedAt;

  return {
    id: deps.generateId(),
    scriptDataId: input.scriptDataId,
    strategy: input.strategy,
    score,
    viewerScore: perspectiveScores.viewerScore ?? null,
    directorScore: perspectiveScores.directorScore ?? null,
    strategistScore: perspectiveScores.strategistScore ?? null,
    ruleBasedScore: ruleResult.score,
    scoringMethod: hasLlmScores ? "llm_multi_perspective" : "rule_based",
    strengths: allStrengths,
    weaknesses: allWeaknesses,
    suggestions: allSuggestions,
    scoreSpread,
    promptCode: input.promptCode,
    promptVersion: input.promptVersion,
    projectId: input.projectId,
    userId: input.userId ?? null,
    llmModel: null,
    durationMs,
    createdAt: Date.now(),
  };
}

// ==================== 规则评分 ====================

/** 基于规则的质量评估（不依赖 LLM），基础分与 LLM 评分锚点对齐为 70 */
function ruleBasedScore(input: ScoringJobInput): { score: number } {
  let score = 70;
  const content = input.scriptContent ?? "";

  // 加分项：脚本具备基本完整度要素
  if (input.scriptTitle && input.scriptTitle.length > 2) score += 5;
  if (content.length > 100) score += 5;
  if (content.length > 500) score += 3;
  if (input.videoStyle) score += 3;
  if (input.videoType) score += 3;
  if (input.scriptSummary && input.scriptSummary.length > 20) score += 5;
  if (content.includes("镜头") || content.includes("分镜")) score += 3;

  // 扣分项：与 LLM 评分扣分规则对齐
  if (!input.scriptTitle || input.scriptTitle.length <= 2) score -= 8;
  if (content.length <= 50) score -= 15;
  if (!input.scriptSummary || input.scriptSummary.length <= 10) score -= 8;

  return { score: Math.min(100, Math.max(0, score)) };
}

// ==================== LLM 视角评估（策略驱动） ====================

/**
 * 根据视角配置执行 LLM 评分
 * 通用评估函数，支持任意视角配置（通用视角 + 专属视角）
 */
async function evaluatePerspective(
  input: ScoringJobInput,
  perspective: PerspectiveConfig,
  ctx: AppContext,
  routeKey: ProviderRouteKey,
): Promise<PerspectiveResult | null> {
  try {
    // 构建 Skill 模板变量
    const skillVariables: Record<string, string> = {
      perspective: perspective.name,
      scriptTitle: input.scriptTitle ?? "",
      scriptContent: input.scriptContent.slice(0, 2000),
    };

    // 根据 skillVariables 配置添加额外变量
    if (perspective.skillVariables.scriptSummary) {
      skillVariables.scriptSummary = input.scriptSummary ?? "";
    }
    if (perspective.skillVariables.videoStyle) {
      skillVariables.videoStyle = input.videoStyle ?? "";
    }
    if (perspective.skillVariables.videoType) {
      skillVariables.videoType = input.videoType ?? "";
    }

    const { system, user } = await skillLoader.render(SKILL_CODE_SCRIPT_QUALITY_SCORING, skillVariables);
    const resp = await requestLlmPlainTextWithMetadata(
      { id: routeKey, vendor: "gemini", baseUrl: "", model: "", callMode: "openai" as const, timeoutMs: 60_000, secret: "" },
      system,
      user,
      0,
      {
        ctx,
        routeKey,
        businessContext: "脚本质量评分",
        userId: input.userId ?? undefined,
        projectId: input.projectId ?? undefined,
        timeoutMsOverride: 60_000,
      },
    );
    const parsed = parseQualityResponse(resp.text);
    return parsed ? { ...parsed, perspective: perspective.name } : null;
  } catch (error) {
    logger.warn({ err: error, perspective: perspective.name }, `evaluatePerspective(${perspective.name}) failed`);
    return null;
  }
}

// ==================== 响应解析 ====================

/** 解析 LLM 返回的质量评估 JSON */
function parseQualityResponse(text: string): {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
} | null {
  let jsonText = text.trim();
  if (jsonText.startsWith("```json")) jsonText = jsonText.slice(7);
  if (jsonText.startsWith("```")) jsonText = jsonText.slice(3);
  if (jsonText.endsWith("```")) jsonText = jsonText.slice(0, -3);
  jsonText = jsonText.trim();

  try {
    const parsed = JSON.parse(jsonText);
    const score = Number(parsed.score) || 50;
    return {
      score: Math.max(0, Math.min(100, score)),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    };
  } catch (error) {
    logger.warn({ err: error }, "parseQualityResponse failed");
    return null;
  }
}
