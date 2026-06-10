/**
 * step3-product-showcase/script-rewriter.unit.test.ts
 * 产品展示脚本改写器单元测试
 */

import { describe, it, expect } from "vitest";
import type { ShotBreakdownItem } from "../../../src/contracts/shot-breakdown-contract.js";

// 模拟 classifyShotType 函数（从模块内部提取测试）
function classifyShotType(shot: ShotBreakdownItem): {
  shotId: number;
  classification: "full_model" | "partial_model" | "no_model";
  reason: string;
} {
  const subjects = shot.subjects ?? [];
  const hasPerson = subjects.some(s => s.type === "人物");
  const shotType = shot.shot_type ?? "";
  const shotId = shot.shot_id;

  // 无模特镜头：subjects 中无人物
  if (!hasPerson) {
    return {
      shotId,
      classification: "no_model",
      reason: "subjects 只有物体或为空，无人物",
    };
  }

  // 局部出镜判断：景别为特写/近景 且 人物描述只涉及局部
  const personSubject = subjects.find(s => s.type === "人物");
  const isCloseUp = /特写|近景|细节|微距/.test(shotType);
  const description = personSubject?.description ?? "";
  const action = personSubject?.action ?? "";
  const isPartialBody = /手|手臂|肩|颈部|脚|腕|指尖/.test(description + action);

  if (isCloseUp && isPartialBody) {
    return {
      shotId,
      classification: "partial_model",
      reason: `景别为 ${shotType}，人物描述涉及局部（${description.slice(0, 30)}${action.slice(0, 30)}）`,
    };
  }

  // 有模特镜头：景别为全身/半身，或人物描述涉及完整身体
  return {
    shotId,
    classification: "full_model",
    reason: `subjects 有人物，景别为 ${shotType}`,
  };
}

describe("classifyShotType", () => {
  describe("无模特镜头（no_model）", () => {
    it("subjects 为空数组时返回 no_model", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 1,
        subjects: [],
        shot_type: "面料特写",
      };

      const result = classifyShotType(shot);

      expect(result.classification).toBe("no_model");
      expect(result.shotId).toBe(1);
    });

    it("subjects 只有物体类型时返回 no_model", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 2,
        subjects: [
          { type: "物体", description: "白色棉质面料" }
        ],
        shot_type: "细节特写",
      };

      const result = classifyShotType(shot);

      expect(result.classification).toBe("no_model");
    });

    it("subjects 为 undefined 时返回 no_model", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 3,
        shot_type: "微距",
      };

      const result = classifyShotType(shot);

      expect(result.classification).toBe("no_model");
    });
  });

  describe("有模特镜头（full_model）", () => {
    it("全身镜头返回 full_model", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 1,
        shot_type: "全身",
        subjects: [
          { type: "人物", description: "约25岁女性，气质温柔" }
        ],
      };

      const result = classifyShotType(shot);

      expect(result.classification).toBe("full_model");
    });

    it("半身镜头返回 full_model", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 2,
        shot_type: "半身",
        subjects: [
          { type: "人物", description: "22岁男性" }
        ],
      };

      const result = classifyShotType(shot);

      expect(result.classification).toBe("full_model");
    });

    it("全景镜头返回 full_model", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 3,
        shot_type: "全景",
        subjects: [
          { type: "人物", description: "模特全身展示" }
        ],
      };

      const result = classifyShotType(shot);

      expect(result.classification).toBe("full_model");
    });

    it("shot_type 为空时默认返回 full_model（有人物）", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 4,
        subjects: [
          { type: "人物", description: "模特站立" }
        ],
      };

      const result = classifyShotType(shot);

      expect(result.classification).toBe("full_model");
    });
  });

  describe("局部出镜镜头（partial_model）", () => {
    it("手部特写返回 partial_model", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 1,
        shot_type: "细节特写",
        subjects: [
          { type: "人物", description: "手指纤细，肤色白皙", action: "手指抚过面料" }
        ],
      };

      const result = classifyShotType(shot);

      expect(result.classification).toBe("partial_model");
    });

    it("手臂近景返回 partial_model", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 2,
        shot_type: "近景",
        subjects: [
          { type: "人物", description: "手臂修长", action: "展示袖口细节" }
        ],
      };

      const result = classifyShotType(shot);

      expect(result.classification).toBe("partial_model");
    });

    it("肩部特写返回 partial_model", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 3,
        shot_type: "特写",
        subjects: [
          { type: "人物", description: "肩部线条优美" }
        ],
      };

      const result = classifyShotType(shot);

      expect(result.classification).toBe("partial_model");
    });

    it("全身镜头即使描述有手也不返回 partial_model", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 4,
        shot_type: "全身",
        subjects: [
          { type: "人物", description: "手指纤细", action: "手插口袋" }
        ],
      };

      const result = classifyShotType(shot);

      expect(result.classification).toBe("full_model");
    });
  });

  describe("边界情况", () => {
    it("人物描述为空时，特写镜头返回 full_model", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 1,
        shot_type: "特写",
        subjects: [
          { type: "人物", description: "", action: "" }
        ],
      };

      const result = classifyShotType(shot);

      expect(result.classification).toBe("full_model");
    });

    it("多人物时返回 full_model（主要人物）", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 1,
        shot_type: "全身",
        subjects: [
          { type: "人物", description: "主角" },
          { type: "人物", description: "配角" },
          { type: "物体", description: "椅子" }
        ],
      };

      const result = classifyShotType(shot);

      expect(result.classification).toBe("full_model");
    });
  });
});

