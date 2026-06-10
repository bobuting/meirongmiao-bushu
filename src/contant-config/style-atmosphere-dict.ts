/**
 * 风格/情绪/氛围统一字典
 * 用于服饰、角色、脚本、音乐的跨模块风格一致性
 *
 * 设计原则：
 * 1. 正交性：风格、情绪、氛围三个维度独立，不混淆
 * 2. 可组合：每个维度可独立选择，组合后形成完整的情绪基调
 * 3. 可追溯：从 Step1 到 Step5，风格选择有清晰的映射链路
 * 4. 多样性：每个维度覆盖足够广的场景，避免"全是治愈"
 */

// ==================== 维度一：服饰风格 ====================

/**
 * 服饰风格分类（25种）
 * 来源：step1_image_classification/system.hbs 中已有 20 种 + 新增 5 种扩充多样性
 */
export const CLOTHING_STYLE_CATEGORY = {
  // === 原有 20 种（来自 step1_image_classification 提示词） ===
  STREET_TREND: '街头潮流',
  JAPANESE_FRESH: '日系清新',
  KOREA_EXQUISITE: '韩系精致',
  SPORTS_CASUAL: '运动休闲',
  LAZY_STYLE: '慵懒风',
  SHARP: '利落',
  SOFT: '柔和',
  SIMPLE_ELEGANT: '素雅',
  INTELLECTUAL: '知性',
  SUNNY: '阳光',
  LIVELY: '活泼',
  MINIMALIST: '简约',
  RETRO: '复古',
  FRESH: '清新',
  ELEGANT: '优雅',
  COMMUTE: '通勤',
  HOME: '居家',
  BUSINESS: '商务',
  CASUAL: '休闲',
  FASHION: '时尚',

  // === 新增 5 种（扩充多样性，对应特殊情绪） ===
  CHINESE_CLASSICAL: '古风',      // 对应情绪基调：古风、怀旧
  SWEET: '甜美',                  // 对应情绪基调：浪漫、温暖
  COOL: '酷飒',                   // 对应情绪基调：动感、自信
  BOHEMIAN: '波西米亚',           // 异域风情，对应情绪基调：自由、浪漫
  ARTISTIC: '文艺',               // 对应情绪基调：抒情、空灵
} as const;

export type ClothingStyleCategory = typeof CLOTHING_STYLE_CATEGORY[keyof typeof CLOTHING_STYLE_CATEGORY];

/** 服饰风格中文标签映射 */
export const CLOTHING_STYLE_LABELS: Record<ClothingStyleCategory, string> = {
  [CLOTHING_STYLE_CATEGORY.STREET_TREND]: '街头潮流',
  [CLOTHING_STYLE_CATEGORY.JAPANESE_FRESH]: '日系清新',
  [CLOTHING_STYLE_CATEGORY.KOREA_EXQUISITE]: '韩系精致',
  [CLOTHING_STYLE_CATEGORY.SPORTS_CASUAL]: '运动休闲',
  [CLOTHING_STYLE_CATEGORY.LAZY_STYLE]: '慵懒风',
  [CLOTHING_STYLE_CATEGORY.SHARP]: '利落',
  [CLOTHING_STYLE_CATEGORY.SOFT]: '柔和',
  [CLOTHING_STYLE_CATEGORY.SIMPLE_ELEGANT]: '素雅',
  [CLOTHING_STYLE_CATEGORY.INTELLECTUAL]: '知性',
  [CLOTHING_STYLE_CATEGORY.SUNNY]: '阳光',
  [CLOTHING_STYLE_CATEGORY.LIVELY]: '活泼',
  [CLOTHING_STYLE_CATEGORY.MINIMALIST]: '简约',
  [CLOTHING_STYLE_CATEGORY.RETRO]: '复古',
  [CLOTHING_STYLE_CATEGORY.FRESH]: '清新',
  [CLOTHING_STYLE_CATEGORY.ELEGANT]: '优雅',
  [CLOTHING_STYLE_CATEGORY.COMMUTE]: '通勤',
  [CLOTHING_STYLE_CATEGORY.HOME]: '居家',
  [CLOTHING_STYLE_CATEGORY.BUSINESS]: '商务',
  [CLOTHING_STYLE_CATEGORY.CASUAL]: '休闲',
  [CLOTHING_STYLE_CATEGORY.FASHION]: '时尚',
  [CLOTHING_STYLE_CATEGORY.CHINESE_CLASSICAL]: '古风',
  [CLOTHING_STYLE_CATEGORY.SWEET]: '甜美',
  [CLOTHING_STYLE_CATEGORY.COOL]: '酷飒',
  [CLOTHING_STYLE_CATEGORY.BOHEMIAN]: '波西米亚',
  [CLOTHING_STYLE_CATEGORY.ARTISTIC]: '文艺',
};

