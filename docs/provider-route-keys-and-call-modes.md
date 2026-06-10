# Provider 路由键 & 调用协议模式 参考文档

> 自动生成自 `src/contracts/provider-route-keys.ts` 和 `src/contracts/types.ts`

---

## 一、ProviderRouteKeys（路由键）

路由键是 Provider 路由的核心标识，每个业务功能点对应一个 routeKey。

### Step1 服饰上传

| 常量 | routeKey | 说明 |
|------|----------|------|
| `STEP1_FASHION_ANALYSIS` | `step1_fashion_analysis` | 服饰分析 |
| `STEP1_FASHION_SEARCH` | `step1_fashion_search` | 服饰搜索 LLM 增强 |
| `STEP1_ROLE_PRESET` | `step1_role_preset` | 角色预设生成 |
| `STEP1_IMAGE_SEARCH_GROUNDING` | `step1_image_search_grounding` | 图片搜索 grounding（图片项目 Step1） |
| `IMAGE_PROJECT_STEP1_SELLING_POINTS` | `image_project_step1_selling_points` | 卖点提取（图片项目 Step1） |

### Step2 定妆

| 常量 | routeKey | 说明 |
|------|----------|------|
| `STEP2_FIVE_VIEW_GENERATION_CHILD` | `step2_five_view_generation_child` | 五视图生成 - 儿童（≤16岁） |
| `STEP2_FIVE_VIEW_GENERATION_ADULT` | `step2_five_view_generation_adult` | 五视图生成 - 成人（>16岁） |

### Step3 脚本生成

| 常量 | routeKey | 说明 |
|------|----------|------|
| `STEP3_REALTIME_SCRIPT_GENERATION` | `step3_realtime_script_generation` | 实时热点脚本生成（Realtime 策略专用） |
| `STEP3_HOT_DEEP_ANALYSIS` | `step3_hot_deep_analysis` | 热点深度分析 |
| `STEP3_STORYBOARD_IMAGE` | `step3_storyboard_image` | 分镜图生成（通用，已废弃） |
| `STEP3_STORYBOARD_IMAGE_CHILD` | `step3_storyboard_image_child` | 分镜图生成 - 儿童（≤16岁） |
| `STEP3_STORYBOARD_IMAGE_ADULT` | `step3_storyboard_image_adult` | 分镜图生成 - 成人（>16岁） |
| `STEP3_STORYBOARD_PROMPT` | `step3_storyboard_prompt` | 分镜提示词工程（视频项目） |
| `STEP3_CUSTOM_SCRIPT_GENERATION` | `step3_custom_script_generation` | 场景化种草脚本生成（Custom 策略） |
| `STEP3_CUSTOM_SCRIPT_CONCEPT` | `step3_custom_script_concept` | 场景化脚本概念生成（Custom 阶段1） |
| `STEP3_FASHION_SCRIPT_GENERATION` | `step3_fashion_script_generation` | 时尚大片脚本生成（Fashion 策略） |
| `STEP3_FASHION_SCRIPT_CONCEPT` | `step3_fashion_script_concept` | 时尚大片视觉概念生成（Fashion 阶段1） |
| `STEP3_EMOTION_ARCHETYPE_GENERATION` | `step3_emotion_archetype_generation` | 情感原型脚本生成（两段式：大纲+分镜） |
| `STEP3_EMOTION_ARCHETYPE_OUTLINE` | `step3_emotion_archetype_outline` | 情感原型大纲生成（阶段1，3个候选大纲） |
| `SCRIPT_EFFECTIVENESS_GENERATION` | `script_effectiveness_generation` | 种草脚本生成（Effectiveness 策略） |
| `STEP3_AESTHETIC_SCRIPT_GENERATION` | `step3_aesthetic_script_generation` | 生活美学脚本生成（Aesthetic 策略） |
| `STEP3_VIDEO_SCRIPT_REWRITE` | `step3_video_script_rewrite` | 视频热榜脚本改写（Video 策略） |
| `STEP3_LIBRARY_SCRIPT_REWRITE` | `step3_library_script_rewrite` | 库脚本改写（Library 策略） |
| `STEP3_PRODUCT_SHOWCASE_SCRIPT_REWRITE` | `step3_product_showcase_script_rewrite` | 产品展示脚本改写（Product Showcase 策略，兼容有模特/无模特/局部出镜三种镜头） |
| `STEP3_PRODUCT_SHOWCASE_SCRIPT_GENERATION` | `step3_product_showcase_script_generation` | 产品展示脚本生成（Product Showcase 策略） |
| `STEP3_PRODUCT_SHOWCASE_SCRIPT_CONCEPT` | `step3_product_showcase_script_concept` | 产品展示视觉概念生成（Product Showcase 阶段1） |
| `STEP3_STORY_THEME_CONCEPT` | `step3_story_theme_concept` | 主题叙事-主题构思（Story Theme 阶段1，热点×原型碰撞） |
| `STEP3_STORY_THEME_OUTLINE` | `step3_story_theme_outline` | 主题叙事-故事大纲（Story Theme 阶段2，主题→大纲） |
| `STEP3_STORY_THEME_GENERATION` | `step3_story_theme_generation` | 主题叙事-分镜展开（Story Theme 阶段3，大纲→分镜） |
| `STEP3_RESONANCE_STORY_CONCEPT` | `step3_resonance_story_concept` | 共鸣故事概念生成（Resonance 阶段1，故事概念构思） |
| `STEP3_RESONANCE_STORY_GENERATION` | `step3_resonance_story_generation` | 共鸣故事分镜展开（Resonance 阶段2，概念→分镜） |

