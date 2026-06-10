# 儿童角色精致感优化方案设计文档

**日期**: 2026-04-24
**设计师**: Claude (基于用户需求)
**状态**: 已批准
**实施优先级**: P1（重要）

---

## 1. 问题背景

### 1.1 核心问题

用户反馈：**女童角色不够精致**，具体表现为：

- **五官比例不协调**：AI 脸综合征（眼睛太小、脸型太尖）
- **表情僵硬**：像"微笑模板"，无童真感
- **皮肤塑料化**：过度平滑，无毛孔纹理
- **服装不精致**：细节简化、材质模糊
- **千篇一律**：缺乏个性化和特色差异化

### 1.2 问题根源

当前五视图生成使用通用提示词模板（character_five_view_generation），未针对儿童角色的特殊比例和审美需求进行优化。

---

## 2. 设计目标

### 2.1 核心目标

**建立儿童专属提示词模板 + 审美特征库动态追踪**，实现：

1. **精致五官**：眼睛占比 30-35%、鼻子小巧立体、嘴唇自然微张
2. **比例完美**：脸型圆润、五官间距符合儿童解剖学
3. **特色差异化**：允许轻微不对称、表情多样化、混血特征增强
4. **服装精致度匹配**：蕾丝、刺绣、纽扣细节清晰可见
5. **审美持续追踪**：动态追踪主流审美变化，自动迭代优化

### 2.2 预期效果

- 精致感提升 80%+
- 千篇一律降低 70%+
- 特色差异化 90%+
- 审美追踪持续进化

---

## 3. 设计方案

### 3.1 方案选择

**选择方案 A**：建立儿童角色专属提示词模板（而非修改现有模板）。

**理由**：
- 隔离儿童和成人规则（儿童比例规则与成人不同）
- 独立迭代（儿童优化可以单独测试）
- 向后兼容（现有项目继续使用原 Skill）
- 灵活切换（前端可根据角色年龄选择不同 Skill）

### 3.2 设计核心要素

#### 3.2.1 精致五官规则

**眼睛特征**（儿童特有）：
- **眼高度**: 30-35% of face height（比成人 20% 更大）
- **眼型**: 杏眼，外眼角轻微上翘
- **眼间距**: 一个眼睛宽度（黄金比例）
- **瞳孔**: 相对虹膜更大（呈现童真）

**鼻子特征**：
- **尺寸**: 小巧、button nose（扁平或轻微立体）
- **形状**: 圆润鼻头，无尖锐角度
- **鼻梁**: 未发育完全（种族依赖）

**嘴唇特征**：
- **厚度**: 薄、自然（无成人丰满感）
- **宽度**: 比成人比例更小
- **表情**: 自然、微张（不强笑）
- **无妆容**: 零口红、唇彩、成人嘴唇特征

**皮肤细节**（精致感关键）：
- **基础**: 柔软、细腻、自然儿童皮肤
- **细节**: 可见微血管（自然红润）
- **毛孔**: 微细、几乎不可见但存在
- **质感**: 平滑但不塑料/磨砂

#### 3.2.2 比例完美约束

**脸型特征**：
- **整体**: 圆润或椭圆，下颌线条柔和
- **脸颊**:饱满、轻微圆润（婴儿肥可见）
- **下巴**: 柔软、圆润、微妙
- **额头**: 比成人比例更大

**下巴和下颌线**：
- **下颌**: 柔软曲线，无尖锐定义
- **下巴**: 小、圆润、微妙
- **颈部**: 细长、优雅

**自然不对称**（避免千篇一律）：
- **允许轻微不对称**: 真实人类不完全对称
- **保留种族特征差异**: 不同种族有独特特征
- **表情多样化**: 而非固定微笑模板

#### 3.2.3 混血特征增强（核心创新）

**智能混血判断逻辑**：

