// test/recommendation-service.unit.test.ts

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Pool } from "pg";
import { RecommendationService } from "../src/service/recommendation-service.js";
import {
  HOT_TREND_CONFIG,
  SCORE_WEIGHT_CONFIG,
  FRESHNESS_CONFIG,
  PREFERENCE_CONFIG,
  INTERLEAVE_CONFIG,
  PAGINATION_CONFIG,
} from "../src/contant-config/recommend-config.js";
import { SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS, SQUARE_PUBLISH_CATEGORIES } from "../src/contracts/square-publish-category.js";

// Mock Pool
const mockPool = {} as Pool;

// Mock adapters
vi.mock("../src/adapters/template-adapter.js", () => ({
  TemplateAdapter: class {
    sourceType = "template";
    fetchItems = vi.fn();
    supportsCategoryFilter = vi.fn(() => true);
  },
}));

vi.mock("../src/adapters/hot-trend-adapter.js", () => ({
  HotTrendAdapter: class {
    sourceType = "hot_trend";
    fetchItems = vi.fn();
    supportsCategoryFilter = vi.fn((filter: string) => filter === "全部" || filter === "热榜");
  },
}));

vi.mock("../src/adapters/user-work-adapter.js", () => ({
  UserWorkAdapter: class {
    sourceType = "user_work";
    fetchItems = vi.fn();
    supportsCategoryFilter = vi.fn(() => true);
  },
}));

vi.mock("../src/service/user-preference-service.js", () => ({
  UserPreferenceService: class {
    calculateCategoryWeights = vi.fn(async () => ({
      男装: 0.25,
      女装: 0.25,
      男童装: 0.25,
      女童装: 0.25,
    }));
  },
}));

vi.mock("../src/service/recommend-config-service.js", () => ({
  RecommendConfigService: class {},
}));