### 脚本质量 & Prompt 进化

| 常量 | routeKey | 说明 |
|------|----------|------|
| `SCRIPT_QUALITY_SCORING` | `script_quality_scoring` | 脚本质量评分（异步守护进程） |
| `PROMPT_EVOLUTION_GENERATION` | `prompt_evolution_generation` | Prompt 进化提案生成（进化守护进程） |

### 图片项目 Step3-4

| 常量 | routeKey | 说明 |
|------|----------|------|
| `IMAGE_PROJECT_STEP3_MODEL_PHOTO` | `image_project_step3_model_photo` | 模特图生成 |
| `IMAGE_PROJECT_STEP3_MODEL_PLAN_ADULT` | `image_project_step3_model_plan` | 模特图规划 - 成人（LLM 规划姿势和背景） |
| `IMAGE_PROJECT_STEP3_MODEL_PLAN_CHILD` | `image_project_step3_model_plan_child` | 模特图规划 - 儿童（LLM 规划姿势和背景） |
| `IMAGE_PROJECT_STEP3_MULTI_PERSON_PLAN` | `image_project_step3_multi_person_plan` | 多人模特图规划（LLM 规划多人站位、互动姿势和颜色分配） |
| `IMAGE_PROJECT_STEP3_MULTI_PERSON_PHOTO` | `image_project_step3_multi_person_photo` | 多人模特图生成 |
| `IMAGE_PROJECT_STEP4_LONG_IMAGE` | `image_project_step4_long_image` | 一键长图生成（万相营造商详长图 API） |

### Step4 分镜视频

| 常量 | routeKey | 说明 |
|------|----------|------|
| `STEP4_CLIP_VIDEO_GENERATION` | `step4_clip_video_generation` | 分镜视频生成（通用，已废弃） |
| `STEP4_CLIP_VIDEO_GENERATION_CHILD` | `step4_clip_video_generation_child` | 分镜视频生成 - 儿童（≤16岁） |
| `STEP4_CLIP_VIDEO_GENERATION_ADULT` | `step4_clip_video_generation_adult` | 分镜视频生成 - 成人（>16岁） |
| `STEP4_PROMPT_REFINER` | `step4_prompt_refiner` | 分镜视频提示词优化（重试时分析失败原因并优化提示词） |
| `STEP4_VIDEO_EXPORT` | `step4_video_export` | 视频导出（拼接+导出成片） |