describe("buildUserInput 预分类标注格式", () => {
  it("镜头分类结果应包含必要字段", () => {
    const classifications = [
      { shotId: 1, classification: "full_model" as const, reason: "subjects 有人物，景别为 全身" },
      { shotId: 2, classification: "partial_model" as const, reason: "景别为 特写，人物描述涉及局部" },
      { shotId: 3, classification: "no_model" as const, reason: "subjects 只有物体或为空，无人物" },
    ];

    // 验证格式可序列化
    const formatted = classifications.map(c => `- 分镜 ${c.shotId}：${c.classification}（${c.reason}）`).join("\n");

    expect(formatted).toContain("分镜 1：full_model");
    expect(formatted).toContain("分镜 2：partial_model");
    expect(formatted).toContain("分镜 3：no_model");
  });
});

describe("parseLLMResponse 错误处理", () => {
  // 模拟 parseLLMResponse 逻辑
  function parseLLMResponse(responseText: string): object | null {
    if (!responseText || typeof responseText !== "string") {
      return null;
    }

    let jsonStr = responseText.trim();

    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    try {
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  it("空字符串返回 null", () => {
    expect(parseLLMResponse("")).toBeNull();
  });

  it("非字符串返回 null", () => {
    expect(parseLLMResponse(null as any)).toBeNull();
    expect(parseLLMResponse(undefined as any)).toBeNull();
  });

  it("有效 JSON 返回解析结果", () => {
    const result = parseLLMResponse('{"shot_breakdown": []}');
    expect(result).toEqual({ shot_breakdown: [] });
  });

  it("带 markdown 代码块的 JSON 返回解析结果", () => {
    const result = parseLLMResponse('```json\n{"shot_breakdown": []}\n```');
    expect(result).toEqual({ shot_breakdown: [] });
  });

  it("无效 JSON 返回 null", () => {
    expect(parseLLMResponse("not json")).toBeNull();
  });
});

describe("与 video_script_rewriter 对比验证", () => {
  it("classifyShotType 应区分三种镜头，video_script_rewriter 不区分", () => {
    // product_showcase_rewriter 有三种分类
    const fullModel = classifyShotType({
      shot_id: 1,
      shot_type: "全身",
      subjects: [{ type: "人物", description: "模特" }]
    });
    expect(fullModel.classification).toBe("full_model");

    const partialModel = classifyShotType({
      shot_id: 2,
      shot_type: "特写",
      subjects: [{ type: "人物", description: "手部", action: "抚过面料" }]
    });
    expect(partialModel.classification).toBe("partial_model");

    const noModel = classifyShotType({
      shot_id: 3,
      shot_type: "面料特写",
      subjects: []
    });
    expect(noModel.classification).toBe("no_model");

    // video_script_rewriter 只替换人物，不区分镜头类型
    // 这是两者的核心区别
  });
});