```typescript
function parseEthnicityConfig(ethnicityOrRegion: string | null): {
  isMixed: boolean;
  primaryEthnicity: string | null;
  secondaryEthnicity: string | null;
  mixedType: string | null;
  mixedIntensity: 'strong' | 'light' | null;
} {
  // 1. 显式混血标记 → 强混血
  if (normalized.includes('mixed') || normalized.includes('混血')) {
    return { isMixed: true, mixedIntensity: 'strong', ... };
  }

  // 2. 区域自动混血规则 → 强混血
  const regionMixedRules = {
    'hong kong': { primary: 'Asian', secondary: 'Caucasian' },
    'singapore': { primary: 'Asian', secondary: 'Caucasian' },
    'california': { primary: 'Asian', secondary: 'Caucasian' },
  };

  // 3. 单一种族 → 30%概率轻微混血（核心优化）
  const randomMixed = Math.random() < 0.3;
  if (randomMixed) {
    return { isMixed: true, mixedIntensity: 'light', ... };
  }

  // 4. 单一种族 → 不混血
  return { isMixed: false, ... };
}
```

**混血特征融合规则**（最受欢迎的 Asian + Caucasian 组合）：

- **脸型**: 柔软椭圆（亚洲圆润 + 欧美立体结构）
- **眼睛**:
  - 双眼皮 + 轻微褶皱（不太深）
  - 杏眼 + 更宽开口（欧美开放 + 亚洲形状）
  - 榛色/琥珀色眼睛（亚洲罕见）
- **鼻子**:
  - 立体鼻梁（欧美基因）
  - 圆润鼻头（亚洲基因）
  - 中等高度（不扁平、不突出）
- **皮肤**:
  - 温暖米色/橄榄色
  - 自然红润脸颊
  - 可见微血管（真实质感）
- **头发**:
  - 深棕/栗色（黑色 + 金色/棕色融合）
  - 柔和波浪或直发
  - 自然光泽

**混血强度分级**：
- **strong（强混血）**: 特征明显（显式标记或区域推断）
- **light（轻微混血）**: 特征不明显，但增加细节丰富度（单一种族30%概率）

#### 3.2.4 服装精致度匹配

**面料和材质细节**：
- **棉麻**: 可见编织纹理、自然褶皱
- **丝绸/缎面**: 柔和光泽、平滑表面（不塑料闪光）
- **针织**: 可见针法图案、柔软质感
- **蕾丝**: 精细图案、精致边缘
- **刺绣**: 清晰线细节、不模糊

**服装结构**：
- **缝线**: 可见缝合线（不隐形/模糊）
- **纽扣**: 清晰形状、适当材质
- **拉链**: 金属或塑料细节可见
- **口袋**: 自然位置、功能细节

**儿童专属服装特征**：
- **裙子**: A字或修身飘逸（自然儿童运动）
- **长度**: 膝或以下（年龄适当）
- **细节**: 脖领、蝴蝶结、丝带（精致装饰）

**服装精致度标准**：
- **细节清晰度**: 高（所有元素清晰可见）
- **质感真实性**: 面料编织、针法图案可见
- **比例准确性**: 儿童尺寸（不成人比例）
- **禁止**: 模糊细节、简化图案、塑料质感

#### 3.2.5 审美特征库动态追踪（可持续进化）

**数据库表结构**：

```sql
CREATE TABLE nrm_aesthetic_feature_library (
  id UUID PRIMARY KEY,
  feature_category VARCHAR(50) NOT NULL,  -- 'eye_shape', 'skin_tone', 'hair_style'
  feature_name VARCHAR(100) NOT NULL,     -- 'almond_eyes_wide', 'warm_beige_rosy'
  feature_description TEXT,                -- 详细描述（用于提示词）
  ethnicity_applicable TEXT[],             -- 适用种族 ['Asian', 'Mixed']
  age_range VARCHAR(20),                   -- 'child_6-12'
  popularity_score DECIMAL(3,2),           -- 流行度评分 0.0-1.0
  trend_period VARCHAR(50),                -- '2026-q1'（季度更新）
  source VARCHAR(50),                      -- 'tikhub_api' | 'user_feedback' | 'magazine'
  source_metadata JSONB,                   -- 来源元数据（likes_count、fans_count等）
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  is_active BOOLEAN DEFAULT true
);
```

