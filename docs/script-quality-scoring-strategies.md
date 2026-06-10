# 脚本质量评分策略配置文档

> 本文档详细说明脚本质量评分系统的**策略差异化评分机制**，包括设计理念、配置规则、评分维度、权重分配、数据库字段映射等完整细节。

---

## 目录

1. [系统概述](#系统概述)
2. [设计理念](#设计理念)
3. [架构设计](#架构设计)
4. [策略评分配置详解](#策略评分配置详解)
5. [评分提示词设计](#评分提示词设计)
6. [数据库字段映射](#数据库字段映射)
7. [实现细节](#实现细节)
8. [使用示例](#使用示例)
9. [扩展指南](#扩展指南)

---

## 系统概述

### 背景

原有评分系统对所有脚本类型使用**统一评分标准**（观众吸引力 + 编导可执行性 + 策略师传播力），这导致不同类型脚本的核心质量特征无法被准确评估。

**典型问题示例**：

| 脚本类型 | 核心目标 | 原评分标准问题 |
|---------|---------|---------------|
| **product_showcase** | 产品展示、带货能力 | ❌ 多角度覆盖、卖点展示、购买引导未被评估 |
| **fashion** | 视觉美学、高级感呈现 | ❌ 镜头语言高级、色调设计感、大片感未被评估 |
| **aesthetic** | 生活氛围、情感叙事平衡 | ❌ 生活感、服饰融入度未被专门评估 |

### 解决方案

**策略差异化评分系统**：根据脚本类型的业务目标，配置专属评分维度、权重和评分提示词。

---

## 设计理念

### 核心原则

1. **业务导向**：评分维度直接映射脚本类型的业务目标
2. **权重差异化**：不同维度根据业务重要性配置不同权重
3. **提示词专属化**：评分提示词包含明确的扣分检查项，适配脚本类型的核心质量标准
4. **向后兼容**：通过字段映射机制，兼容现有数据库结构（`viewerScore`/`directorScore`/`strategistScore`）

### 评分流程

```
脚本输入 → 获取策略配置 → 执行专属视角评分 → 加权合成 → 字段映射 → 写入数据库
```

---

## 架构设计

### 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| **评分引擎** | `src/modules/script-quality/scoring-engine.ts` | 执行评分、加权合成、结果返回 |
| **策略配置** | `scoring-engine.ts` 内的 `STRATEGY_SCORING_CONFIG` | 定义每种策略的评分维度和权重 |
| **评分提示词** | `scoring-engine.ts` 内的常量 | 定义每个视角的评分标准和扣分检查项 |
| **数据仓库** | `src/modules/script-quality/scoring-repository.ts` | 评分结果持久化 |
| **守护进程** | `src/modules/script-quality/scoring-daemon.ts` | 后台执行评分任务 |

### 配置结构

```typescript
interface PerspectiveConfig {
  name: string;           // 视角标识（如 product_showcase_power）
  weight: number;         // 权重（0-1，如 0.4 表示 40%）
  promptTemplate: string; // 评分提示词模板（包含扣分检查项）
  skillVariables: Record<string, string>; // Skill 模板变量映射
}

interface StrategyScoringConfig {
  perspectives: PerspectiveConfig[];      // 该策略的评分维度列表
  perspectiveFieldMap: Record<string, string>; // 视角名称 → 数据库字段映射
}

const STRATEGY_SCORING_CONFIG: Record<ScoringStrategy, StrategyScoringConfig> = {
  product_showcase: { ... },
  fashion: { ... },
  // 其他策略配置
};
```

---

## 策略评分配置详解

### 1. Product Showcase（产品展示）

**业务目标**：电商带货脚本，服饰就是展示目的，追求多角度覆盖、卖点展示、购买引导。

| 维度 | 权重 | 视角标识 | 评分重点 |
|------|------|---------|---------|
| **产品展示力** | 40% | `product_showcase_power` | 多角度覆盖、卖点展示、细节特写、购买引导、自然展示 |
| **编导可执行性** | 30% | `director_executability` | 场景可拍摄、动作可执行、镜头数量匹配 |
| **视觉冲击力** | 30% | `visual_impact` | 前3秒冲击、色彩搭配、节奏流畅、爆款画面潜力 |

**字段映射**：
- `product_showcase_power` → `viewerScore`（语义为产品展示力）
- `director_executability` → `directorScore`
- `visual_impact` → `strategistScore`（语义为视觉冲击力）

---

### 2. Fashion（时尚大片）

**业务目标**：追求高级感和视觉美感，镜头语言高级、色调设计感、大片感。

| 维度 | 权重 | 视角标识 | 评分重点 |
|------|------|---------|---------|
| **视觉美学** | 40% | `visual_aesthetics` | 镜头语言高级、色调设计感、大片感、避免廉价感 |
| **编导可执行性** | 25% | `director_executability` | 场景可拍摄、动作可执行、镜头数量匹配 |
| **高级感呈现** | 35% | `premium_feeling` | 品牌调性传达、模特表现专业、设计亮点突出、节奏从容 |

**字段映射**：
- `visual_aesthetics` → `viewerScore`（语义为视觉美学）
- `director_executability` → `directorScore`
- `premium_feeling` → `strategistScore`（语义为高级感呈现）

---

### 3. Library / Video / Realtime（通用三视角）

**业务目标**：改写现有脚本或热点脚本，追求传播力、吸引力、可执行性。

| 维度 | 权重 | 视角标识 | 评分重点 |
|------|------|---------|---------|
| **观众吸引力** | 30% | `viewer` | 前3秒冲击、情绪弧线、转发触发点、受众精准度 |
| **编导可执行性** | 30% | `director` | 场景可拍摄、转场逻辑、镜头数量匹配、避免抽象描述 |
| **策略师传播力** | 40% | `strategist` | 二次传播触发、平台适配、行动钩子、品牌植入自然 |

**字段映射**：
- `viewer` → `viewerScore`
- `director` → `directorScore`
- `strategist` → `strategistScore`

---

### 4. Effectiveness（效果导向）

**业务目标**：视觉驱动的展示效果，服饰是画面视觉焦点，追求展示效果与视觉吸引力。

| 维度 | 权重 | 视角标识 | 评分重点 |
|------|------|---------|---------|
| **展示效果力** | 35% | `presentation_effect` | 展示类型明确、服饰视觉焦点、展示节奏匹配、高光时刻、避免人物抢镜 |
| **编导可执行性** | 30% | `director_executability` | 场景可拍摄、动作可执行、镜头数量匹配 |
| **视觉吸引力** | 35% | `visual_attraction` | 前3秒视觉锚点、画面吸引力、节奏感、模仿触发点 |

**字段映射**：
- `presentation_effect` → `viewerScore`（语义为展示效果力）
- `director_executability` → `directorScore`
- `visual_attraction` → `strategistScore`（语义为视觉吸引力）

---

### 5. Custom（场景化种草）

**业务目标**：情感驱动的场景化种草，追求情感共鸣和场景匹配度。

| 维度 | 权重 | 视角标识 | 评分重点 |
|------|------|---------|---------|
| **情感共鸣力** | 35% | `emotion_resonance` | 场景代入感、情感叙事共鸣、服饰情感节点、种草感、自然叙事 |
| **编导可执行性** | 25% | `director_executability` | 场景可拍摄、动作可执行、镜头数量匹配 |
| **场景匹配度** | 40% | `scene_matching` | 服饰风格匹配场景、适配人物关系、适配场景氛围、场景真实可体验 |

**字段映射**：
- `emotion_resonance` → `viewerScore`（语义为情感共鸣力）
- `director_executability` → `directorScore`
- `scene_matching` → `strategistScore`（语义为场景匹配度）

---

### 6. Emotion Archetype（情感原型驱动）

**业务目标**：情感原型的一致性表达，追求情感原型匹配和情绪弧线表达。

| 维度 | 权重 | 视角标识 | 评分重点 |
|------|------|---------|---------|
| **情感原型匹配** | 40% | `archetype_matching` | 情感原型明确、情绪弧线符合原型、关键情节匹配、服饰情感节点、真实表达 |
| **编导可执行性** | 25% | `director_executability` | 场景可拍摄、动作可执行、镜头数量匹配 |
| **情绪弧线表达** | 35% | `emotion_arc_expression` | 情绪起点明确、高潮张力、终点收束、情绪递进节奏、服饰参与情绪表达 |

**字段映射**：
- `archetype_matching` → `viewerScore`（语义为情感原型匹配）
- `director_executability` → `directorScore`
- `emotion_arc_expression` → `strategistScore`（语义为情绪弧线表达）

---

### 7. Aesthetic（生活美学）

**业务目标**："服饰是美好生活的一部分"，追求生活氛围营造和平衡展示度。

| 维度 | 权重 | 视角标识 | 评分重点 |
|------|------|---------|---------|
| **生活氛围营造** | 35% | `life_atmosphere` | 生活场景真实感、氛围情感共鸣、服饰自然融入、向往感、节奏舒缓 |
| **编导可执行性** | 30% | `director_executability` | 场景可拍摄、动作可执行、镜头数量匹配 |
| **平衡展示度** | 35% | `balance_presentation` | 情感叙事与服饰展示平衡、服饰定位明确、融合叙事、避免纯展示/纯生活 |

**字段映射**：
- `life_atmosphere` → `viewerScore`（语义为生活氛围营造）
- `director_executability` → `directorScore`
- `balance_presentation` → `strategistScore`（语义为平衡展示度）

---

### 8. Story Theme（主题叙事）

**业务目标**：完整的叙事结构和主题一致性表达，追求叙事完整性和主题一致性。

| 维度 | 权重 | 视角标识 | 评分重点 |
|------|------|---------|---------|
| **叙事完整性** | 35% | `narrative_completeness` | 情节结构完整、情节因果逻辑、高潮张力、结局收束、叙事节奏合理 |
| **编导可执行性** | 25% | `director_executability` | 场景可拍摄、动作可执行、镜头数量匹配 |
| **主题一致性** | 40% | `theme_consistency` | 主题明确、情节围绕主题、服饰服务主题、热点融入主题、社会共鸣 |

**字段映射**：
- `narrative_completeness` → `viewerScore`（语义为叙事完整性）
- `director_executability` → `directorScore`
- `theme_consistency` → `strategistScore`（语义为主题一致性）

---

## 评分提示词设计

### 设计原则

每个评分提示词包含**明确的扣分检查项**，确保 LLM 评分可量化、可解释：

1. **扣分项明确**：列出 4-5 项检查点，每项有具体扣分值
2. **业务适配**：扣分项直接映射脚本类型的业务目标
3. **输出规范**：要求返回结构化 JSON（score/strengths/weaknesses/suggestions）

### Product Showcase 示例：产品展示力评分提示词

```markdown
你从【产品展示力】视角评估。这是电商带货脚本，服饰就是展示目的。逐项检查以下扣分点：

①是否有多角度覆盖——全身/半身/细节特写至少各出现一次（缺失扣12分）；
②是否有明确的产品卖点展示——弹性/垂感/版型/百搭等卖点是否在动作中体现（无扣10分）；
③是否有细节特写镜头展示面料/质感/工艺（无扣8分）；
④是否有引导用户购买的钩子——价格暗示/限时优惠/穿搭建议（无扣8分）；
⑤动作是否自然展示服饰特点而非机械摆拍（生硬扣10分）。

strengths 只写确实超出预期的展示亮点，weaknesses 必须包含所有触发的扣分项。

输出 JSON 格式：
{
  "score": 85,
  "strengths": ["全身展示覆盖", "弹性卖点在动作中体现"],
  "weaknesses": ["缺少面料细节特写"],
  "suggestions": ["增加面料细节特写镜头"]
}
```

### Fashion 示例：视觉美学评分提示词

```markdown
你从【视觉美学】视角评估。这是时尚大片脚本，追求高级感和视觉美感。逐项检查以下扣分点：

①镜头语言是否高级——运镜流畅/构图考究/景别丰富（平庸扣12分）；
②色调搭配是否有设计感——主色调统一/辅助色点缀/氛围感强（杂乱扣10分）；
③画面是否有"大片感"——模特表现力/场景选择/光影质感（无扣10分）；
④是否避免廉价感——避免过度曝光/俗套构图/土味滤镜（有扣8分）。

strengths 只写确实超出预期的美学亮点，weaknesses 必须包含所有触发的扣分项。

输出 JSON 格式：
{
  "score": 90,
  "strengths": ["运镜流畅高级", "色调统一有设计感"],
  "weaknesses": ["部分镜头构图略显平庸"],
  "suggestions": ["增加特写镜头强化大片感"]
}
```

---

## 数据库字段映射

### 字段映射机制

为兼容现有数据库结构（`nrm_script_quality_scores` 表），使用字段映射机制：

```typescript
perspectiveFieldMap: {
  product_showcase_power: "viewerScore",    // 语义为产品展示力
  director_executability: "directorScore",
  visual_impact: "strategistScore",         // 语义为视觉冲击力
}
```

### 映射规则

| 原字段名 | Product Showcase 映射 | Fashion 映射 | 通用策略映射 |
|---------|---------------------|-------------|------------|
| `viewerScore` | 产品展示力 | 视觉美学 | 观众吸引力 |
| `directorScore` | 编导可执行性 | 编导可执行性 | 编导可执行性 |
| `strategistScore` | 视觉冲击力 | 高级感呈现 | 策略师传播力 |

### 注意事项

**数据库字段语义变化**：
- `viewerScore` 字段在不同策略下有不同语义
- 查询评分数据时需结合 `strategy` 字段理解各分数含义
- 建议在展示层添加语义标注（如 "产品展示力: 85分"）

---

## 实现细节

### 核心函数改造

#### scoreScript 函数（评分主流程）

```typescript
export async function scoreScript(
  input: ScoringJobInput,
  deps: ScoringEngineDeps,
): Promise<QualityScoreRecord> {
  // 1. 获取策略配置
  const strategyConfig = STRATEGY_SCORING_CONFIG[input.strategy];

  // 2. 根据配置执行 LLM 视角并行评估
  const perspectivePromises = strategyConfig.perspectives.map((perspective) =>
    evaluatePerspective(input, perspective, deps.requestLlmPlainText),
  );
  const settledResults = await Promise.allSettled(perspectivePromises);

  // 3. 过滤有效结果
  const perspectives = settledResults
    .map((r) => r.status === "fulfilled" && r.value ? r.value : null)
    .filter((r): r is PerspectiveResult => r !== null);

  // 4. 按策略配置权重加权合成
  let weightedSum = 0;
  let totalWeight = 0;
  for (const r of perspectives) {
    const config = strategyConfig.perspectives.find((p) => p.name === r.perspective);
    const w = config?.weight ?? 0.33;
    weightedSum += r.score * w;
    totalWeight += w;
  }
  const score = Math.round(weightedSum / totalWeight);

  // 5. 字段映射
  const perspectiveScores: Record<string, number | null> = {};
  for (const r of perspectives) {
    const fieldName = strategyConfig.perspectiveFieldMap[r.perspective];
    if (fieldName) perspectiveScores[fieldName] = r.score;
  }

  // 6. 返回结果
  return {
    ...,
    viewerScore: perspectiveScores.viewerScore ?? null,
    directorScore: perspectiveScores.directorScore ?? null,
    strategistScore: perspectiveScores.strategistScore ?? null,
  };
}
```

#### evaluatePerspective 函数（通用视角评估）

```typescript
async function evaluatePerspective(
  input: ScoringJobInput,
  perspective: PerspectiveConfig,
  requestLlm: (sys: string, user: string) => Promise<string>,
): Promise<PerspectiveResult | null> {
  // 构建 Skill 模板变量
  const skillVariables: Record<string, string> = {
    perspectivePrompt: perspective.promptTemplate,
    scriptTitle: input.scriptTitle ?? "",
    scriptContent: input.scriptContent.slice(0, 2000),
  };

  // 根据 skillVariables 配置添加额外变量
  if (perspective.skillVariables.scriptSummary) {
    skillVariables.scriptSummary = input.scriptSummary ?? "";
  }
  if (perspective.skillVariables.videoStyle) {
    skillVariables.videoStyle = input.videoStyle ?? "";
  }

  // 调用 Skill 渲染并执行 LLM
  const { system, user } = await skillLoader.render(SKILL_CODE_SCRIPT_QUALITY_SCORING, skillVariables);
  const resp = await requestLlm(system, user);
  const parsed = parseQualityResponse(resp);
  return parsed ? { ...parsed, perspective: perspective.name } : null;
}
```

---

## 使用示例

### Product Showcase 脚本评分

**输入脚本**：
```json
{
  "scriptTitle": "春季新品针织衫展示",
  "scriptContent": "镜头1：全身展示，模特缓缓转身...镜头2：半身特写，展示领口设计...镜头3：面料细节特写，手指轻抚面料...",
  "strategy": "product_showcase",
  "videoStyle": "简约清新"
}
```

**评分结果**：
```json
{
  "score": 88,
  "viewerScore": 90,        // 产品展示力（多角度覆盖、卖点展示、细节特写）
  "directorScore": 85,      // 编导可执行性（场景可拍摄、动作可执行）
  "strategistScore": 88,    // 视觉冲击力（前3秒冲击、色彩搭配）
  "strengths": [
    "全身/半身/细节三角度完整覆盖",
    "弹性卖点在转身动作中自然体现",
    "面料细节特写展示质感"
  ],
  "weaknesses": [
    "缺少购买引导钩子"
  ],
  "suggestions": [
    "结尾增加价格暗示或穿搭建议"
  ]
}
```

### Fashion 脚本评分

**输入脚本**：
```json
{
  "scriptTitle": "高级时装大片",
  "scriptContent": "镜头1：慢推全身，光影交错...镜头2：特写面部，表情张力...镜头3：剪裁细节特写...",
  "strategy": "fashion",
  "videoStyle": "高级简约"
}
```

**评分结果**：
```json
{
  "score": 92,
  "viewerScore": 94,        // 视觉美学（镜头语言高级、色调设计感）
  "directorScore": 88,      // 编导可执行性
  "strategistScore": 90,    // 高级感呈现（品牌调性、模特表现）
  "strengths": [
    "运镜流畅，构图考究",
    "色调统一，氛围感强",
    "模特表情有张力"
  ],
  "weaknesses": [
    "部分镜头切换略显急躁"
  ],
  "suggestions": [
    "镜头2-3转场延长0.5秒"
  ]
}
```

---

## 扩展指南

### 为新策略添加专属评分

**步骤 1：定义评分维度**

分析策略的业务目标，确定 3 个核心评分维度：

| 维度 | 权重建议 | 评分重点 |
|------|---------|---------|
| 维度1 | 30-40% | 最核心的业务目标 |
| 维度2 | 25-35% | 次重要的业务目标 |
| 维度3 | 25-30% | 通用质量标准（如编导可执行性） |

**步骤 2：编写评分提示词**

```typescript
const NEW_STRATEGY_DIMENSION1_PROMPT = `你从【维度1】视角评估。逐项检查以下扣分点：
①检查项1（无则扣X分）；
②检查项2（无则扣Y分）；
③检查项3（无则扣Z分）；
④检查项4（无则扣W分）。

strengths 只写确实超出预期的亮点，weaknesses 必须包含所有触发的扣分项。`;
```

**步骤 3：添加策略配置**

```typescript
STRATEGY_SCORING_CONFIG.new_strategy = {
  perspectives: [
    {
      name: "dimension1",
      weight: 0.35,
      promptTemplate: NEW_STRATEGY_DIMENSION1_PROMPT,
      skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
    },
    {
      name: "director_executability",
      weight: 0.30,
      promptTemplate: DIRECTOR_PERSPECTIVE_PROMPT,
      skillVariables: { scriptTitle: "scriptTitle", videoStyle: "videoStyle", scriptContent: "scriptContent" },
    },
    {
      name: "dimension3",
      weight: 0.35,
      promptTemplate: NEW_STRATEGY_DIMENSION3_PROMPT,
      skillVariables: { scriptTitle: "scriptTitle", scriptContent: "scriptContent" },
    },
  ],
  perspectiveFieldMap: {
    dimension1: "viewerScore",
    director_executability: "directorScore",
    dimension3: "strategistScore",
  },
};
```

**步骤 4：验证评分效果**

使用 `npm run skills:test script_quality_scoring -e 0` 测试评分提示词效果，调整扣分项直到评分结果符合预期。

---

## 附录：完整配置代码

详见源代码文件：`src/modules/script-quality/scoring-engine.ts`

---

*文档更新日期：2026-05-07*
*文档版本：v1.1（阶段2完整覆盖 - 7种策略专属评分 + 3种通用评分）*

---

## 附录A：评分提示词完整示例

### Effectiveness 示例：展示效果力评分提示词

```markdown
你从【展示效果力】视角评估。这是效果导向脚本，追求视觉驱动的展示效果。逐项检查以下扣分点：

①展示类型是否明确体现——OOTD/生活方式/Lookbook/旅行探店/对比测评/穿搭变身（模糊扣12分）；
②服饰是否成为画面视觉焦点——服装占比合理/不被场景淹没/突出展示（无扣10分）；
③展示节奏是否匹配类型——OOTD需快节奏/Lookbook需慢节奏/测评需对比节奏（不匹配扣8分）；
④是否有视觉冲击的"高光时刻"——转身展示/对比切换/穿搭变身瞬间（无扣10分）；
⑤是否避免"只看人不见衣"——人物不过度抢镜/服饰始终是主角（人物抢镜扣8分）。

strengths 只写确实超出预期的展示效果亮点，weaknesses 必须包含所有触发的扣分项。

输出 JSON 格式：
{
  "score": 88,
  "strengths": ["展示类型明确为OOTD", "转身展示高光时刻"],
  "weaknesses": ["展示节奏略显拖沓"],
  "suggestions": ["加快镜头切换节奏"]
}
```

### Custom 示例：情感共鸣力评分提示词

```markdown
你从【情感共鸣力】视角评估。这是场景化种草脚本，追求情感驱动的种草效果。逐项检查以下扣分点：

①场景是否有代入感——日常Vlog/情侣闺蜜/旅行探店等场景是否真实可信（虚假扣12分）；
②情感叙事是否有共鸣——甜蜜/治愈/友情/亲情等情感是否传达（无扣10分）；
③服饰是否出现在情感关键节点——重要时刻穿重要衣服（无关联扣8分）；
④是否有"我也想这样穿"的种草感——穿搭好看+场景匹配（无扣10分）；
⑤叙事是否自然不刻意——避免硬植入/保持叙事流畅（生硬扣8分）。

strengths 只写确实超出预期的情感共鸣亮点，weaknesses 必须包含所有触发的扣分项。

输出 JSON 格式：
{
  "score": 90,
  "strengths": ["咖啡馆场景真实代入感强", "服饰出现在约会关键节点"],
  "weaknesses": ["缺少种草感"],
  "suggestions": ["增加穿搭好看+场景匹配的种草引导"]
}
```

### Emotion Archetype 示例：情感原型匹配评分提示词

```markdown
你从【情感原型匹配】视角评估。这是情感原型驱动脚本，追求情感原型的一致性表达。逐项检查以下扣分点：

①情感原型是否明确体现——成长蜕变/浪漫邂逅/温暖治愈等原型是否清晰（模糊扣12分）；
②情绪弧线是否符合原型模式——原型规定的情绪起点/高潮/终点是否体现（不符合扣10分）；
③关键情节是否匹配原型——原型规定的关键情节点是否出现（缺失扣8分）；
④服饰是否在情感关键节点出现——重要情感时刻服饰有戏份（无关联扣10分）；
⑤情感表达是否真实不虚假——避免过度戏剧化/保持真实感（虚假扣8分）。

strengths 只写确实超出预期的情感原型匹配亮点，weaknesses 必须包含所有触发的扣分项。

输出 JSON 格式：
{
  "score": 92,
  "strengths": ["温暖治愈原型清晰", "情绪弧线完整表达"],
  "weaknesses": ["服饰在高潮时刻戏份不足"],
  "suggestions": ["增加服饰在温暖高潮时的细节展示"]
}
```

### Aesthetic 示例：生活氛围营造评分提示词

```markdown
你从【生活氛围营造】视角评估。这是生活美学脚本，追求"服饰是美好生活的一部分"。逐项检查以下扣分点：

①生活场景是否有真实感——居家/咖啡馆/书店/阳台等场景是否真实可信（虚假扣12分）；
②氛围感是否有情感共鸣——温馨/治愈/文艺/舒适等情绪是否传达（无扣10分）；
③服饰是否自然融入场景——不刻意展示/自然出现在生活场景中（生硬扣8分）；
④是否有"想这样生活"的向往感——生活方式吸引/场景想体验/氛围想拥有（无扣10分）；
⑤节奏是否从容舒缓——慢节奏/无急促感/让人放松（急躁扣8分）。

strengths 只写确实超出预期的生活氛围亮点，weaknesses 必须包含所有触发的扣分项。

输出 JSON 格式：
{
  "score": 88,
  "strengths": ["书店场景真实感强", "服饰自然融入阅读场景"],
  "weaknesses": ["节奏略显急促"],
  "suggestions": ["延长镜头停留时间，增加舒缓感"]
}
```

### Story Theme 示例：主题一致性评分提示词

```markdown
你从【主题一致性】视角评估。这是主题叙事脚本，追求完整的叙事结构和主题一致性。逐项检查以下扣分点：

①主题是否明确表达——主题标题/核心情感是否清晰（模糊扣12分）；
②所有情节是否围绕主题——情节服务于主题表达（偏离扣10分）；
③服饰是否服务于主题——服饰出现与主题表达相关（无关扣8分）；
④热点是否融入主题——热点元素与主题表达结合（无结合扣8分）；
⑤主题是否有社会共鸣——主题贴近社会情绪/有传播潜力（无共鸣扣10分）。

strengths 只写确实超出预期的主题一致性亮点，weaknesses 必须包含所有触发的扣分项。

输出 JSON 格式：
{
  "score": 90,
  "strengths": ["主题明确表达", "所有情节围绕主题"],
  "weaknesses": ["服饰与主题关联不足"],
  "suggestions": ["增加服饰在主题表达中的作用"]
}
```

---

## 附录B：所有策略评分使用示例

### Effectiveness 脚本评分示例

**输入脚本**：
```json
{
  "scriptTitle": "OOTD穿搭展示",
  "scriptContent": "镜头1：全身展示转身...镜头2：半身特写展示领口...镜头3：对比前后穿搭效果...",
  "strategy": "effectiveness",
  "videoStyle": "时尚简约"
}
```

**评分结果**：
```json
{
  "score": 88,
  "viewerScore": 90,        // 展示效果力（展示类型明确、服饰视觉焦点）
  "directorScore": 85,      // 编导可执行性
  "strategistScore": 88,    // 视觉吸引力（高光时刻、节奏感）
  "strengths": ["OOTD展示类型明确", "转身展示高光时刻"],
  "weaknesses": ["展示节奏略显拖沓"],
  "suggestions": ["加快镜头切换节奏"]
}
```

### Custom 脚本评分示例

**输入脚本**：
```json
{
  "scriptTitle": "咖啡馆约会穿搭",
  "scriptContent": "镜头1：咖啡馆场景...镜头2：情侣穿搭展示...镜头3：约会关键节点服饰变化...",
  "strategy": "custom",
  "videoStyle": "温馨治愈"
}
```

**评分结果**：
```json
{
  "score": 90,
  "viewerScore": 92,        // 情感共鸣力（场景代入感、种草感）
  "directorScore": 88,      // 编导可执行性
  "strategistScore": 90,    // 场景匹配度（场景真实、服饰匹配）
  "strengths": ["咖啡馆场景真实代入感强", "服饰出现在约会关键节点"],
  "weaknesses": ["缺少种草感"],
  "suggestions": ["增加穿搭好看+场景匹配的种草引导"]
}
```

### Emotion Archetype 脚本评分示例

**输入脚本**：
```json
{
  "scriptTitle": "温暖治愈故事",
  "scriptContent": "镜头1：开场温暖氛围...镜头2：治愈情节递进...镜头3：温暖高潮服饰展示...",
  "strategy": "emotion_archetype",
  "videoStyle": "温暖治愈"
}
```

**评分结果**：
```json
{
  "score": 92,
  "viewerScore": 94,        // 情感原型匹配（温暖治愈原型清晰、情绪弧线表达）
  "directorScore": 88,      // 编导可执行性
  "strategistScore": 92,    // 情绪弧线表达（情绪起点明确、高潮张力）
  "strengths": ["温暖治愈原型清晰", "情绪弧线完整表达"],
  "weaknesses": ["服饰在高潮时刻戏份不足"],
  "suggestions": ["增加服饰在温暖高潮时的细节展示"]
}
```

### Aesthetic 脚本评分示例

**输入脚本**：
```json
{
  "scriptTitle": "书店阅读时光",
  "scriptContent": "镜头1：书店场景...镜头2：阅读时服饰自然出现...镜头3：生活氛围营造...",
  "strategy": "aesthetic",
  "videoStyle": "文艺舒适"
}
```

**评分结果**：
```json
{
  "score": 88,
  "viewerScore": 90,        // 生活氛围营造（场景真实感、向往感）
  "directorScore": 86,      // 编导可执行性
  "strategistScore": 88,    // 平衡展示度（情感叙事与服饰展示平衡）
  "strengths": ["书店场景真实感强", "服饰自然融入阅读场景"],
  "weaknesses": ["节奏略显急促"],
  "suggestions": ["延长镜头停留时间，增加舒缓感"]
}
```

### Story Theme 脚本评分示例

**输入脚本**：
```json
{
  "scriptTitle": "成长蜕变故事",
  "scriptContent": "镜头1：开场困境...镜头2：成长情节递进...镜头3：蜕变高潮服饰变化...",
  "strategy": "story_theme",
  "videoStyle": "励志成长"
}
```

**评分结果**：
```json
{
  "score": 90,
  "viewerScore": 92,        // 叙事完整性（情节结构完整、高潮张力）
  "directorScore": 88,      // 编导可执行性
  "strategistScore": 90,    // 主题一致性（主题明确、情节围绕主题）
  "strengths": ["成长蜕变主题明确", "所有情节围绕主题"],
  "weaknesses": ["服饰与主题关联不足"],
  "suggestions": ["增加服饰在主题表达中的作用"]
}
```