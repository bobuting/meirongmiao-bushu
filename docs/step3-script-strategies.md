# Step3 脚本生成策略文档

> 本文档详细描述 Step3 阶段的 9 种脚本生成策略，包括执行流程、输入参数、LLM 调用、生成数量等完整细节。

## 目录

1. [策略总览](#策略总览)
2. [Library 策略](#1-library-库存脚本改写)
3. [Video 策略](#2-video-热榜脚本重写)
4. [Realtime 策略](#3-realtime-实时热点生成)
5. [Effectiveness 策略](#4-effectiveness-效果导向生成)
6. [Custom 策略](#5-custom-场景化种草生成)
7. [Fashion 策略](#6-fashion-时尚大片生成)
8. [Emotion Archetype 策略](#7-emotion_archetype-情感原型驱动)
9. [Aesthetic 策略](#8-aesthetic-生活美学生成)
10. [Product Showcase 策略](#9-product_showcase-产品展示生成)
11. [Story Theme 策略](#10-story_theme-主题叙事生成)
12. [架构设计总结](#架构设计总结)

---

## 脚本类型判断逻辑

视频反推时，根据 `on_screen_presence.has_real_person` 字段智能判断脚本类型：

| has_real_person | 脚本类型 | DB type 值 | 走向改写器 |
|-----------------|----------|------------|------------|
| `true` | REVERSE（有人出镜） | 1 | `video_script_rewriter` |
| `false` | PRODUCT_SHOWCASE（纯商品展示） | 11 | `product_showcase_rewriter` |

**判断函数**: `inferScriptTypeFromContent()`（位于 `src/modules/video-hot-trend/sync-service.ts`）

**核心逻辑**: 只依据 `has_real_person` 字段判断，无其他条件判断。

---

## 年龄驱动策略选择

系统根据角色年龄自动选择可用的脚本生成策略，确保生成内容与角色能力匹配。

### 年龄分组定义

| 分组 | 年龄范围 | 标签 | 能力特征 |
|------|---------|------|---------|
| infant | 0-3 岁 | 婴幼儿 | 无法站立、无主动动作能力 |
| toddler | 4-6 岁 | 幼儿 | 能站立行走，pose 能力有限 |
| child | 7-12 岁 | 儿童 | 能配合拍摄，可做简单展示动作 |
| teen | 13-17 岁 | 青少年 | 大部分策略可用，风格偏向青春活力 |
| adult | 18+ 岁 | 成人 | 所有策略可用（与儿童、青少年一致） |

### 各年龄分组可用策略

| 策略 | infant | toddler | child | teen | adult |
|------|:------:|:-------:|:-----:|:----:|:-----:|
| library | ✅ | ✅ | ✅ | ✅ | ✅ |
| video | ❌ | ❌ | ✅ | ✅ | ✅ |
| realtime | ❌ | ❌ | ✅ | ✅ | ✅ |
| effectiveness | ❌ | ❌ | ✅ | ✅ | ✅ |
| custom | ❌ | ✅ | ✅ | ✅ | ✅ |
| fashion | ❌ | ❌ | ✅ | ✅ | ✅ |
| emotion_archetype | ❌ | ❌ | ✅ | ✅ | ✅ |
| aesthetic | ✅ | ✅ | ✅ | ✅ | ✅ |
| product_showcase | ❌ | ❌ | ✅ | ✅ | ✅ |
| story_theme | ❌ | ❌ | ✅ | ✅ | ✅ |
| resonance | ❌ | ❌ | ✅ | ✅ | ✅ |

### 策略排除原因

| 年龄分组 | 排除策略 | 排除原因 |
|---------|---------|---------|
| infant | fashion | 时尚大片需要 T 台走秀、pose 展示，婴幼儿无法完成 |
| infant | effectiveness | 效果导向需要穿搭变身、动作展示，婴幼儿无法完成 |
| infant | product_showcase | 产品展示需要多动作姿势展示，婴幼儿无法完成 |
| infant | emotion_archetype | 情感原型需要角色主动参与剧情，婴幼儿无法完成 |
| infant | story_theme | 主题叙事需要角色推动剧情，婴幼儿无法完成 |
| infant | custom | 除亲子类外，其他场景类型不适用婴幼儿 |
| infant | realtime | 实时热点生成通常不适合婴幼儿 |
| infant | video | 热榜脚本多为成人向，婴幼儿匹配率低 |
| toddler | fashion | 时尚大片需要专业 pose 能力，幼儿能力有限 |
| toddler | effectiveness | 效果导向的穿搭变身动作较复杂 |
| toddler | product_showcase | 产品展示需要多角度动作展示 |
| toddler | emotion_archetype | 部分情感原型不适合幼儿 |
| toddler | story_theme | 复杂叙事不适合幼儿 |
| toddler | realtime | 热点内容通常不适合幼儿 |
| toddler | video | 热榜脚本多为成人向 |
| toddler | resonance | 共鸣故事需要角色主动参与叙事，幼儿能力有限 |

### API 响应变化

调用 `POST /projects/:projectId/step3/candidates/generate-all` 时，返回值新增年龄相关字段：

```json
{
  "parentJobId": "job-xxx",
  "childJobIds": ["job-1", "job-2"],
  "status": "pending",
  "strategies": ["library", "aesthetic"],
  "age": 2,
  "ageGroup": "infant"
}
```

前端可根据 `strategies` 展示"正在生成 X 个策略的脚本"，用户知道会有哪些结果。

---

## 策略总览

| 策略标识 | DB 类型值 | 中文名称 | Route Key | 生成数量 | LLM 调用 | 生成模式 |
|-----------|----------|---------|-----------|---------|---------|---------|
| `library` | 2 | 库存脚本改写 | `step3_library_script_rewrite` | **1 条** | 1 次 | 改写现有脚本 |
| `video` | 3 | 热榜脚本重写 | `step3_video_script_rewrite` | **1 条** | 1 次 | 改写热榜脚本 |
| `realtime` | 4 | 实时热点生成 | `step3_realtime_script_generation` + `step3_hot_deep_analysis` | **1 条** | 2 次（可缓存减为 1） | 热点分析 + 脚本生成 |
| `effectiveness` | 5 | 效果导向生成 | `script_effectiveness_generation` | **1 条** | 1 次（回退时 0 次） | 视觉驱动 + 规则回退 |
| `custom` | 7 | 场景化种草 | `step3_custom_script_concept` → `step3_custom_script_generation` | **1 条** | 2 次 | 两阶段：概念 → 扩展 |
| `fashion` | 8 | 时尚大片 | `step3_fashion_script_concept` → `step3_fashion_script_generation` | **1 条** | 2 次 | 两阶段：视觉概念 → 脚本 |
| `emotion_archetype` | 9 | 情感原型驱动 | `step3_emotion_archetype_outline` → `step3_emotion_archetype_generation` | **1 条** | 4 次 | 两阶段：大纲（3 候选）→ 分镜 |
| `aesthetic` | 10 | 生活美学 | `step3_aesthetic_script_generation` | **1 条** | 1 次 | 单次生成 |
| `product_showcase` | 11 | 产品展示 | `step3_product_showcase_script_concept` → `step3_product_showcase_script_generation` | **1 条** | 2 次 | 两阶段：视觉概念 → 脚本 |
| `story_theme` | 12 | 主题叙事 | `step3_story_theme_concept` → `step3_story_theme_outline` → `step3_story_theme_generation` | **1 条** | 3 次 | 三阶段：主题概念 → 大纲 → 分镜 |
| `resonance` | 13 | 共鸣故事 | `step3_resonance_story_concept` → `step3_resonance_story_generation` | **1 条** | 2 次 | 两阶段：故事概念 → 分镜 |

### 路由端点

所有策略通过统一 API 触发：

```
POST /neirongmiao/api/projects/:projectId/step3/candidates/:strategy
```

`strategy` 参数为上述策略标识（如 `library`, `video`, `realtime`, `product_showcase` 等）。

---

## 产品性与故事性维度分析

### 策略排序（产品性最强 → 故事性最强）

| 序号 | 策略 | 定位 | 核心目标 | 产品性权重 | 故事性权重 |
|:----:|------|------|---------|:----------:|:----------:|
| 1 | **product_showcase** | 纯产品导向 | 服饰就是展示目的 | **100%** | 0% |
| 2 | **effectiveness** | 效果驱动 | 展示效果最大化 | **85%** | 15% |
| 3 | **fashion** | 视觉美学 | 大片质感+高级感 | **70%** | 30% |
| 4 | **aesthetic** | 平衡点 | 服饰融入美好生活 | **50%** | 50% |
| 5 | **library** | 库存改写 | 保留原脚本特征 | **40%** | 60% |
| 6 | **video** | 热榜复用 | 借鉴爆款结构 | **35%** | 65% |
| 7 | **realtime** | 热点追投 | 时效性+传播力 | **30%** | 70% |
| 8 | **custom** | 场景种草 | 情感共鸣+代入感 | **25%** | 75% |
| 9 | **emotion_archetype** | 情感原型 | 情绪弧线+原型匹配 | **15%** | 85% |
| 10 | **story_theme** | 主题叙事 | 社会共鸣+完整叙事 | **10%** | 90% |
| 11 | **resonance** | 纯故事导向 | 拍人不拍衣服 | **0%** | **100%** |

### 三梯队划分

#### 第一梯队：纯产品导向（产品性 85%+）

**核心特征**：服饰是镜头主角，展示卖点是主要目的。

| 策略 | 核心铁律 | 评分重点 |
|------|---------|---------|
| **product_showcase** | "服饰就是展示目的" | 产品展示力（40%）+ 视觉冲击力（30%） |
| **effectiveness** | 视觉驱动+规则回退 | 展示效果力（35%）+ 视觉吸引力（35%） |
| **fashion** | 大片质感+高级感 | 视觉美学（40%）+ 高级感呈现（35%） |

**product_showcase 与 resonance 的极端对比**：

| 维度 | product_showcase | resonance |
|------|------------------|-----------|
| 服饰定位 | 展示目的 | 角色造型的一部分 |
| 镜头焦点 | 产品多角度展示 | 人物动作和故事 |
| 核心目标 | 购买引导 | 让观众想看完 |
| 改写原则 | 镜头类型分治（有模特/局部出镜/无模特） | 保留人物故事结构 |

#### 第二梯队：产品性与故事性平衡（产品性 40-60%）

**核心特征**：服饰融入场景或故事，不突兀不隐藏。

| 策略 | 核心理念 | 评分重点 |
|------|---------|---------|
| **aesthetic** | "服饰是美好生活的一部分，不是主角，也不是配角" | 生活氛围营造（35%）+ 平衡展示度（35%） |
| **library** | 改写现有脚本，保留原脚本特征 | 策略师传播力（40%） |
| **video** | 借鉴爆款结构，"服饰不是展示目的" | 策略师传播力（40%） |

**aesthetic 的黄金平衡点**：情感叙事与视觉展示平衡，服饰自然融入生活场景。

#### 第三梯队：强故事性（故事性 70%+）

**核心特征**：叙事和情感是脚本的核心驱动力，服饰服务于故事。

| 策略 | 核心理念 | 评分重点 |
|------|---------|---------|
| **realtime** | 时效性+传播力驱动 | 策略师传播力（40%） |
| **custom** | 场景代入感+种草感 | 情感共鸣力（35%）+ 场景匹配度（40%） |
| **emotion_archetype** | 65个情感原型驱动 | 情感原型匹配（40%）+ 情绪弧线表达（35%） |
| **story_theme** | 热点日报×情感原型碰撞 | 叙事完整性（35%）+ 主题一致性（40%） |
| **resonance** | "拍人不拍衣服" | 情感共鸣力为核心 |

**resonance 核心铁律**：
- 讲述真实人物的故事，服装自然呈现在角色造型中
- 镜头描述铁律：**描述人物动作，绝不直接描述服装**
- 核心目标：**让观众想看完**，而非展示产品

### 策略选择指南

| 场景 | 推荐策略 | 原因 |
|------|---------|------|
| 新品首发带货 | product_showcase | 多角度展示卖点 |
| 电商详情页视频 | effectiveness | 效果导向、展示清晰 |
| 品牌大片 | fashion | 高级感、大片质感 |
| 生活美学内容 | aesthetic | 平衡展示、向往感 |
| 借鉴爆款 | library/video | 保留传播结构 |
| 追热点传播 | realtime | 时效性强 |
| 场景种草 | custom | 场景代入感 |
| 情感故事 | emotion_archetype | 情绪弧线 |
| 社会共鸣话题 | story_theme | 热点×原型碰撞 |
| 人物故事 | resonance | 拍人不拍衣服 |

### 设计理念总结

这条轴线反映了项目的核心设计哲学：

- **产品性端** → 服饰是主角，镜头服务于产品展示
- **故事性端** → 服饰是配角，镜头服务于人物故事
- **平衡点（aesthetic）** → "服饰是美好生活的一部分，不是主角，也不是配角"

排序的核心判断标准：
- **产品性**：服饰展示是否是镜头的主要目的
- **故事性**：叙事和情感是否是脚本的核心驱动力

---

## 1. Library（库存脚本改写）

### Route Key

`step3_library_script_rewrite`

### 执行流程（8 步）

**步骤 1：获取项目上下文**
- 调用 `ProjectContextService.getProjectContext()`
- 聚合数据：`clothingStyles`, `characterDescription`, `matchingReference`, `outfitDescription`
- **终止条件**：无服饰风格信息则抛错

**步骤 2：查询库存脚本**
- `nrm_script_data` 表，`type != 1`（非反推脚本）
- 预过滤器：`has_real_person = true`（有人出镜的脚本）
- 限制 200 条，`ORDER BY updated_at DESC`

**步骤 3：随机打乱**
- Fisher-Yates 算法避免重复推荐

**步骤 4：解析脚本内容（不含分镜）**
- 延迟加载优化，`shot_breakdown = []`

**步骤 5：风格匹配过滤**
- 9 条规则：解析状态、曝光级别、出镜时长占比、推荐风格等
- 两阶段年龄过滤：精确匹配优先，无数据脚本备用
- 两阶段性别过滤：精确匹配优先，无数据脚本备用
- **风格匹配规则**：统一字典精确匹配（消除启发式判断）
  - 角色 `clothingStyles` 必须是 25 种字典值之一
  - 脚本 `recommended_styles.style` 已清洗为字典值
  - 精确匹配，不再使用双字/单字包含匹配
- **性别匹配规则**：标准化后精确匹配
  - 角色 `gender` 取值：`male`/`female`/`uncertain`
  - 脚本 `person_details[0].gender` 标准化为 `male`/`female`/`unknown`
  - 角色性别为 `uncertain` 时不限制
  - 脚本性别无法识别时进入无数据池

**步骤 6：加载选定脚本的分镜数据**
- 仅取 `filteredScripts[0]`
- 批量查询 `nrm_shot_breakdown`

**步骤 7：LLM 轻度改写**
- Skill：`library_script_rewriter`
- 温度：0.3
- 改写规则：替换角色描述、服装、表情；保留场景、运镜、氛围

**步骤 8：构建快照**
- 返回 `Step3ScriptCandidateSnapshot`，`items` 包含 1 条候选

### 输入参数

| 参数 | 数据源 |
|------|--------|
| `clothingStyles` | `nrm_outfit_plans.tags` 或服饰 `style` |
| `character.age` | `nrm_library_characters.age` |
| `selectedRoleDirection.gender` | `nrm_projects.selected_role_direction` |
| `scriptJson` | `nrm_script_data` + `nrm_shot_breakdown` |

### 生成数量

**固定 1 条**

### LLM 调用

**1 次**（`library_script_rewriter` skill）

失败时使用原始脚本作为降级结果（`generationMode: "degraded"`）。

---

## 2. Video（热榜脚本重写）

### Route Key

`step3_video_script_rewrite`

### 执行流程

**步骤 1：加载项目上下文**
- 同 Library 策略

**步骤 2：查询热榜脚本**
- `nrm_script_data` 表，`type = 1`（反推脚本）
- **时间范围过滤**：只查询最近 7 天的热榜脚本（确保匹配近期热点）
- 按 `title` 去重，限制 200 条

**步骤 3：随机打乱**

**步骤 4：解析脚本内容**

**步骤 5：风格匹配过滤**
- 9 条规则：解析状态、曝光级别、出镜时长占比、推荐风格、年龄、性别等
- 两阶段年龄过滤：精确匹配优先，无数据脚本备用
- 两阶段性别过滤：精确匹配优先，无数据脚本备用
- **风格匹配规则**：统一字典精确匹配（消除启发式判断）
  - 角色 `clothingStyles` 必须是 25 种字典值之一
  - 脚本 `recommended_styles.style` 已清洗为字典值
  - 精确匹配，不再使用双字/单字包含匹配
- **性别匹配规则**：标准化后精确匹配
  - 角色 `gender` 取值：`male`/`female`/`uncertain`
  - 脚本 `person_details[0].gender` 标准化为 `male`/`female`/`unknown`
  - 角色性别为 `uncertain` 时不限制
  - 脚本性别无法识别时进入无数据池

**步骤 6：加载分镜数据**
- 取 `filteredScripts.slice(0, 2)` — 前 2 条

**步骤 7：LLM 重写（并行）**
- Skill：`video_script_rewriter`
- 温度：0.7
- 三级重写策略：
  - Level 1（必须替换）：subjects description, clothing, expression
  - Level 2（冲突时适配）：position, action, shot_description
  - Level 3（绝不触碰）：timecodes, camera, transitions, scene, music
- **人体模特判定规则**：
  - 真人模特（有表情、动作、视线、情绪互动）→ `type: "人物"`
  - 人体模特/假人（无表情、机械旋转、无视线、展示道具）→ `type: "物体"`
  - 原始 `type: "物体"` 的人体模特，改写后必须保持 `type: "物体"`

**步骤 8：构建快照**
- 返回最多 2 条候选

### 输入参数

| 参数 | 数据源 |
|------|--------|
| `selectedRoleDirection` | `nrm_projects.selected_role_direction` |
| `clothingStyles` | 服饰风格标签 |
| `scriptJson` | 热榜脚本完整 JSON |

### 生成数量

**固定 1 条**（取过滤后的第 1 条热榜脚本）

### LLM 调用

**1 次**（`video_script_rewriter` skill）

---

## 3. Realtime（实时热点生成）

### Route Key

| 阶段 | Route Key | 用途 |
|------|-----------|------|
| 阶段 2 热点分析 | `step3_hot_deep_analysis` | 热点深度分析（2h 全局缓存） |
| 阶段 4 脚本生成 | `step3_realtime_script_generation` | 脚本创作 |

### 执行流程（6 阶段）

**阶段 0：编排器设置**
- 从 `nrm_async_jobs` 获取任务
- 获取并发槽位（每项目最多 2 个策略）

**阶段 1：输入解析（无 LLM）**
- 加载项目上下文
- 查询热点条目 `nrm_trend_entries`（25 条，`ORDER BY syncedAt DESC`）

**阶段 2：热点深度分析**
- Skill：`video_step3_hotspot_analysis`
- 温度：0.3
- **全局缓存**：固定键 `"global_hotspot_analysis"`，TTL 2 小时
- 输出：结构化热点报告 JSON

**阶段 3：角色分析**
- **已移除**，返回空报告占位值

**阶段 4：脚本创作**
- Skill：`video_step3_script_generation`
- 温度：0.7
- 输入：热点报告 + 角色描述 + 服装描述
- 输出：2 条脚本 JSON

**阶段 5：质量检查（无 LLM）**
- 铁律检查：无服装特写、时长 15-30 秒、4-8 个镜头
- 性别一致性检查 + 自动修复

**阶段 6：输出格式化**
- 构建 `Step3ScriptCandidateSnapshot`

### 输入参数

| 参数 | 数据源 |
|------|--------|
| `project` | `nrm_projects` |
| `character` | `nrm_library_characters` |
| `garments` | `nrm_garment_assets` |
| `trendEntries` | `nrm_trend_entries`（25 条） |

### 生成数量

**固定 1 条**

### LLM 调用

| 调用 | Skill | 温度 | 缓存 |
|------|-------|------|------|
| 1 | `video_step3_hotspot_analysis` | 0.3 | 2 小时全局缓存 |
| 2 | `video_step3_script_generation` | 0.7 | 无缓存 |

**总计：2 次**（热点缓存命中时减为 1 次）

---

## 4. Effectiveness（效果导向生成）

### Route Key

`script_effectiveness_generation`

### 执行流程

**阶段 1：项目上下文加载**
- 同其他策略

**阶段 2：输入转换**
- 服饰 → `OutfitAssetInput[]`
- 角色 → `CharacterInfoInput[]`

**阶段 3：热点匹配（无 LLM）**
- 查询 `nrm_hot_trend_assets`（50 条）
- 关键词子字符串匹配排名
- 选排名第一的热点

**阶段 4：LLM 脚本生成**
- Skill：`script_effectiveness_generation`
- 温度：0.8
- 输入：展示类型、氛围主题、节奏类型、热点、角色、服饰
- 输出：完整脚本 JSON

**阶段 5：回退路径**
- 无热点或 LLM 失败时：`buildMinimalFallback()`
- 纯规则构建：4-6 个镜头、30 秒时长

### 输入参数

| 参数 | 数据源 |
|------|--------|
| `garments` | `nrm_garment_assets` |
| `character` | `nrm_library_characters` |
| `hotTrends` | `nrm_hot_trend_assets`（50 条） |

### 展示类型（6 种）

`OOTD穿搭展示`, `生活方式记录`, `Lookbook风格片`, `旅行探店`, `对比测评`, `穿搭变身`

### 生成数量

**固定 1 条**

### LLM 调用

**1 次**（`script_effectiveness_generation` skill）

回退路径时 **0 次**。

---

## 5. Custom（场景化种草生成）

### Route Key

| 阶段 | Route Key | 用途 |
|------|-----------|------|
| 阶段 1 概念生成 | `step3_custom_script_concept` | 故事概念构思 |
| 阶段 2 脚本扩展 | `step3_custom_script_generation` | 完整脚本生成 |

### 执行流程（两阶段）

**阶段 0：初始化**
- 脚本数量：固定 1 条
- 加载项目上下文
- 查询热点 `nrm_hot_trend_assets`（5 维度）

**循环 3 次，每次生成 1 条脚本：**

**阶段 1：故事概念生成**
- 随机选择场景类型（6 种）
- 随机生成多样性组合（7 维度）
- 导演角色轮换：林夕 → 陈默 → 苏然 → ...
- Skill：`custom_scenario_script_concept`
- 温度：0.9
- 输出：概念 JSON（title, theme, emotion_arc, narrative_beats, hook）

**阶段 2：脚本扩展**
- 匹配金标样例 `nrm_golden_script_examples`（2 条）
- Skill：`custom_scenario_script_generation`
- 温度：0.8
- 输入：概念 + 金标样例 + 热点 + 角色/服饰描述
- 输出：完整脚本 JSON

### 输入参数

| 参数 | 数据源 |
|------|--------|
| `outfitDescription` | 服饰描述 |
| `characterDescription` | 角色描述 |
| `hotTrends` | `nrm_hot_trend_assets` |
| `goldenExamples` | `nrm_golden_script_examples`（2 条） |

### 场景类型（6 种）

`剧情/短剧`, `日常Vlog`, `氛围感/OOTD`, `情侣/闺蜜/亲子`, `季节/节日/热点`, `旅行/探店`

### 多样性维度（7 维度）

`narrativeStructure`（11 种）, `characterRelationship`（9 种）, `coreEmotion`（10 种）, `visualStyle`（10 种）, `sceneStrategy`（8 种）, `openingStyle`（9 种）, `endingStyle`（8 种）

### 导演角色（6 位）

林夕（文艺细腻）, 陈默（悬疑反转）, 苏然（温暖治愈）, 赵越（时尚视觉）, 何暖（俏皮轻快）, 周一（极简现代）

### 生成数量

**固定 1 条**

### LLM 调用

**2 次**（概念 1 次 + 扩展 1 次）

---

## 6. Fashion（时尚大片生成）

### Route Key

| 阶段 | Route Key | 用途 |
|------|-----------|------|
| 阶段 1 视觉概念 | `step3_fashion_script_concept` | 色调/镜头/氛围 |
| 阶段 2 脚本扩展 | `step3_fashion_script_generation` | 完整脚本生成 |

### 执行流程（两阶段）

**初始化：**
- 脚本数量：固定 1 条
- 加载项目上下文
- 查询热点 `nrm_hot_trend_assets`（10 条，按 `hot_value` 排序）

**循环 3 次：**

**阶段 1：视觉概念生成**
- 随机多样性组合（9 维度）
- Skill：`fashion_visual_concept`
- 温度：0.9
- 输出：`VisualConcept`（title, visualThesis, visualReference, creativeTension, visualSymbols, colorPalette, cameraLanguage, atmosphereAnchor, visualBeats, keyVisual, endingVisual）

**阶段 2：脚本扩展**
- 匹配金标样例 `nrm_golden_script_examples`（2 条）
- 导演角色轮换：沈光 → 叶岚 → 温如 → 韩铮 → 程野 → 陆白
- Skill：`fashion_script_generation`
- 温度：0.8
- 输出：完整脚本 JSON

### 输入参数

| 参数 | 数据源 |
|------|--------|
| `outfitDescription` | 服饰描述 |
| `characterDescription` | 角色描述 |
| `hotTrends` | `nrm_hot_trend_assets`（10 条） |
| `goldenExamples` | `nrm_golden_script_examples`（2 条） |

### 多样性维度（9 维度）

`scene`（15 种：T台走秀/街拍LOOK/影棚大片/...）, `visualStyle`（8 种）, `cameraMovement`（6 种）, `mood`（6 种）, `openingStyle`（6 种）, `endingStyle`（6 种）, `musicRhythm`（5 种）, `creativeTension`（8 种：柔与刚/古典与未来/自然与人造/静止与运动/光与暗/秩序与混乱/东方与西方/奢华与克制）, `visualSymbol`（8 种：水镜面/植物藤蔓/几何结构/飞鸟羽毛/金属链条/烟雾纱帘/建筑废墟/光线棱镜）

### 导演角色（6 位）

沈光（极简奢侈美学）, 叶岚（街头纪实时装）, 温如（浪漫诗性影像）, 韩铮（概念装置艺术）, 程野（实验视觉冲击）, 陆白（古典电影质感）

### 生成数量

**固定 1 条**

### LLM 调用

**2 次**（概念 1 次 + 扩展 1 次）

---

## 7. Emotion Archetype（情感原型驱动）

### Route Key

| 阶段 | Route Key | 用途 |
|------|-----------|------|
| 阶段 1 大纲生成 | `step3_emotion_archetype_outline` | 3 候选大纲 |
| 阶段 2 分镜生成 | `step3_emotion_archetype_generation` | 完整分镜脚本 |

### 执行流程（两阶段）

**阶段 1：大纲生成（3 候选）**
- 选择情感原型（65 个原型，8 大类）
- **并行**生成 3 个大纲候选
- Skill：`emotion_archetype_outline`
- 温度：0.8
- 本地评分：情绪弧线匹配、冲突清晰度、服饰角色清晰度等
- 选择最高分大纲

**阶段 2：分镜生成**
- Skill：`emotion_archetype_storyboard`
- 温度：0.7
- 输入：选定大纲 + 原型 + 角色/服饰描述
- 输出：完整分镜脚本 JSON

**验证：**
- 镜头数、场景一致性、同步点、情绪弧线

### 输入参数

| 参数 | 数据源 |
|------|--------|
| `characterDescription` | 角色描述 |
| `outfitDescription` | 服饰描述 |
| `selectedArchetype` | 65 个原型库（按年龄/性别/风格过滤） |

### 情感原型库（8 大类，65 个原型）

`成长蜕变`, `浪漫邂逅`, `温暖治愈`, `力量觉醒`, `神秘吸引`, `青春活力`, `优雅从容`, `叛逆突破`

### 生成数量

**固定 1 条**（从 3 个大纲候选中选最佳）

### LLM 调用

**4 次**（3 次大纲生成 + 1 次分镜扩展）

---

## 8. Aesthetic（生活美学生成）

### Route Key

`step3_aesthetic_script_generation`

### 执行流程

**步骤 1：加载项目上下文**
- 同其他策略

**步骤 2：转换数据**
- 服饰 → `assets[]`
- 角色 → `characters[]`

**步骤 3：加载 Skill**
- Skill：`aesthetic_script_generation`
- 共享规则注入：`shot-description`, `shot-breakdown-schema`, `video-output-schema`

**步骤 4：LLM 生成**
- 温度：0.8
- 输出：完整脚本 JSON

**步骤 5：解析响应**
- `extractJsonObject()` 解析

**步骤 6：构建快照**
- 返回 1 条候选

### 输入参数

| 参数 | 数据源 |
|------|--------|
| `characters` | 角色信息 |
| `assets` | 服饰资产 |
| `aestheticType` | 硬编码 `"fashion_aesthetic"` |

### 核心特点

**"发现生活的美好"** — 服饰是美好生活的一部分，不是主角，也不是配角。情感叙事与视觉展示平衡。

### 生成数量

**固定 1 条**

### LLM 调用

**1 次**（`aesthetic_script_generation` skill）

---

## 9. Product Showcase（产品展示生成）

### Route Key

| 阶段 | Route Key | 用途 |
|------|-----------|------|
| 阶段 1 视觉概念 | `step3_product_showcase_script_concept` | 产品展示视觉概念生成 |
| 阶段 2 脚本扩展 | `step3_product_showcase_script_generation` | 完整脚本生成 |

### 执行流程（两阶段）

**初始化：**
- 脚本数量：固定 1 条
- 加载项目上下文
- 查询热点 `nrm_hot_trend_assets`（10 条，按 `hot_value` 排序）

**循环 3 次：**

**阶段 1：视觉概念生成**
- 单模特多角度多场景的产品导向展示概念
- Skill：`product_showcase_concept`
- 温度：0.9
- 输出：`ProductShowcaseConcept`（showcaseType, angleSequence, sceneFlow, actionHighlights, keyVisual, endingVisual）

**阶段 2：脚本扩展**
- 匹配金标样例 `nrm_golden_script_examples`（2 条）
- 导演角色轮换：李楠（电商实战）→ 张阳（视觉冲击）→ 王薇（细节质感）→ 陈宇（场景营造）
- Skill：`product_showcase_generation`
- 温度：0.8
- 输出：完整脚本 JSON

### 输入参数

| 参数 | 数据源 |
|------|--------|
| `outfitDescription` | 服饰描述 |
| `characterDescription` | 角色描述 |
| `hotTrends` | `nrm_hot_trend_assets`（10 条） |
| `goldenExamples` | `nrm_golden_script_examples`（2 条） |

### 展示类型（5 种）

`全能细节展示`, `场景化生活方式`, `对比测评`, `穿搭教学`, `新品首发`

### 多样性维度（6 维度）

`showcaseType`（5 种：全能细节/场景生活方式/对比测评/穿搭教学/新品首发）, `angleSequence`（5 种）, `sceneFlow`（6 种）, `actionHighlights`（8 种）, `openingStyle`（6 种）, `endingStyle`（6 种）

### 导演角色（4 位）

李楠（电商实战）, 张阳（视觉冲击）, 王薇（细节质感）, 陈宇（场景营造）

### 核心特点

**单模特多角度多场景多动作姿势的产品导向带货脚本**

- **多角度覆盖**：全身、半身、面料特写、细节特写
- **多场景切换**：室内试穿、街拍、咖啡厅、办公室、户外等
- **动作驱动**：每个动作展示一个产品卖点（弹性、垂感、版型、百搭）
- **导演角色轮换**：4 位电商导演带来不同产品展示视角
- **金标样例匹配**：质量锚点确保脚本质量

### 生成数量

**固定 1 条**

### LLM 调用

**2 次**（概念 1 次 + 扩展 1 次）

### 实现文件

`src/modules/video-step/step3-product-showcase/`
- `types.ts` - 类型定义
- `concept-generator.ts` - 视觉概念生成器
- `prompt.ts` - 提示词构建
- `index.ts` - 策略入口
- `script-rewriter.ts` - 反推重写器（兼容有模特/无模特/局部出镜三种镜头）

### 反推重写

**Route Key**: `step3_product_showcase_script_rewrite`

**触发条件**: 项目 `kind = "reverse"` 且关联脚本为 product_showcase 策略

**改写策略**: 镜头分类改写（三类型分治）

| 镜头类型 | 判断条件 | 改写规则 |
|----------|----------|----------|
| **有模特镜头** | subjects 有人物，景别为全身/半身 | 替换角色描述 + 服饰，保留展示结构 |
| **局部出镜镜头** | subjects 有人物，景别为特写/近景，描述只涉及局部（手/手臂等） | 适配局部描述为新模特属性（肤色/手型等） |
| **无模特镜头** | subjects 只有物体或为空（面料特写/细节特写） | 基于新产品卖点重新生成描述 |

**Skill**: `product_showcase_rewriter`

**温度**: 0.7

**核心原则**: 服饰就是展示目的（与 video_script_rewriter 的"服饰不是展示目的"相反）

**与 video_script_rewriter 的区别**:

| 维度 | video_script_rewriter | product_showcase_rewriter |
|------|----------------------|--------------------------|
| 适用脚本 | 热榜验证脚本 | 产品展示脚本 |
| 核心原则 | 服饰不是展示目的 | 服饰就是展示目的 |
| 爆款因子 | 必须保留 | 无需分析 |
| 镜头处理 | 只替换人物 subjects | 按镜头类型分治改写 |
| 无模特镜头 | 不处理 | 基于新产品卖点重新生成 |
| 局部出镜镜头 | 不处理 | 适配局部描述为新模特属性 |

**预分类机制**: 改写前先对脚本中所有镜头进行预分类，将分类结果注入 LLM prompt，避免 LLM 自行判断镜头类型导致的误判。

**人体模特判定规则**:

| 类型 | 特征 | subjects.type |
|------|------|---------------|
| **真人模特** | 有表情、有动作、有视线方向、有情绪互动 | `"人物"` |
| **人体模特/假人** | 无表情、机械旋转/静止、无视线、展示道具 | `"物体"` |

判断依据：
- description 中出现"人体模特"、"假人"、"展示道具"、"模特架"、"模特穿着" → 保持 `type: "物体"`
- position 中出现"展示台"、"固定位置" → 保持 `type: "物体"`
- action 是"旋转展示"、"静止展示"、"360度旋转展示" → 保持 `type: "物体"`

改写规则：原始 `type: "物体"` 的人体模特，改写后必须保持 `type: "物体"`，只替换服装描述。

### 路由端点

```
POST /neirongmiao/api/projects/:projectId/step3/candidates/product_showcase
```

### 任务类型

`step3_product_showcase`

### 初始阶段

"生成展示概念"

---

## 10. Story Theme（主题叙事生成）

### Route Key

| 阶段 | Route Key | 用途 |
|------|-----------|------|
| 阶段 1 主题构思 | `step3_story_theme_concept` | 热点日报 × 情感原型碰撞生成主题概念 |
| 阶段 2 故事大纲 | `step3_story_theme_outline` | 基于主题概念扩展为故事大纲 |
| 阶段 3 分镜展开 | `step3_story_theme_generation` | 基于故事大纲生成分镜脚本 |

### 执行流程（三阶段）

**初始化：**
- 脚本数量：固定 1 条
- 加载项目上下文
- 查询情感原型（65 个原型，8 大类）

**阶段 1：主题构思**
- 选择情感原型（65 个原型库，按年龄/性别/风格过滤）
- 查询热点日报（`nrm_trend_entries`，取最新日报的 5-10 条热点）
- Skill：`story_theme_concept`
- 温度：0.8
- 输入：热点日报 + 情感原型 + 角色/服饰描述
- 输出：`StoryThemeConcept`（themeTitle, coreEmotion, narrativeCore, relevanceExplanation）

**阶段 2：故事大纲**
- Skill：`story_theme_outline`
- 温度：0.7
- 输入：主题概念 + 情感原型 + 角色/服饰描述
- 输出：`StoryThemeOutline`（narrativeStructure, emotionalArc, keyPlotPoints, climaxPoint, endingType）

**阶段 3：分镜展开**
- Skill：`story_theme_generation`
- 温度：0.7
- 输入：故事大纲 + 主题概念 + 角色/服饰描述
- 输出：完整分镜脚本 JSON

**验证：**
- 镜头数、场景一致性、主题一致性、情绪弧线

### 输入参数

| 参数 | 数据源 |
|------|--------|
| `characterDescription` | 角色描述 |
| `outfitDescription` | 服饰描述 |
| `selectedArchetype` | 65 个原型库（按年龄/性别/风格过滤） |
| `trendEntries` | `nrm_trend_entries`（热点日报数据） |

### 情感原型库（8 大类，65 个原型）

`成长蜕变`, `浪漫邂逅`, `温暖治愈`, `力量觉醒`, `神秘吸引`, `青春活力`, `优雅从容`, `叛逆突破`

### 核心特点

**热点日报 × 情感原型碰撞** — 利用当日热点日报的情感共鸣点与情感原型的叙事模式碰撞，生成强叙事性、强真实感的主题故事。

- **热点日报驱动**：使用当日热点日报的 5-10 条热点，捕捉社会情绪和关注点
- **情感原型锚定**：65 个情感原型提供成熟的叙事框架和情绪弧线
- **三阶段生成**：主题概念 → 故事大纲 → 分镜脚本，层层递进确保质量
- **强叙事性**：每个脚本都有明确的主题、情绪弧线和情节结构
- **强真实感**：基于真实热点，贴近用户当前关注和情感需求

### 生成数量

**固定 1 条**

### LLM 调用

**3 次**（串行）
1. `story_theme_concept` - 主题构思
2. `story_theme_outline` - 故事大纲
3. `story_theme_generation` - 分镜展开

### Skills

| Skill | 阶段 | 用途 |
|-------|------|------|
| `story_theme_concept` | 阶段 1 | 生成主题概念（热点×原型碰撞） |
| `story_theme_outline` | 阶段 2 | 基于主题概念生成故事大纲 |
| `story_theme_generation` | 阶段 3 | 基于故事大纲生成分镜脚本 |

---

## 11. Resonance（共鸣故事生成）

### 设计理念

**拍人不拍衣服** — 讲述真实人物的故事，服装自然呈现在角色造型中。

核心目标是**让观众想看完**，而非展示产品。反转是可选工具，不是必选项。

### 执行流程

```
fetchHotTrends() ─────────────────────┐
getProjectContext() ──────────────────┤（并行）
getMergedSceneRecommendation() ───────┘
        │
        ▼
   选择讲述者人格（4 选 1 轮转）
        │
        ▼
   阶段 1：故事概念生成
   skill: resonance_story_concept
   temp: 0.85
   route: STEP3_RESONANCE_STORY_CONCEPT
        │
        ▼
   matchGoldenExamples()
        │
        ▼
   阶段 2：分镜展开
   skill: resonance_story_generation
   temp: 0.7
   route: STEP3_RESONANCE_STORY_GENERATION
   共享规则: shot-description, video-output-schema, character-outfit-anchors
        │
        ▼
   构建 Step3ScriptCandidateSnapshot
   strategyType: "resonance"
```

### 讲述者人格

| 人格 | 风格 | 签名 |
|------|------|------|
| 陈野 | 街头纪实 | 用粗糙的真实感打动人，不修饰不美化 |
| 赵锐 | 冷峻反转 | 表面平静下暗流涌动，用反转揭示真相 |
| 苏暖 | 生活治愈 | 在平凡日常里找到温暖的诗意 |
| 周白 | 极简叙事 | 用最少的镜头讲最大的故事，留白即力量 |

### 关键约束

- **镜头描述铁律**：描述人物动作，绝不直接描述服装
- **热点数据**：复用已有的 `nrm_hot_trend_assets` 数据（情绪驱动，不是话题复述）
- **场景推荐**：`suitability: ["clothing", "lifestyle"]`
- **默认时长**：25-30 秒，6-8 个镜头

### LLM 调用

| 阶段 | Skill Code | Route Key | Temperature | 用途 |
|------|-----------|-----------|-------------|------|
| 概念生成 | `resonance_story_concept` | `STEP3_RESONANCE_STORY_CONCEPT` | 0.85 | 故事概念构思 |
| 分镜展开 | `resonance_story_generation` | `STEP3_RESONANCE_STORY_GENERATION` | 0.7 | 概念→完整分镜 |

---

## 架构设计总结

### 共享组件

| 组件 | 职责 | 使用策略 |
|------|------|---------|
| `ProjectContextService` | 聚合项目数据（角色、服饰、穿搭） | 全部 10 种 |
| `buildPrompt(skillCode, variables)` | 统一 Skill 加载入口 | 全部 10 种 |
| `buildUnifiedSnapshotItem()` | 统一字段提取 | library/video/realtime |
| `video-output-schema.md` | 标准 JSON 输出格式 | 全部 10 种 |
| `shot-description.md` | 镜头描述生成规则 | 多种策略 |
| `scene-recommender.ts` | 场景库+硬编码场景合并推荐 | custom/fashion/product_showcase/aesthetic/resonance |
| `clothing-narrative-identity.md` | 服饰叙事身份（5种身份随机注入） | product_showcase/fashion/effectiveness |
| `narrative-identity.ts` | 叙事身份随机选择（代码层） | product_showcase/fashion/effectiveness |

### 场景库集成

4 个策略（custom、fashion、product_showcase、aesthetic、resonance）在生成脚本前会查询场景库，合并后注入 Skill 模板：

**数据流：**
```
策略执行 → getMergedSceneRecommendation(pool, { suitability, fallbackScenes })
         → SceneLibraryService.extractSceneFeatures(suitability)
         → 合并：场景库场景（优先）+ 硬编码场景（补足）
         → 注入 Skill 模板变量 recommendedScenes
         → LLM 基于真实热度场景 + 基础场景生成脚本
```

**策略 suitability 映射：**

| 策略 | suitability | 硬编码兜底场景 |
|------|------------|---------------|
| custom | `["clothing", "lifestyle"]` | 户外公园、咖啡馆场景、居家空间、城市街头、办公空间、花艺工作室 |
| fashion | `["clothing"]` | FASHION_SCENES（15 种） |
| product_showcase | `["clothing"]` | PRODUCT_SCENES（10 种） |
| aesthetic | `["clothing", "lifestyle"]` | 室内家居、花艺空间、咖啡馆角落、阳台晨光、书店一角、厨房料理台 |

**合并逻辑：**
1. 查询场景库（`nrm_scene_library`）中 `suitability && $1` 且 `popularity_score >= 0.5` 的场景
2. 场景库数据排在前面（真实热度数据）
3. 硬编码场景补足到目标数量（默认 6 个）
4. 场景库查询失败时仅使用硬编码场景，不影响主流程

**Skill 模板变量：**
```handlebars
{{#if recommendedScenes}}
## 推荐场景（场景库热度数据 + 基础场景）
以下场景供参考，可以从中选取或借鉴灵感融入分镜：
{{recommendedScenes}}
{{/if}}
```

### Skill 系统架构

```
skills/
├── {skill-code}/
│   ├── SKILL.md           # 元数据（名称、描述、共享规则依赖）
│   ├── system.hbs         # 系统提示词模板
│   ├── user.hbs           # 用户提示词模板
│   ├── schema.ts          # Zod 输入验证
│   └── examples.json      # 使用示例
└── _shared/rules/
    ├── video-output-schema.md
    ├── shot-description.md
    └── shot-breakdown-schema.md
```

### Product Showcase 专属 Skills

| Skill | 阶段 | 用途 |
|-------|------|------|
| `product_showcase_concept` | 阶段 1 | 生成产品展示视觉概念 |
| `product_showcase_generation` | 阶段 2 | 扩展为完整脚本 |

### 提示词铁律

**系统提示词写规则，用户提示词写变量参数，绝不允许混淆。**

所有业务数据（角色、服饰、热点）通过 Handlebars 变量注入到 `user.hbs`，规则和输出格式约束在 `system.hbs` 和共享规则中。

---

## 脚本质量评分

### 评分系统概述

脚本质量评分系统通过**策略差异化评分机制**，为每种脚本类型配置专属评分维度、权重和评分提示词，确保评分标准与业务目标精准匹配。

**详细文档**：参见 [script-quality-scoring-strategies.md](script-quality-scoring-strategies.md)

### 策略评分配置

| 策略类型 | 评分维度 | 权重分配 | 核心评估重点 |
|---------|---------|---------|------------|
| **product_showcase** | 产品展示力 + 编导可执行性 + 视觉冲击力 | 40% + 30% + 30% | 多角度覆盖、卖点展示、购买引导 |
| **fashion** | 视觉美学 + 编导可执行性 + 高级感呈现 | 40% + 25% + 35% | 镜头语言高级、色调设计感、大片感 |
| **effectiveness** | 展示效果力 + 编导可执行性 + 视觉吸引力 | 35% + 30% + 35% | 展示类型明确、服饰视觉焦点、高光时刻 |
| **custom** | 情感共鸣力 + 编导可执行性 + 场景匹配度 | 35% + 25% + 40% | 场景代入感、种草感、场景匹配 |
| **emotion_archetype** | 情感原型匹配 + 编导可执行性 + 情绪弧线表达 | 40% + 25% + 35% | 情感原型一致、情绪弧线表达、真实感 |
| **aesthetic** | 生活氛围营造 + 编导可执行性 + 平衡展示度 | 35% + 30% + 35% | 生活场景真实感、向往感、平衡展示 |
| **story_theme** | 叙事完整性 + 编导可执行性 + 主题一致性 | 35% + 25% + 40% | 情节结构完整、主题一致、社会共鸣 |
| **library/video/realtime** | 观众吸引力 + 编导可执行性 + 策略师传播力 | 30% + 30% + 40% | 传播力、吸引力、可执行性 |

### 评分触发机制

**定时评分（主要机制）**：
- 执行时间：每天凌晨 2 点
- 触发条件：当天生成的未评分脚本
- 守护进程轮询间隔：10 秒

**评分结果数据库**：
- 表：`nrm_script_quality_scores`
- 字段：`viewerScore`/`directorScore`/`strategistScore`（通过字段映射机制兼容）
- 状态标记：`nrm_script_data.quality_status`（active/deprecated）

### Product Showcase 专属评分维度

| 维度 | 扣分检查项 |
|------|-----------|
| **产品展示力** | 多角度覆盖（缺失扣12分）、卖点展示（无扣10分）、细节特写（无扣8分）、购买引导（无扣8分）、自然展示（生硬扣10分） |
| **视觉冲击力** | 前3秒冲击（无扣15分）、色彩搭配（杂乱扣8分）、节奏流畅（突兀扣5分）、爆款画面潜力（无扣10分） |

### Fashion 专属评分维度

| 维度 | 扣分检查项 |
|------|-----------|
| **视觉美学** | 镜头语言高级（平庸扣12分）、色调设计感（杂乱扣10分）、大片感（无扣10分）、避免廉价感（有扣8分） |
| **高级感呈现** | 品牌调性传达（模糊扣10分）、模特表现专业（业余扣8分）、设计亮点突出（无扣10分）、节奏从容（急躁扣8分） |

### 评分结果应用

| 应用场景 | 用途 | 实现位置 |
|---------|------|---------|
| **库存脚本筛选** | 过滤低分脚本，只推荐高质量脚本 | `step3-library-script/index.ts` |
| **低分脚本淘汰** | 自动标记低于阈值的脚本为 `deprecated` | `scoring-loop.ts` |
| **弱项反馈注入** | 提取高频弱点反馈给脚本生成系统 | `scoring-loop.ts` |
| **Prompt版本对比** | 对比不同 prompt 版本的质量指标 | `metrics-aggregator.ts` |

---

## 附录：数据库表

| 表名 | 用途 |
|------|------|
| `nrm_script_data` | 脚本数据存储（type 列区分策略） |
| `nrm_shot_breakdown` | 分镜数据（关联 `script_data_id`） |
| `nrm_hot_trend_assets` | 热点资产库 |
| `nrm_trend_entries` | 热点条目 |
| `nrm_golden_script_examples` | 金标样例库 |
| `nrm_emotion_archetype_library` | 情感原型库（可选） |
| `nrm_async_jobs` | 异步任务队列 |
| `nrm_scene_library` | 场景库（TikHub 爬取 + AI 分析） |

---

*文档更新日期：2026-05-24*