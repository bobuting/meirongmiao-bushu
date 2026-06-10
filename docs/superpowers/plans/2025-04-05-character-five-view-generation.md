# 角色五视图自动生成实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现角色五视图图板的自动生成功能，用户点击"重新生成"按钮后同步生成五视图并上传 OSS。

**架构：** 在现有角色库基础上，新增五视图生成接口，复用即梦 API 图生图能力，通过提示词管理系统配置生成模板。

**技术栈：** Node.js + Fastify + PostgreSQL + 即梦 API + OSS

---

## 文件结构

### 新增文件

| 文件 | 职责 |
|---|---|
| `src/modules/character-five-view-generation-service.ts` | 五视图生成服务（提示词构建 + 即梦调用 + OSS 上传） |

### 修改文件

| 文件 | 职责 |
|---|---|
| `scripts/create_all_tables.ts` | 新增 nrm_library_characters 表的 17 个分析字段 |
| `src/contracts/types.ts` | LibraryCharacter 接口新增分析字段 |
| `src/repositories/pg/character-pg-repository.ts` | 仓库层新增字段映射 |
| `src/routes/character-five-view-routes.ts` | 新增 generate 接口 |
| `apps/web/pages/characters/characterCreateModalPanel.tsx` | 创建角色时保存分析结果 |
| `apps/web/services/backendApi.ts` | 前端 API 新增生成方法 |
| `apps/web/pages/characters/CharacterManagement.tsx` | 调用生成接口 |

---

## 任务 1：数据库表结构变更

**文件：**
- 修改：`scripts/create_all_tables.ts`

- [ ] **步骤 1：在 nrm_library_characters 表定义中新增 17 个分析字段**

找到 `nrm_library_characters` 表的 CREATE TABLE 语句，在 `payload_hash TEXT,` 后添加字段：

```typescript
await pool.query(`
  CREATE TABLE IF NOT EXISTS ${t("library_characters")} (
    id TEXT PRIMARY KEY,
    payload_json JSONB NOT NULL,
    payload_hash TEXT,
    -- 角色分析字段
    overall_impression TEXT,
    ethnicity TEXT,
    age TEXT,
    gender TEXT,
    style TEXT,
    body_type TEXT,
    face_shape TEXT,
    facial_features TEXT,
    eyebrows TEXT,
    eyes TEXT,
    eye_expression TEXT,
    nose TEXT,
    lips TEXT,
    chin TEXT,
    skin_tone TEXT,
    hair_style TEXT,
    unique_features TEXT,
    updated_at BIGINT NOT NULL
  )
`);
```

- [ ] **步骤 2：运行建表脚本验证**

运行：`npx tsx scripts/create_all_tables.ts`
预期：表创建成功，无报错

- [ ] **步骤 3：Commit**

```bash
git add scripts/create_all_tables.ts
git commit -m "feat(db): 新增 nrm_library_characters 表角色分析字段"
```

---

## 任务 2：类型定义更新

**文件：**
- 修改：`src/contracts/types.ts`

- [ ] **步骤 1：在 LibraryCharacter 接口新增分析字段**

找到 `LibraryCharacter` 接口定义，添加字段：

```typescript
export interface LibraryCharacter {
  id: string;
  userId: string;
  name: string;
  kind: CharacterKind;
  status: "processing" | "ready";
  thumbnailUrl: string;
  tags: string[];
  views: string[];
  viewSession?: CharacterViewSession | null;
  videoPreview: string | null;
  createdAt: number;
  updatedAt: number;
  // 角色分析字段
  overallImpression?: string | null;
  ethnicity?: string | null;
  age?: string | null;
  gender?: string | null;
  style?: string | null;
  bodyType?: string | null;
  faceShape?: string | null;
  facialFeatures?: string | null;
  eyebrows?: string | null;
  eyes?: string | null;
  eyeExpression?: string | null;
  nose?: string | null;
  lips?: string | null;
  chin?: string | null;
  skinTone?: string | null;
  hairStyle?: string | null;
  uniqueFeatures?: string | null;
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/contracts/types.ts
git commit -m "feat(types): LibraryCharacter 新增角色分析字段"
```

---

## 任务 3：仓库层更新

**文件：**
- 修改：`src/repositories/pg/character-pg-repository.ts`

- [ ] **步骤 1：更新 mapRow 方法添加新字段映射**

在 `mapRow` 方法中添加：

