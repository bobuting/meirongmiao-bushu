/**
 * 脚本有效性分析模块
 *
 * 借鉴 BettaFish 的核心逻辑，基于服饰资产和角色信息生成符合 nrm_script_data 表格式的脚本
 *
 * 核心设计：
 * 1. 热点匹配：从热点资产中匹配最佳热点
 * 2. 关键词优化：将服饰标签转化为用户语言
 * 3. 反思迭代：评估匹配度，优化脚本
 */

// 核心组件
export { ScriptGenerator, type ScriptGeneratorDeps } from "./generator.js";

// 类型定义
export type {
  OutfitAssetInput,
  CharacterInfoInput,
  HotTrendAssetSnapshot,
  VideoScriptPayload,
  ScriptDataRecord,
  ScriptGenerationInput,
} from "./types.js";

// 辅助函数
export { toOutfitAssetInput, toCharacterInfoInput } from "./types.js";