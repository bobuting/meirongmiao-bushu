export interface Step3ScriptBasicInfoExtractorInput {
  title: string;
  subtitle?: string;
  preview: string;
  content: string;
  tags?: string[];
}

export interface Step3ScriptBasicInfoViewModel {
  videoTheme: string;
  videoIntro: string;
  sceneSettings: Array<{
    label: "主场景" | "辅助场景" | "时间" | "天气" | "氛围";
    value: string;
  }>;
}

const SECTION_BREAK_PATTERN =
  /^(?:#{1,6}\s*)?(?:【[^】]+】|视频主题|视频简介|场景设定|抖音标题|封面文案|角色设定表|服装设定表|分镜表)/u;

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function removeBulletPrefix(line: string): string {
  // 先移除数字编号前缀（如 "1. ", "2. " 等）
  let result = line.replace(/^\d+\.\s*/u, "").trim();
  // 再移除其他常见的前缀符号
  result = result.replace(/^(?:[-*•·]|[（(]?\d+[）)])\s*/u, "").trim();
  return result;
}

function cleanupSectionValue(line: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return normalizeLine(line.replace(new RegExp(`^${escapedLabel}\\s*[：:]?\\s*`, "u"), ""));
}

function splitContentLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);
}

function pickSectionValue(lines: string[], label: "视频主题" | "视频简介"): string | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith(label)) {
      continue;
    }
    const inlineValue = cleanupSectionValue(line, label);
    if (inlineValue.length > 0) {
      return inlineValue;
    }
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextLine = lines[cursor];
      if (SECTION_BREAK_PATTERN.test(nextLine)) {
        break;
      }
      const normalized = removeBulletPrefix(nextLine);
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }
  return null;
}

