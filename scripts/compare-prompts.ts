#!/usr/bin/env tsx
/**
 * 提示词对比工具
 * 对比旧提示词系统和新 Skills 系统的输出差异
 */

import { SkillLoader } from '../src/services/skills/skill-loader.js';

interface ComparisonResult {
  skillCode: string;
  skillName: string;
  testCase: string;
  oldOutput: {
    system: string;
    user: string;
  };
  newOutput: {
    system: string;
    user: string;
  };
  differences: {
    systemDiff: boolean;
    userDiff: boolean;
    systemLength: { old: number; new: number };
    userLength: { old: number; new: number };
  };
}

/**
 * 从旧系统获取提示词输出
 */
async function getOldPromptOutput(code: string, input: any): Promise<{ system: string; user: string }> {
  // TODO: 从旧系统加载提示词
  // 这里返回模拟数据
  return {
    system: '旧系统的 System Prompt',
    user: `旧系统的 User Prompt\n用户输入: ${input.userPrompt || input.userInput}`
  };
}

/**
 * 从新系统获取提示词输出
 */
async function getNewPromptOutput(code: string, input: any): Promise<{ system: string; user: string }> {
  const loader = new SkillLoader();
  const skill = await loader.load(code);
  return await skill.render(input);
}

/**
 * 对比两个提示词输出
 */
function compareOutputs(
  skillCode: string,
  skillName: string,
  testCase: string,
  oldOutput: { system: string; user: string },
  newOutput: { system: string; user: string }
): ComparisonResult {
  return {
    skillCode,
    skillName,
    testCase,
    oldOutput,
    newOutput,
    differences: {
      systemDiff: oldOutput.system !== newOutput.system,
      userDiff: oldOutput.user !== newOutput.user,
      systemLength: {
        old: oldOutput.system.length,
        new: newOutput.system.length
      },
      userLength: {
        old: oldOutput.user.length,
        new: newOutput.user.length
      }
    }
  };
}

/**
 * 计算文本相似度（简单的字符级相似度）
 */
function calculateSimilarity(text1: string, text2: string): number {
  const len1 = text1.length;
  const len2 = text2.length;
  const maxLen = Math.max(len1, len2);

  if (maxLen === 0) return 1.0;

  let matches = 0;
  const minLen = Math.min(len1, len2);

  for (let i = 0; i < minLen; i++) {
    if (text1[i] === text2[i]) {
      matches++;
    }
  }

  return matches / maxLen;
}

/**
 * 生成对比报告
 */
function generateReport(results: ComparisonResult[]): string {
  let report = '# 提示词对比报告\n\n';
  report += `生成时间: ${new Date().toISOString()}\n\n`;

  // 统计信息
  const totalTests = results.length;
  const systemDiffs = results.filter(r => r.differences.systemDiff).length;
  const userDiffs = results.filter(r => r.differences.userDiff).length;

  report += '## 统计信息\n\n';
  report += `- 总测试数: ${totalTests}\n`;
  report += `- System Prompt 差异: ${systemDiffs} (${((systemDiffs / totalTests) * 100).toFixed(1)}%)\n`;
  report += `- User Prompt 差异: ${userDiffs} (${((userDiffs / totalTests) * 100).toFixed(1)}%)\n\n`;

  // 详细对比
  report += '## 详细对比\n\n';

  for (const result of results) {
    report += `### ${result.skillName} (${result.skillCode})\n\n`;
    report += `测试用例: ${result.testCase}\n\n`;

    // System Prompt 对比
    report += '#### System Prompt\n\n';
    if (result.differences.systemDiff) {
      report += '⚠️ **存在差异**\n\n';
      report += `- 旧系统长度: ${result.differences.systemLength.old} 字符\n`;
      report += `- 新系统长度: ${result.differences.systemLength.new} 字符\n`;
      const similarity = calculateSimilarity(result.oldOutput.system, result.newOutput.system);
      report += `- 相似度: ${(similarity * 100).toFixed(1)}%\n\n`;
    } else {
      report += '✅ **完全一致**\n\n';
    }

    // User Prompt 对比
    report += '#### User Prompt\n\n';
    if (result.differences.userDiff) {
      report += '⚠️ **存在差异**\n\n';
      report += `- 旧系统长度: ${result.differences.userLength.old} 字符\n`;
      report += `- 新系统长度: ${result.differences.userLength.new} 字符\n`;
      const similarity = calculateSimilarity(result.oldOutput.user, result.newOutput.user);
      report += `- 相似度: ${(similarity * 100).toFixed(1)}%\n\n`;
    } else {
      report += '✅ **完全一致**\n\n';
    }

    report += '---\n\n';
  }

  return report;
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 开始对比提示词输出...\n');

  // 定义测试用例
  const testCases = [
    {
      code: 'script-generation',
      name: '脚本生成',
      input: {
        outfitDescription: '白色衬衫配黑色西裤',
        sceneDescription: '现代办公室',
        style: 'professional',
        duration: 30,
        targetAudience: '职场白领'
      },
      description: '职场穿搭脚本'
    }
  ];

  const results: ComparisonResult[] = [];

  // 对比每个测试用例
  for (const testCase of testCases) {
    console.log(`🔄 对比: ${testCase.name} (${testCase.code})`);

    try {
      const oldOutput = await getOldPromptOutput(testCase.code, testCase.input);
      const newOutput = await getNewPromptOutput(testCase.code, testCase.input);

      const result = compareOutputs(
        testCase.code,
        testCase.name,
        testCase.description,
        oldOutput,
        newOutput
      );

      results.push(result);

      if (result.differences.systemDiff || result.differences.userDiff) {
        console.log('⚠️  发现差异');
      } else {
        console.log('✅ 输出一致');
      }
    } catch (error) {
      console.log(`❌ 对比失败: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log('');
  }

  // 生成报告
  const report = generateReport(results);
  const reportPath = './comparison-report.md';

  const fs = await import('fs/promises');
  await fs.writeFile(reportPath, report);

  console.log(`\n📄 对比报告已保存到: ${reportPath}`);

  // 输出统计
  const totalDiffs = results.filter(r => r.differences.systemDiff || r.differences.userDiff).length;
  console.log(`\n📊 对比统计:`);
  console.log(`   总测试数: ${results.length}`);
  console.log(`   存在差异: ${totalDiffs}`);
  console.log(`   完全一致: ${results.length - totalDiffs}`);

  if (totalDiffs > 0) {
    console.log('\n⚠️  部分输出存在差异，请检查报告');
  } else {
    console.log('\n✅ 所有输出完全一致！');
  }
}

main().catch(error => {
  console.error('❌ 对比过程出错:', error);
  process.exit(1);
});