describe("recommendation-service", () => {
  let service: RecommendationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RecommendationService(mockPool);
  });

  // ============================================================================
  // 测试 determineActiveAdapters 逻辑
  // ============================================================================

  describe("determineActiveAdapters", () => {
    /**
     * 通过访问私有方法进行测试
     * 使用 any 类型断言绕过 TypeScript 私有访问限制
     */
    const getActiveAdapterTypes = (filter: string): string[] => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapters = (service as any).determineActiveAdapters(filter);
      return adapters.map((a: { sourceType: string }) => a.sourceType);
    };

    it('"全部" 应返回三个适配器（template, hot_trend, user_work）', () => {
      const types = getActiveAdapterTypes("全部");
      expect(types).toEqual(["template", "hot_trend", "user_work"]);
      expect(types).toHaveLength(3);
    });

    it('"精选" 应只返回模板适配器', () => {
      const types = getActiveAdapterTypes("精选");
      expect(types).toEqual(["template"]);
      expect(types).toHaveLength(1);
    });

    it('"热榜" 应只返回热榜适配器', () => {
      const types = getActiveAdapterTypes("热榜");
      expect(types).toEqual(["hot_trend"]);
      expect(types).toHaveLength(1);
    });

    it('"男装" 应返回模板和用户作品适配器（不含热榜）', () => {
      const types = getActiveAdapterTypes("男装");
      expect(types).toEqual(["template", "user_work"]);
      expect(types).toHaveLength(2);
      expect(types).not.toContain("hot_trend");
    });

    it('"女装" 应返回模板和用户作品适配器（不含热榜）', () => {
      const types = getActiveAdapterTypes("女装");
      expect(types).toEqual(["template", "user_work"]);
      expect(types).toHaveLength(2);
      expect(types).not.toContain("hot_trend");
    });

    it('"男童装" 应返回模板和用户作品适配器（不含热榜）', () => {
      const types = getActiveAdapterTypes("男童装");
      expect(types).toEqual(["template", "user_work"]);
      expect(types).toHaveLength(2);
      expect(types).not.toContain("hot_trend");
    });

    it('"女童装" 应返回模板和用户作品适配器（不含热榜）', () => {
      const types = getActiveAdapterTypes("女童装");
      expect(types).toEqual(["template", "user_work"]);
      expect(types).toHaveLength(2);
      expect(types).not.toContain("hot_trend");
    });

    it("未知分类应默认返回所有适配器", () => {
      const types = getActiveAdapterTypes("未知分类");
      expect(types).toEqual(["template", "hot_trend", "user_work"]);
      expect(types).toHaveLength(3);
    });
  });

  // ============================================================================
  // 测试分类验证
  // ============================================================================

  describe("SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS", () => {
    it("应包含正确的筛选选项", () => {
      expect(SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS).toContain("全部");
      expect(SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS).toContain("精选");
      expect(SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS).toContain("热榜");
    });

    it("应包含所有服装分类", () => {
      expect(SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS).toContain("男装");
      expect(SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS).toContain("女装");
      expect(SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS).toContain("男童装");
      expect(SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS).toContain("女童装");
    });

    it("选项总数应为 7 个（全部 + 模板 + 热榜 + 4个服装分类）", () => {
      expect(SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS).toHaveLength(7);
    });

    it("SQUARE_PUBLISH_CATEGORIES 应只包含 4 个服装分类", () => {
      expect(SQUARE_PUBLISH_CATEGORIES).toHaveLength(4);
      expect(SQUARE_PUBLISH_CATEGORIES).toEqual(["男装", "女装", "男童装", "女童装"]);
    });
  });

  // ============================================================================
  // 测试配置常量
  // ============================================================================

  describe("HOT_TREND_CONFIG", () => {
    it("EXPIRY_HOURS 应为 72 小时", () => {
      expect(HOT_TREND_CONFIG.EXPIRY_HOURS).toBe(72);
    });

    it("EXPIRY_MS 应为 72 小时的毫秒数", () => {
      expect(HOT_TREND_CONFIG.EXPIRY_MS).toBe(72 * 60 * 60 * 1000);
    });
  });

  describe("SCORE_WEIGHT_CONFIG", () => {
    it("应包含所有必要的配置项", () => {
      expect(SCORE_WEIGHT_CONFIG).toHaveProperty("CATEGORY_MATCH_BASE");
      expect(SCORE_WEIGHT_CONFIG).toHaveProperty("HOT_VALUE_MAX_SCORE");
      expect(SCORE_WEIGHT_CONFIG).toHaveProperty("HOT_VALUE_BASE");
      expect(SCORE_WEIGHT_CONFIG).toHaveProperty("VIEW_MAX_SCORE");
      expect(SCORE_WEIGHT_CONFIG).toHaveProperty("VIEW_BASE");
      expect(SCORE_WEIGHT_CONFIG).toHaveProperty("LIKE_MAX_SCORE");
      expect(SCORE_WEIGHT_CONFIG).toHaveProperty("LIKE_BASE");
    });

    it("所有配置项应为数字类型", () => {
      expect(typeof SCORE_WEIGHT_CONFIG.CATEGORY_MATCH_BASE).toBe("number");
      expect(typeof SCORE_WEIGHT_CONFIG.HOT_VALUE_MAX_SCORE).toBe("number");
      expect(typeof SCORE_WEIGHT_CONFIG.HOT_VALUE_BASE).toBe("number");
      expect(typeof SCORE_WEIGHT_CONFIG.VIEW_MAX_SCORE).toBe("number");
      expect(typeof SCORE_WEIGHT_CONFIG.VIEW_BASE).toBe("number");
      expect(typeof SCORE_WEIGHT_CONFIG.LIKE_MAX_SCORE).toBe("number");
      expect(typeof SCORE_WEIGHT_CONFIG.LIKE_BASE).toBe("number");
    });

    it("基础分类匹配得分应为 100", () => {
      expect(SCORE_WEIGHT_CONFIG.CATEGORY_MATCH_BASE).toBe(100);
    });
  });

  describe("FRESHNESS_CONFIG", () => {
    it("应包含所有必要的配置项", () => {
      expect(FRESHNESS_CONFIG).toHaveProperty("SCORE_WITHIN_24H");
      expect(FRESHNESS_CONFIG).toHaveProperty("SCORE_WITHIN_72H");
      expect(FRESHNESS_CONFIG).toHaveProperty("THRESHOLD_24H");
      expect(FRESHNESS_CONFIG).toHaveProperty("THRESHOLD_72H");
    });

    it("所有配置项应为数字类型", () => {
      expect(typeof FRESHNESS_CONFIG.SCORE_WITHIN_24H).toBe("number");
      expect(typeof FRESHNESS_CONFIG.SCORE_WITHIN_72H).toBe("number");
      expect(typeof FRESHNESS_CONFIG.THRESHOLD_24H).toBe("number");
      expect(typeof FRESHNESS_CONFIG.THRESHOLD_72H).toBe("number");
    });

    it("24小时内得分应大于72小时内得分", () => {
      expect(FRESHNESS_CONFIG.SCORE_WITHIN_24H).toBeGreaterThan(FRESHNESS_CONFIG.SCORE_WITHIN_72H);
    });

    it("时间阈值应正确设置", () => {
      expect(FRESHNESS_CONFIG.THRESHOLD_24H).toBe(24);
      expect(FRESHNESS_CONFIG.THRESHOLD_72H).toBe(72);
    });
  });

  describe("PREFERENCE_CONFIG", () => {
    it("应包含所有必要的配置项", () => {
      expect(PREFERENCE_CONFIG).toHaveProperty("ASSET_WEIGHT_RATIO");
      expect(PREFERENCE_CONFIG).toHaveProperty("BEHAVIOR_WEIGHT_RATIO");
      expect(PREFERENCE_CONFIG).toHaveProperty("CLICK_WEIGHT_FACTOR");
      expect(PREFERENCE_CONFIG).toHaveProperty("VIEW_WEIGHT_FACTOR");
      expect(PREFERENCE_CONFIG).toHaveProperty("BEHAVIOR_LOG_DAYS");
      expect(PREFERENCE_CONFIG).toHaveProperty("PROJECT_QUERY_LIMIT");
    });

    it("所有配置项应为数字类型", () => {
      expect(typeof PREFERENCE_CONFIG.ASSET_WEIGHT_RATIO).toBe("number");
      expect(typeof PREFERENCE_CONFIG.BEHAVIOR_WEIGHT_RATIO).toBe("number");
      expect(typeof PREFERENCE_CONFIG.CLICK_WEIGHT_FACTOR).toBe("number");
      expect(typeof PREFERENCE_CONFIG.VIEW_WEIGHT_FACTOR).toBe("number");
      expect(typeof PREFERENCE_CONFIG.BEHAVIOR_LOG_DAYS).toBe("number");
      expect(typeof PREFERENCE_CONFIG.PROJECT_QUERY_LIMIT).toBe("number");
    });

    it("资产权重与行为权重之和应为 1", () => {
      expect(PREFERENCE_CONFIG.ASSET_WEIGHT_RATIO + PREFERENCE_CONFIG.BEHAVIOR_WEIGHT_RATIO).toBeCloseTo(1, 2);
    });
  });

  describe("INTERLEAVE_CONFIG", () => {
    it("应包含 PICK_PATTERN 配置项", () => {
      expect(INTERLEAVE_CONFIG).toHaveProperty("PICK_PATTERN");
      expect(INTERLEAVE_CONFIG).toHaveProperty("MAX_ITERATIONS");
    });

    it("PICK_PATTERN 应包含正确的来源类型", () => {
      const pattern = INTERLEAVE_CONFIG.PICK_PATTERN;
      expect(pattern).toContain("template");
      expect(pattern).toContain("hot_trend");
      expect(pattern).toContain("user_work");
    });

    it("MAX_ITERATIONS 应为合理的数值", () => {
      expect(INTERLEAVE_CONFIG.MAX_ITERATIONS).toBe(1000);
      expect(typeof INTERLEAVE_CONFIG.MAX_ITERATIONS).toBe("number");
    });
  });

  describe("PAGINATION_CONFIG", () => {
    it("应包含分页配置项", () => {
      expect(PAGINATION_CONFIG).toHaveProperty("DEFAULT_PAGE_SIZE");
      expect(PAGINATION_CONFIG).toHaveProperty("MAX_PAGE_SIZE");
    });

    it("默认分页大小应为 20", () => {
      expect(PAGINATION_CONFIG.DEFAULT_PAGE_SIZE).toBe(20);
    });

    it("最大分页大小应为 50", () => {
      expect(PAGINATION_CONFIG.MAX_PAGE_SIZE).toBe(50);
    });

    it("最大分页大小应大于默认分页大小", () => {
      expect(PAGINATION_CONFIG.MAX_PAGE_SIZE).toBeGreaterThan(PAGINATION_CONFIG.DEFAULT_PAGE_SIZE);
    });
  });
});