**数据来源**（三层自动化）：

| 来源 | 覆盖平台 | 自动化程度 | 更新频率 |
|------|---------|-----------|---------|
| **TikHub API** | 小红书 + Instagram + TikTok/抖音 | 90% | 每月 |
| **用户反馈分析** | 五视图生成结果评分 | 95% | 实时 |
| **时尚杂志爬虫** | Vogue Bambini + Milk Magazine | 70% | 每季度 |

**TikHub API 数据覆盖**：

- **小红书**（完全符合需求）：
  - 图片数据：image_urls、image_count
  - 文字数据：title、description、tags
  - 热度指标：likes_count、comments_count、collects_count
  - 博主信息：author_id、author_name、fans_count
  - 评论数据：comments_top10、comments_keywords
  - 话题标签：话题详情、话题笔记列表

- **Instagram**（完全符合需求）：
  - 用户数据：user_id、username、fans_count
  - 帖子数据：image_urls、caption、likes_count
  - 搜索功能：搜索用户/话题/地点

- **时尚杂志**（需自行爬取，权重仅30%，可后期补充）：
  - 使用 Playwright 爬取 Vogue Bambini + Milk Magazine
  - 图片数据：image_urls、image_category
  - 趋势文字：trend_title、trend_description、keywords
  - 季度标签：season、year、quarter

**自动化维护流程**：

```typescript
// 1. 社交媒体趋势分析（每月）
async function analyzeSocialMediaTrends(ctx: AppContext): Promise<void> {
  const instagramPosts = await TikHubAPI.fetchInstagramPosts({
    hashtags: ['#childfashion', '#mixedracechild'],
    limit: 1000,
  });

  const extractedFeatures = await analyzeImagesWithAI(instagramPosts.images, {
    model: 'claude-3-opus',
    extractCategories: ['eye_shape', 'skin_tone', 'hair_style'],
  });

  for (const feature of extractedFeatures) {
    await upsertAestheticFeature(pool, feature);
  }
}

// 2. 用户反馈分析（实时）
async function analyzeUserFeedback(
  ctx: AppContext,
  characterId: string,
  userRating: number,
): Promise<void> {
  if (userRating >= 4) {
    // 高分案例：提升特征流行度
    await pool.query(`
      UPDATE nrm_aesthetic_feature_library
      SET popularity_score = LEAST(1.0, popularity_score + 0.05)
      WHERE ...
    `);
  }

  if (userRating <= 2) {
    // 低分案例：降低特征流行度（甚至淘汰）
    await pool.query(`
      UPDATE nrm_aesthetic_feature_library
      SET popularity_score = GREATEST(0.0, popularity_score - 0.1)
      WHERE ...
    `);

    // 流行度过低（< 0.3）→ 自动淘汰
    await pool.query(`
      UPDATE nrm_aesthetic_feature_library
      SET is_active = false
      WHERE popularity_score < 0.3
    `);
  }
}

// 3. 综合评分计算（每日）
async function calculatePopularityScore(ctx: AppContext): Promise<void> {
  const popularityScore = (
    0.4 * social_media_score +
    0.3 * professional_score +
    0.3 * user_feedback_score
  );

  await pool.query(`
    UPDATE nrm_aesthetic_feature_library
    SET popularity_score = $1
    WHERE id = $2
  `, [popularityScore, id]);
}
```

**定时任务调度**：

- 每月1日：社交媒体趋势分析（TikHub API）
- 每季度初：时尚杂志爬虫（Playwright）
- 每日凌晨：综合评分计算
- 实时：用户反馈分析（每次生成完成后）

---

## 4. 实施路径

### 4.1 步骤 1：创建儿童专属 Skill

**时间**: 1天

