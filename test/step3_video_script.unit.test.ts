/**
 * Step3 视频脚本生成模块单元测试
 * 测试 generateVideoScriptsSnapshot 及其子模块
 */

import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryStore } from "../src/core/store.js";
import type { LibraryScript, User, Project, ProjectWorkflowStateRecord } from "../src/contracts/types.js";
import {
  parseVideoScriptContent,
  parseVideoScriptsContents,
} from "../src/modules/video-step/step3-video-script/content-parser.js";
import { filterVideoScripts } from "../src/modules/video-step/step3-video-script/script-filter.js";
import {
  extractStylesFromDescription,
} from "../src/modules/video-step/step3-video-script/script-rewriter.js";
import {
  buildVideoScriptSnapshot,
  createEmptyVideoSnapshot,
} from "../src/modules/video-step/step3-video-script/snapshot-builder.js";
import type { VideoScriptData, ScriptRewriterOutput } from "../src/modules/video-step/step3-video-script/types.js";

// =====================================================
// 测试数据
// =====================================================

/** 创建模拟的 LibraryScript */
function createMockLibraryScript(overrides: Partial<LibraryScript> = {}): LibraryScript {
  const id = `script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    userId: "test-user",
    title: "测试脚本",
    tags: ["街头潮流", "日系"],
    content: JSON.stringify(createMockVideoScriptContent()),
    currentVersion: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/** 创建模拟的视频脚本内容 */
function createMockVideoScriptContent(overrides: Record<string, unknown> = {}) {
  return {
    video_analysis: {
      title: "测试视频标题",
      theme: "街头穿搭",
      summary: "这是一个展示街头穿搭的视频",
      emotion: {
        primary: "活力",
        secondary: ["自信", "时尚"],
      },
      on_screen_presence: {
        has_real_person: true,
        person_count: 1,
        exposure_level: "高",
        person_details: [
          {
            person_id: 1,
            description: "年轻女性，街头风格",
            screen_time_ratio: 0.85,
            appearance_notes: "主要人物",
          },
        ],
      },
      fashion_placement: {
        suitable: true,
        reason: "适合服饰种草",
        recommended_styles: [
          {
            style: "街头潮流",
            fit_score: 0.95,
            reason: "风格匹配度高",
            recommended_items: ["卫衣", "工装裤"],
          },
          {
            style: "日系清新",
            fit_score: 0.8,
            reason: "风格较匹配",
          },
        ],
      },
    },
    shot_breakdown: [
      {
        shot_id: 1,
        timecode: {
          start: "00:00:00",
          end: "00:00:04",
          duration_seconds: 4.0,
        },
        shot_type: "中景",
        camera_movement: "固定镜头",
        subjects: [
          {
            subject_id: 1,
            type: "人物",
            description: "年轻女性，街头风格",
            action: "自信行走",
            expression: "微笑",
            clothing: {
              ref: "搭配1",
              overall_style: "街头潮流",
            },
          },
        ],
        shot_description: "女生自信地走在街头，阳光洒在身上",
        audio: {
          narration: {
            content: "今天的穿搭灵感",
            tone: "活力",
          },
        },
      },
      {
        shot_id: 2,
        timecode: {
          start: "00:00:04",
          end: "00:00:08",
          duration_seconds: 4.0,
        },
        shot_type: "近景",
        shot_description: "展示穿搭细节",
      },
    ],
    editing_analysis: {
      total_shots: 2,
      average_shot_duration: 4.0,
      pacing: "中",
    },
    ...overrides,
  };
}

/** 创建模拟的用户 */
function createMockUser(): User {
  return {
    id: "test-user",
    email: "test@example.com",
    createdAt: Date.now(),
    tier: "free",
  };
}

/** 创建模拟的项目 */
function createMockProject(): Project {
  return {
    id: "test-project",
    userId: "test-user",
    name: "测试项目",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "step2",
  };
}

// =====================================================
// 测试套件
// =====================================================

describe("Step3 视频脚本生成模块", () => {
  describe("content-parser: 内容解析", () => {
    it("正确解析有效的 JSON 内容", () => {
      const script = createMockLibraryScript();
      const result = parseVideoScriptContent(script);

      expect(result.id).toBe(script.id);
      expect(result.title).toBe(script.title);
      expect(result.parsed).not.toBeNull();
      expect(result.parsed?.video_analysis).toBeDefined();
      expect(result.parsed?.shot_breakdown).toBeDefined();
      expect(result.parseError).toBeUndefined();
    });

    it("处理空内容", () => {
      const script = createMockLibraryScript({ content: "" });
      const result = parseVideoScriptContent(script);

      expect(result.parsed).toBeNull();
      expect(result.parseError).toContain("empty");
    });

    it("处理无效 JSON", () => {
      const script = createMockLibraryScript({ content: "not a valid json" });
      const result = parseVideoScriptContent(script);

      expect(result.parsed).toBeNull();
      expect(result.parseError).toContain("parse error");
    });

    it("处理缺少必需字段的内容", () => {
      const script = createMockLibraryScript({
        content: JSON.stringify({ other_field: "value" }),
      });
      const result = parseVideoScriptContent(script);

      expect(result.parsed).toBeNull();
      expect(result.parseError).toContain("Missing");
    });

    it("批量解析过滤掉无效内容", () => {
      const scripts = [
        createMockLibraryScript(), // 有效
        createMockLibraryScript({ content: "" }), // 无效
        createMockLibraryScript(), // 有效
        createMockLibraryScript({ content: "invalid" }), // 无效
      ];

      const results = parseVideoScriptsContents(scripts);

      expect(results.length).toBe(2);
      expect(results.every((r) => r.parsed !== null)).toBe(true);
    });
  });

  describe("script-filter: 脚本过滤", () => {
    it("过滤符合所有条件的脚本", () => {
      const scripts: VideoScriptData[] = [
        {
          id: "script-1",
          title: "符合条件",
          raw: {} as LibraryScript,
          parsed: createMockVideoScriptContent(),
        },
      ];

      const result = filterVideoScripts(scripts, {
        characterStyles: ["街头潮流"],
        minScreenTimeRatio: 0.5,
        allowedExposureLevels: ["高", "中"],
      });

      expect(result.length).toBe(1);
    });

    it("过滤掉 has_real_person 为 false 的脚本", () => {
      const scripts: VideoScriptData[] = [
        {
          id: "script-1",
          title: "无真人",
          raw: {} as LibraryScript,
          parsed: createMockVideoScriptContent({
            video_analysis: {
              ...createMockVideoScriptContent().video_analysis,
              on_screen_presence: {
                has_real_person: false,
              },
            },
          }),
        },
      ];

      const result = filterVideoScripts(scripts, {
        characterStyles: ["街头潮流"],
      });

      expect(result.length).toBe(0);
    });

    it("过滤掉 exposure_level 为低的脚本", () => {
      const scripts: VideoScriptData[] = [
        {
          id: "script-1",
          title: "低露出",
          raw: {} as LibraryScript,
          parsed: createMockVideoScriptContent({
            video_analysis: {
              ...createMockVideoScriptContent().video_analysis,
              on_screen_presence: {
                has_real_person: true,
                exposure_level: "低",
              },
            },
          }),
        },
      ];

      const result = filterVideoScripts(scripts, {
        characterStyles: ["街头潮流"],
      });

      expect(result.length).toBe(0);
    });

    it("过滤掉 screen_time_ratio 过低的脚本", () => {
      const scripts: VideoScriptData[] = [
        {
          id: "script-1",
          title: "出镜时间短",
          raw: {} as LibraryScript,
          parsed: createMockVideoScriptContent({
            video_analysis: {
              ...createMockVideoScriptContent().video_analysis,
              on_screen_presence: {
                has_real_person: true,
                exposure_level: "高",
                person_details: [
                  {
                    person_id: 1,
                    screen_time_ratio: 0.3, // 低于 0.5
                  },
                ],
              },
            },
          }),
        },
      ];

      const result = filterVideoScripts(scripts, {
        characterStyles: ["街头潮流"],
        minScreenTimeRatio: 0.5,
      });

      expect(result.length).toBe(0);
    });

    it("过滤掉风格不匹配的脚本", () => {
      const scripts: VideoScriptData[] = [
        {
          id: "script-1",
          title: "风格不匹配",
          raw: {} as LibraryScript,
          parsed: createMockVideoScriptContent(),
        },
      ];

      const result = filterVideoScripts(scripts, {
        characterStyles: ["商务正装", "优雅通勤"], // 不包含街头潮流
      });

      expect(result.length).toBe(0);
    });
  });

  describe("script-rewriter: 风格提取", () => {
    it("从角色描述中提取风格关键词", () => {
      const description = "22岁女生，酷飒街头风，穿着黑色oversized卫衣和工装裤，性格外向开朗";
      const styles = extractStylesFromDescription(description);

      expect(styles).toContain("酷飒");
      expect(styles.length).toBeGreaterThan(0);
    });

    it("处理空描述", () => {
      const styles = extractStylesFromDescription("");
      expect(styles).toEqual([]);
    });

    it("从穿搭关键词后提取风格", () => {
      const description = "她的穿搭风格是韩系精致";
      const styles = extractStylesFromDescription(description);

      expect(styles.some((s) => s.includes("韩系") || s.includes("精致"))).toBe(true);
    });
  });

  describe("snapshot-builder: 快照构建", () => {
    it("从改写结果构建快照", () => {
      const rewrittenScripts: ScriptRewriterOutput[] = [
        {
          success: true,
          originalScriptId: "script-1",
          rewrittenContent: createMockVideoScriptContent(),
        },
        {
          success: true,
          originalScriptId: "script-2",
          rewrittenContent: createMockVideoScriptContent(),
        },
      ];

      const snapshot = buildVideoScriptSnapshot(rewrittenScripts, {
        projectId: "test-project",
      });

      expect(snapshot.projectId).toBe("test-project");
      expect(snapshot.items.length).toBe(2);
      expect(snapshot.lockState).toBe("snapshot_ready");
      expect(snapshot.items[0].trendType).toBe("video");
    });

    it("跳过改写失败的结果", () => {
      const rewrittenScripts: ScriptRewriterOutput[] = [
        {
          success: true,
          originalScriptId: "script-1",
          rewrittenContent: createMockVideoScriptContent(),
        },
        {
          success: false,
          originalScriptId: "script-2",
          error: "LLM failed",
        },
      ];

      const snapshot = buildVideoScriptSnapshot(rewrittenScripts, {
        projectId: "test-project",
      });

      expect(snapshot.items.length).toBe(1);
    });

    it("创建空快照", () => {
      const snapshot = createEmptyVideoSnapshot("test-project");

      expect(snapshot.projectId).toBe("test-project");
      expect(snapshot.items.length).toBe(0);
      expect(snapshot.generationMode).toBe("degraded");
      expect(snapshot.lockState).toBe("snapshot_ready");
    });

    it("正确提取时长", () => {
      const rewrittenScripts: ScriptRewriterOutput[] = [
        {
          success: true,
          originalScriptId: "script-1",
          rewrittenContent: createMockVideoScriptContent(),
        },
      ];

      const snapshot = buildVideoScriptSnapshot(rewrittenScripts, {
        projectId: "test-project",
      });

      // 两个镜头，每个 4 秒，共 8 秒
      expect(snapshot.items[0].durationSec).toBe(8);
    });

    it("正确提取标签", () => {
      const rewrittenScripts: ScriptRewriterOutput[] = [
        {
          success: true,
          originalScriptId: "script-1",
          rewrittenContent: createMockVideoScriptContent(),
        },
      ];

      const snapshot = buildVideoScriptSnapshot(rewrittenScripts, {
        projectId: "test-project",
      });

      expect(snapshot.items[0].labels.length).toBeGreaterThan(0);
      // 去重
      const uniqueLabels = new Set(snapshot.items[0].labels);
      expect(uniqueLabels.size).toBe(snapshot.items[0].labels.length);
    });
  });

  describe("完整流程测试", () => {
    it("解析 -> 过滤 -> 构建快照", () => {
      // 1. 创建模拟数据
      const scripts = [
        createMockLibraryScript(), // 符合条件
        createMockLibraryScript({
          content: JSON.stringify({
            video_analysis: {
              on_screen_presence: {
                has_real_person: false, // 不符合条件
              },
            },
          }),
        }),
        createMockLibraryScript(), // 符合条件
      ];

      // 2. 解析
      const parsed = parseVideoScriptsContents(scripts);
      expect(parsed.length).toBe(3);

      // 3. 过滤
      const filtered = filterVideoScripts(parsed, {
        characterStyles: ["街头潮流", "日系清新"],
      });
      expect(filtered.length).toBe(2);

      // 4. 模拟改写结果
      const rewritten: ScriptRewriterOutput[] = filtered.map((f) => ({
        success: true,
        originalScriptId: f.id,
        rewrittenContent: f.parsed!,
      }));

      // 5. 构建快照
      const snapshot = buildVideoScriptSnapshot(rewritten, {
        projectId: "test-project",
      });

      expect(snapshot.items.length).toBe(2);
      expect(snapshot.projectId).toBe("test-project");
    });
  });
});