### Step6 裂变

| 常量 | routeKey | 说明 |
|------|----------|------|
| `FISSION_VIDEO_GENERATION_CHILD` | `fission_video_generation_child` | 裂变视频生成 - 儿童（≤16岁） |
| `FISSION_VIDEO_GENERATION_ADULT` | `fission_video_generation_adult` | 裂变视频生成 - 成人（>16岁） |
| `FISSION_STORY_GENERATION` | `fission_story_generation` | 裂变故事生成 |
| `FISSION_STORYBOARD_PROMPT` | `fission_storyboard_prompt` | 裂变分镜提示词工程 |
| `FISSION_STORYBOARD_IMAGE_CHILD` | `fission_storyboard_image_child` | 裂变分镜图片生成 - 儿童（≤16岁） |
| `FISSION_STORYBOARD_IMAGE_ADULT` | `fission_storyboard_image_adult` | 裂变分镜图片生成 - 成人（>16岁） |

### 广场 & 热榜

| 常量 | routeKey | 说明 |
|------|----------|------|
| `SQUARE_VIDEO_REVERSE` | `square_video_reverse` | 广场反推 |
| `HOT_TREND_VIDEO_REVERSE` | `hot_trend_video_reverse` | 热榜反推 |

### 审美特征库
| 枚举键 | RouteKey 值 | 用途 |
|--------|-------------|------|
| `AESTHETIC_FEATURE_EXTRACTION` | `aesthetic_feature_extraction` | 审美特征提取（AI 分析社交媒体图片提取审美特征） |

### 场景库
| 枚举键 | RouteKey 值 | 用途 |
|--------|-------------|------|
| `SCENE_FEATURE_EXTRACTION` | `scene_feature_extraction` | 场景特征提取（AI 分析社交媒体图片提取拍摄场景特征） |

### 情感原型库
| 枚举键 | RouteKey 值 | 用途 |
|--------|-------------|------|
| `EMOTION_ARCHETYPE_EXTRACTION` | `emotion_archetype_extraction` | 情感原型提取（从视频/实时/日报中提取可复用原型） |

### 库管理

| 常量 | routeKey | 说明 |
|------|----------|------|
| `LIBRARY_PORTRAIT_DETECT` | `library_portrait_detect` | 人像检测 |
| `GARMENT_FLAT_LAY_GENERATION` | `garment_flat_lay_generation` | 服饰平铺图生成 |

### 换装

| 常量 | routeKey | 说明 |
|------|----------|------|
| `OUTFIT_CHANGE_IMAGE_GENERATION` | `outfit_change_image_generation` | 换装图片生成（Stage 2） |
| `OUTFIT_CHANGE_VIDEO_GENERATION` | `outfit_change_video_generation` | 换装视频生成（Stage 3） |
| `OUTFIT_CHANGE_VIDEO_EDIT` | `outfit_change_video_edit` | 换装视频编辑（Stage 3 视频编辑模式） |
| `WANXIANG_VIDEO_MIX` | `wanxiang_video_mix` | 万相视频换人（wan2.2-animate-mix，视频角色替换） |
| `ANIMATE_ANYONE_DETECT` | `animate_anyone_detect` | AnimateAnyone 图片检测（Step 1，人物图片合规检测） |
| `ANIMATE_ANYONE_TEMPLATE` | `animate_anyone_template` | AnimateAnyone 模板生成（Step 2，从视频提取动作模板） |
| `ANIMATE_ANYONE_VIDEO_GENERATION` | `animate_anyone_video_generation` | AnimateAnyone 视频生成（Step 3，图片+模板生成动作视频） |

### 音乐

| 常量 | routeKey | 说明 |
|------|----------|------|
| `MUSIC_ATMOSPHERE_ANALYSIS` | `music_atmosphere_analysis` | 音乐氛围分析 |

