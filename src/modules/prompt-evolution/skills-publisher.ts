/**
 * Skills 发布服务
 *
 * 用于 prompt-evolution 功能将改进的提示词发布到 Skills 系统
 */

import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { FastifyBaseLogger } from "fastify";

const SKILLS_DIR = join(process.cwd(), "skills");

/** Skills 文件的 frontmatter 元数据 */
interface SkillFrontmatter {
  code: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
  author: string;
  defaultVariant: string;
  [key: string]: unknown;
}

/** 发布结果 */
export interface PublishResult {
  success: boolean;
  error?: string;
  oldVersion?: string;
  newVersion?: string;
  filePath?: string;
}

/**
 * 解析 SKILL.md 文件的 frontmatter 和内容
 */
function parseSkillFile(content: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    throw new Error("Invalid SKILL.md format: missing frontmatter");
  }

  const [, frontmatterText, body] = frontmatterMatch;

  // 解析 YAML frontmatter
  const frontmatter: Record<string, unknown> = {};
  const lines = frontmatterText!.split("\n");

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      // 处理数组类型（tags）
      if (value!.startsWith("[") && value!.endsWith("]")) {
        const arrayContent = value!.slice(1, -1).trim();
        frontmatter[key!] = arrayContent ? arrayContent.split(",").map(s => s.trim()) : [];
      } else {
        frontmatter[key!] = value!.trim();
      }
    }
  }

  return {
    frontmatter: frontmatter as SkillFrontmatter,
    body: body!.trim(),
  };
}

/**
 * 序列化 frontmatter 和内容为 SKILL.md 格式
 */
function serializeSkillFile(frontmatter: SkillFrontmatter, body: string): string {
  const lines: string[] = ["---"];

  // 按固定顺序输出字段
  const orderedKeys = [
    "code",
    "name",
    "description",
    "category",
    "tags",
    "version",
    "author",
    "defaultVariant",
  ];

  for (const key of orderedKeys) {
    const value = frontmatter[key];
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  // 输出其他字段
  for (const [key, value] of Object.entries(frontmatter)) {
    if (orderedKeys.includes(key)) continue;

    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(body);

  return lines.join("\n");
}

/**
 * 增加版本号（简单的语义化版本递增）
 */
function incrementVersion(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) {
    // 如果不是标准的 x.y.z 格式，直接追加 .1
    return `${version}.1`;
  }

  const [major, minor, patch] = parts;
  const newPatch = parseInt(patch!, 10) + 1;
  return `${major}.${minor}.${newPatch}`;
}

/**
 * 发布提示词改进到 Skills 系统
 *
 * @param promptCode - 提示词代码（对应 skills/{code}/SKILL.md）
 * @param newContent - 新的提示词内容
 * @param changeSummary - 变更摘要（会添加到 body 顶部作为注释）
 * @param logger - 日志记录器
 */
export async function publishToSkills(
  promptCode: string,
  newContent: string,
  changeSummary: string,
  logger?: FastifyBaseLogger,
): Promise<PublishResult> {
  try {
    const skillPath = join(SKILLS_DIR, promptCode, "SKILL.md");

    // 1. 读取现有文件
    let fileContent: string;
    try {
      fileContent = await readFile(skillPath, "utf-8");
    } catch (err) {
      const error = `Skill file not found: ${skillPath}`;
      logger?.error({ err, promptCode }, error);
      return { success: false, error };
    }

    // 2. 解析 frontmatter 和 body
    const { frontmatter, body: oldBody } = parseSkillFile(fileContent);
    const oldVersion = frontmatter.version;

    // 3. 更新版本号
    const newVersion = incrementVersion(oldVersion);
    frontmatter.version = newVersion;

    // 4. 构建新的 body（保留变更历史）
    const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const changeLog = `<!-- 变更记录 ${newVersion} (${timestamp}): ${changeSummary} -->`;

    // 如果新内容不包含变更日志，添加到顶部
    const newBody = newContent.includes("<!-- 变更记录")
      ? newContent
      : `${changeLog}\n\n${newContent}`;

    // 5. 序列化并写回文件
    const newFileContent = serializeSkillFile(frontmatter, newBody);
    await writeFile(skillPath, newFileContent, "utf-8");

    logger?.info(
      { promptCode, oldVersion, newVersion, changeSummary },
      `[SkillsPublisher] Published ${promptCode} ${oldVersion} → ${newVersion}`,
    );

    return {
      success: true,
      oldVersion,
      newVersion,
      filePath: skillPath,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger?.error({ err, promptCode }, "[SkillsPublisher] Publish failed");
    return { success: false, error };
  }
}

/**
 * 获取 Skill 的当前版本
 */
export async function getSkillVersion(promptCode: string): Promise<string | null> {
  try {
    const skillPath = join(SKILLS_DIR, promptCode, "SKILL.md");
    const fileContent = await readFile(skillPath, "utf-8");
    const { frontmatter } = parseSkillFile(fileContent);
    return frontmatter.version;
  } catch {
    return null;
  }
}

/**
 * 验证 Skill 是否存在
 */
export async function skillExists(promptCode: string): Promise<boolean> {
  try {
    const skillPath = join(SKILLS_DIR, promptCode, "SKILL.md");
    await readFile(skillPath, "utf-8");
    return true;
  } catch {
    return false;
  }
}