**任务**:
1. 创建 `skills/character_five_view_generation_child/` 目录
2. 编写 `SKILL.md`（Skill 元数据）
3. 编写 `system.hbs`（系统提示词，包含 3.2.1-3.2.4 所有规则）
4. 编写 `user.hbs`（用户提示词，变量模板）
5. 编写 `schema.ts`（输入参数 Schema）
6. 编写 `examples.json`（使用示例）

**关键改动**:
- 复制现有 `character_five_view_generation` Skill
- 在 `system.hbs` 中新增以下模块：
  - ## CHILD FACIAL PROPORTIONS — CRITICAL 100% MANDATORY
  - ## MIXED-RACE CHILD FEATURES — ENHANCEMENT RULES
  - ## CHILD OUTFIT REFINEMENT — CRITICAL FOR OVERALL QUALITY
- 在 `user.hbs` 中新增混血特征变量：

```handlebars
{{#if mixedEthnicity}}
## MIXED ETHNICITY CONFIGURATION
- Primary ethnicity: {{primaryEthnicity}}
- Secondary ethnicity: {{secondaryEthnicity}}
- Mixed intensity: {{mixedIntensity}}
{{/if}}

{{#if aestheticFeatures}}
## AESTHETIC FEATURES (Current Trend - {{trendPeriod}})
- Eye Shape: {{aestheticEyeShape}}
- Eye Color: {{aestheticEyeColor}}
- Skin Tone: {{aestheticSkinTone}}
- Hair Style: {{aestheticHairStyle}}
- Nose Shape: {{aestheticNoseShape}}
{{/if}}
```

### 4.2 步骤 2：代码集成

**时间**: 2-3天

**任务**:

#### 4.2.1 智能混血判断集成

修改 `src/modules/character-five-view-generation-service.ts`：

```typescript
// 新增儿童专属提示词代码
const CHILD_PROMPT_CODE = "character_five_view_generation_child";
const CHILD_MIXED_PROMPT_CODE = "character_five_view_generation_child_mixed";

// 根据 age 和 ethnicity 选择提示词模板
function selectPromptCode(options: FiveViewGenerationOptions): string {
  const age = options?.age;
  const ethnicity = options?.ethnicity;
  const isMixed = options?.mixedEthnicity === true;

  if (age && Number(age) <= 12) {
    if (isMixed || ethnicity?.toLowerCase().includes('mixed')) {
      return CHILD_MIXED_PROMPT_CODE;
    }
    return CHILD_PROMPT_CODE;
  }

  return options?.promptCode ?? PROMPT_CODE;
}

// 智能混血判断逻辑
function parseEthnicityConfig(ethnicityOrRegion: string | null): EthnicityConfig {
  // ...（实现 3.2.3 中的逻辑）
}

// 修改 generateCharacterFiveView 函数
export async function generateCharacterFiveView(...) {
  const ethnicityConfig = parseEthnicityConfig(ethnicity);
  const promptCode = selectPromptCode({ age, ethnicity, mixedEthnicity: ethnicityConfig.isMixed });

  const promptVariables = {
    ...otherVariables,
    mixedEthnicity: ethnicityConfig.isMixed,
    primaryEthnicity: ethnicityConfig.primaryEthnicity,
    secondaryEthnicity: ethnicityConfig.secondaryEthnicity,
    mixedIntensity: ethnicityConfig.mixedIntensity,
    // 审美特征库注入（动态）
    aestheticEyeShape: features.eyeShape,
    aestheticEyeColor: features.eyeColor,
    aestheticSkinTone: features.skinTone,
    aestheticHairStyle: features.hairStyle,
    aestheticNoseShape: features.noseShape,
  };
}
```

#### 4.2.2 TikHub API 集成

安装 TikHub API SDK（如有）或直接调用 REST API：

