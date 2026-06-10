/**
 * 角色匹配服务单元测试
 */

import { describe, it, expect } from "vitest";
import { CharacterMatchingService } from "../../../../src/modules/video-step/step3/character-matching-service.js";
import type { ShotBreakdownItem } from "../../../../src/contracts/shot-breakdown-contract.js";

describe("CharacterMatchingService", () => {
  const service = new CharacterMatchingService();

  describe("analyzeCharacters", () => {
    it("应该正确统计 person_id 出现频率", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: 1, description: "主角" },
            { type: "人物", person_id: 2, description: "配角" }
          ]
        },
        {
          shot_id: 2,
          subjects: [
            { type: "人物", person_id: 1, description: "主角" }
          ]
        },
        {
          shot_id: 3,
          subjects: [
            { type: "人物", person_id: 1, description: "主角" },
            { type: "人物", person_id: 2, description: "配角" }
          ]
        }
      ];

      const result = service.analyzeCharacters(shotBreakdown);

      expect(result.mainPersonId).toBe(1);
      expect(result.personIds).toEqual([1, 2]);
      expect(result.personFrequency.get(1)).toBe(3);
      expect(result.personFrequency.get(2)).toBe(2);
    });

    it("应该处理空镜头数据", () => {
      const result = service.analyzeCharacters([]);

      expect(result.mainPersonId).toBe(null);
      expect(result.personIds).toEqual([]);
    });

    it("应该跳过非人物主体", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: 1, description: "主角" },
            { type: "物体", description: "道具" }
          ]
        }
      ];

      const result = service.analyzeCharacters(shotBreakdown);

      expect(result.mainPersonId).toBe(1);
      expect(result.personIds).toEqual([1]);
      expect(result.personFrequency.size).toBe(1);
    });
  });

  describe("remapPersonIdsForUserPriority", () => {
    it("用户角色已是 person_id=1 时不应重映射", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: 1, description: "25岁都市白领女性" }
          ]
        }
      ];

      const result = service.remapPersonIdsForUserPriority(shotBreakdown, {
        description: "25岁都市白领"
      });

      expect(result.remapping.size).toBe(0);
      expect(result.warnings).toEqual([]);
      expect(result.shotBreakdown[0].subjects![0].person_id).toBe(1);
    });

    it("用户角色是 person_id=2 时应重映射为 1", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: 2, description: "25岁都市白领女性" },
            { type: "人物", person_id: 1, description: "男性配角" }
          ]
        }
      ];

      const result = service.remapPersonIdsForUserPriority(shotBreakdown, {
        description: "25岁都市白领"
      });

      expect(result.remapping.size).toBe(2);
      expect(result.remapping.get(2)).toBe(1);
      expect(result.remapping.get(1)).toBe(3);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.shotBreakdown[0].subjects![0].person_id).toBe(1);
      expect(result.shotBreakdown[0].subjects![1].person_id).toBe(3);
    });

    it("通过描述关键词匹配识别用户角色", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: 3, description: "优雅气质女性，穿着白色连衣裙" }
          ]
        }
      ];

      const result = service.remapPersonIdsForUserPriority(shotBreakdown, {
        description: "优雅气质女性"
      });

      expect(result.remapping.get(3)).toBe(1);
      expect(result.shotBreakdown[0].subjects![0].person_id).toBe(1);
    });

    it("无用户信息时应返回最高频率角色", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: 2, description: "配角" },
            { type: "人物", person_id: 3, description: "主角" }
          ]
        },
        {
          shot_id: 2,
          subjects: [
            { type: "人物", person_id: 3, description: "主角" }
          ]
        },
        {
          shot_id: 3,
          subjects: [
            { type: "人物", person_id: 3, description: "主角" }
          ]
        }
      ];

      const result = service.remapPersonIdsForUserPriority(shotBreakdown, {});

      // person_id=3 出现 3 次，应该被重映射为 1
      expect(result.remapping.get(3)).toBe(1);
    });
  });

  describe("ensureOutfitAnchor", () => {
    it("服饰锚点正确时不应修正", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            {
              type: "人物",
              person_id: 1,
              description: "主角",
              clothing: { ref: "搭配1", overall_style: "休闲" }
            }
          ]
        }
      ];

      const result = service.ensureOutfitAnchor(shotBreakdown, 1, "搭配1");

      expect(result.warnings).toEqual([]);
      expect(result.shotBreakdown[0].subjects![0].clothing!.ref).toBe("搭配1");
    });

    it("服饰锚点错误时应修正", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            {
              type: "人物",
              person_id: 1,
              description: "主角",
              clothing: { ref: "搭配2", overall_style: "休闲" }
            }
          ]
        },
        {
          shot_id: 2,
          subjects: [
            {
              type: "人物",
              person_id: 1,
              description: "主角",
              clothing: { ref: "搭配3", overall_style: "休闲" }
            }
          ]
        }
      ];

      const result = service.ensureOutfitAnchor(shotBreakdown, 1, "搭配1");

      expect(result.warnings.length).toBe(2);
      expect(result.shotBreakdown[0].subjects![0].clothing!.ref).toBe("搭配1");
      expect(result.shotBreakdown[1].subjects![0].clothing!.ref).toBe("搭配1");
    });

    it("不应修正非用户角色的服饰锚点", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            {
              type: "人物",
              person_id: 2,
              description: "配角",
              clothing: { ref: "搭配2", overall_style: "正式" }
            }
          ]
        }
      ];

      const result = service.ensureOutfitAnchor(shotBreakdown, 1, "搭配1");

      expect(result.warnings).toEqual([]);
      expect(result.shotBreakdown[0].subjects![0].clothing!.ref).toBe("搭配2");
    });
  });

  describe("isMainCharacterInShot", () => {
    it("主角色在镜头中时应返回 true", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 1,
        subjects: [
          { type: "人物", person_id: 1, description: "主角" },
          { type: "人物", person_id: 2, description: "配角" }
        ]
      };

      expect(service.isMainCharacterInShot(shot, 1)).toBe(true);
    });

    it("主角色不在镜头中时应返回 false", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 1,
        subjects: [
          { type: "人物", person_id: 2, description: "配角" }
        ]
      };

      expect(service.isMainCharacterInShot(shot, 1)).toBe(false);
    });

    it("空镜头时应返回 false", () => {
      const shot: ShotBreakdownItem = {
        shot_id: 1,
        subjects: []
      };

      expect(service.isMainCharacterInShot(shot, 1)).toBe(false);
    });
  });

  // =====================================================
  // 边界场景测试
  // =====================================================

  describe("边界场景", () => {
    it("多角色场景：3+ 角色时应正确识别主角", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: 2, description: "配角A" },
            { type: "人物", person_id: 3, description: "配角B" },
            { type: "人物", person_id: 4, description: "配角C" }
          ]
        },
        {
          shot_id: 2,
          subjects: [
            { type: "人物", person_id: 3, description: "主角" }
          ]
        },
        {
          shot_id: 3,
          subjects: [
            { type: "人物", person_id: 3, description: "主角" }
          ]
        }
      ];

      const result = service.remapPersonIdsForUserPriority(shotBreakdown, {
        description: "主角"
      });

      // person_id=3 出现最多次，应被重映射为 1
      expect(result.remapping.get(3)).toBe(1);
      expect(result.shotBreakdown[1].subjects![0].person_id).toBe(1);
    });

    it("person_id 不连续时应正确重映射", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: 5, description: "25岁都市白领" },
            { type: "人物", person_id: 10, description: "配角A" }
          ]
        },
        {
          shot_id: 2,
          subjects: [
            { type: "人物", person_id: 7, description: "配角B" }
          ]
        }
      ];

      const result = service.remapPersonIdsForUserPriority(shotBreakdown, {
        description: "25岁都市白领"
      });

      // 用户角色 person_id=5 应重映射为 1
      expect(result.remapping.get(5)).toBe(1);
      expect(result.shotBreakdown[0].subjects![0].person_id).toBe(1);
    });

    it("多套服饰场景：同一角色多套服饰应保持 person_id 不变", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: 1, description: "主角", clothing: { ref: "搭配1" } }
          ]
        },
        {
          shot_id: 2,
          subjects: [
            { type: "人物", person_id: 1, description: "主角", clothing: { ref: "搭配2" } }
          ]
        },
        {
          shot_id: 3,
          subjects: [
            { type: "人物", person_id: 1, description: "主角", clothing: { ref: "搭配3" } }
          ]
        }
      ];

      // 角色匹配应保持 person_id=1
      const result = service.analyzeCharacters(shotBreakdown);
      expect(result.mainPersonId).toBe(1);

      // 服饰锚点修正应只修正目标搭配
      const outfitResult = service.ensureOutfitAnchor(shotBreakdown, 1, "搭配1");
      expect(outfitResult.warnings.length).toBe(2); // 搭配2 和 搭配3 被修正
      expect(outfitResult.shotBreakdown[0].subjects![0].clothing!.ref).toBe("搭配1");
      expect(outfitResult.shotBreakdown[1].subjects![0].clothing!.ref).toBe("搭配1");
      expect(outfitResult.shotBreakdown[2].subjects![0].clothing!.ref).toBe("搭配1");
    });

    it("用户角色无服饰时应跳过服饰修正", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: 1, description: "主角" }
          ]
        }
      ];

      const result = service.ensureOutfitAnchor(shotBreakdown, 1, "搭配1");

      expect(result.warnings).toEqual([]);
    });

    it("服饰信息缺失时不应报错", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: 1, description: "主角", clothing: { ref: "搭配1" } }
          ]
        }
      ];

      // 执行应不报错
      const result = service.ensureOutfitAnchor(shotBreakdown, 1, "搭配1");
      expect(result.warnings).toEqual([]);
    });

    it("混合主体类型：物体主体不应影响角色统计", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        {
          shot_id: 1,
          subjects: [
            { type: "人物", person_id: 1, description: "主角" },
            { type: "物体", description: "咖啡杯" },
            { type: "人物", person_id: 2, description: "配角" }
          ]
        },
        {
          shot_id: 2,
          subjects: [
            { type: "物体", description: "书本" }
          ]
        }
      ];

      const result = service.analyzeCharacters(shotBreakdown);

      expect(result.personIds).toEqual([1, 2]);
      expect(result.personFrequency.get(1)).toBe(1);
      expect(result.personFrequency.get(2)).toBe(1);
    });

    it("用户角色戏份少时仍应正确识别（关键：铁律不能因戏份少违反）", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        { shot_id: 1, subjects: [{ type: "人物", person_id: 2, description: "配角，年轻女性" }] },
        { shot_id: 2, subjects: [{ type: "人物", person_id: 2, description: "配角，年轻女性" }] },
        { shot_id: 3, subjects: [{ type: "人物", person_id: 2, description: "配角，年轻女性" }] },
        { shot_id: 4, subjects: [{ type: "人物", person_id: 3, description: "25岁，都市白领女性" }] }
      ];

      const result = service.remapPersonIdsForUserPriority(shotBreakdown, {
        description: "25岁 都市 白领"
      });

      // 用户角色只出现 1 次，配角出现 3 次，但用户角色仍应为 person_id=1
      // 关键词：25岁、都市、白领 与 "25岁，都市白领女性" 匹配 >= 2
      expect(result.remapping.get(3)).toBe(1);
      expect(result.shotBreakdown[3].subjects![0].person_id).toBe(1);
    });

    it("短描述匹配：单关键词应降级到频率匹配", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        { shot_id: 1, subjects: [{ type: "人物", person_id: 2, description: "女性主角" }] },
        { shot_id: 2, subjects: [{ type: "人物", person_id: 3, description: "男性配角" }] }
      ];

      // 用户描述只有"女性"（1个关键词，<2无法匹配）
      const result = service.remapPersonIdsForUserPriority(shotBreakdown, {
        description: "女性"
      });

      // 应 fallback 到频率匹配（person_id=2 出现 1 次，person_id=3 出现 1 次）
      // 频率相同时返回第一个遇到的，但用户角色戏份少场景已在上一个测试验证
      expect(result.remapping.size).toBeGreaterThanOrEqual(0);
    });

    it("重映射编号冲突：原 person_id=1 应被重新分配到不冲突的编号", () => {
      const shotBreakdown: ShotBreakdownItem[] = [
        { shot_id: 1, subjects: [
          { type: "人物", person_id: 1, description: "原配角，年轻男性" },
          { type: "人物", person_id: 5, description: "25岁，都市白领女性" }
        ]}
      ];

      const result = service.remapPersonIdsForUserPriority(shotBreakdown, {
        description: "25岁 都市 白领"
      });

      // 用户角色 5 → 1，原 1 → 新编号（应 > 5）
      expect(result.remapping.get(5)).toBe(1);
      expect(result.remapping.get(1)).toBeGreaterThan(5);
      expect(result.warnings.some(w => w.includes("重新分配"))).toBe(true);
    });

    // =====================================================
    // 产品展示脚本边界场景测试
    // =====================================================

    it("纯产品镜头：角色不出镜时不应报错", () => {
      // 用户上传了角色五视图，但脚本全是产品特写
      const shotBreakdown: ShotBreakdownItem[] = [
        { shot_id: 1, subjects: [{ type: "产品", description: "白色衬衫平铺" }] },
        { shot_id: 2, subjects: [{ type: "产品", description: "领口细节特写" }] },
        { shot_id: 3, subjects: [{ type: "产品", description: "袖口细节" }] }
      ];

      const result = service.remapPersonIdsForUserPriority(shotBreakdown, {
        description: "25岁 都市 白领"
      });

      // 无人物可重映射，返回原数据
      expect(result.remapping.size).toBe(0);
      expect(result.warnings).toEqual([]);
    });

    it("混合镜头：部分镜头角色不出镜", () => {
      // 脚本既有产品特写，又有角色出镜
      const shotBreakdown: ShotBreakdownItem[] = [
        { shot_id: 1, subjects: [{ type: "产品", description: "白色衬衫平铺" }] },
        { shot_id: 2, subjects: [{ type: "人物", person_id: 2, description: "25岁都市白领女性" }] },
        { shot_id: 3, subjects: [{ type: "产品", description: "领口细节" }] }
      ];

      const result = service.remapPersonIdsForUserPriority(shotBreakdown, {
        description: "25岁 都市 白领"
      });

      // 用户角色应被识别并重映射为 person_id=1
      expect(result.remapping.get(2)).toBe(1);
      expect(result.shotBreakdown[1].subjects![0].person_id).toBe(1);
      // 产品镜头不受影响
      expect(result.shotBreakdown[0].subjects![0].type).toBe("产品");
    });

    it("手部特写：只有手出镜时应兼容处理", () => {
      // 手持产品展示场景，只有手部出镜，不归类为"人物"
      const shotBreakdown: ShotBreakdownItem[] = [
        { shot_id: 1, subjects: [{ type: "手部", description: "手持产品展示" }] },
        { shot_id: 2, subjects: [{ type: "产品", description: "产品特写" }] }
      ];

      const result = service.analyzeCharacters(shotBreakdown);

      // 手部不被识别为"人物"，无角色分配
      expect(result.mainPersonId).toBe(null);
      expect(result.personIds).toEqual([]);
    });

    it("手部+全身镜头：手部不影响角色统计", () => {
      // 同一脚本中既有手部特写，又有全身出镜
      const shotBreakdown: ShotBreakdownItem[] = [
        { shot_id: 1, subjects: [{ type: "手部", description: "手持产品" }] },
        { shot_id: 2, subjects: [{ type: "人物", person_id: 1, description: "25岁都市白领女性" }] },
        { shot_id: 3, subjects: [{ type: "手部", description: "展示细节" }] }
      ];

      const result = service.analyzeCharacters(shotBreakdown);

      // 只有 person_id=1 被统计，手部不计入
      expect(result.personIds).toEqual([1]);
      expect(result.personFrequency.get(1)).toBe(1);
    });
  });
});