### 能力实验室

| 常量 | routeKey | 说明 |
|------|----------|------|
| `TEXT_GENERATION` | `text_generation` | 文本生成测试 |
| `IMAGE_GENERATION` | `image_generation` | 图片生成测试 |
| `VIDEO_GENERATION` | `video_generation` | 视频生成测试 |

---

## 二、ProviderCallMode（调用协议模式）

callMode 决定了与 AI 服务商通信时使用的协议格式和接口路径。

### 文本/多模态生成

| callMode | 说明 | 协议路径 |
|----------|------|----------|
| `openai` | OpenAI 兼容协议 | `/chat/completions` |
| `gemini` | Gemini 原生协议 | `/v1/models/...:generateContent` |
| `dashscope` | 百炼 DashScope 文本原生 | `/api/v1/services/aigc/text-generation/generation` |
| `dashscope-stream` | 百炼 DashScope 流式（SSE，支持 thinking + 联网搜索 + 搜索来源同时返回） | 同上（SSE 模式） |

### 视频生成

| callMode | 说明 | 协议路径 |
|----------|------|----------|
| `kling-video-yunwu` | 可灵视频生成-云雾 | `/v1/videos/generations` |
| `kling-video-official` | 可灵视频生成-官方直连（OpenAI 兼容） | `/v1/videos` |
| `kling-video-edit-yunwu` | 可灵视频编辑-云雾（多模态视频编辑，支持换装） | `/kling/v1/videos/video-edit` |
| `veo-video-yunwu-tongyi` | VEO 视频生成-云雾通义（JSON） | `/v1/video/create` |
| `veo-video-yunwu-openai` | VEO 视频生成-云雾 OpenAI 格式（multipart） | `/v1/videos` |
| `doubao-seedance-video-yunwu` | 豆包 Seedance 视频生成-云雾 | `/api/v1/contents/generations/tasks` |
| `wanx-video-bailian` | 万相视频生成-百炼 DashScope | `/api/v1/services/aigc/video-generation/video-synthesis` |
| `wanxiang-video-mix-bailian` | 万相视频换人-百炼 DashScope（wan2.2-animate-mix，视频角色替换） | `/api/v1/services/aigc/image2video/video-synthesis` |
| `happyhorse-video-bailian` | 快乐马视频生成-百炼 DashScope（参考生视频，多图指代） | `/api/v1/services/aigc/video-generation/video-synthesis` |
| `happyhorse-video-edit-bailian` | 快乐马视频编辑-百炼 DashScope（视频+参考图编辑换装） | `/api/v1/services/aigc/video-generation/video-synthesis` |
| `animate-anyone-detect-bailian` | AnimateAnyone 图片检测-百炼 DashScope（同步，人物图片合规检测） | `/api/v1/services/aigc/image2video/aa-detect` |
| `animate-anyone-template-bailian` | AnimateAnyone 模板生成-百炼 DashScope（异步，从视频提取动作模板） | `/api/v1/services/aigc/image2video/aa-template-generation` |
| `animate-anyone-video-bailian` | AnimateAnyone 视频生成-百炼 DashScope（异步，图片+模板生成动作视频） | `/api/v1/services/aigc/image2video/aa-video-generation` |

### 图片生成

| callMode | 说明 | 协议路径 |
|----------|------|----------|
| `openai-image-to-text` | OpenAI 视觉理解（图生文） | OpenAI 兼容 Vision API |
| `gemini-to-image` | Gemini 图片生成（返回 base64） | Gemini generateContent |
| `gemini-to-image-inline` | Gemini 图片生成（inline_data 模式，避免 file_uri 兼容问题） | 同上 |
| `nano-banana-image` | Nano Banana 图片生成（任务制，需轮询） | `/api/{modelPath}` |
| `seedream-image-ark` | 火山方舟 Seedream 图片生成（OpenAI 兼容） | `/api/v3/images/generations` |
| `wanx-image-bailian` | 万相图片生成-百炼 DashScope | `/api/v1/services/aigc/multimodal-generation/generation` |
| `openai-image` | OpenAI 图片生成（gpt-image-2 等） | `/v1/images/generations` |
| `grok-image` | Grok 图片生成-云雾（grok-4.2-image，Chat Completions JSON 格式） | `/v1/chat/completions` |
| `alicloud-market-image` | 阿里云市场万相营造商详长图（AppCode 认证，异步 submit → poll） | 自定义路径 |

