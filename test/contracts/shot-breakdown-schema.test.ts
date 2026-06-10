/**
 * 分镜数据 Zod Schema 验证测试
 */

import { describe, it, expect } from "vitest";
import {
  ShotBreakdownArraySchema,
  ShotBreakdownItemSchema,
  CharacterMatchingInputSchema,
  validateShotBreakdown,
  validateSingleShot,
  validateCharacterMatchingInput,
} from "../../src/contracts/shot-breakdown-schema.js";

describe("ShotBreakdownArraySchema", () => {
  describe("有效数据", () => {
    it("应接受有效的分镜数组", () => {
      const data = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: 1, description: "主角" }
          ]
        }
      ];

      const result = ShotBreakdownArraySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("应接受空数组", () => {
      const result = ShotBreakdownArraySchema.safeParse([]);
      expect(result.success).toBe(true);
    });

    it("应接受包含所有可选字段的完整数据", () => {
      const data = [
        {
          shot_id: 1,
          timecode: { start: "00:00:01", end: "00:00:03", duration_seconds: 2 },
          shot_type: "中景",
          camera_movement: "推进",
          subjects: [
            {
              type: "人物",
              person_id: 1,
              description: "主角",
              clothing: { ref: "搭配1", overall_style: "休闲" }
            }
          ],
          audio: {
            dialogue: { speaker: "主角", content: "你好", tone: "友好" },
            music: { presence: true, style: "轻快" }
          }
        }
      ];

      const result = ShotBreakdownArraySchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("应接受额外字段（passthrough）", () => {
      const data = [
        {
          shot_id: 1,
          custom_field: "自定义值",
          another_field: 123
        }
      ];

      const result = ShotBreakdownArraySchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0]).toHaveProperty("custom_field", "自定义值");
      }
    });
  });

  describe("无效数据", () => {
    it("应拒绝非数组输入", () => {
      const result = ShotBreakdownArraySchema.safeParse({ shot_id: 1 });
      expect(result.success).toBe(false);
    });

    it("应拒绝 shot_id 为负数", () => {
      const data = [{ shot_id: -1 }];
      const result = ShotBreakdownArraySchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it("应拒绝 shot_id 为 0", () => {
      const data = [{ shot_id: 0 }];
      const result = ShotBreakdownArraySchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it("应拒绝 shot_id 为非整数", () => {
      const data = [{ shot_id: 1.5 }];
      const result = ShotBreakdownArraySchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it("应拒绝重复的 shot_id", () => {
      const data = [
        { shot_id: 1 },
        { shot_id: 1 }
      ];
      const result = ShotBreakdownArraySchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.message.includes("重复的 shot_id")
        )).toBe(true);
      }
    });

    it("应拒绝 person_id 为负数", () => {
      const data = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: -1 }
          ]
        }
      ];
      const result = ShotBreakdownArraySchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});

describe("ShotBreakdownItemSchema", () => {
  it("应接受最小有效数据", () => {
    const result = ShotBreakdownItemSchema.safeParse({ shot_id: 1 });
    expect(result.success).toBe(true);
  });

  it("应接受有效的 subjects 数组", () => {
    const data = {
      shot_id: 1,
      subjects: [
        { type: "人物", person_id: 1 },
        { type: "物体", description: "道具" }
      ]
    };
    const result = ShotBreakdownItemSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("应接受有效的 clothing 结构", () => {
    const data = {
      shot_id: 1,
      subjects: [
        {
          type: "人物",
          person_id: 1,
          clothing: {
            ref: "搭配1",
            overall_style: "休闲"
          }
        }
      ]
    };
    const result = ShotBreakdownItemSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("应拒绝缺少 shot_id 的数据", () => {
    const result = ShotBreakdownItemSchema.safeParse({ subjects: [] });
    expect(result.success).toBe(false);
  });
});

describe("CharacterMatchingInputSchema", () => {
  it("应接受有效的输入", () => {
    const data = {
      gender: "female",
      description: "25岁都市白领",
      age: 25
    };
    const result = CharacterMatchingInputSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("应接受空对象", () => {
    const result = CharacterMatchingInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("应接受 undefined", () => {
    const result = CharacterMatchingInputSchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it("应拒绝无效的 gender 值", () => {
    const data = { gender: "invalid" };
    const result = CharacterMatchingInputSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("应拒绝负数的 age", () => {
    const data = { age: -1 };
    const result = CharacterMatchingInputSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("应拒绝超过 150 的 age", () => {
    const data = { age: 200 };
    const result = CharacterMatchingInputSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("validateShotBreakdown", () => {
  it("应返回成功结果", () => {
    const data = [{ shot_id: 1 }];
    const result = validateShotBreakdown(data);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("应返回失败结果和错误消息", () => {
    const data = [{ shot_id: -1 }];
    const result = validateShotBreakdown(data);
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toContain("分镜数据验证失败");
  });

  it("错误消息应包含字段路径", () => {
    const data = [{ shot_id: -1 }];
    const result = validateShotBreakdown(data);
    expect(result.error).toContain("shot_id");
  });
});

describe("validateSingleShot", () => {
  it("应返回成功结果", () => {
    const data = { shot_id: 1 };
    const result = validateSingleShot(data);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("应返回失败结果", () => {
    const data = { shot_id: "invalid" };
    const result = validateSingleShot(data);
    expect(result.success).toBe(false);
    expect(result.error).toContain("分镜验证失败");
  });
});

describe("validateCharacterMatchingInput", () => {
  it("应返回成功结果", () => {
    const data = { gender: "male", description: "测试" };
    const result = validateCharacterMatchingInput(data);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("应返回失败结果", () => {
    const data = { age: "invalid" };
    const result = validateCharacterMatchingInput(data);
    expect(result.success).toBe(false);
    expect(result.error).toContain("角色匹配输入验证失败");
  });
});
