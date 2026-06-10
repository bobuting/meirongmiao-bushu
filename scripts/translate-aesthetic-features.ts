/**
 * 批量翻译审美特征库数据
 * 将英文 feature_category, feature_name, feature_description 翻译为中文
 */

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

// LLM 翻译配置
const LLM_API_URL = process.env.LLM_API_URL || process.env.OPENAI_API_URL || 'https://api.openai.com/v1';
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';

/**
 * 翻译特征分类名称
 */
const CATEGORY_TRANSLATIONS: Record<string, string> = {
  'eye_shape_width': '眼型宽度',
  'eye_shape_almond': '眼型形状-杏仁眼',
  'eye_shape_round': '眼型形状-圆眼',
  'eye_color_hazel': '眼色-琥珀色',
  'eye_color_dark_brown': '眼色-深棕色',
  'eye_color_light_brown': '眼色-浅棕色',
  'skin_tone_warm_beige': '肤色-暖米色',
  'skin_tone_olive': '肤色-橄榄色',
  'skin_tone_rosy_cheeks': '肤色-红润脸颊',
  'hair_style_soft_waves': '发型-柔和波浪',
  'hair_style_natural_straight': '发型-自然直发',
  'hair_style_chestnut_brown': '发型-栗棕色',
  'nose_shape_button_defined': '鼻型-精致小鼻',
  'nose_shape_small_flat': '鼻型-小巧平鼻',
  'jawline_definition': '下颌线清晰度',
  'cheekbone_prominence': '颧骨突出度',
  'lip_fullness': '唇部丰满度',
  'eyebrow_shape': '眉形'
};

/**
 * 翻译特征名称（通用模式）
 */
function translateFeatureName(englishName: string): string {
  // 常见词汇翻译映射
  const wordMap: Record<string, string> = {
    'wide': '宽阔',
    'moderate': '适中',
    'narrow': '狭窄',
    'almond': '杏仁',
    'round': '圆润',
    'innocent': '无辜',
    'natural': '自然',
    'soft': '柔和',
    'curved': '弯曲',
    'defined': '清晰',
    'flat': '平坦',
    'hazel': '琥珀',
    'amber': '琥珀金',
    'warm': '温暖',
    'dark': '深',
    'brown': '棕色',
    'light': '浅',
    'beige': '米色',
    'olive': '橄榄',
    'rosy': '红润',
    'cheeks': '脸颊',
    'waves': '波浪',
    'straight': '直',
    'chestnut': '栗色',
    'button': '精致',
    'small': '小巧',
    'slight': '轻微',
    'bridge': '鼻梁',
    'visible': '明显',
    'youthful': '年轻',
    'balanced': '平衡',
    'gaze': '目光',
    'opening': '开阔',
    'tilt': '倾斜',
    'corner': '眼角',
    'outer': '外',
    'golden': '金色',
    'undertone': '底色',
    'flush': '红晕',
    'flushed': '泛红',
    'deep': '深邃',
    'black': '黑色',
    'wavy': '波浪',
    'arched': '拱形',
    'prominent': '突出',
    'high': '高',
    'full': '丰满',
    'lips': '嘴唇',
    'M': 'M形',
    'dudu': '嘟嘟',
    'arched_brows': '拱形眉',
    'sword_brows': '剑眉'
  };

  // 分词翻译
  const parts = englishName.split('_');
  const translatedParts = parts.map(part => wordMap[part] || part);
  return translatedParts.join('');
}

/**
 * 使用 LLM 翻译描述
 */
async function translateDescriptionWithLLM(description: string): Promise<string> {
  if (!LLM_API_KEY) {
    // 无 API Key 时返回简单翻译
    return `(${description})`;
  }

  try {
    const response = await fetch(`${LLM_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LLM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `将以下审美特征描述翻译成简洁优美的中文（用于电商短视频AI生成系统，描述儿童或成人角色的面部审美特征），保留关键信息，50字以内：

"${description}"

只返回翻译结果，不要解释。`
          }
        ],
        max_tokens: 100
      })
    });

    if (!response.ok) {
      console.error(`LLM API error: ${response.status}`);
      return description;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || description;
  } catch (e) {
    console.error('翻译失败:', e);
    return description;
  }
}

/**
 * 执行批量翻译
 */
async function batchTranslate() {
  console.log('开始批量翻译...');

  // 获取所有需要翻译的记录
  const result = await pool.query(`
    SELECT id, feature_category, feature_name, feature_description
    FROM nrm_aesthetic_feature_library
    WHERE feature_category_cn IS NULL
    ORDER BY id
  `);

  console.log(`找到 ${result.rows.length} 条记录需要翻译`);

  let translated = 0;
  let errors = 0;

  for (const row of result.rows) {
    try {
      // 翻译分类
      const categoryCn = CATEGORY_TRANSLATIONS[row.feature_category] || row.feature_category;

      // 翻译名称
      const nameCn = translateFeatureName(row.feature_name);

      // 翻译描述（使用 LLM）
      let descriptionCn = row.feature_description;
      if (LLM_API_KEY && row.feature_description) {
        descriptionCn = await translateDescriptionWithLLM(row.feature_description);
        // 避免 API 调用过快
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // 更新数据库
      await pool.query(`
        UPDATE nrm_aesthetic_feature_library
        SET feature_category_cn = $1,
            feature_name_cn = $2,
            feature_description_cn = $3
        WHERE id = $4
      `, [categoryCn, nameCn, descriptionCn, row.id]);

      translated++;
      console.log(`[${translated}/${result.rows.length}] ${row.feature_name} → ${nameCn}`);
    } catch (e: any) {
      errors++;
      console.error(`翻译失败 (${row.id}):`, e.message);
    }
  }

  console.log(`\n翻译完成: ${translated} 成功, ${errors} 失败`);

  // 验证结果
  const verify = await pool.query(`
    SELECT feature_category, feature_category_cn, feature_name, feature_name_cn
    FROM nrm_aesthetic_feature_library
    WHERE feature_category_cn IS NOT NULL
    LIMIT 3
  `);

  console.log('\n翻译结果示例:');
  verify.rows.forEach(row => {
    console.log(`  ${row.feature_category} → ${row.feature_category_cn}`);
    console.log(`  ${row.feature_name} → ${row.feature_name_cn}`);
  });

  await pool.end();
}

batchTranslate();