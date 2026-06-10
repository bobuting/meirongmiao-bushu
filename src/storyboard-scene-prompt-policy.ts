export interface SceneReferencePromptInput {
  index: number;
  title?: string | null;
  narration?: string | null;
  visualPrompt?: string | null;
}

export interface SceneReferencePromptResult {
  prompt: string;
  warnings: string[];
}

const HUMAN_TOKENS = [
  "人物",
  "角色",
  "模特",
  "女生",
  "男生",
  "女人",
  "男人",
  "女孩",
  "男孩",
  "博主",
  "她",
  "他",
  "脸",
  "眼神",
  "表情",
  "上半身",
  "半身",
  "全身",
  "特写人物",
  "站",
  "坐",
  "走",
  "跑",
  "拿着",
  "穿着",
];

const SCENE_HINT_TOKENS = [
  "室内",
  "室外",
  "卧室",
  "客厅",
  "书房",
  "咖啡馆",
  "店铺",
  "展厅",
  "办公室",
  "街道",
  "背景",
  "环境",
  "桌面",
  "窗边",
  "沙发",
  "墙面",
  "舞台",
  "走廊",
  "橱窗",
  "货架",
  "展柜",
];

const SHOT_TOKENS = ["特写", "近景", "中景", "全景", "远景"];
const ANGLE_TOKENS = ["平视", "俯视", "仰视", "顶视", "低机位", "高机位"];
const MOVEMENT_TOKENS = ["推进", "拉远", "摇镜", "平移", "跟拍", "固定", "环绕", "俯拍"];
const LIGHTING_TOKENS = ["自然光", "柔光", "暖光", "冷光", "侧光", "逆光", "高对比", "漫射光"];
const MOOD_TOKENS = ["温暖", "冷静", "高级", "安静", "通透", "明亮", "神秘", "克制", "电影感", "电商感"];
const SOUND_TOKENS = ["环境音", "音乐", "BGM", "静音", "雨声", "风声", "白噪音"];

function compactText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[，,]{2,}/g, "，")
    .trim();
}

function containsAnyToken(value: string, tokens: string[]): boolean {
  return tokens.some((token) => value.includes(token));
}

function pickFirstToken(value: string, tokens: string[], fallback: string): string {
  const match = tokens.find((token) => value.includes(token));
  return match ?? fallback;
}

function splitClauses(value: string): string[] {
  return value
    .split(/[，。；;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function removeHumanClauses(visualPrompt: string): { cleaned: string; removed: string[] } {
  const clauses = splitClauses(visualPrompt);
  const removed = clauses.filter((clause) => containsAnyToken(clause, HUMAN_TOKENS));
  const kept = clauses.filter((clause) => !containsAnyToken(clause, HUMAN_TOKENS));
  return {
    cleaned: kept.join("，"),
    removed,
  };
}

function resolveSceneDescription(input: SceneReferencePromptInput, cleanedVisualPrompt: string): string {
  const clauses = splitClauses(cleanedVisualPrompt);
  const explicitScene = clauses.find((clause) => containsAnyToken(clause, SCENE_HINT_TOKENS));
  if (explicitScene) {
    return explicitScene;
  }
  const firstClause = clauses[0];
  if (firstClause) {
    return firstClause;
  }
  const title = compactText(input.title);
  if (title) {
    return `${title} 对应的场景环境与关键陈设`;
  }
  const narration = compactText(input.narration);
  if (narration) {
    return `${narration} 所在的场景环境与关键物件`;
  }
  return "与镜头内容匹配的电商场景环境与关键物件";
}

export function buildSceneReferencePrompt(input: SceneReferencePromptInput): SceneReferencePromptResult {
  const shotId = `S${String(Math.max(1, input.index || 1)).padStart(2, "0")}`;
  const visualPrompt = compactText(input.visualPrompt);
  const { cleaned, removed } = removeHumanClauses(visualPrompt);
  const sceneDescription = resolveSceneDescription(input, cleaned);
  const composition = pickFirstToken(visualPrompt, SHOT_TOKENS, "中景");
  const angle = pickFirstToken(visualPrompt, ANGLE_TOKENS, "平视");
  const movement = pickFirstToken(visualPrompt, MOVEMENT_TOKENS, "固定镜头");
  const lighting = pickFirstToken(visualPrompt, LIGHTING_TOKENS, "自然柔光");
  const mood = pickFirstToken(visualPrompt, MOOD_TOKENS, "电商感");
  const sound = pickFirstToken(visualPrompt, SOUND_TOKENS, "静音");
  const warnings: string[] = [];
  if (removed.length > 0) {
    warnings.push("removed-human-clauses");
  }
  if (!containsAnyToken(sceneDescription, SCENE_HINT_TOKENS)) {
    warnings.push("scene-description-fallback");
  }
  return {
    prompt:
      `${shotId}；时长约3秒；场景/环境：${sceneDescription}；` +
      `构图/机位：${composition}，${angle}；` +
      `镜头运动：${movement}；` +
      `光线/氛围：${lighting}，${mood}；` +
      `声音/音乐：${sound}；` +
      `仅生成场景与物件，不出现人物、角色、人体局部、倒影、影子、服装展示。`,
    warnings,
  };
}
