/**
 * Skills 版本管理器
 * 负责保存、查询和回滚 Skill 的历史版本
 */

import fs from 'fs/promises';
import path from 'path';
import type { SkillVersion, SkillVersionDetail, SkillMetadata } from './skill-types.js';

const SKILLS_DIR = path.join(process.cwd(), 'skills');

export class SkillVersionManager {
  /**
   * 保存当前版本为历史快照
   */
  async saveVersion(
    skillPath: string,
    options?: { author?: string; changeLog?: string }
  ): Promise<string> {
    const versionsDir = path.join(skillPath, 'versions');

    // 确保 versions 目录存在
    await fs.mkdir(versionsDir, { recursive: true });

    // 生成版本号（时间戳）
    const timestamp = Date.now();
    const versionId = `v${timestamp}`;
    const versionPath = path.join(versionsDir, versionId);
    await fs.mkdir(versionPath, { recursive: true });

    // 读取当前文件
    const metadata = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8');
    const systemPrompt = await fs.readFile(path.join(skillPath, 'system.hbs'), 'utf-8');
    const userPrompt = await fs.readFile(path.join(skillPath, 'user.hbs'), 'utf-8');
    const inputSchema = await fs.readFile(path.join(skillPath, 'schema.ts'), 'utf-8');

    // 保存快照
    await fs.writeFile(path.join(versionPath, 'SKILL.md'), metadata, 'utf-8');
    await fs.writeFile(path.join(versionPath, 'system.hbs'), systemPrompt, 'utf-8');
    await fs.writeFile(path.join(versionPath, 'user.hbs'), userPrompt, 'utf-8');
    await fs.writeFile(path.join(versionPath, 'schema.ts'), inputSchema, 'utf-8');

    // 保存版本元信息
    const versionInfo: SkillVersion = {
      version: versionId,
      timestamp,
      author: options?.author,
      changeLog: options?.changeLog,
    };
    await fs.writeFile(
      path.join(versionPath, 'version.json'),
      JSON.stringify(versionInfo, null, 2),
      'utf-8'
    );

    return versionId;
  }

  /**
   * 获取版本列表
   */
  async listVersions(skillPath: string): Promise<SkillVersion[]> {
    const versionsDir = path.join(skillPath, 'versions');

    try {
      const entries = await fs.readdir(versionsDir, { withFileTypes: true });
      const versions: SkillVersion[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('v')) {
          try {
            const versionInfoPath = path.join(versionsDir, entry.name, 'version.json');
            const content = await fs.readFile(versionInfoPath, 'utf-8');
            const versionInfo = JSON.parse(content) as SkillVersion;
            versions.push(versionInfo);
          } catch {
            // 忽略无效的版本目录
          }
        }
      }

      // 按时间倒序排列
      return versions.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      // 如果 versions 目录不存在，返回空数组
      return [];
    }
  }

  /**
   * 获取版本详情
   */
  async getVersion(skillPath: string, versionId: string): Promise<SkillVersionDetail | null> {
    const versionPath = path.join(skillPath, 'versions', versionId);

    try {
      // 读取版本信息
      const versionInfoPath = path.join(versionPath, 'version.json');
      const versionInfo = JSON.parse(await fs.readFile(versionInfoPath, 'utf-8')) as SkillVersion;

      // 读取文件内容
      const metadataContent = await fs.readFile(path.join(versionPath, 'SKILL.md'), 'utf-8');
      const systemPrompt = await fs.readFile(path.join(versionPath, 'system.hbs'), 'utf-8');
      const userPrompt = await fs.readFile(path.join(versionPath, 'user.hbs'), 'utf-8');
      const inputSchema = await fs.readFile(path.join(versionPath, 'schema.ts'), 'utf-8');

      // 解析 metadata
      const frontmatterMatch = metadataContent.match(/^---\n([\s\S]*?)\n---/);
      const metadata: Record<string, unknown> = {};
      if (frontmatterMatch) {
        frontmatterMatch[1].split('\n').forEach(line => {
          const [key, ...valueParts] = line.split(':');
          if (key && valueParts.length > 0) {
            metadata[key.trim()] = valueParts.join(':').trim();
          }
        });
      }

      return {
        ...versionInfo,
        metadata: metadata as unknown as SkillMetadata,
        systemPrompt,
        userPrompt,
        inputSchema,
      };
    } catch {
      return null;
    }
  }

  /**
   * 回滚到指定版本
   */
  async rollback(skillPath: string, versionId: string): Promise<boolean> {
    const versionDetail = await this.getVersion(skillPath, versionId);
    if (!versionDetail) {
      return false;
    }

    // 先保存当前版本
    await this.saveVersion(skillPath, { author: 'system', changeLog: '回滚前的自动备份' });

    // 恢复文件
    const versionPath = path.join(skillPath, 'versions', versionId);
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), await fs.readFile(path.join(versionPath, 'SKILL.md'), 'utf-8'), 'utf-8');
    await fs.writeFile(path.join(skillPath, 'system.hbs'), versionDetail.systemPrompt, 'utf-8');
    await fs.writeFile(path.join(skillPath, 'user.hbs'), versionDetail.userPrompt, 'utf-8');
    await fs.writeFile(path.join(skillPath, 'schema.ts'), versionDetail.inputSchema, 'utf-8');

    return true;
  }

  /**
   * 删除指定版本
   */
  async deleteVersion(skillPath: string, versionId: string): Promise<boolean> {
    const versionPath = path.join(skillPath, 'versions', versionId);

    try {
      await fs.rm(versionPath, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }
}
