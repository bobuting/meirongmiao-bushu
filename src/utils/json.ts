/**
 * JSON 解析工具函数
 */

/**
 * 统计文本中未闭合的括号/方括号/花括号数量（正确处理字符串转义）
 */
function countUnclosedBrackets(text: string): { brace: number; bracket: number; paren: number } {
  let braceCount = 0;   // {}
  let bracketCount = 0; // []
  let parenCount = 0;   // ()
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === "\\") { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braceCount++;
    else if (ch === "}") braceCount--;
    else if (ch === "[") bracketCount++;
    else if (ch === "]") bracketCount--;
    else if (ch === "(") parenCount++;
    else if (ch === ")") parenCount--;
  }

  return { brace: braceCount, bracket: bracketCount, paren: parenCount };
}

/**
 * 尝试修复常见的 LLM JSON 输出截断/缺失括号问题
 *
 * 策略：
 * 1. 简单追加（适用于截断场景）
 * 2. 智能插入：当外层括号完整但内层缺失时，从右向左尝试插入缺失的闭合括号
 */
function tryRepairJson(text: string): unknown | null {
  const tryParse = (raw: string): unknown | null => {
    try { return JSON.parse(raw); } catch { return null; }
  };

  const unclosed = countUnclosedBrackets(text);

  // 快速路径：直接追加（适用于文本截断到末尾的场景）
  if (unclosed.brace > 0 || unclosed.bracket > 0 || unclosed.paren > 0) {
    let repaired = text;
    while (unclosed.paren > 0) { repaired += ")"; unclosed.paren--; }
    while (unclosed.brace > 0) { repaired += "}"; unclosed.brace--; }
    while (unclosed.bracket > 0) { repaired += "]"; unclosed.bracket--; }
    const result = tryParse(repaired);
    if (result !== null) return result;
  }

  // 智能插入：当外层 {} 都完整但内部有缺失时，尝试从右向左找合适位置插入
  // 适用于 "外层完整、内层某对象缺 }" 的场景
  // 找到所有好的插入候选点：] 或 } 或 , 之前的位置
  const insertCh = "}";
  for (let i = text.length; i >= 0; i--) {
    const candidate = text.slice(0, i) + insertCh + text.slice(i);
    const result = tryParse(candidate);
    if (result !== null) return result;
  }

  return null;
}

/**
 * 从文本中提取 JSON 对象
 * 支持: 1) ```json``` 代码块  2) 直接 JSON  3) 嵌入文本中的 JSON 片段  4) LLM 截断/缺失括号修复
 */
export function extractJsonValue(text: string): unknown | null {
  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (codeMatch?.[1] ?? text).trim();
  if (!candidate) {
    return null;
  }
  const tryParse = (raw: string): unknown | null => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const direct = tryParse(candidate);
  if (direct !== null) {
    if (typeof direct === "string") {
      return tryParse(direct.trim()) ?? direct;
    }
    return direct;
  }
  const startObject = candidate.indexOf("{");
  const endObject = candidate.lastIndexOf("}");
  const startArray = candidate.indexOf("[");
  const endArray = candidate.lastIndexOf("]");
  const objectSnippet =
    startObject >= 0 && endObject > startObject ? candidate.slice(startObject, endObject + 1) : null;
  const arraySnippet =
    startArray >= 0 && endArray > startArray ? candidate.slice(startArray, endArray + 1) : null;
  const snippets = [objectSnippet, arraySnippet].filter((item): item is string => Boolean(item));
  for (const snippet of snippets) {
    const parsed = tryParse(snippet);
    if (parsed !== null) {
      return parsed;
    }
    // 尝试修复缺失括号
    const repaired = tryRepairJson(snippet);
    if (repaired !== null) {
      return repaired;
    }
  }
  // 对原始 candidate 也尝试修复（兜底）
  return tryRepairJson(candidate);
}