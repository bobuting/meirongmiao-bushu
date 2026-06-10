/**
 * SkillCache 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillCache } from '../skill-cache.js';
import type { Skill } from '../skill-types.js';

// Mock Skill
const createMockSkill = (code: string): Skill => ({
  metadata: {
    code,
    name: `Test Skill ${code}`,
    description: 'Test description',
    version: '1.0.0'
  },
  variants: [],
  defaultVariant: 'default',
  render: async () => ({ system: '', user: '' }),
  validateInput: () => ({ valid: true })
});

describe('SkillCache', () => {
  let cache: SkillCache;

  beforeEach(() => {
    cache = new SkillCache({ maxSize: 3, ttl: 1000 });
  });

  describe('get/set', () => {
    it('应该能存储和获取 Skill', () => {
      const skill = createMockSkill('test-1');
      cache.set('test-1', skill);

      const retrieved = cache.get('test-1');
      expect(retrieved).toBe(skill);
    });

    it('不存在的 Skill 应该返回 undefined', () => {
      const retrieved = cache.get('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('应该更新访问统计', () => {
      const skill = createMockSkill('test-1');
      cache.set('test-1', skill);

      const statsBefore = cache.getStats();
      cache.get('test-1');
      const statsAfter = cache.getStats();

      expect(statsAfter.hits).toBe(statsBefore.hits + 1);
    });
  });

  describe('LRU eviction', () => {
    it('超过 maxSize 应该移除最少使用的项', () => {
      cache.set('skill-1', createMockSkill('skill-1'));
      cache.set('skill-2', createMockSkill('skill-2'));
      cache.set('skill-3', createMockSkill('skill-3'));

      // 访问 skill-1 和 skill-2，使它们成为最近使用
      cache.get('skill-1');
      cache.get('skill-2');

      // 添加第 4 个，应该移除 skill-3（最少使用）
      cache.set('skill-4', createMockSkill('skill-4'));

      expect(cache.get('skill-1')).toBeDefined();
      expect(cache.get('skill-2')).toBeDefined();
      expect(cache.get('skill-3')).toBeUndefined();
      expect(cache.get('skill-4')).toBeDefined();
    });
  });

  describe('TTL', () => {
    it('过期的项应该被移除', async () => {
      const shortTtlCache = new SkillCache({ ttl: 100 }); // 100ms TTL
      const skill = createMockSkill('test-1');

      shortTtlCache.set('test-1', skill);
      expect(shortTtlCache.get('test-1')).toBeDefined();

      // 等待超过 TTL
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(shortTtlCache.get('test-1')).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('应该能删除指定的项', () => {
      const skill = createMockSkill('test-1');
      cache.set('test-1', skill);

      const deleted = cache.delete('test-1');
      expect(deleted).toBe(true);
      expect(cache.get('test-1')).toBeUndefined();
    });

    it('删除不存在的项应该返回 false', () => {
      const deleted = cache.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('clear', () => {
    it('应该清空所有缓存', () => {
      cache.set('skill-1', createMockSkill('skill-1'));
      cache.set('skill-2', createMockSkill('skill-2'));

      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', () => {
      cache.set('skill-1', createMockSkill('skill-1'));
      cache.set('skill-2', createMockSkill('skill-2'));

      cache.get('skill-1'); // hit
      cache.get('skill-1'); // hit
      cache.get('non-existent'); // miss

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.totalAccess).toBe(3);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('空缓存的命中率应该为 0', () => {
      const stats = cache.getStats();

      expect(stats.size).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('warmup', () => {
    it('应该预加载指定的 Skills', async () => {
      const mockLoader = {
        load: async (code: string) => createMockSkill(code)
      };

      await cache.warmup(mockLoader, ['skill-1', 'skill-2', 'skill-3']);

      const stats = cache.getStats();
      expect(stats.size).toBe(3);
      expect(cache.get('skill-1')).toBeDefined();
      expect(cache.get('skill-2')).toBeDefined();
      expect(cache.get('skill-3')).toBeDefined();
    });

    it('加载失败不应该影响其他 Skills', async () => {
      const mockLoader = {
        load: async (code: string) => {
          if (code === 'fail') {
            throw new Error('Load failed');
          }
          return createMockSkill(code);
        }
      };

      await cache.warmup(mockLoader, ['skill-1', 'fail', 'skill-2']);

      expect(cache.get('skill-1')).toBeDefined();
      expect(cache.get('fail')).toBeUndefined();
      expect(cache.get('skill-2')).toBeDefined();
    });
  });

  describe('access patterns', () => {
    it('频繁访问的项应该保留在缓存中', () => {
      cache.set('hot', createMockSkill('hot'));
      cache.set('cold-1', createMockSkill('cold-1'));
      cache.set('cold-2', createMockSkill('cold-2'));

      // 频繁访问 hot
      for (let i = 0; i < 10; i++) {
        cache.get('hot');
      }

      // 添加新项，应该移除 cold 项之一
      cache.set('new', createMockSkill('new'));

      // hot 应该仍然存在
      expect(cache.get('hot')).toBeDefined();
    });
  });
});