/** 服饰风格选项列表（用于前端下拉和 LLM 提示词） */
export const CLOTHING_STYLE_OPTIONS: ClothingStyleCategory[] = Object.values(CLOTHING_STYLE_CATEGORY);

// ==================== 维度二：情绪基调 ====================

/**
 * 情绪基调分类（18种）
 * 来源：音乐已有 10 种氛围 + 新增 8 种情绪扩充多样性
 * 用途：角色预设 styleWords、脚本 emotion 字段
 */
export const EMOTION_TONE_CATEGORY = {
  // === 音乐已有 10 种氛围（直接对应） ===
  CHEERFUL: '欢快',        // 高能量正向情绪
  SUNNY: '阳光',           // 清新温暖情绪
  DYNAMIC: '动感',         // 节奏感强情绪
  ROMANTIC: '浪漫',        // 柔和亲密情绪
  RELAXED: '轻松',         // 平缓舒适情绪
  ELEGANT: '空灵',         // 梦幻治愈情绪
  LYRICAL: '抒情',         // 娓娓道来情绪
  PEACEFUL: '宁静',        // 极静冥想情绪
  CLASSICAL: '古风',       // 东方古典情绪
  EPIC: '悲壮',            // 戏剧张力情绪

  // === 新增 8 种情绪（扩充多样性，打破"全是治愈"） ===
  MELANCHOLY: '忧郁',      // 低能量情绪，替代"治愈"滥用
  NOSTALGIC: '怀旧',       // 时间流逝情绪
  CONFUSED: '迷茫',        // 不确定情绪
  EXPECTANT: '期待',       // 朝向未来情绪
  SATISFIED: '满足',       // 完成感情绪
  SURPRISED: '惊喜',       // 意外感情绪
  CONFIDENT: '自信',       // 确定感情绪
  WARM: '温暖',            // 人际连接情绪
} as const;

export type EmotionToneCategory = typeof EMOTION_TONE_CATEGORY[keyof typeof EMOTION_TONE_CATEGORY];

/** 情绪基调中文标签映射 */
export const EMOTION_TONE_LABELS: Record<EmotionToneCategory, string> = {
  [EMOTION_TONE_CATEGORY.CHEERFUL]: '欢快',
  [EMOTION_TONE_CATEGORY.SUNNY]: '阳光',
  [EMOTION_TONE_CATEGORY.DYNAMIC]: '动感',
  [EMOTION_TONE_CATEGORY.ROMANTIC]: '浪漫',
  [EMOTION_TONE_CATEGORY.RELAXED]: '轻松',
  [EMOTION_TONE_CATEGORY.ELEGANT]: '空灵',
  [EMOTION_TONE_CATEGORY.LYRICAL]: '抒情',
  [EMOTION_TONE_CATEGORY.PEACEFUL]: '宁静',
  [EMOTION_TONE_CATEGORY.CLASSICAL]: '古风',
  [EMOTION_TONE_CATEGORY.EPIC]: '悲壮',
  [EMOTION_TONE_CATEGORY.MELANCHOLY]: '忧郁',
  [EMOTION_TONE_CATEGORY.NOSTALGIC]: '怀旧',
  [EMOTION_TONE_CATEGORY.CONFUSED]: '迷茫',
  [EMOTION_TONE_CATEGORY.EXPECTANT]: '期待',
  [EMOTION_TONE_CATEGORY.SATISFIED]: '满足',
  [EMOTION_TONE_CATEGORY.SURPRISED]: '惊喜',
  [EMOTION_TONE_CATEGORY.CONFIDENT]: '自信',
  [EMOTION_TONE_CATEGORY.WARM]: '温暖',
};

/** 情绪基调选项列表（用于前端下拉和 LLM 提示词） */
export const EMOTION_TONE_OPTIONS: EmotionToneCategory[] = Object.values(EMOTION_TONE_CATEGORY);

// ==================== 维度三：氛围场景 ====================

/**
 * 氛围场景分类（16种）
 * 用途：脚本 atmosphere 字段、分镜 visual.scene.mood 字段
 * 设计：覆盖自然、城市、情感、特殊四大类场景
 */
