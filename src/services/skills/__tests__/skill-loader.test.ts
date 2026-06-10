/**
 * SkillLoader 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillLoader } from '../skill-loader.js';

describe('SkillLoader', () => {
  let loader: SkillLoader;

  beforeEach(() => {
    loader = new SkillLoader();
  });

  describe('listAll', () => {
    it('应该列出所有可用的 Skills', async () => {
      const skills = await loader.listAll();

      expect(skills).toBeDefined();
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);

      // 验证返回的数据结构
      const skill = skills[0];
      expect(skill).toHaveProperty('code');
      expect(skill).toHaveProperty('name');
      expect(skill).toHaveProperty('description');
      expect(skill).toHaveProperty('version');
    });

    it('应该包含 script-generation Skill', async () => {
      const skills = await loader.listAll();
      const scriptGen = skills.find(s => s.code === 'script-generation');

      expect(scriptGen).toBeDefined();
      expect(scriptGen?.name).toBe('脚本生成');
    });
  });

  describe('load', () => {
    it('应该成功加载 script-generation Skill', async () => {
      const skill = await loader.load('script-generation');

      expect(skill).toBeDefined();
      expect(skill.metadata.code).toBe('script-generation');
      expect(skill.metadata.name).toBe('脚本生成');
      expect(skill.variants.length).toBeGreaterThan(0);
    });

    it('应该加载 Schema', async () => {
      const skill = await loader.load('script-generation');

      expect(skill.inputSchema).toBeDefined();
    });

    it('应该加载示例', async () => {
      const skill = await loader.load('script-generation');

      expect(skill.examples).toBeDefined();
      expect(skill.examples!.length).toBeGreaterThan(0);
    });

    it('加载不存在的 Skill 应该抛出错误', async () => {
      await expect(loader.load('non-existent-skill')).rejects.toThrow();
    });
  });

  describe('render', () => {
    it('应该成功渲染提示词', async () => {
      const skill = await loader.load('script-generation');

      const { system, user } = await skill.render({
        outfitDescription: '白色衬衫',
        sceneDescription: '办公室',
        style: 'professional',
        duration: 30,
        targetAudience: '职场白领'
      });

      expect(system).toBeDefined();
      expect(user).toBeDefined();
      expect(typeof system).toBe('string');
      expect(typeof user).toBe('string');
      expect(system.length).toBeGreaterThan(0);
      expect(user.length).toBeGreaterThan(0);
    });

    it('应该在 User Prompt 中包含输入变量', async () => {
      const skill = await loader.load('script-generation');

      const { user } = await skill.render({
        outfitDescription: '白色衬衫',
        sceneDescription: '办公室',
        style: 'professional',
        duration: 30,
        targetAudience: '职场白领'
      });

      expect(user).toContain('白色衬衫');
      expect(user).toContain('办公室');
    });
  });

  describe('validateInput', () => {
    it('有效输入应该通过验证', async () => {
      const skill = await loader.load('script-generation');

      const validation = skill.validateInput({
        outfitDescription: '白色衬衫',
        sceneDescription: '办公室',
        style: 'professional',
        duration: 30,
        targetAudience: '职场白领'
      });

      expect(validation.valid).toBe(true);
      expect(validation.errors).toBeUndefined();
    });

    it('缺少必需字段应该验证失败', async () => {
      const skill = await loader.load('script-generation');

      const validation = skill.validateInput({
        outfitDescription: '白色衬衫'
        // 缺少 sceneDescription
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors!.length).toBeGreaterThan(0);
    });

    it('无效的枚举值应该验证失败', async () => {
      const skill = await loader.load('script-generation');

      const validation = skill.validateInput({
        outfitDescription: '白色衬衫',
        sceneDescription: '办公室',
        style: 'invalid-style', // 无效的 style
        duration: 30,
        targetAudience: '职场白领'
      });

      expect(validation.valid).toBe(false);
    });
  });

  describe('cache', () => {
    it('第二次加载应该使用缓存', async () => {
      // 第一次加载
      await loader.load('script-generation');

      const statsBefore = loader.getCacheStats();

      // 第二次加载
      await loader.load('script-generation');

      const statsAfter = loader.getCacheStats();

      // 缓存命中次数应该增加
      expect(statsAfter.hits).toBeGreaterThan(statsBefore.hits);
    });

    it('clearCache 应该清空缓存', async () => {
      await loader.load('script-generation');

      loader.clearCache();

      const stats = loader.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('examples', () => {
    it('示例应该通过验证', async () => {
      const skill = await loader.load('script-generation');

      if (skill.examples) {
        for (const example of skill.examples) {
          const validation = skill.validateInput(example.input);
          expect(validation.valid).toBe(true);
        }
      }
    });

    it('示例应该能成功渲染', async () => {
      const skill = await loader.load('script-generation');

      if (skill.examples && skill.examples.length > 0) {
        const { system, user } = await skill.render(skill.examples[0].input);

        expect(system).toBeDefined();
        expect(user).toBeDefined();
        expect(system.length).toBeGreaterThan(0);
        expect(user.length).toBeGreaterThan(0);
      }
    });
  });
});