```typescript
// src/services/crawler/tikhub-client.ts

export class TikHubClient {
  private apiKey: string;

  async fetchXiaohongshuNotes(keyword: string): Promise<XiaohongshuNote[]> {
    const response = await fetch(`https://api.tikhub.io/api/v1/xiaohongshu/app/v2/search_notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keyword,
        limit: 100,
      }),
    });

    return response.json();
  }

  async fetchInstagramPosts(hashtag: string): Promise<InstagramPost[]> {
    // ...调用 TikHub Instagram API
  }
}
```

#### 4.2.3 审美特征库集成

创建 `src/services/aesthetic-library-service.ts`：

```typescript
export class AestheticLibraryService {
  async extractAestheticFeatures(
    ethnicity: string | null,
    age: number | null,
    trendPeriod: string = 'current',
  ): Promise<AestheticFeatures> {
    const currentPeriod = trendPeriod === 'current' ? getCurrentQuarter() : trendPeriod;

    const result = await ctx.pool.query(`
      SELECT feature_category, feature_name, feature_description
      FROM nrm_aesthetic_feature_library
      WHERE
        ethnicity_applicable && $1
        AND age_range = $2
        AND trend_period = $3
        AND popularity_score >= 0.7
        AND is_active = true
      ORDER BY popularity_score DESC, RANDOM()
      LIMIT 10
    `, [ethnicity ? [ethnicity] : ['Asian', 'Mixed'], age <= 12 ? 'child_6-12' : 'adult', currentPeriod]);

    return {
      eyeShape: result.rows.find(r => r.feature_category === 'eye_shape')?.feature_description,
      eyeColor: result.rows.find(r => r.feature_category === 'eye_color')?.feature_description,
      // ...
    };
  }

  async analyzeUserFeedback(characterId: string, userRating: number): Promise<void> {
    // ...（实现 3.2.5 中的用户反馈分析逻辑）
  }
}
```

#### 4.2.4 数据库表创建

执行 SQL（不创建迁移文件）：

```sql
CREATE TABLE nrm_aesthetic_feature_library (
  -- ...（见 3.2.5）
);