export const ATMOSPHERE_SCENE_CATEGORY = {
  // === 自然氛围 ===
  MORNING_FRESH: '清晨清新',
  AFTERNOON_WARM: '午后温暖',
  EVENING_ROMANTIC: '傍晚浪漫',
  NIGHT_QUIET: '夜晚静谧',

  // === 城市氛围 ===
  URBAN_BUSTLE: '城市喧嚣',
  ALLEY_QUIET: '胡同静谧',
  CAFE_COZY: '咖啡馆温馨',
  BOOKSTORE_SERENE: '书店宁静',

  // === 情感氛围 ===
  HOME_HEALING: '居家治愈',
  TRAVEL_FREE: '旅行自由',
  REUNION_WARM: '重逢温暖',
  ALONE_INTROSPECTIVE: '独处内省',

  // === 特殊氛围（扩充多样性） ===
  RAIN_MELANCHOLY: '雨中忧郁',
  WIND_FRESH: '风中清新',
  SNOW_PURE: '雪中纯净',
  SUNSET_EPIC: '落日壮美',
} as const;

export type AtmosphereSceneCategory = typeof ATMOSPHERE_SCENE_CATEGORY[keyof typeof ATMOSPHERE_SCENE_CATEGORY];

/** 氛围场景中文标签映射 */
export const ATMOSPHERE_SCENE_LABELS: Record<AtmosphereSceneCategory, string> = {
  [ATMOSPHERE_SCENE_CATEGORY.MORNING_FRESH]: '清晨清新',
  [ATMOSPHERE_SCENE_CATEGORY.AFTERNOON_WARM]: '午后温暖',
  [ATMOSPHERE_SCENE_CATEGORY.EVENING_ROMANTIC]: '傍晚浪漫',
  [ATMOSPHERE_SCENE_CATEGORY.NIGHT_QUIET]: '夜晚静谧',
  [ATMOSPHERE_SCENE_CATEGORY.URBAN_BUSTLE]: '城市喧嚣',
  [ATMOSPHERE_SCENE_CATEGORY.ALLEY_QUIET]: '胡同静谧',
  [ATMOSPHERE_SCENE_CATEGORY.CAFE_COZY]: '咖啡馆温馨',
  [ATMOSPHERE_SCENE_CATEGORY.BOOKSTORE_SERENE]: '书店宁静',
  [ATMOSPHERE_SCENE_CATEGORY.HOME_HEALING]: '居家治愈',
  [ATMOSPHERE_SCENE_CATEGORY.TRAVEL_FREE]: '旅行自由',
  [ATMOSPHERE_SCENE_CATEGORY.REUNION_WARM]: '重逢温暖',
  [ATMOSPHERE_SCENE_CATEGORY.ALONE_INTROSPECTIVE]: '独处内省',
  [ATMOSPHERE_SCENE_CATEGORY.RAIN_MELANCHOLY]: '雨中忧郁',
  [ATMOSPHERE_SCENE_CATEGORY.WIND_FRESH]: '风中清新',
  [ATMOSPHERE_SCENE_CATEGORY.SNOW_PURE]: '雪中纯净',
  [ATMOSPHERE_SCENE_CATEGORY.SUNSET_EPIC]: '落日壮美',
};

/** 氛围场景选项列表（用于前端下拉和 LLM 提示词） */
export const ATMOSPHERE_SCENE_OPTIONS: AtmosphereSceneCategory[] = Object.values(ATMOSPHERE_SCENE_CATEGORY);

// ==================== 维度四：音乐氛围 ====================

/**
 * 音乐氛围分类（10种，来自现有 music-atmosphere 定义）
 * 用途：音乐匹配（注：shot_breakdown.audio 已改为只包含 ambient_sound）
 */
export const MUSIC_ATMOSPHERE_CATEGORY = {
  CHEERFUL: '欢快',
  SUNNY: '阳光',
  DYNAMIC: '动感',
  ROMANTIC: '浪漫',
  RELAXED: '轻松',
  ELEGANT: '空灵',
  LYRICAL: '抒情',
  PEACEFUL: '宁静',
  CLASSICAL: '古风',
  EPIC: '悲壮',
} as const;

export type MusicAtmosphereCategory = typeof MUSIC_ATMOSPHERE_CATEGORY[keyof typeof MUSIC_ATMOSPHERE_CATEGORY];

/** 音乐氛围中文标签映射 */
export const MUSIC_ATMOSPHERE_LABELS: Record<MusicAtmosphereCategory, string> = {
  [MUSIC_ATMOSPHERE_CATEGORY.CHEERFUL]: '欢快',
  [MUSIC_ATMOSPHERE_CATEGORY.SUNNY]: '阳光',
  [MUSIC_ATMOSPHERE_CATEGORY.DYNAMIC]: '动感',
  [MUSIC_ATMOSPHERE_CATEGORY.ROMANTIC]: '浪漫',
  [MUSIC_ATMOSPHERE_CATEGORY.RELAXED]: '轻松',
  [MUSIC_ATMOSPHERE_CATEGORY.ELEGANT]: '空灵',
  [MUSIC_ATMOSPHERE_CATEGORY.LYRICAL]: '抒情',
  [MUSIC_ATMOSPHERE_CATEGORY.PEACEFUL]: '宁静',
  [MUSIC_ATMOSPHERE_CATEGORY.CLASSICAL]: '古风',
  [MUSIC_ATMOSPHERE_CATEGORY.EPIC]: '悲壮',
};

