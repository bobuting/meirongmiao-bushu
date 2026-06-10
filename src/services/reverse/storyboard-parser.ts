/**
 * 分镜叙述解析纯函数
 *
 * 从 app.ts 提取的分镜/叙述相关纯函数，
 * 负责拆分叙述块。
 */

// ---------------------------------------------------------------------------
// splitNarrationBlocks — 拆分叙述块
// ---------------------------------------------------------------------------

export function splitNarrationBlocks(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length > 1) {
    return lines;
  }
  return text
    .split(/[。！？!?；;\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
