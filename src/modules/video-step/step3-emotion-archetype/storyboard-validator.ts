/**
 * 分镜验证器
 * 验证生成的分镜是否符合大纲要求
 */

import type { EmotionArchetype, StoryOutline, StoryboardValidation } from "./types.js";
import type { Storyboard, StoryboardShot } from "../../../contracts/storyboard-contract.js";

/**
 * 验证分镜质量
 */
export function validateStoryboard(
  storyboard: Storyboard,
  outline: StoryOutline,
  archetype: EmotionArchetype
): StoryboardValidation {
  let score = 100;
  const issues: string[] = [];

  // 1. 检查基本结构
  if (!storyboard.shot_breakdown || !Array.isArray(storyboard.shot_breakdown)) {
    return {
      pass: false,
      score: 0,
      issues: ["缺少 shot_breakdown 字段或格式错误"]
    };
  }

  // 2. 检查镜头数量是否一致（30分）
  const actualShotCount = storyboard.shot_breakdown.length;
  const expectedShotCount = outline.shots_outline.length;
  if (actualShotCount !== expectedShotCount) {
    score -= 30;
    issues.push(`镜头数量不一致：期望${expectedShotCount}，实际${actualShotCount}`);
  }

  // 3. 检查每个镜头的场景是否一致（40分）
  let sceneMismatch = 0;
  storyboard.shot_breakdown.forEach((shot: StoryboardShot, i: number) => {
    const expectedScene = outline.shots_outline[i]?.scene;
    const actualScene = (shot.visual?.scene as Record<string, unknown>)?.specific_location as string | undefined;

    if (expectedScene && actualScene) {
      // 检查场景是否包含关键词
      if (!actualScene.includes(expectedScene) && !expectedScene.includes(actualScene)) {
        sceneMismatch++;
      }
    } else if (expectedScene && !actualScene) {
      sceneMismatch++;
    }
  });

  if (sceneMismatch > 0) {
    const penalty = Math.min(40, (sceneMismatch / actualShotCount) * 40);
    score -= penalty;
    issues.push(`${sceneMismatch}个镜头场景不符合大纲`);
  }

  // 4. 检查情感弧线是否一致（30分）
  const actualEmotionArc = storyboard.video_analysis?.emotion?.emotion_arc;
  if (actualEmotionArc !== outline.emotion_arc) {
    score -= 30;
    issues.push(`情感弧线不一致：期望「${outline.emotion_arc}」，实际「${actualEmotionArc}」`);
  }

  return {
    pass: score >= 70,
    score,
    issues
  };
}

/**
 * 验证服饰展示质量
 */
export function validateClothingShowcase(storyboard: Storyboard): {
  score: number;
  issues: string[];
} {
  let score = 100;
  const issues: string[] = [];

  if (!storyboard.shot_breakdown) {
    return { score: 0, issues: ["缺少分镜数据"] };
  }

  // 检查每个镜头的用户角色服饰描述
  // 业务规则：用户角色（person_id=1）必须锚定参考图，配角可选
  let missingClothingDesc = 0;
  let missingVisualChange = 0;

  storyboard.shot_breakdown.forEach((shot: StoryboardShot, i: number) => {
    // 找到用户角色（person_id=1）
    const userSubject = shot.subjects?.find((s: any) => s.person_id === 1);

    // 只检查用户角色的 clothing.ref
    if (userSubject) {
      const clothing = userSubject.clothing as Record<string, unknown> | undefined;
      if (!clothing || !clothing.ref) {
        missingClothingDesc++;
      }

      if (!clothing?.visual_change) {
        missingVisualChange++;
      }
    }
  });

  if (missingClothingDesc > 0) {
    score -= 50;
    issues.push(`${missingClothingDesc}个镜头缺少服饰锚点(clothing.ref)`);
  }

  if (missingVisualChange > 0) {
    score -= 30;
    issues.push(`${missingVisualChange}个镜头缺少服饰视觉变化描述`);
  }

  return { score, issues };
}