/** 音乐氛围选项列表 */
export const MUSIC_ATMOSPHERE_OPTIONS: MusicAtmosphereCategory[] = Object.values(MUSIC_ATMOSPHERE_CATEGORY);

// ==================== 跨模块映射规则 ====================

/**
 * 服饰风格 → 情绪基调映射
 * 规则：每种服饰风格映射到 2-3 种推荐情绪基调
 */
export const STYLE_TO_EMOTION_MAP: Record<ClothingStyleCategory, EmotionToneCategory[]> = {
  // === 休闲风格 → 轻松类情绪 ===
  [CLOTHING_STYLE_CATEGORY.MINIMALIST]: [EMOTION_TONE_CATEGORY.RELAXED, EMOTION_TONE_CATEGORY.PEACEFUL, EMOTION_TONE_CATEGORY.SATISFIED],
  [CLOTHING_STYLE_CATEGORY.CASUAL]: [EMOTION_TONE_CATEGORY.RELAXED, EMOTION_TONE_CATEGORY.SUNNY, EMOTION_TONE_CATEGORY.SATISFIED],
  [CLOTHING_STYLE_CATEGORY.HOME]: [EMOTION_TONE_CATEGORY.RELAXED, EMOTION_TONE_CATEGORY.PEACEFUL, EMOTION_TONE_CATEGORY.WARM],
  [CLOTHING_STYLE_CATEGORY.LAZY_STYLE]: [EMOTION_TONE_CATEGORY.RELAXED, EMOTION_TONE_CATEGORY.MELANCHOLY, EMOTION_TONE_CATEGORY.PEACEFUL],

  // === 时尚风格 → 活力类情绪 ===
  [CLOTHING_STYLE_CATEGORY.STREET_TREND]: [EMOTION_TONE_CATEGORY.DYNAMIC, EMOTION_TONE_CATEGORY.CHEERFUL, EMOTION_TONE_CATEGORY.CONFIDENT],
  [CLOTHING_STYLE_CATEGORY.SPORTS_CASUAL]: [EMOTION_TONE_CATEGORY.DYNAMIC, EMOTION_TONE_CATEGORY.SUNNY, EMOTION_TONE_CATEGORY.EXPECTANT],
  [CLOTHING_STYLE_CATEGORY.LIVELY]: [EMOTION_TONE_CATEGORY.CHEERFUL, EMOTION_TONE_CATEGORY.SUNNY, EMOTION_TONE_CATEGORY.SURPRISED],
  [CLOTHING_STYLE_CATEGORY.COOL]: [EMOTION_TONE_CATEGORY.DYNAMIC, EMOTION_TONE_CATEGORY.CONFIDENT, EMOTION_TONE_CATEGORY.EPIC],

  // === 优雅风格 → 柔和类情绪 ===
  [CLOTHING_STYLE_CATEGORY.ELEGANT]: [EMOTION_TONE_CATEGORY.ROMANTIC, EMOTION_TONE_CATEGORY.LYRICAL, EMOTION_TONE_CATEGORY.WARM],
  [CLOTHING_STYLE_CATEGORY.KOREA_EXQUISITE]: [EMOTION_TONE_CATEGORY.ROMANTIC, EMOTION_TONE_CATEGORY.WARM, EMOTION_TONE_CATEGORY.EXPECTANT],
  [CLOTHING_STYLE_CATEGORY.SWEET]: [EMOTION_TONE_CATEGORY.ROMANTIC, EMOTION_TONE_CATEGORY.CHEERFUL, EMOTION_TONE_CATEGORY.WARM],
  [CLOTHING_STYLE_CATEGORY.SOFT]: [EMOTION_TONE_CATEGORY.WARM, EMOTION_TONE_CATEGORY.RELAXED, EMOTION_TONE_CATEGORY.ROMANTIC],

  // === 文艺风格 → 内省类情绪 ===
  [CLOTHING_STYLE_CATEGORY.JAPANESE_FRESH]: [EMOTION_TONE_CATEGORY.PEACEFUL, EMOTION_TONE_CATEGORY.LYRICAL, EMOTION_TONE_CATEGORY.NOSTALGIC],
  [CLOTHING_STYLE_CATEGORY.SIMPLE_ELEGANT]: [EMOTION_TONE_CATEGORY.PEACEFUL, EMOTION_TONE_CATEGORY.ELEGANT, EMOTION_TONE_CATEGORY.MELANCHOLY],
  [CLOTHING_STYLE_CATEGORY.ARTISTIC]: [EMOTION_TONE_CATEGORY.LYRICAL, EMOTION_TONE_CATEGORY.NOSTALGIC, EMOTION_TONE_CATEGORY.ELEGANT],
  [CLOTHING_STYLE_CATEGORY.INTELLECTUAL]: [EMOTION_TONE_CATEGORY.LYRICAL, EMOTION_TONE_CATEGORY.MELANCHOLY, EMOTION_TONE_CATEGORY.SATISFIED],

  // === 特殊风格 → 特殊情绪 ===
  [CLOTHING_STYLE_CATEGORY.CHINESE_CLASSICAL]: [EMOTION_TONE_CATEGORY.CLASSICAL, EMOTION_TONE_CATEGORY.NOSTALGIC, EMOTION_TONE_CATEGORY.LYRICAL],
  [CLOTHING_STYLE_CATEGORY.BOHEMIAN]: [EMOTION_TONE_CATEGORY.SUNNY, EMOTION_TONE_CATEGORY.ROMANTIC, EMOTION_TONE_CATEGORY.DYNAMIC],

  // === 其他风格映射 ===
  [CLOTHING_STYLE_CATEGORY.SHARP]: [EMOTION_TONE_CATEGORY.CONFIDENT, EMOTION_TONE_CATEGORY.SUNNY, EMOTION_TONE_CATEGORY.DYNAMIC],
  [CLOTHING_STYLE_CATEGORY.SUNNY]: [EMOTION_TONE_CATEGORY.SUNNY, EMOTION_TONE_CATEGORY.CHEERFUL, EMOTION_TONE_CATEGORY.WARM],
  [CLOTHING_STYLE_CATEGORY.RETRO]: [EMOTION_TONE_CATEGORY.NOSTALGIC, EMOTION_TONE_CATEGORY.ROMANTIC, EMOTION_TONE_CATEGORY.LYRICAL],
  [CLOTHING_STYLE_CATEGORY.FRESH]: [EMOTION_TONE_CATEGORY.SUNNY, EMOTION_TONE_CATEGORY.RELAXED],
  [CLOTHING_STYLE_CATEGORY.COMMUTE]: [EMOTION_TONE_CATEGORY.RELAXED, EMOTION_TONE_CATEGORY.CONFIDENT, EMOTION_TONE_CATEGORY.SATISFIED],
  [CLOTHING_STYLE_CATEGORY.BUSINESS]: [EMOTION_TONE_CATEGORY.CONFIDENT, EMOTION_TONE_CATEGORY.SATISFIED],
  [CLOTHING_STYLE_CATEGORY.FASHION]: [EMOTION_TONE_CATEGORY.DYNAMIC, EMOTION_TONE_CATEGORY.CONFIDENT, EMOTION_TONE_CATEGORY.SURPRISED],
};

