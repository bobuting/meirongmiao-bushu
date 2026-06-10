/**
 * 服饰叙事身份 — 为产品展示类策略提供身份选择
 * 每次生成随机选择一种兼容身份，注入 Skill 模板
 */

/** 叙事身份定义 */
interface NarrativeIdentity {
  key: string;
  description: string;
}

/** 5 种服饰叙事身份 */
const NARRATIVE_IDENTITIES: NarrativeIdentity[] = [
  {
    key: "角色战袍",
    description: "角色主动选择了这件衣服去面对一个具体场景/挑战。服装赋予穿着者力量和自信。",
  },
  {
    key: "关系信物",
    description: "服装是人与人之间情感关系的载体。可能是礼物、传承、默契穿搭、闺蜜同款。",
  },
  {
    key: "生活印记",
    description: "服装自然存在于角色的日常生活中，没有刻意展示的意图。观众在生活片段中「顺便」看到了衣服。",
  },
  {
    key: "身份声明",
    description: "穿上这件衣服就是在宣告「我是这样的人」。服装是态度、立场、审美的外化表达。",
  },
  {
    key: "转变触发",
    description: "换上这件衣服后，角色的状态发生了可见的变化。服装是转变的仪式感载体。",
  },
];

/**
 * 各策略兼容的身份列表
 * - product_showcase / fashion：排除"生活印记"（与"产品展示/视觉主角"定位矛盾）
 * - effectiveness：全部兼容（场景最广）
 */
const STRATEGY_COMPATIBLE_IDENTITIES: Record<string, string[]> = {
  product_showcase: ["角色战袍", "身份声明", "转变触发", "关系信物"],
  fashion: ["角色战袍", "身份声明", "转变触发", "关系信物"],
  effectiveness: ["角色战袍", "关系信物", "生活印记", "身份声明", "转变触发"],
};

/**
 * 为指定策略随机选择一个兼容的叙事身份
 * 返回格式："角色战袍 — 角色主动选择了这件衣服去面对..."
 */
export function selectNarrativeIdentity(strategy: string): string {
  const compatible = STRATEGY_COMPATIBLE_IDENTITIES[strategy] ?? NARRATIVE_IDENTITIES.map(i => i.key);
  const idx = Math.floor(Math.random() * compatible.length);
  const key = compatible[idx];
  const identity = NARRATIVE_IDENTITIES.find(i => i.key === key) ?? NARRATIVE_IDENTITIES[0];
  return `${identity.key} — ${identity.description}`;
}
