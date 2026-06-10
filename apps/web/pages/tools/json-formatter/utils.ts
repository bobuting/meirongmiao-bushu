/**
 * JSON Formatter 工具函数
 */

/**
 * 格式化 JSON（美化缩进）
 */
export function formatJson(data: any, indent = 2): string {
  return JSON.stringify(data, null, indent);
}

/**
 * 压缩 JSON（去除空白）
 */
export function compressJson(data: any): string {
  return JSON.stringify(data);
}

/**
 * 下载 JSON 文件
 */
export function downloadJson(data: any, filename: string): void {
  const json = formatJson(data);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 复制到剪贴板
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // 降级方案：使用 execCommand
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 解析 JSON 并统计信息
 */
export function parseJsonWithStats(text: string): {
  data: any;
  stats: {
    nodeCount: number;
    maxDepth: number;
    size: number;
  };
} {
  const data = JSON.parse(text);

  const stats = {
    nodeCount: countNodes(data),
    maxDepth: calculateMaxDepth(data),
    size: new Blob([text]).size,
  };

  return { data, stats };
}

/**
 * 计算节点数
 */
function countNodes(data: any): number {
  if (typeof data !== 'object' || data === null) {
    return 1;
  }

  const isArray = Array.isArray(data);
  const keys = isArray ? data : Object.keys(data);

  let count = 1; // 当前节点
  for (const key of (isArray ? keys.map((_, i) => i) : keys)) {
    const value = isArray ? data[key as number] : data[key];
    count += countNodes(value);
  }

  return count;
}

/**
 * 计算最大深度
 */
function calculateMaxDepth(data: any, depth = 0): number {
  if (typeof data !== 'object' || data === null) {
    return depth;
  }

  const isArray = Array.isArray(data);
  const keys = isArray ? data : Object.keys(data);

  let maxDepth = depth;
  for (const key of (isArray ? keys.map((_, i) => i) : keys)) {
    const value = isArray ? data[key as number] : data[key];
    const childDepth = calculateMaxDepth(value, depth + 1);
    maxDepth = Math.max(maxDepth, childDepth);
  }

  return maxDepth;
}

/**
 * 获取文本行数
 */
export function getLines(text: string): string[] {
  return text.split('\n');
}