/**
 * 情绪基调 → 音乐氛围映射
 * 规则：每种情绪基调映射到 1 种推荐音乐氛围
 * 注意：音乐只有 10 种，新增的 8 种情绪需要映射到现有音乐分类
 */
export const EMOTION_TO_MUSIC_MAP: Record<EmotionToneCategory, MusicAtmosphereCategory> = {
  // === 直接对应（音乐已有 10 种） ===
  [EMOTION_TONE_CATEGORY.CHEERFUL]: MUSIC_ATMOSPHERE_CATEGORY.CHEERFUL,
  [EMOTION_TONE_CATEGORY.SUNNY]: MUSIC_ATMOSPHERE_CATEGORY.SUNNY,
  [EMOTION_TONE_CATEGORY.DYNAMIC]: MUSIC_ATMOSPHERE_CATEGORY.DYNAMIC,
  [EMOTION_TONE_CATEGORY.ROMANTIC]: MUSIC_ATMOSPHERE_CATEGORY.ROMANTIC,
  [EMOTION_TONE_CATEGORY.RELAXED]: MUSIC_ATMOSPHERE_CATEGORY.RELAXED,
  [EMOTION_TONE_CATEGORY.ELEGANT]: MUSIC_ATMOSPHERE_CATEGORY.ELEGANT,
  [EMOTION_TONE_CATEGORY.LYRICAL]: MUSIC_ATMOSPHERE_CATEGORY.LYRICAL,
  [EMOTION_TONE_CATEGORY.PEACEFUL]: MUSIC_ATMOSPHERE_CATEGORY.PEACEFUL,
  [EMOTION_TONE_CATEGORY.CLASSICAL]: MUSIC_ATMOSPHERE_CATEGORY.CLASSICAL,
  [EMOTION_TONE_CATEGORY.EPIC]: MUSIC_ATMOSPHERE_CATEGORY.EPIC,

  // === 新增情绪映射到现有音乐 ===
  [EMOTION_TONE_CATEGORY.MELANCHOLY]: MUSIC_ATMOSPHERE_CATEGORY.LYRICAL,     // 忧郁 → 抒情类音乐
  [EMOTION_TONE_CATEGORY.NOSTALGIC]: MUSIC_ATMOSPHERE_CATEGORY.LYRICAL,     // 怀旧 → 抒情类音乐
  [EMOTION_TONE_CATEGORY.CONFUSED]: MUSIC_ATMOSPHERE_CATEGORY.ELEGANT,      // 迷茫 → 空灵类音乐
  [EMOTION_TONE_CATEGORY.EXPECTANT]: MUSIC_ATMOSPHERE_CATEGORY.SUNNY,       // 期待 → 阳光类音乐
  [EMOTION_TONE_CATEGORY.SATISFIED]: MUSIC_ATMOSPHERE_CATEGORY.RELAXED,     // 满足 → 轻松类音乐
  [EMOTION_TONE_CATEGORY.SURPRISED]: MUSIC_ATMOSPHERE_CATEGORY.CHEERFUL,    // 惊喜 → 欢快类音乐
  [EMOTION_TONE_CATEGORY.CONFIDENT]: MUSIC_ATMOSPHERE_CATEGORY.DYNAMIC,     // 自信 → 动感类音乐
  [EMOTION_TONE_CATEGORY.WARM]: MUSIC_ATMOSPHERE_CATEGORY.ROMANTIC,         // 温暖 → 浪漫类音乐
};

