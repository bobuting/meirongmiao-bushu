/** 判断字符串是否为有效 URL */
function isValidUrl(s: string): boolean {
  try { new URL(s); return true; } catch { return false; }
}

/** 判断字符串是否为图片 URL（包含常见图片扩展名或 OSS 图片处理参数） */
function isImageUrl(s: string): boolean {
  if (!isValidUrl(s)) return false;
  // 检查路径是否以图片扩展名结尾（忽略查询参数）
  const url = new URL(s);
  const pathname = url.pathname.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|avif|tiff|tif)$/i.test(pathname)) {
    return true;
  }
  // 检查 OSS 图片处理参数（阿里云 OSS、AWS S3 等）
  const query = url.search.toLowerCase();
  if (query.includes('x-oss-process=image') || query.includes('format=')) {
    return true;
  }
  return false;
}

/** 从字符串中提取所有图片 URL（处理多种格式） */
function extractImageUrlFromString(text: string): string[] {
  const trimmed = text.trim();
  const urls: string[] = [];

  // 1. 先提取所有特殊格式的 URL（如 "ctx-1:top:xxx: https://..."）
  // 使用宽松匹配找到所有可能的 URL，后续验证
  const urlPattern = /(https?:\/\/[^\s"'`<>\[\]\{\}\)]+)/gi;
  let match;
  while ((match = urlPattern.exec(trimmed)) !== null) {
    const url = match[1].trim();
    // 移除 URL 末尾可能的标点符号（逗号、分号等）
    const cleanedUrl = url.replace(/[,\s;]+$/, '');
    if (isValidUrl(cleanedUrl) && isImageUrl(cleanedUrl)) {
      urls.push(cleanedUrl);
    }
  }

  // 2. 如果找到 URL，直接返回（已处理所有格式）
  if (urls.length > 0) {
    return urls;
  }

  // 3. 尝试作为 JSON 解析（数组或对象字符串）
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return extractUrlsFromJson(parsed);
    } catch {
      // JSON 解析失败，继续处理
    }
  }

  // 4. 支持换行分隔的多个 URL
  const lines = trimmed.split(/[\n\r]+/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    // 多行：逐行处理（每行可能包含特殊格式）
    return lines.flatMap(line => extractImageUrlFromString(line));
  }

  // 5. 单行：直接检查是否为图片 URL
  return isImageUrl(trimmed) ? [trimmed] : [];
}

/** 递归提取 JSON 值中的所有图片 URL */
function extractUrlsFromJson(value: unknown): string[] {
  if (typeof value === 'string') {
    return extractImageUrlFromString(value);
  }
  if (Array.isArray(value)) {
    return value.flatMap(extractUrlsFromJson);
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(extractUrlsFromJson);
  }
  return [];
}

/** 从输入文本中解析出 URL 列表，支持多行、JSON 数组、JSON 对象自动提取 */
export function parseUrls(input: string): string[] {
  const text = input.trim();

  // 尝试作为 JSON 解析（数组或对象）
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const json = JSON.parse(text);
      const urls = extractUrlsFromJson(json);
      if (urls.length > 0) return urls;
    } catch {
      // JSON 解析失败，走逐行解析
    }
  }

  // 逐行解析
  const lineUrls = text
    .split(/[\n\r]+/)
    .map(line => {
      let cleaned = line.trim();
      cleaned = cleaned.replace(/^[\s"',`\[\]]+/, '').replace(/[\s"',`\[\]]+$/, '');
      cleaned = cleaned.replace(/,+\s*$/, '');
      return cleaned;
    })
    .filter(s => s && isValidUrl(s));

  if (lineUrls.length > 0) return lineUrls;

  // 兜底：正则从任意文本中提取图片 URL
  const urlRegex = /https?:\/\/[^\s"'\),;\]\}]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|avif|tiff|tif)(?:\?[^\s"'\),;\]\}]*)?/gi;
  const matched = text.match(urlRegex);
  return matched ? [...new Set(matched)] : [];
}

/** 从 JSON 对象中提取所有图片 URL */
export function extractImageUrlsFromJson(json: unknown): string[] {
  const urls = extractUrlsFromJson(json);
  // 去重
  return [...new Set(urls)];
}