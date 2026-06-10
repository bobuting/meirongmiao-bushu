/**
 * Step3 脚本生成五阶段流水线（Stage3 已移除）
 * 导出所有阶段方法
 */

export { stage1_parseInput } from "./stage1-input-parser.js";
export { stage2_analyzeHotspots } from "./stage2-hotspot-analyzer.js";
export { stage4_createScripts } from "./stage4-script-creator.js";
export { stage5_validateScripts, validateScriptIronLaws, validateScriptGender } from "./stage5-quality-checker.js";
export type { Stage5Result } from "./stage5-quality-checker.js";
export { stage6_formatOutput } from "./stage6-output-formatter.js";