---

## 三、RouteKey × CallMode 使用关系

| routeKey | 典型 callMode | 说明 |
|----------|---------------|------|
| `step1_fashion_analysis` | `openai` / `gemini` | 文本分析类，支持联网搜索 |
| `step1_fashion_search` | `gemini` | 需要 grounding 能力 |
| `step2_five_view_generation_child` / `step2_five_view_generation_adult` | `gemini-to-image` / `seedream-image-ark` | 图片生成（按年龄分流） |
| `step3_*` (脚本类) | `openai` / `gemini` / `dashscope-stream` | 文本生成，需高质量长文本 |
| `step3_storyboard_image` | `gemini-to-image` / `wanx-image-bailian` | 图片生成 |
| `step3_product_showcase_script_concept` | `openai` / `gemini` / `dashscope-stream` | 产品展示概念生成（Product Showcase 阶段1） |
| `step3_product_showcase_script_generation` | `openai` / `gemini` / `dashscope-stream` | 产品展示脚本生成（Product Showcase 阶段2） |
| `step4_clip_video_generation` | `kling-video-yunwu` / `kling-video-official` | 视频生成 |
| `fission_video_generation_child` / `fission_video_generation_adult` | `kling-video-yunwu` | 裂变视频生成（按角色年龄区分） |
| `fission_storyboard_image_child` / `fission_storyboard_image_adult` | `gemini-to-image` / `nano-banana-image` | 裂变分镜图片生成（按角色年龄区分） |
| `outfit_change_*` | `gemini` / `gemini-to-image` / `kling-video-yunwu` | 视频理解 + 图片生成 + 视频生成 |
| `outfit_change_video_edit` | `kling-video-edit-yunwu` | 视频编辑模式（切片 + 换装 + 合并） |
| `wanxiang_video_mix` | `wanxiang-video-mix-bailian` | 万相视频换人（wan2.2-animate-mix，视频角色替换） |
| `animate_anyone_detect` | `animate-anyone-detect-bailian` | AnimateAnyone 图片检测（人物图片合规检测，同步） |
| `animate_anyone_template` | `animate-anyone-template-bailian` | AnimateAnyone 模板生成（从视频提取动作模板，异步） |
| `animate_anyone_video_generation` | `animate-anyone-video-bailian` | AnimateAnyone 视频生成（图片+模板生成动作视频，异步） |
| `script_quality_scoring` | `openai` | 文本生成（评分） |
| `prompt_evolution_generation` | `openai` | 文本生成（进化提案） |
| `music_atmosphere_analysis` | `openai` / `gemini` | 文本分析 |
| `image_project_step4_long_image` | `alicloud-market-image` | 万相营造商详长图生成（AppCode 认证，异步） |

> 具体使用哪个 callMode 由后台 Provider 配置决定，同一 routeKey 可配置多个 Provider（不同 callMode）实现故障切换。

---

## 四、Provider Fallback 机制

### Fallback Provider IDs 配置

每个 routeKey 可配置 `fallback_provider_ids` 数组，当 primary provider 不可用时，按数组顺序依次尝试 fallback provider。

**配置示例**（`garment_flat_lay_generation`）：