```typescript
protected mapRow(row: Record<string, unknown>): LibraryCharacter {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    kind: row.kind as LibraryCharacter["kind"],
    status: row.status as LibraryCharacter["status"],
    thumbnailUrl: row.thumbnail_url as string,
    tags: row.tags as string[],
    views: row.views as string[],
    viewSession: row.view_session as CharacterViewSession | null,
    videoPreview: row.video_preview as string | null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    // 角色分析字段
    overallImpression: row.overall_impression as string | null,
    ethnicity: row.ethnicity as string | null,
    age: row.age as string | null,
    gender: row.gender as string | null,
    style: row.style as string | null,
    bodyType: row.body_type as string | null,
    faceShape: row.face_shape as string | null,
    facialFeatures: row.facial_features as string | null,
    eyebrows: row.eyebrows as string | null,
    eyes: row.eyes as string | null,
    eyeExpression: row.eye_expression as string | null,
    nose: row.nose as string | null,
    lips: row.lips as string | null,
    chin: row.chin as string | null,
    skinTone: row.skin_tone as string | null,
    hairStyle: row.hair_style as string | null,
    uniqueFeatures: row.unique_features as string | null,
  };
}
```

- [ ] **步骤 2：更新 mapEntity 方法添加新字段映射**

在 `mapEntity` 方法中添加：

```typescript
protected mapEntity(c: LibraryCharacter): Record<string, unknown> {
  return {
    id: c.id,
    user_id: c.userId,
    name: c.name,
    kind: c.kind,
    status: c.status,
    thumbnail_url: c.thumbnailUrl,
    tags: c.tags,
    views: c.views,
    view_session: c.viewSession ?? null,
    video_preview: c.videoPreview ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    // 角色分析字段
    overall_impression: c.overallImpression ?? null,
    ethnicity: c.ethnicity ?? null,
    age: c.age ?? null,
    gender: c.gender ?? null,
    style: c.style ?? null,
    body_type: c.bodyType ?? null,
    face_shape: c.faceShape ?? null,
    facial_features: c.facialFeatures ?? null,
    eyebrows: c.eyebrows ?? null,
    eyes: c.eyes ?? null,
    eye_expression: c.eyeExpression ?? null,
    nose: c.nose ?? null,
    lips: c.lips ?? null,
    chin: c.chin ?? null,
    skin_tone: c.skinTone ?? null,
    hair_style: c.hairStyle ?? null,
    unique_features: c.uniqueFeatures ?? null,
  };
}
```

- [ ] **步骤 3：Commit**

```bash
git add src/repositories/pg/character-pg-repository.ts
git commit -m "feat(repo): character 仓库支持角色分析字段"
```

---

## 任务 4：创建五视图生成服务

**文件：**
- 创建：`src/modules/character-five-view-generation-service.ts`

- [ ] **步骤 1：创建服务文件**