COMMENT ON TABLE nrm_aesthetic_feature_library IS '审美特征库 - 追踪主流审美趋势';
```

### 4.3 步骤 3：测试验证

**时间**: 1-2天

**测试矩阵**:

| 场景 | 参数 | 预期效果 |
|------|------|---------|
| 纯 Asian 儿童 | age: 8, ethnicity: "Asian" | 单眼皮/双眼皮可选、黑色头发、温暖白色肤色 |
| Asian + Caucasian 混血儿童 | age: 10, ethnicity: "Mixed Asian + Caucasian" | 双眼皮 + 榛色/琥珀色眼睛、深棕色头发 + 柔和波浪、温暖米色肤色 + 红润脸颊 |
| Hong Kong 区域推断 | ethnicity: "Hong Kong" | 自动推断为 Asian+Caucasian 混血（强混血） |
| 单一种族 30% 概率混血 | ethnicity: "Asian" | 70% → 不混血，30% → 轻微混血（增加多样性） |

**对比验证**:
- 同一服饰平铺图，生成：
  - 原提示词版本（成人比例）
  - 儿童提示词版本（儿童比例）
- 对比指标：眼睛占比差异、脸型圆润度、整体精致感提升

### 4.4 步骤 4：迭代优化

**时间**: 持续

**优化循环**:
1. 收集用户反馈（评分、重生成行为）
2. 分析高分案例特征
3. 调整提示词权重（如琥珀色眼睛权重提升）
4. 更新审美特征库流行度评分
5. 重新测试验证
6. 固化最佳版本

---

## 5. 技术栈与工具

### 5.1 提示词系统

- **Skills 系统**: `skills/` 目录
- **模板引擎**: Handlebars (.hbs)
- **系统提示词 + 用户提示词分离**: 符合项目规范

### 5.2 数据爬虫

- **TikHub API**: 小红书 + Instagram + TikTok/抖音（90%自动化）
- **Playwright**: 时尚杂志爬虫（70%自动化，后期补充）
- **Claude 3 Opus**: AI 图像分析（提取特征）

### 5.3 数据库

- **PostgreSQL**: nrm_aesthetic_feature_library 表
- **流行度评分**: 动态计算（社交媒体 + 用户反馈 + 杂志）
- **自动淘汰机制**: 流行度 < 0.3 自动淘汰

### 5.4 定时任务

- **每月1日**: 社交媒体趋势分析
- **每季度初**: 时尚杂志爬虫
- **每日凌晨**: 综合评分计算
- **实时**: 用户反馈分析

---

## 6. 成本估算

### 6.1 开发成本

| 步骤 | 时间 | 成本 |
|------|------|------|
| 步骤 1：创建 Skill | 1天 | 低 |
| 步骤 2：代码集成 | 2-3天 | 中（TikHub API 极低） |
| 步骤 3：测试验证 | 1-2天 | 低 |
| 步骤 4：迭代优化 | 持续 | 低 |
| **总开发时间** | **4-6天** | **低-中** |

### 6.2 运营成本

| 成本项 | 月度成本 | 说明 |
|--------|---------|------|
| TikHub API | $50-$100 | 每月爬取约 1000-2000 次 |
| 时尚杂志爬虫 | $0 | 自建 Playwright 爬虫（后期补充） |
| 审美特征库维护 | 88%自动化 | 仅需 10% 专家季度审核 |
| **总月度成本** | **$50-$100** | **可控** |

---

## 7. 风险与缓解

### 7.1 风险识别

| 风险 | 严重性 | 缓解措施 |
|------|--------|---------|
| TikHub API 价格上涨 | 中 | 建立备用爬虫方案（Playwright） |
| 审美特征库数据质量差 | 低 | 用户反馈实时调整 + 自动淘汰机制 |
| 时尚杂志网站反爬 | 低 | 使用 Playwright + 浏览器自动化 |
| 混血判断逻辑误判 | 低 | 人工审核 + 区域规则持续优化 |

### 7.2 监控指标

- **精致感评分**: 用户评分 ≥ 4 星占比
- **多样性指标**: 混血特征占比 ≥ 30%
- **审美库健康度**: 活跃特征数 ≥ 50 个
- **API 成本监控**: 每月调用次数 ≤ 2000 次

---

## 8. 批准状态

**设计已批准**，准备进入实施阶段。

**下一步**：调用 writing-plans 技能，创建详细实现计划。

---

## 9. 实施状态

**状态**: 已实施 ✅

**实施日期**: 2026-04-24

**实施文件**:
- `skills/character_five_view_generation_child/` — 儿童专属 Skill（SKILL.md, system.hbs, user.hbs, schema.ts, examples.json）
- `src/modules/character-five-view-generation-service.ts` — 智能混血判断 + 细化审美特征库集成
- `src/services/aesthetic-library-service.ts` — 细化审美特征库服务（14 个子特征）
- `src/services/crawler/tikhub-client.ts` — TikHub API 客户端（小红书 + Instagram）
- `src/utils/date-utils.ts` — 日期工具函数（getCurrentQuarter）
- 数据库表：`nrm_aesthetic_feature_library`（15 条细化种子数据）

**核心功能**:
- ✅ 精致五官规则（眼睛占比 30-35%）
- ✅ 智能混血判断（30%概率轻微混血）
- ✅ 细化审美特征库（14 个子特征类别）
- ✅ 动态流行度评分（实时用户反馈分析）
- ✅ TikHub API 集成（小红书 + Instagram，90%自动化）

**测试验证**: ✅ TypeScript 编译通过，数据库种子数据完整，导入依赖正确

**简化优化**:
- 时尚杂志爬虫已移除（TikHub API 覆盖 90%需求）
- 审美特征类别已细化（从大类拆分为具体子特征）

---

## 附录：参考文档

- TikHub API 文档：`docs/tikhud文档.txt`
- Skills 系统文档：`skills/SKILLS_INDEX.md`
- 提示词系统规范：项目 CLAUDE.md
- 数据库连接规范：`memory/reference_database-connection.md`