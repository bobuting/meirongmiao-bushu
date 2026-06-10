/**
 * Skills 发布服务单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { publishToSkills, getSkillVersion, skillExists } from "../../../src/modules/prompt-evolution/skills-publisher.js";

const TEST_SKILLS_DIR = join(process.cwd(), "skills");
const TEST_SKILL_CODE = "test_skill_publisher";
const TEST_SKILL_PATH = join(TEST_SKILLS_DIR, TEST_SKILL_CODE);

describe("Skills Publisher", () => {
  beforeEach(async () => {
    await mkdir(TEST_SKILL_PATH, { recursive: true });
    const initialContent = `---
code: ${TEST_SKILL_CODE}
name: 测试技能
description: 用于测试发布功能
category: test
tags: []
version: 1.0.0
author: system
defaultVariant: default
---

# 测试技能

这是初始内容。
`;
    await writeFile(join(TEST_SKILL_PATH, "SKILL.md"), initialContent, "utf-8");
  });

  afterEach(async () => {
    try {
      await rm(TEST_SKILL_PATH, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  it("应该成功发布新内容并增加版本号", async () => {
    const newContent = "# 测试技能\n\n这是更新后的内容。";
    const changeSummary = "测试更新";

    const result = await publishToSkills(
      TEST_SKILL_CODE,
      newContent,
      changeSummary,
    );

    expect(result.success).toBe(true);
    expect(result.oldVersion).toBe("1.0.0");
    expect(result.newVersion).toBe("1.0.1");

    const updatedContent = await readFile(join(TEST_SKILL_PATH, "SKILL.md"), "utf-8");
    expect(updatedContent).toContain("version: 1.0.1");
    expect(updatedContent).toContain("这是更新后的内容");
  });

  it("getSkillVersion 应该返回正确的版本号", async () => {
    const version = await getSkillVersion(TEST_SKILL_CODE);
    expect(version).toBe("1.0.0");
  });

  it("skillExists 应该正确检测 Skill 是否存在", async () => {
    const exists = await skillExists(TEST_SKILL_CODE);
    expect(exists).toBe(true);

    const notExists = await skillExists("non_existent_skill");
    expect(notExists).toBe(false);
  });
});