```typescript
/**
 * 角色五视图生成服务
 * 负责调用即梦 API 生成五视图图板并上传到 OSS
 */

import { randomUUID } from "node:crypto";
import type { AppContext } from "../core/app-context.js";
import type { LibraryCharacter, CharacterFiveView } from "../contracts/types.js";
import { AppError } from "../core/errors.js";
import { getPromptContent } from "./prompt/prompt-helper.js";

const PROMPT_CODE = "character_five_view_generation";

/**
 * 生成五视图提示词变量
 */
interface FiveViewPromptVariables {
  overallImpression?: string | null;
  ethnicity?: string | null;
  age?: string | null;
  gender?: string | null;
  style?: string | null;
  bodyType?: string | null;
  faceShape?: string | null;
  facialFeatures?: string | null;
  eyes?: string | null;
  hairStyle?: string | null;
  skinTone?: string | null;
  uniqueFeatures?: string | null;
}

/**
 * 生成五视图图板
 * @param ctx 应用上下文
 * @param character 角色信息
 * @returns 生成的五视图记录
 */
export async function generateCharacterFiveView(
  ctx: AppContext,
  character: LibraryCharacter,
): Promise<CharacterFiveView> {
  const characterId = character.id;
  const now = ctx.clock.now();
  const viewId = randomUUID();

  // 1. 创建五视图记录（status=processing）
  const view: CharacterFiveView = {
    id: viewId,
    characterId,
    imageUrl: null,
    status: "processing",
    isActive: false,
    prompt: null,
    model: null,
    generationParams: null,
    errorMessage: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await ctx.repos.characterFiveViews.create(view);

  try {
    // 2. 构建提示词变量
    const promptVariables: FiveViewPromptVariables = {
      overallImpression: character.overallImpression,
      ethnicity: character.ethnicity,
      age: character.age,
      gender: character.gender,
      style: character.style,
      bodyType: character.bodyType,
      faceShape: character.faceShape,
      facialFeatures: character.facialFeatures,
      eyes: character.eyes,
      hairStyle: character.hairStyle,
      skinTone: character.skinTone,
      uniqueFeatures: character.uniqueFeatures,
    };

    // 3. 从提示词管理获取模板
    const promptContent = await getPromptContent(PROMPT_CODE);
    const systemPrompt = promptContent.systemPrompt;
    let userPrompt = promptContent.userPrompt;

    // 4. 替换变量
    userPrompt = replacePromptVariables(userPrompt, promptVariables);

    // 5. 调用即梦 API 图生图
    const imageUrl = await callJimengImageGeneration(ctx, {
      referenceImageUrl: character.thumbnailUrl,
      systemPrompt,
      userPrompt,
    });

    // 6. 上传到 OSS
    const ossUrl = await uploadToOss(ctx, imageUrl, `five-views/${characterId}/${viewId}.png`);

    // 7. 更新记录
    view.imageUrl = ossUrl;
    view.status = "ready";
    view.prompt = userPrompt;
    view.updatedAt = ctx.clock.now();

    await ctx.repos.characterFiveViews.update(view);

    // 8. 设置为激活
    await ctx.repos.characterFiveViews.setActive(characterId, viewId);

    return view;
  } catch (error) {
    // 生成失败，更新状态
    view.status = "failed";
    view.errorMessage = error instanceof Error ? error.message : String(error);
    view.updatedAt = ctx.clock.now();
    await ctx.repos.characterFiveViews.update(view);
    throw error;
  }
}

/**
 * 替换提示词变量
 */
function replacePromptVariables(template: string, variables: FiveViewPromptVariables): string {
  let result = template;
  const varMap: Record<string, string | null | undefined> = {
    overall_impression: variables.overallImpression,
    ethnicity: variables.ethnicity,
    age: variables.age,
    gender: variables.gender,
    style: variables.style,
    body_type: variables.bodyType,
    face_shape: variables.faceShape,
    facial_features: variables.facialFeatures,
    eyes: variables.eyes,
    hair_style: variables.hairStyle,
    skin_tone: variables.skinTone,
    unique_features: variables.uniqueFeatures,
  };

  for (const [key, value] of Object.entries(varMap)) {
    const placeholder = `{${key}}`;
    const replacement = value || "";
    result = result.replace(new RegExp(placeholder, "g"), replacement);
  }

  return result;
}

/**
 * 调用即梦 API 生成图片
 */
async function callJimengImageGeneration(
  ctx: AppContext,
  params: {
    referenceImageUrl: string;
    systemPrompt: string;
    userPrompt: string;
  },
): Promise<string> {
  // 解析图片生成路由
  const imageRoute = await ctx.providerResolver.resolveRoute("image_generation");
  if (!imageRoute) {
    throw new AppError(503, "PROVIDER_NOT_FOUND", "图片生成服务未配置");
  }

  // 调用即梦图生图接口
  const response = await fetch(imageRoute.provider.baseUrl + "/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${imageRoute.provider.apiKey}`,
    },
    body: JSON.stringify({
      model: "jimeng-2.1",
      prompt: params.userPrompt,
      negative_prompt: "low quality, blurry, distorted",
      image_url: params.referenceImageUrl,
      aspect_ratio: "16:9",
      num_images: 1,
      style_type: "general",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new AppError(502, "IMAGE_GENERATION_FAILED", `即梦 API 调用失败: ${errorText}`);
  }

  const data = await response.json();
  const generatedUrl = data.data?.[0]?.url;

  if (!generatedUrl) {
    throw new AppError(502, "IMAGE_GENERATION_FAILED", "即梦 API 未返回图片 URL");
  }

  return generatedUrl;
}

/**
 * 上传图片到 OSS
 */
