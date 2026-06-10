# Skills 汇总文档

> 📌 **重要提醒**：每次修改任何 Skill 后，必须运行 `npm run skills:generate-index` 更新此文档！

---

## 统计信息

| 指标 | 数值 |
|------|------|
| Skills 总数 | 51 |
| 类别数量 | 21 |
| 更新日期 | 2026-05-09 |

---

## 目录

- [evolution](#evolution) (1 个)
- [fashion](#fashion) (3 个)
- [fission](#fission) (1 个)
- [general](#general) (2 个)
- [hot_trend](#hot-trend) (1 个)
- [image](#image) (1 个)
- [image_analysis](#image-analysis) (1 个)
- [image_generation](#image-generation) (5 个)
- [image_project](#image-project) (2 个)
- [ops](#ops) (1 个)
- [prompt](#prompt) (2 个)
- [scoring](#scoring) (1 个)
- [script](#script) (2 个)
- [section](#section) (1 个)
- [square](#square) (1 个)
- [step1](#step1) (2 个)
- [storyboard_generation](#storyboard-generation) (1 个)
- [system](#system) (1 个)
- [uncategorized](#uncategorized) (2 个)
- [video_analysis](#video-analysis) (2 个)
- [video_step](#video-step) (18 个)

---

## evolution

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| prompt_evolution_proposal | 提示词进化提案 | 接收质量进化信号，调用 LLM 生成改进版 Prompt 提案 | 1.0.0 | `prompt`, `evolution`, `proposal` |

## fashion

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| capability_fashion_analysis | 时尚分析助手 | 多模态时尚分析师 | 1.0.0 | - |
| single_image_outfit | 单图服饰分析 | 分析单张图片中的服饰 | 1.0.0 | - |
| step1_outfit_optimization | 服饰搭配提示词优化 | 将搭配分析重写为生图提示词 | 1.0.0 | - |

## fission

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| fission_story_generation | 裂变故事生成 | 根据原故事和角色信息创作新的裂变故事脚本，保持角色特征和原分镜不变 | 1.0.0 | - |

## general

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| capability_text_analysis | 文本分析助手 | 通用中文写作和规划助手 | 1.0.0 | - |
| capability_text_default_instruction | 文本分析默认指令 | 能力实验室文本分析接口的默认指令 | 1.0.0 | - |

## hot_trend

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| realtime_trend_emotion_archetype | 实时热点情感原型提取 | 从实时热点话题文本中提取可复用的情感原型，用于扩充情感原型库 | 1.0.0 | `emotion_archetype`, `realtime` |

## image

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| character_single_view_generation | 角色单视图生成 | 角色库单视图逐个生成提示词 | 1.0.0 | - |

## image_analysis

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| portrait_check | 人像检测分析 | 分析图片是否为人像，并返回详细特征分析 | 1.0.0 | - |

## image_generation

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| character_five_view_generation | 角色五视图生成 | 生成角色五视图图板提示词（服饰搭配场景） | 2.0.0 | - |
| character_five_view_generation_child | 儿童角色五视图生成 | 儿童专属五视图生成提示词，包含精致五官规则、比例完美约束、混血特征增强、服装精致度匹配 | 2.0.0 | `child`, `refinement`, `mixed-race`, `outfit-detail` |
| character_five_view_generation_outfit_portrait | 角色五视图生成（服饰+真人结合） | 项目内服饰搭配 + 角色头像同时传入的五视图生成，同时参考服饰平铺图和角色头像生成五视图 | 2.0.0 | - |
| character_five_view_generation_real_portrait | 角色五视图生成（真人像） | 根据真人肖像生成角色五视图图板提示词 | 2.0.0 | - |
| garment_flat_lay_generation | 服饰平铺图生成 | 基于用户上传的服饰图片，生成正反面电商专业平铺图（上下布局） | 3.0.0 | - |

## image_project

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| image_project_step1_garment_analysis | 图片项目 Step1 单品服饰分析 | 分析单品服饰图片，返回分类+属性+卖点，一次调用完成 | 1.0.0 | - |
| image_project_step3_model_plan | 图片项目 Step3 模特图规划 | 根据服装搭配和角色描述，规划模特图的拍摄方案（姿势+背景），生成 10 张模特图的规划 | 1.0.0 | - |

## ops

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| provider_connectivity_probe | Provider 连通性测试 | 用于测试 LLM / 图片生成 / 视频生成 Provider 的连通性提示词 | 1.0.0 | `provider`, `connectivity`, `probe` |

## prompt

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| prompt_rewrite_storyboard | 分镜提示词改写 | 改写分镜提示词 | 1.0.0 | - |

## scoring

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| script_quality_scoring | 脚本质量评分 | 对短视频脚本进行多维度质量评分 | 1.0.0 | `scoring`, `quality`, `script` |

## script

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| script_planner_lenient | 脚本规划（宽松模式） | 短视频脚本规划，解析失败返回模板文本 | 1.0.0 | - |
| script_planner_strict | 脚本规划（严格模式） | 短视频脚本规划，返回JSON格式 | 1.0.0 | - |

## section

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|

## square

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| square_creator_evaluation | 达人评估 | 评估抖音达人是否符合「场景种草」内容理念（以半度闲为标杆），识别场景化穿搭展示+大片质感+无导购的优质创作者。三要素缺一不可：穿搭展示、场景化拍摄、视觉质感。 | 1.0.0 | - |

## step1

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| step1_image_classification | Step1 图片分类 | 服饰图片分类、视角标注 | 1.0.0 | - |
| step1_role_direction_from_garments | Step1 角色方向生成（基于服饰） | 根据用户服饰信息和性别年龄生成角色方向预设（不依赖穿搭方案） | 1.0.0 | `step1`, `character`, `direction`, `garments` |

## storyboard_generation

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| shot_prompt_engineer | 分镜提示词工程师 | 将完整脚本数据（video_info + video_analysis + shot_breakdown）转化为可直接投入AI视频工具生产的高精度提示词指令包，包含关键帧图片提示词和视频提示词 | 1.1.0 | - |

## system

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| outfit_analysis | 穿搭分析生成 | Step1 穿搭方案生成，智能补齐用户未提供的单品，生成差异化搭配方案 | 1.0.0 | - |

## uncategorized

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| product_showcase_rewriter | 产品展示脚本改写器 | 根据新角色和新产品信息改写产品展示分镜脚本，兼容有模特/无模特/局部出镜三种镜头类型 | 1.0.0 | - |
| video_step3_hotspot_daily_analysis | video_step3_hotspot_daily_analysis | 每日热点分析报告生成，五段结构化输出（核心趋势/穿搭切入点/情绪氛围/规避话题/创意建议） | 1.0.0 | `hot-trend`, `daily-analysis`, `step3` |

## video_analysis

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| video_multimodal_screen | 视频多模态筛选提示词 | 用于视频多模态筛选的完整提示词模板 | 1.0.0 | - |
| video_storyboard_analysis | 视频分镜分析 | 分析视频内容生成分镜脚本，输出JSON结构化数据 | 1.0.0 | - |

## video_step

| Code | 名称 | 描述 | 版本 | 标签 |
|------|------|------|------|------|
| aesthetic_script_generation | 生活美学脚本生成 | 情感叙事与视觉展示平衡的生活美学脚本，适合时尚博主/品牌内容创作。核心是"发现生活的美好"，服饰是美好生活的一部分，不是展示主角，也不是背景配角。 | 1.0.0 | - |
| custom_scenario_script_concept | 场景化脚本概念生成（阶段1） | 生成场景化种草脚本的概念阶段，确定主题和叙事框架 | 1.0.0 | - |
| custom_scenario_script_generation | 场景化种草脚本生成 | 根据场景化概念生成种草类短视频脚本 | 1.0.0 | - |
| emotion_archetype_outline | 情感原型-故事大纲生成 | 基于情感原型生成故事大纲（第一段） | 1.0.0 | - |
| emotion_archetype_storyboard | 情感原型-详细分镜生成 | 基于故事大纲生成详细分镜（第二段） | 1.0.0 | - |
| fashion_script_generation | 时尚大片脚本生成 | 生成时尚品牌大片风格的短视频脚本 | 1.0.0 | - |
| fashion_visual_concept | 时尚大片视觉概念生成（阶段1） | 生成时尚大片视觉概念的第一阶段，确定视觉命题和创作素材 | 1.0.0 | - |
| library_script_rewriter | 库存脚本角色改写器 | 将分镜脚本改写为新角色版本，保持原有风格氛围 | 1.0.0 | - |
| product_showcase_concept | 产品展示视觉概念生成（阶段1） | 生成产品展示脚本的第一阶段，规划单模特多角度多场景的展示概念 | 1.0.0 | - |
| product_showcase_generation | 产品展示脚本生成 | 生成电商带货风格的产品展示短视频脚本，单模特多角度多场景 | 1.0.0 | - |
| script_effectiveness_generation | 效果导向脚本生成（视觉驱动） | 视觉驱动、转化导向的短视频脚本，适合穿搭展示、旅游探店、Lookbook、生活随拍氛围感短片等展示类场景。服饰是视觉主角，强调画面节奏和展示效果。 | 2.0.0 | - |
| story_theme_concept | 主题叙事-主题构思 | 基于热点日报与情感原型碰撞，生成故事主题（第一段） | 1.0.0 | - |
| story_theme_generation | 主题叙事-分镜展开 | 基于故事大纲生成详细分镜（第三段） | 1.0.0 | - |
| story_theme_outline | 主题叙事-故事大纲 | 基于故事主题生成完整故事大纲（第二段） | 1.0.0 | - |
| video_script_rewriter | 视频脚本改写器 | 根据角色描述改写分镜脚本 | 1.0.0 | - |
| video_step3_character_analysis | Step3 角色形象分析 | 分析角色形象中的服饰风格和受众画像 | 1.0.0 | - |
| video_step3_hotspot_analysis | Step3 热点深度分析 | 分析热点话题的情绪价值和商业潜力，输出结构化 JSON 报告供下游脚本生成使用 | 1.0.0 | - |
| video_step3_script_generation | Step3 脚本生成 | 生成服饰种草类短视频脚本，遵循叙事为主、软植入原则。输入需包含热点分析报告（hotspot-analysis-output-schema 格式） | 1.0.0 | - |

---

## 更新指南

### 何时更新此文档

以下情况必须运行更新命令：

- ✅ 新增 Skill
- ✅ 修改 Skill 元数据（SKILL.md）
- ✅ 修改 Skill 名称、描述、分类、标签
- ✅ 删除 Skill

以下情况**不需要**更新此文档：

- ❌ 修改 system.md/system.hbs 内容
- ❌ 修改 user.md/user.hbs 内容
- ❌ 修改 schema.ts
- ❌ 修改 examples.json

### 更新命令

```bash
npm run skills:generate-index
```

### 强制更新提醒

建议在以下场景添加强制更新检查：

1. **Git Pre-commit Hook**: 提交时检查 SKILL.md 变动，提醒更新汇总文档
2. **CI Pipeline**: PR 合并前检查汇总文档是否为最新版本
3. **定期审计**: 每周运行 `npm run skills:check` 检查一致性

---

## 快速查询

### 查看单个 Skill 详情

```bash
npm run skills:info {skill-code}
```

### 测试 Skill 渲染

```bash
npm run skills:test {skill-code} -- -e 0
```

### 验证 Skill 完整性

```bash
npm run skills:validate {skill-code}
```

---

*此文档由 `scripts/generate-skills-index.ts` 自动生成*