function pickSceneSettings(lines: string[], _subtitle: string, tags: string[]): Step3ScriptBasicInfoViewModel["sceneSettings"] {
  const sceneMap: Partial<Record<"主场景" | "辅助场景" | "时间" | "天气" | "氛围", string>> = {};
  const freeformScenes: string[] = [];
  const sceneLabels: Array<"主场景" | "辅助场景" | "时间" | "天气" | "氛围"> = [
    "主场景",
    "辅助场景",
    "时间",
    "天气",
    "氛围",
  ];
  const directSceneLabelPattern = /^(主场景|辅助场景|时间|天气|氛围|场景设定)\s*[：:]\s*(.+)$/u;

  // 处理"场景设定：xxx"格式的行，提取值作为主场景候选
  const tryAssignSceneSettingValue = (line: string) => {
    const matched = line.match(directSceneLabelPattern);
    if (matched && matched[1] === "场景设定") {
      const value = matched[2]?.trim() ?? "";
      if (value.length > 0) {
        // 场景设定的值作为主场景候选
        sceneMap["主场景"] = value;
      }
    }
  };

  const tryAssignLabeledScene = (line: string, preserveAsFreeform = true) => {
    const matched = line.match(directSceneLabelPattern);
    if (!matched) {
      if (preserveAsFreeform) {
        freeformScenes.push(line);
      }
      return;
    }
    const key = matched[1]?.trim();
    const value = matched[2]?.trim() ?? "";
    if (!key || !value) {
      return;
    }
    // 场景设定作为主场景候选
    if (key === "场景设定") {
      sceneMap["主场景"] = value;
      return;
    }
    if (sceneLabels.includes(key as "主场景")) {
      sceneMap[key as "主场景" | "辅助场景" | "时间" | "天气" | "氛围"] = value;
      return;
    }
    if (preserveAsFreeform) {
      freeformScenes.push(line);
    }
  };

  let inSceneSection = false;
  for (const rawLine of lines) {
    // 移除数字编号前缀后的行
    const normalizedAfterBullet = removeBulletPrefix(rawLine);
    // 原始行（移除空白后）
    const normalizedRaw = normalizeLine(rawLine);

    // 处理"场景设定"章节标题（可能在移除编号前缀后的行中）
    if (normalizedAfterBullet.startsWith("场景设定")) {
      inSceneSection = true;
      // 检查是否有带标签的格式
      tryAssignSceneSettingValue(normalizedAfterBullet);
      // 如果行中不包含标签格式（如"场景设定 光影斑驳的旧书店"），则将值作为主场景
      if (!directSceneLabelPattern.test(normalizedAfterBullet)) {
        const sceneValue = cleanupSectionValue(normalizedAfterBullet, "场景设定");
        if (sceneValue.length > 0) {
          sceneMap["主场景"] = sceneValue;
        }
      }
      continue;
    }

    // 原始行也检查是否以"场景设定"开头（处理未移除编号的情况）
    if (normalizedRaw.startsWith("场景设定")) {
      inSceneSection = true;
      tryAssignSceneSettingValue(normalizedRaw);
      if (!directSceneLabelPattern.test(normalizedRaw)) {
        const sceneValue = cleanupSectionValue(normalizedRaw, "场景设定");
        if (sceneValue.length > 0) {
          sceneMap["主场景"] = sceneValue;
        }
      }
      continue;
    }

    // 检查是否匹配场景标签格式（时间、天气、氛围等）
    if (directSceneLabelPattern.test(normalizedAfterBullet)) {
      // 在场景章节外也要赋值（确保不在章节内的场景信息也能被捕获）
      tryAssignLabeledScene(normalizedAfterBullet, false);
      if (inSceneSection) {
        tryAssignLabeledScene(normalizedAfterBullet, false);
      }
      continue;
    }

    // 在场景章节内，未匹配标签格式的行作为辅助场景候选
    if (inSceneSection) {
      if (SECTION_BREAK_PATTERN.test(normalizedAfterBullet)) {
        inSceneSection = false;
        continue;
      }
      freeformScenes.push(normalizedAfterBullet);
    }
  }

  if (!sceneMap["主场景"]) {
    sceneMap["主场景"] = freeformScenes[0] || "未标注";
  }
  if (!sceneMap["辅助场景"]) {
    sceneMap["辅助场景"] = freeformScenes.slice(1, 3).join("、") || "未标注";
  }
  if (!sceneMap["时间"]) {
    sceneMap["时间"] = "未标注";
  }
  if (!sceneMap["天气"]) {
    sceneMap["天气"] = "未标注";
  }
  if (!sceneMap["氛围"]) {
    sceneMap["氛围"] = tags.slice(0, 3).join("、") || "未标注";
  }

  return sceneLabels.map((label) => ({
    label,
    value: sceneMap[label] ?? "未标注",
  }));
}

export function resolveStep3ScriptBasicInfo(
  input: Step3ScriptBasicInfoExtractorInput,
): Step3ScriptBasicInfoViewModel {
  const lines = splitContentLines(input.content);
  const normalizedTitle = normalizeLine(input.title);
  const normalizedPreview = normalizeLine(input.preview);
  const normalizedSubtitle = normalizeLine(input.subtitle ?? "");
  const normalizedTags = Array.isArray(input.tags)
    ? Array.from(new Set(input.tags.map((tag) => normalizeLine(String(tag ?? ""))).filter((tag) => tag.length > 0)))
    : [];
  const firstBodyLine =
    lines.find((line) => !SECTION_BREAK_PATTERN.test(line) && !line.startsWith("视频主题") && !line.startsWith("视频简介")) ?? "";

  const videoTheme = (pickSectionValue(lines, "视频主题") ?? normalizedTitle) || "未命名脚本主题";
  const videoIntro = (pickSectionValue(lines, "视频简介") ?? normalizedPreview) || firstBodyLine || videoTheme;
  const sceneSettings = pickSceneSettings(lines, normalizedSubtitle, normalizedTags);

  return {
    videoTheme,
    videoIntro,
    sceneSettings,
  };
}