async function uploadToOss(
  ctx: AppContext,
  sourceUrl: string,
  ossPath: string,
): Promise<string> {
  // 下载图片
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new AppError(502, "DOWNLOAD_FAILED", "下载生成图片失败");
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // 上传到 OSS
  const ossUrl = await ctx.storage.put(ossPath, buffer, "image/png");

  return ossUrl;
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/modules/character-five-view-generation-service.ts
git commit -m "feat: 新增角色五视图生成服务"
```

---

## 任务 5：新增生成 API 路由

**文件：**
- 修改：`src/routes/character-five-view-routes.ts`

- [ ] **步骤 1：导入生成服务**

在文件顶部添加导入：

```typescript
import { generateCharacterFiveView } from "../modules/character-five-view-generation-service.js";
```

- [ ] **步骤 2：新增 generate 路由处理函数**

在 `createCharacterFiveViewHandlers` 函数中添加：

```typescript
/** 生成五视图图板 */
const generateFiveView = async (request: FastifyRequest<{ Params: CharacterIdParams }>) => {
  const user = await requireUser(ctx, request);
  const { characterId } = request.params;
  const character = await requireOwnerLibraryCharacter(ctx, user, characterId);

  if (!character.thumbnailUrl) {
    throw new AppError(400, "BAD_REQUEST", "角色缺少缩略图，无法生成五视图");
  }

  const view = await generateCharacterFiveView(ctx, character);
  return view;
};
```

- [ ] **步骤 3：导出新增的 handler**

修改 return 语句：

```typescript
return { listFiveViews, createFiveView, activateFiveView, deleteFiveView, generateFiveView };
```

- [ ] **步骤 4：注册路由**

在 `registerCharacterFiveViewRoutes` 函数中添加：

```typescript
app.post("/library/characters/:characterId/five-views/generate", handlers.generateFiveView);
```

- [ ] **步骤 5：Commit**

```bash
git add src/routes/character-five-view-routes.ts
git commit -m "feat(api): 新增五视图生成接口 POST /five-views/generate"
```

---

## 任务 6：前端 API 更新

**文件：**
- 修改：`apps/web/services/backendApi.ts`

- [ ] **步骤 1：新增 generateCharacterFiveView 方法**

在 `backendApi` 对象中添加：

```typescript
async generateCharacterFiveView(
  token: string,
  characterId: string,
): Promise<CharacterFiveViewDto> {
  const response = await fetch(`${API_BASE_URL}/library/characters/${characterId}/five-views/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new ApiError(response.status, "GENERATE_FAILED", "生成五视图失败");
  }
  return response.json();
}
```

- [ ] **步骤 2：导出类型**

确保 `CharacterFiveViewDto` 已在 `backendApi.types.ts` 中定义。

- [ ] **步骤 3：Commit**

```bash
git add apps/web/services/backendApi.ts apps/web/services/backendApi.types.ts
git commit -m "feat(web-api): 新增 generateCharacterFiveView 方法"
```

---

## 任务 7：前端角色创建保存分析结果

**文件：**
- 修改：`apps/web/pages/characters/characterCreateModalPanel.tsx`

- [ ] **步骤 1：修改创建角色的 API 调用**

在 `handleSaveBasic` 函数中，修改 `createLibraryCharacter` 调用：

```typescript
const created = await backendApi.createLibraryCharacter(token, {
  name,
  kind: "basic",
  thumbnailUrl,
  tags: selectedTags,
  // 新增：保存分析结果
  overallImpression: portraitCheckResult?.analysis?.overallImpression || null,
  ethnicity: portraitCheckResult?.analysis?.ethnicity || null,
  age: portraitCheckResult?.analysis?.age || null,
  gender: portraitCheckResult?.analysis?.gender || null,
  style: portraitCheckResult?.analysis?.style || null,
  bodyType: portraitCheckResult?.analysis?.bodyType || null,
  faceShape: portraitCheckResult?.analysis?.faceShape || null,
  facialFeatures: portraitCheckResult?.analysis?.facialFeatures || null,
  eyebrows: portraitCheckResult?.analysis?.eyebrows || null,
  eyes: portraitCheckResult?.analysis?.eyes || null,
  eyeExpression: portraitCheckResult?.analysis?.eyeExpression || null,
  nose: portraitCheckResult?.analysis?.nose || null,
  lips: portraitCheckResult?.analysis?.lips || null,
  chin: portraitCheckResult?.analysis?.chin || null,
  skinTone: portraitCheckResult?.analysis?.skinTone || null,
  hairStyle: portraitCheckResult?.analysis?.hairStyle || null,
  uniqueFeatures: portraitCheckResult?.analysis?.uniqueFeatures || null,
});
```

- [ ] **步骤 2：更新 backendApi.createLibraryCharacter 类型**

在 `backendApi.ts` 中更新 `createLibraryCharacter` 方法的参数类型，新增分析字段。

- [ ] **步骤 3：更新后端接口处理**

在 `src/routes/library-routes.ts` 的 `POST /library/characters` 接口中，接收并保存分析字段。

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/characters/characterCreateModalPanel.tsx apps/web/services/backendApi.ts src/routes/library-routes.ts
git commit -m "feat: 创建角色时保存人像分析结果"
```

---

## 任务 8：前端调用生成接口

**文件：**
- 修改：`apps/web/pages/characters/CharacterManagement.tsx`

- [ ] **步骤 1：修改重新生成按钮的点击处理**

找到"重新生成"按钮，修改 `onClick` 处理：

```typescript
const [isGenerating, setIsGenerating] = useState(false);

// 在组件内添加生成处理函数
const handleGenerateFiveView = async () => {
  if (!token || !character?.id) return;
  setIsGenerating(true);
  try {
    const result = await backendApi.generateCharacterFiveView(token, character.id);
    // 刷新五视图列表
    queryClient.invalidateQueries({ queryKey: ['character-five-views', token, character.id] });
  } catch (error) {
    console.error("生成五视图失败:", error);
    alert(error instanceof Error ? error.message : "生成失败");
  } finally {
    setIsGenerating(false);
  }
};

// 按钮修改
<Button
  size="sm"
  variant="secondary"
  onClick={handleGenerateFiveView}
  disabled={isGenerating || createFiveViewMutation.isPending}
>
  {isGenerating || createFiveViewMutation.isPending ? (
    <span className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin"></span>
  ) : (
    <span className="material-icons-round text-sm">refresh</span>
  )}
  重新生成
</Button>
```

- [ ] **步骤 2：Commit**

```bash
git add apps/web/pages/characters/CharacterManagement.tsx
git commit -m "feat(web): 角色详情页调用五视图生成接口"
```

---

## 任务 9：提示词配置

**操作：** 在提示词管理系统中添加提示词模板

- [ ] **步骤 1：通过数据库或管理界面添加提示词**

插入提示词记录到 `nrm_prompt_templates` 表：

```sql
INSERT INTO nrm_prompt_templates (id, code, name, type, description, content, variables, status, created_at, updated_at)
VALUES (
  'uuid-here',
  'character_five_view_generation',
  '角色五视图生成',
  'image_generation',
  '生成角色五视图图板提示词',
  'Generate a character reference sheet with 5 views: front, left, right, back, and close-up.

Character description:
- Overall impression: {overall_impression}
- Gender: {gender}
- Age: {age}
- Style: {style}
- Ethnicity: {ethnicity}
- Body type: {body_type}
- Face shape: {face_shape}
- Facial features: {facial_features}
- Eyes: {eyes}
- Hair style: {hair_style}
- Skin tone: {skin_tone}

Requirements:
- Full body character in consistent style
- Front view in center, side views on left and right, back view and close-up below
- White or neutral background
- Professional character design sheet layout
- Maintain character consistency across all views',
  '{"overall_impression": "string", "gender": "string", "age": "string", "style": "string", "ethnicity": "string", "body_type": "string", "face_shape": "string", "facial_features": "string", "eyes": "string", "hair_style": "string", "skin_tone": "string", "unique_features": "string"}',
  'published',
  EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
  EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);
```

- [ ] **步骤 2：验证提示词可获取**

运行测试或手动调用 `getPromptContent('character_five_view_generation')` 确认可获取。

---

## 任务 10：集成测试

- [ ] **步骤 1：启动项目**

```bash
PERSISTENCE_REQUIRE_READY=false npm run dev
```

- [ ] **步骤 2：测试创建角色并保存分析结果**

1. 打开角色管理页面
2. 点击"新建角色"
3. 上传人像图片
4. 等待人像检测完成
5. 保存角色
6. 检查数据库 `nrm_library_characters` 表的分析字段是否已填充

- [ ] **步骤 3：测试五视图生成**

1. 打开角色详情弹窗
2. 点击"重新生成"按钮
3. 等待生成完成（约 30-60 秒）
4. 检查：
   - `nrm_character_five_views` 表新增记录
   - `status` 为 `ready`
   - `image_url` 有 OSS 地址
   - `is_active` 为 `true`
   - 角色图区域显示生成的图片

- [ ] **步骤 4：测试错误情况**

1. 无缩略图角色点击生成 → 应返回 400 错误
2. 未配置图片生成 Provider → 应返回 503 错误

---

## 执行顺序

```
任务 1 → 任务 2 → 任务 3 → 任务 4 → 任务 5 → 任务 6 → 任务 7 → 任务 8 → 任务 9 → 任务 10
```

每个任务完成后进行 commit，任务 10 为最终集成测试。