/**
 * 情绪基调 → 氛围场景映射（推荐）
 * 规则：每种情绪基调推荐 1-2 种氛围场景
 */
export const EMOTION_TO_ATMOSPHERE_MAP: Record<EmotionToneCategory, AtmosphereSceneCategory[]> = {
  // === 高能量情绪 → 动态场景 ===
  [EMOTION_TONE_CATEGORY.CHEERFUL]: [ATMOSPHERE_SCENE_CATEGORY.MORNING_FRESH, ATMOSPHERE_SCENE_CATEGORY.URBAN_BUSTLE],
  [EMOTION_TONE_CATEGORY.DYNAMIC]: [ATMOSPHERE_SCENE_CATEGORY.URBAN_BUSTLE, ATMOSPHERE_SCENE_CATEGORY.TRAVEL_FREE],
  [EMOTION_TONE_CATEGORY.SUNNY]: [ATMOSPHERE_SCENE_CATEGORY.AFTERNOON_WARM, ATMOSPHERE_SCENE_CATEGORY.TRAVEL_FREE],
  [EMOTION_TONE_CATEGORY.SURPRISED]: [ATMOSPHERE_SCENE_CATEGORY.URBAN_BUSTLE, ATMOSPHERE_SCENE_CATEGORY.CAFE_COZY],

  // === 柔和情绪 → 温暖场景 ===
  [EMOTION_TONE_CATEGORY.ROMANTIC]: [ATMOSPHERE_SCENE_CATEGORY.EVENING_ROMANTIC, ATMOSPHERE_SCENE_CATEGORY.CAFE_COZY],
  [EMOTION_TONE_CATEGORY.WARM]: [ATMOSPHERE_SCENE_CATEGORY.REUNION_WARM, ATMOSPHERE_SCENE_CATEGORY.HOME_HEALING],
  [EMOTION_TONE_CATEGORY.RELAXED]: [ATMOSPHERE_SCENE_CATEGORY.AFTERNOON_WARM, ATMOSPHERE_SCENE_CATEGORY.HOME_HEALING],
  [EMOTION_TONE_CATEGORY.SATISFIED]: [ATMOSPHERE_SCENE_CATEGORY.HOME_HEALING, ATMOSPHERE_SCENE_CATEGORY.ALLEY_QUIET],

  // === 内省情绪 → 静谧场景 ===
  [EMOTION_TONE_CATEGORY.PEACEFUL]: [ATMOSPHERE_SCENE_CATEGORY.NIGHT_QUIET, ATMOSPHERE_SCENE_CATEGORY.BOOKSTORE_SERENE],
  [EMOTION_TONE_CATEGORY.ELEGANT]: [ATMOSPHERE_SCENE_CATEGORY.NIGHT_QUIET, ATMOSPHERE_SCENE_CATEGORY.ALONE_INTROSPECTIVE],
  [EMOTION_TONE_CATEGORY.MELANCHOLY]: [ATMOSPHERE_SCENE_CATEGORY.RAIN_MELANCHOLY, ATMOSPHERE_SCENE_CATEGORY.ALONE_INTROSPECTIVE],
  [EMOTION_TONE_CATEGORY.CONFUSED]: [ATMOSPHERE_SCENE_CATEGORY.ALONE_INTROSPECTIVE, ATMOSPHERE_SCENE_CATEGORY.NIGHT_QUIET],

  // === 叙事情绪 → 文化场景 ===
  [EMOTION_TONE_CATEGORY.LYRICAL]: [ATMOSPHERE_SCENE_CATEGORY.BOOKSTORE_SERENE, ATMOSPHERE_SCENE_CATEGORY.ALLEY_QUIET],
  [EMOTION_TONE_CATEGORY.NOSTALGIC]: [ATMOSPHERE_SCENE_CATEGORY.ALLEY_QUIET, ATMOSPHERE_SCENE_CATEGORY.SUNSET_EPIC],
  [EMOTION_TONE_CATEGORY.CLASSICAL]: [ATMOSPHERE_SCENE_CATEGORY.ALLEY_QUIET, ATMOSPHERE_SCENE_CATEGORY.SUNSET_EPIC],

  // === 特殊情绪 → 特殊场景 ===
  [EMOTION_TONE_CATEGORY.EPIC]: [ATMOSPHERE_SCENE_CATEGORY.SUNSET_EPIC, ATMOSPHERE_SCENE_CATEGORY.SNOW_PURE],
  [EMOTION_TONE_CATEGORY.EXPECTANT]: [ATMOSPHERE_SCENE_CATEGORY.MORNING_FRESH, ATMOSPHERE_SCENE_CATEGORY.TRAVEL_FREE],
  [EMOTION_TONE_CATEGORY.CONFIDENT]: [ATMOSPHERE_SCENE_CATEGORY.TRAVEL_FREE, ATMOSPHERE_SCENE_CATEGORY.URBAN_BUSTLE],
};