| Provider ID | 名称 | call_mode | 优先级 | 说明 |
|-------------|------|-----------|--------|------|
| `003e6f47-5623-4e55-a03e-95958540c1d6` | openai-image | `openai-image` | Primary | 主 Provider |
| `a7789c23-4a2d-46cc-9a26-9bf5f10ed82e` | grok-image | `grok-image` | Fallback 1 | 同云雾平台，切换最快 |
| `a5c0386c-70df-414c-9903-05e2eec24113` | gemini-to-image-inline | `gemini-to-image-inline` | Fallback 2 | Gemini 质量高，稳定性好 |
| `ca8b9699-0064-4988-94a4-6d7d13854eb3` | seedream-image-ark | `seedream-image-ark` | Fallback 3 | 火山方舟独立平台，最后备选 |

### Fallback 触发条件

- Primary provider 被禁用（`enabled = false`）
- Primary provider secret 缺失
- Primary provider API 调用失败（HTTP 429/500 等错误）

### Fallback 日志记录

系统会自动记录 fallback 尝试：

```json
{
  "routeKey": "garment_flat_lay_generation",
  "primaryProviderId": "003e6f47-...",
  "fallbackProviderId": "a7789c23-...",
  "reason": "使用 fallback provider"
}
```

### 数据库配置方式

```sql
UPDATE nrm_provider_policies
SET fallback_provider_ids = '["provider_id_1", "provider_id_2", "provider_id_3"]'::jsonb
WHERE route_key = 'your_route_key';
```

> **注意**：`fallback_provider_ids` 数组顺序决定尝试优先级，建议按"同平台 → 跨平台 → 独立平台"排序。

---

## 四、图像生成 CallMode 架构

图像生成 CallMode 采用 **Handler 注册表** 架构，每个 CallMode 的请求构建和响应提取封装在独立文件中。

### 目录结构

```
src/services/media/image-callmodes/
├── types.ts                 # ImageCallModeHandler 接口 + 共享类型
├── shared.ts                # 多 CallMode 共用工具（normalizeImages、parseSecret 等）
├── openai-image.ts          # OPENAI_IMAGE — /v1/images/generations
├── seedream-image.ts        # SEEDREAM_IMAGE_ARK — /api/v3/images/generations
├── gemini-image.ts          # GEMINI_IMAGE + GEMINI_IMAGE_INLINE
├── grok-image.ts            # GROK_IMAGE — /v1/chat/completions
├── grok-image-edit.ts       # GROK_IMAGE_EDIT — /v1/images/edits (multipart)
├── nano-banana-image.ts     # NANO_BANANA_IMAGE — /api/{modelPath}
├── wanx-image.ts            # WANX_IMAGE_BAILIAN — DashScope 多模态生成
└── index.ts                 # 注册表 Map<ProviderCallMode, ImageCallModeHandler>
```

### 接口定义

```typescript
interface ImageCallModeHandler {
  buildRequest(provider, prompt, options?): ImageCallModeRequest | Promise<ImageCallModeRequest>;
  extractImageUrls(response: unknown): string[];
}
```

### 调度流程

1. `requestLlmImageGenerationUrls` → 积分冻结 → `requestLlmImageGenerationUrlsInner`
2. `requestLlmImageGenerationUrlsInner` 按 CallMode 分发：
   - `GROK_IMAGE_EDIT` → `handleGrokImageEdit`（multipart 特殊处理）
   - `NANO_BANANA_IMAGE` → `handleNanoBanana`（异步轮询特殊处理）
   - 其他已注册 CallMode → `handleWithCallMode`（通用 Handler 调度）
   - 未注册 → `requestGenericJimengImageUrlsInternal`（即梦通用协议兼容）
3. `handleWithCallMode` 通过 `getImageCallModeHandler(callMode)` 查注册表获取 Handler

### 新增 CallMode 流程

1. 在 `image-callmodes/` 下创建新文件
2. 实现 `ImageCallModeHandler` 接口（`buildRequest` + `extractImageUrls`）
3. 在 `index.ts` 注册到 registry
4. 主文件 `image-generation-providers.ts` 无需修改（除非需要特殊处理逻辑）
