/**
 * 提示词优化器
 * 针对不同模型优化提示词格式，提升 AI 理解准确度并节省 token
 *
 * 核心功能：
 * 1. 模型类型自动检测（国产 vs 国际）
 * 2. 国产模型：Markdown 标题 → 中文【】格式，压缩换行，NEGATIVE 后置
 * 3. 国际模型：保持 Markdown 格式，压缩换行，NEGATIVE 后置
 */

/**
 * 模型类型枚举
 */
type ModelType = 'chinese' | 'english';

/**
 * 国产模型关键词（中文优先）
 * 如果模型名称包含这些关键词，则使用中文优化策略
 * 否则默认使用国际模型策略（保持 Markdown 格式）
 */
const CHINESE_MODEL_KEYWORDS = [
  'doubao',
  'seedream',
  'wanx',
  'kling',
  'bailian',
  'dashscope',
  'tongyi',
  'qwen',
];

/**
 * Markdown 标题 → 中文格式映射
 */
const TITLE_MAPPING: Record<string, string> = {
  '## ROLE': '【核心任务】',
  '## ⚠️ REALISM FIRST — HIGHEST PRIORITY': '【真实感优先】',
  '## LAYOUT': '【布局】',
  '## STYLE & TEXT': '【风格要求】',
  '## STYLE & TEXT — CRITICAL': '【风格要求】',
  '## CHARACTER APPEARANCE': '【角色外观】',
  '## BODY PROPORTIONS & POSTURE': '【姿态与比例】',
  '## OUTFIT CONSISTENCY': '【服装一致性】',
  '## TECHNICAL SPEC': '【技术规格】',
  '## LIGHTING SETUP — CRITICAL FOR REALISM': '【光影配置】',
  '## NEGATIVE PROMPT — MUST AVOID ALL BELOW': '【禁止项】',
  '## INPUT DATA': '【输入数据】',
  '## BODY DIRECTION — CRITICAL': '【身体朝向要求】',
  '## FULL BODY COMPOSITION — CRITICAL': '【全身构图要求】',
};

/**
 * 提示词优化器类
 */
export class PromptOptimizer {
  /**
   * 根据模型名称判断模型类型
   */
  private static detectModelType(model: string): ModelType {
    const normalizedModel = model.toLowerCase();

    // 检查是否为国产模型
    for (const keyword of CHINESE_MODEL_KEYWORDS) {
      if (normalizedModel.includes(keyword)) {
        return 'chinese';
      }
    }

    // 默认为国际模型
    return 'english';
  }

  /**
   * 优化提示词（主入口）
   *
   * @param model - 模型名称（如 "doubao-seedream-5-0-260128"）
   * @param system - System Prompt
   * @param user - User Prompt
   * @returns 优化后的提示词
   */
  static optimize(model: string, system: string, user: string): string {
    const modelType = this.detectModelType(model);

    if (modelType === 'chinese') {
      return this.optimizeForChineseModel(system, user);
    } else {
      return this.optimizeForEnglishModel(system, user);
    }
  }

  /**
   * 国产模型优化策略（豆包、万相、可灵等）
   *
   * 优化点：
   * 1. Markdown 标题改为中文格式【】
   * 2. 压缩连续换行（3+ → 2）
   * 3. NEGATIVE 移到最后
   * 4. 输入数据移到最前
   * 5. 【真实感优先】保持在最前面（不被移动）
   */
  private static optimizeForChineseModel(system: string, user: string): string {
    let combined = `${system}\n\n${user}`;

    // 1. Markdown 标题改为中文格式
    for (const [english, chinese] of Object.entries(TITLE_MAPPING)) {
      // 使用正则匹配整行（忽略大小写）
      const regex = new RegExp(`^${this.escapeRegex(english)}\\s*$`, 'gm');
      combined = combined.replace(regex, chinese);
    }

    // 新增：检测【真实感优先】section，保持它在最前面
    const realismMatch = combined.match(/【真实感优先】[\s\S]+?(?=【|$)/);
    if (realismMatch) {
      // 提取真实感优先内容，确保它在最前面
      combined = combined.replace(/【真实感优先】[\s\S]+?(?=【|$)/, '');
      combined = realismMatch[0].trim() + '\n\n' + combined.trim();
    }

    // 2. 压缩连续换行（3+ → 2）
    combined = combined.replace(/\n{3,}/g, '\n\n');

    // 3. 提取【禁止项】并移到最后
    const negativeMatch = combined.match(/【禁止项】[\s\S]+/);
    if (negativeMatch) {
      combined = combined.replace(/【禁止项】[\s\S]+/, '');
      combined = combined.trim() + '\n\n' + negativeMatch[0];
    }

    // 4. 提取【输入数据】并移到最前（但在真实感优先之后）
    // 匹配到下一个【标题】之前，或到文件末尾
    const inputMatch = combined.match(/【输入数据】[\s\S]+?(?=【|$)/);
    if (inputMatch) {
      combined = combined.replace(/【输入数据】[\s\S]+?(?=【|$)/, '');
      // 如果有真实感优先，插入到它之后；否则插入到最前
      if (realismMatch) {
        // 在真实感优先 section 之后插入输入数据
        combined = combined.replace(
          /【真实感优先】[\s\S]+?(?=【|$)/,
          (match) => match.trim() + '\n\n' + inputMatch[0].trim()
        );
      } else {
        combined = inputMatch[0].trim() + '\n\n' + combined.trim();
      }
    }

    return combined;
  }

  /**
   * 国际模型优化策略（Nano Banana、Gemini、OpenAI等）
   *
   * 优化点：
   * 1. 保持 Markdown 格式（英文标题）
   * 2. 压缩连续换行（3+ → 2）
   * 3. NEGATIVE 移到最后
   */
  private static optimizeForEnglishModel(system: string, user: string): string {
    let combined = `${system}\n\n${user}`;

    // 1. 压缩连续换行（3+ → 2）
    combined = combined.replace(/\n{3,}/g, '\n\n');

    // 2. 提取 NEGATIVE PROMPT 并移到最后
    const negativeMatch = combined.match(/## NEGATIVE PROMPT[\s\S]+/);
    if (negativeMatch) {
      combined = combined.replace(/## NEGATIVE PROMPT[\s\S]+/, '');
      combined = combined.trim() + '\n\n' + negativeMatch[0];
    }

    return combined;
  }

  /**
   * 转义正则表达式特殊字符
   */
  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 精简 NEGATIVE PROMPT（可选，进一步节省 token）
   *
   * @param negative - 原始 NEGATIVE PROMPT
   * @returns 精简后的 NEGATIVE PROMPT
   */
  static simplifyNegative(negative: string): string {
    const lines = negative.split('\n');
    const keyNegatives: string[] = [];

    // 质量要求
    if (negative.includes('low visual quality') || negative.includes('blurry')) {
      keyNegatives.push('质量要求：禁止低质量、模糊、变形、水印、文字、Logo。');
    }

    // 皮肤质感
    if (negative.includes('plastic skin') || negative.includes('porcelain skin')) {
      keyNegatives.push('皮肤质感：禁止塑料皮肤、瓷质皮肤、过度磨皮、无毛孔。');
    }

    // 风格禁止
    if (negative.includes('cartoon') || negative.includes('anime')) {
      keyNegatives.push('风格禁止：禁止卡通、动漫、插画、数字艺术。');
    }

    // 最终要求
    keyNegatives.push('最终要求：必须是写实摄影风格。');

    return keyNegatives.join('\n');
  }
}