// ==================== 辅助函数 ====================

/**
 * 根据服饰风格推荐情绪基调
 * @param styles 服饰风格列表（1-3种）
 * @returns 推荐情绪基调列表（合并去重）
 */
export function recommendEmotionFromStyle(styles: ClothingStyleCategory[]): EmotionToneCategory[] {
  const emotions = styles.flatMap(style => STYLE_TO_EMOTION_MAP[style] || []);
  return Array.from(new Set(emotions));
}

/**
 * 根据情绪基调推荐音乐氛围
 * @param emotions 情绪基调列表（1-3种）
 * @returns 推荐音乐氛围列表（合并去重）
 */
export function recommendMusicFromEmotion(emotions: EmotionToneCategory[]): MusicAtmosphereCategory[] {
  const music = emotions.map(emotion => EMOTION_TO_MUSIC_MAP[emotion]);
  return Array.from(new Set(music));
}

/**
 * 根据情绪基调推荐氛围场景
 * @param emotions 情绪基调列表（1-3种）
 * @returns 推荐氛围场景列表（合并去重）
 */
export function recommendAtmosphereFromEmotion(emotions: EmotionToneCategory[]): AtmosphereSceneCategory[] {
  const atmospheres = emotions.flatMap(emotion => EMOTION_TO_ATMOSPHERE_MAP[emotion] || []);
  return Array.from(new Set(atmospheres));
}

/**
 * 验证风格组合是否兼容
 * 规则：同一组风格不应有强烈冲突（如"街头潮流"+"古风"）
 * @param styles 服饰风格列表
 * @returns 是否兼容
 */
export function validateStyleCompatibility(styles: ClothingStyleCategory[]): boolean {
  // 定义冲突风格组
  const conflictGroups: ClothingStyleCategory[][] = [
    [CLOTHING_STYLE_CATEGORY.STREET_TREND, CLOTHING_STYLE_CATEGORY.CHINESE_CLASSICAL],
    [CLOTHING_STYLE_CATEGORY.BUSINESS, CLOTHING_STYLE_CATEGORY.LAZY_STYLE],
    [CLOTHING_STYLE_CATEGORY.HOME, CLOTHING_STYLE_CATEGORY.COOL],
  ];

  // 检查是否存在冲突组
  for (const conflictGroup of conflictGroups) {
    const hasConflict = conflictGroup.every(style => styles.includes(style));
    if (hasConflict) return false;
  }

  return true;
}

/**
 * 验证情绪基调是否属于有效枚举值
 * @param emotion 情绪基调字符串
 * @returns 是否有效
 */
export function isValidEmotionTone(emotion: string): boolean {
  return EMOTION_TONE_OPTIONS.includes(emotion as EmotionToneCategory);
}

/**
 * 验证服饰风格是否属于有效枚举值
 * @param style 服饰风格字符串
 * @returns 是否有效
 */
export function isValidClothingStyle(style: string): boolean {
  return CLOTHING_STYLE_OPTIONS.includes(style as ClothingStyleCategory);
}

/**
 * 验证氛围场景是否属于有效枚举值
 * @param atmosphere 氛围场景字符串
 * @returns 是否有效
 */
export function isValidAtmosphereScene(atmosphere: string): boolean {
  return ATMOSPHERE_SCENE_OPTIONS.includes(atmosphere as AtmosphereSceneCategory);
}

/**
 * 验证音乐氛围是否属于有效枚举值
 * @param atmosphere 音乐氛围字符串
 * @returns 是否有效
 */
export function isValidMusicAtmosphere(atmosphere: string): boolean {
  return MUSIC_ATMOSPHERE_OPTIONS.includes(atmosphere as MusicAtmosphereCategory);
}

/**
 * 从自由文本中提取最接近的服饰风格
 * 用于兼容旧数据或 LLM 输出未严格遵循枚举的情况
 * @param text 自由文本（如"简约风格"、"比较休闲"）
 * @returns 最接近的服饰风格枚举值，或 null
 */
export function parseClothingStyleFromText(text: string): ClothingStyleCategory | null {
  const normalized = text.trim().toLowerCase();

  // 空字符串返回 null
  if (normalized.length === 0) {
    return null;
  }

  // 尝试直接匹配
  for (const style of CLOTHING_STYLE_OPTIONS) {
    if (normalized.includes(style.toLowerCase()) || style.toLowerCase().includes(normalized)) {
      return style;
    }
  }

  // 尝试关键词匹配
  const keywordMap: Record<string, ClothingStyleCategory> = {
    '简约': CLOTHING_STYLE_CATEGORY.MINIMALIST,
    '休闲': CLOTHING_STYLE_CATEGORY.CASUAL,
    '优雅': CLOTHING_STYLE_CATEGORY.ELEGANT,
    '古风': CLOTHING_STYLE_CATEGORY.CHINESE_CLASSICAL,
    '街头': CLOTHING_STYLE_CATEGORY.STREET_TREND,
    '日系': CLOTHING_STYLE_CATEGORY.JAPANESE_FRESH,
    '韩系': CLOTHING_STYLE_CATEGORY.KOREA_EXQUISITE,
    '运动': CLOTHING_STYLE_CATEGORY.SPORTS_CASUAL,
    '慵懒': CLOTHING_STYLE_CATEGORY.LAZY_STYLE,
    '文艺': CLOTHING_STYLE_CATEGORY.ARTISTIC,
  };

  for (const [keyword, style] of Object.entries(keywordMap)) {
    if (normalized.includes(keyword.toLowerCase())) {
      return style;
    }
  }

  return null;
}

/**
 * 从自由文本中提取最接近的情绪基调
 * @param text 自由文本
 * @returns 最接近的情绪基调枚举值，或 null
 */
export function parseEmotionToneFromText(text: string): EmotionToneCategory | null {
  const normalized = text.trim().toLowerCase();

  for (const emotion of EMOTION_TONE_OPTIONS) {
    if (normalized.includes(emotion.toLowerCase()) || emotion.toLowerCase().includes(normalized)) {
      return emotion;
    }
  }

  return null;
}

/**
 * 从自由文本中提取最接近的氛围场景
 * @param text 自由文本
 * @returns 最接近的氛围场景枚举值，或 null
 */
export function parseAtmosphereSceneFromText(text: string): AtmosphereSceneCategory | null {
  const normalized = text.trim().toLowerCase();

  for (const atmosphere of ATMOSPHERE_SCENE_OPTIONS) {
    if (normalized.includes(atmosphere.toLowerCase()) || atmosphere.toLowerCase().includes(normalized)) {
      return atmosphere;
    }
  }

  return null;
}

/**
 * 获取服饰风格完整链路推荐（风格 → 情绪 → 音乐 → 氛围）
 * @param styles 服饰风格列表
 * @returns 完整链路推荐结果
 */
export function getFullRecommendation(styles: ClothingStyleCategory[]): {
  emotions: EmotionToneCategory[];
  music: MusicAtmosphereCategory[];
  atmospheres: AtmosphereSceneCategory[];
} {
  const emotions = recommendEmotionFromStyle(styles);
  const music = recommendMusicFromEmotion(emotions);
  const atmospheres = recommendAtmosphereFromEmotion(emotions);

  return { emotions, music, atmospheres };
}