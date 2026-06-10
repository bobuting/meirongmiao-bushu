# Step6 裂变新故事生成结构化脚本 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将裂变阶段1 的输出从纯文本 `{ newStory, storyboardDescriptions[] }` 改为完整的 `VideoScriptPayload` 结构化脚本，使阶段1.5 专业提示词生成能获得丰富的分镜结构数据。

**架构：** 修改提示词模板 `fission_story_generation` 为 system/user 分隔格式，要求 LLM 输出 `VideoScriptPayload` JSON；同步修改 4 个调用文件的解析和使用逻辑，不兼容旧数据。

**技术栈：** TypeScript 5.9, Fastify 5, PostgreSQL, 云雾 API (LLM)

---

## 文件清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/modules/fission-video/fission-video-config.ts` | 修改 | `NewStoryJson` 类型定义 |
| `src/modules/fission-video/fission-story-generator.ts` | 修改 | 故事生成：提示词构建、LLM 调用、JSON 解析 |
| `src/modules/fission-video/fission-newstory-orchestrator.ts` | 修改 | 编排服务：阶段1.5/2/4 使用新结构 |
| `src/routes/fission-video-routes.ts` | 修改 | 并行任务：`executeNewStoryTask` 使用新结构 |
| `docs/superpowers/specs/` | 已有 | 规格文档 |

---

### 任务 1：更新 `NewStoryJson` 类型定义

**文件：**
- 修改：`src/modules/fission-video/fission-video-config.ts:74-89`

- [ ] **步骤 1：修改 NewStoryJson 接口**

将 `fission-video-config.ts` 第 74-89 行的 `NewStoryJson` 接口改为：

```typescript
/**
 * 新故事JSON数据结构
 * 包含新故事裂变生成的完整 VideoScriptPayload 脚本
 */
export interface NewStoryJson {
  /** 完整的 VideoScriptPayload 结构化脚本 */
  payloadJson: import("../../service/scripts-data-db-service.js").VideoScriptPayload;
  /** 创建时间 */
  createdAt: number;
}
```

删除旧字段（`newStory`、`storyboardDescriptions`、`storyboardImageUrls`、`storyboardImagePaths`、`storyboardVideoUrls`、`storyboardVideoPaths`）。

- [ ] **步骤 2：运行 tsc 检查类型错误**

```bash
npx tsc --noEmit 2>&1 | grep -i "fission-video-config\|NewStoryJson" | head -20
```

预期：会报下游文件使用旧字段的类型错误，这是预期的，后续任务会修复。

- [ ] **步骤 3：Commit**

```bash
git add src/modules/fission-video/fission-video-config.ts
git commit -m "refactor: NewStoryJson 改为 payloadJson 结构化类型"
```

---

### 任务 2：更新故事生成器

**文件：**
- 修改：`src/modules/fission-video/fission-story-generator.ts`

- [ ] **步骤 1：修改 StoryGenerationResult 返回类型**

将第 48-53 行的 `StoryGenerationResult` 改为：

```typescript
/**
 * 故事生成结果
 */
export interface StoryGenerationResult {
  /** 完整的 VideoScriptPayload 结构化脚本 */
  payload: import("../../service/scripts-data-db-service.js").VideoScriptPayload;
}
```

- [ ] **步骤 2：删除旧的辅助函数**

删除第 56-64 行的 `generateStoryboardPromptPart` 函数（不再需要动态生成 JSON 片段）。

- [ ] **步骤 3：重写 buildStoryPrompt 函数**

将第 70-89 行的 `buildStoryPrompt` 函数改为：

```typescript
/**
 * 构建故事生成提示词（从提示词管理系统获取）
 * 模板不存在会直接抛错
 */
async function buildStoryPrompt(
  userPromptContent: string,
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const { systemPrompt, userPrompt } = await buildPrompt(FISSION_STORY_GENERATION_CODE, {
    variables: {
      userPrompt: userPromptContent,
    },
  });

  return { systemPrompt, userPrompt };
}
```

- [ ] **步骤 4：修改 buildStoryPrompt 调用处**

将第 211-218 行调用处改为：

```typescript
const characterInfoText = formatCharacterInfo(characterInfo);
const totalCount = storyboardCount + 2;
const userPromptContent = `【原始故事】
${oldStory || "无原故事"}

【角色信息】
${characterInfoText}

【角色参考图片】
${characterImageUrls.length > 0 ? characterImageUrls.join('\n') : '未提供'}

【分镜数量】
共 ${totalCount} 个分镜（原故事 ${storyboardCount} 个 + 开头扩写 1 个 + 结尾扩写 1 个）`;

const { systemPrompt, userPrompt } = await buildStoryPrompt(userPromptContent);
```

- [ ] **步骤 5：重写 parseStoryResponse 函数**

将第 129-172 行的 `parseStoryResponse` 函数改为：

```typescript
/**
 * 解析 LLM 响应为 VideoScriptPayload
 */
function parseStoryResponse(responseText: string): import("../../service/scripts-data-db-service.js").VideoScriptPayload {
  let jsonText = responseText.trim();

  // 移除可能的 markdown 代码块标记
  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.slice(7);
  } else if (jsonText.startsWith("```")) {
    jsonText = jsonText.slice(3);
  }
  if (jsonText.endsWith("```")) {
    jsonText = jsonText.slice(0, -3);
  }

  jsonText = jsonText.trim();

  try {
    const parsed = JSON.parse(jsonText) as import("../../service/scripts-data-db-service.js").VideoScriptPayload;

    // 基本验证
    if (!parsed.shot_breakdown || !Array.isArray(parsed.shot_breakdown)) {
      throw new Error("缺少 shot_breakdown 字段");
    }
    if (!parsed.video_analysis) {
      throw new Error("缺少 video_analysis 字段");
    }

    return parsed;
  } catch (e) {
    console.error("[StoryGenerator] Failed to parse LLM response as VideoScriptPayload:", jsonText.slice(0, 500));
    throw new Error(`解析 LLM 返回的结构化脚本失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}
```

- [ ] **步骤 6：修改 generateNewStory 函数**

将第 230-253 行的 mock 数据返回改为：

```typescript
  if (!llmProvider) {
    const totalCount = storyboardCount + 2;
    console.warn(`[StoryGenerator] ⚠️ No LLM Provider configured, returning mock data with ${totalCount} storyboards`);
    const shots = [];
    for (let i = 1; i <= totalCount; i++) {
      let desc = `发展${i}：故事情节推进`;
      if (i === 1) desc = "扩写开头：主角出场前的铺垫";
      else if (i === totalCount) desc = "扩写结尾：故事圆满收尾后的延伸";
      else if (i === 2) desc = "开场：主角出场，展示环境背景";
      else if (i === totalCount - 1) desc = "结局：问题解决，圆满收尾";
      shots.push({
        shot_id: i,
        shot_type: "中景",
        camera_movement: "固定",
        shot_description: desc,
        visual: { scene: { description: desc }, composition: {}, lighting: {} },
        subjects: [],
        audio: {},
      });
    }
    return {
      payload: {
        video_info: { title: "模拟脚本", duration_seconds: totalCount * 4 },
        video_analysis: { title: "模拟脚本", summary: "模拟数据", video_type: "裂变新故事" },
        shot_breakdown: shots,
        editing_analysis: { total_shots: totalCount, editing_rhythm: "舒缓", pacing: "慢" },
      },
    };
  }
```

将第 292-298 行的解析和返回改为：

```typescript
    const payload = parseStoryResponse(responseText);

    console.log(`[StoryGenerator] 解析结果:`);
    console.log(`[StoryGenerator] - shot_breakdown 数量: ${payload.shot_breakdown?.length || 0}`);
    console.log(`[StoryGenerator] - video_analysis.title: ${payload.video_analysis?.title || "无"}`);
    console.log(`[StoryGenerator] ========== 新故事生成完成 ==========`);

    return { payload };
```

- [ ] **步骤 7：在文件顶部添加 import**

在第 11 行之后添加：

```typescript
import type { VideoScriptPayload } from "../../service/scripts-data-db-service.js";
```

然后删除上面步骤中的 `import("../../service/scripts-data-db-service.js")` 内联引用，改为使用顶层导入的 `VideoScriptPayload` 类型。

- [ ] **步骤 8：运行 tsc 检查**

```bash
npx tsc --noEmit 2>&1 | grep "fission-story-generator" | head -10
```

预期：无错误。

- [ ] **步骤 9：Commit**

```bash
git add src/modules/fission-video/fission-story-generator.ts
git commit -m "feat: 故事生成器改为输出 VideoScriptPayload 结构化脚本"
```

---

### 任务 3：更新编排服务

**文件：**
- 修改：`src/modules/fission-video/fission-newstory-orchestrator.ts`

- [ ] **步骤 1：修改阶段1 日志输出**

将第 180-182 行改为：

```typescript
      console.log(`[FissionNewStoryOrchestrator] 新故事生成结果:`);
      console.log(`[FissionNewStoryOrchestrator] - shot_breakdown 数量: ${storyResult.payload.shot_breakdown?.length || 0}`);
      console.log(`[FissionNewStoryOrchestrator] - title: ${storyResult.payload.video_analysis?.title || "无"}`);
```

- [ ] **步骤 2：修改阶段1.5 segments 构建**

将第 204-208 行改为：

```typescript
          segments: storyResult.payload.shot_breakdown?.map((shot, idx) => ({
            title: `分镜 ${shot.shot_id || idx + 1}`,
            content: shot.shot_description ?? "",
            visualCue: shot.visual?.description ?? shot.shot_description ?? "",
          })) || [],
```

- [ ] **步骤 3：修改阶段2 扩写描述获取**

将第 235-240 行改为（从 shot_breakdown 中取第一个和最后一个分镜的描述）：

```typescript
      const shots = storyResult.payload.shot_breakdown || [];
      const expandedDescriptions = [
        firstShotPrompt || shots[0]?.shot_description || "",  // 开头扩写
        lastShotPrompt || shots[shots.length - 1]?.shot_description || "",  // 结尾扩写
      ];
```

- [ ] **步骤 4：修改阶段4 NewStoryJson 构建**

将第 359-368 行改为：

```typescript
      // 阶段4: 构建并保存新故事JSON到 fission_video_status 表
      const newStoryJson: NewStoryJson = {
        payloadJson: storyResult.payload,
        createdAt: Date.now(),
      };
```

- [ ] **步骤 5：修改 saveNewStoryToScriptsData 调用**

将第 393-398 行改为：

```typescript
      if (isSuccess) {
        await this.saveNewStoryToScriptsData(
          projectId,
          storyResult.payload,
        );
      }
```

- [ ] **步骤 6：修改 saveNewStoryToScriptsData 方法签名和实现**

将第 430-476 行改为：

```typescript
  private async saveNewStoryToScriptsData(
    projectId: string,
    payload: VideoScriptPayload,
  ): Promise<void> {
    try {
      const title = payload.video_analysis?.title || "新故事脚本";
      const content = payload.video_analysis?.summary || "";
      const payloadHash = createHash("md5").update(title + "\n" + content).digest("hex");

      const item: InsertScriptDataItem = {
        id: randomUUID(),
        type: ScriptType.NEW_STORY,
        payloadJson: payload,
        payloadHash,
        projectId,
      };

      const pool = this.pool;
      if (!pool) {
        console.warn(`[FissionNewStoryOrchestrator] No database pool available, skipping save to nrm_script_data`);
        return;
      }

      const service = getScriptsDataDbService(pool);
      const insertedCount = await service.batchInsertIfNotExists([item]);

      console.log(`[FissionNewStoryOrchestrator] Saved new story script to nrm_script_data: ${insertedCount} record`);
    } catch (error) {
      console.error(`[FissionNewStoryOrchestrator] Failed to save new story script:`, error);
    }
  }
```

- [ ] **步骤 7：运行 tsc 检查**

```bash
npx tsc --noEmit 2>&1 | grep "fission-newstory-orchestrator" | head -10
```

- [ ] **步骤 8：Commit**

```bash
git add src/modules/fission-video/fission-newstory-orchestrator.ts
git commit -m "refactor: 编排服务使用 VideoScriptPayload 结构化数据"
```

---

### 任务 4：更新并行裂变任务

**文件：**
- 修改：`src/routes/fission-video-routes.ts`

- [ ] **步骤 1：修改阶段1 检查条件**

将第 2660 行改为：

```typescript
  if (!newStoryJson?.payloadJson?.shot_breakdown?.length) {
```

- [ ] **步骤 2：修改阶段1 成功判断和 NewStoryJson 保存**

将第 2730-2743 行改为：

```typescript
      if (!storyResult.payload.shot_breakdown?.length) {
        throw new Error("新故事生成失败");
      }

      // 保存新故事 JSON
      newStoryJson = {
        payloadJson: storyResult.payload,
        createdAt: Date.now(),
      };
```

- [ ] **步骤 3：修改阶段1.5 segments 构建**

将第 2779-2807 行改为：

```typescript
    if (!newStoryJson?.payloadJson?.shot_breakdown?.length) {
      const errorMsg = "新故事分镜描述不存在，无法生成专业提示词";
      console.error("[Fission] " + errorMsg);
      for (const item of pendingItems) {
        await taskItemsService.updateVideoStatus(item.id, fissionVideoStatusId, "new_story", {
          status: "failed",
          errorMessage: errorMsg,
        });
      }
      return;
    }

    try {
      const shotPromptsService = getShotPromptsService(ctx);
      const shotPromptsRequest = {
        projectId,
        characterReferenceImages: characterRefs.map(r => r.imageUrl),
        characterDescription: characterDescription || undefined,
        aspectRatio: "9:16" as const,
        projectTitle: "裂变新故事",
        outfitDescription: outfitDescription || undefined,
        clothingStyles: clothingStyles.length > 0 ? clothingStyles : undefined,
        outfitReferenceImages: outfitReferenceImages.length > 0 ? outfitReferenceImages : undefined,
        segments: newStoryJson.payloadJson.shot_breakdown.map((shot, idx) => ({
          title: `分镜 ${shot.shot_id || idx + 1}`,
          content: shot.shot_description ?? "",
          visualCue: shot.visual?.description ?? shot.shot_description ?? "",
        })),
      };
```

- [ ] **步骤 4：修改阶段2 分镜描述获取**

将第 2846-2861 行改为：

```typescript
  // 获取分镜数据
  const shots = newStoryJson?.payloadJson?.shot_breakdown || [];

  // 处理待处理的分镜项
  for (const item of pendingItems) {
    try {
      console.log(`[Fission] 处理新故事分镜 ${item.itemIndex}`);

      // 更新状态为处理中
      await taskItemsService.updateVideoStatus(item.id, fissionVideoStatusId, "new_story", { status: "processing" });

      // 获取该分镜的 shot_breakdown 数据
      const shot = shots[item.itemIndex - 1];
      if (!shot?.shot_description) {
        throw new Error(`分镜 ${item.itemIndex} 描述不存在`);
      }
```

- [ ] **步骤 5：运行 tsc 检查**

```bash
npx tsc --noEmit 2>&1 | grep "fission-video-routes" | head -10
```

预期：无关于 NewStoryJson 旧字段的错误。

- [ ] **步骤 6：Commit**

```bash
git add src/routes/fission-video-routes.ts
git commit -m "refactor: 并行裂变任务使用 VideoScriptPayload 结构化数据"
```

---

### 任务 5：更新数据库提示词模板

**操作：** 通过数据库直接更新 `fission_story_generation` 提示词模板

- [ ] **步骤 1：执行 SQL 更新模板**

```bash
node -e "
const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const newContent = \`---SYSTEM---
你是一位专业的短视频剧本导演。请根据用户提供的原始故事、角色信息和角色参考图片，创作一个新的故事脚本。

## 创作规则

1. **扩写要求**：在原故事的前后各扩写一个分镜（开头和结尾各1个），保持原故事的核心主题和情感基调
2. **角色适配**：根据新角色的特点调整故事细节
3. **图片参考**：如果有角色参考图片，根据图片中角色的外观特征来设计故事场景
4. **情绪推进**：故事必须有明确的起承转合，情绪有推进和变化，相邻分镜情绪不能相同
5. **分镜完整性**：每个分镜必须包含镜头类型、运镜方式、画面描述、主体动作、光影氛围
6. **输出格式**：只输出 JSON，不要包含 markdown 代码块标记

## 输出格式

你必须输出一个完整的 VideoScriptPayload JSON 对象：

\`\`\`json
{
  \"video_info\": {
    \"title\": \"脚本标题（10字以内）\",
    \"duration_seconds\": 总时长数字
  },
  \"video_analysis\": {
    \"title\": \"与 video_info.title 相同\",
    \"summary\": \"故事概要（100字以内）\",
    \"video_type\": \"裂变新故事\",
    \"emotion\": {
      \"primary\": \"主导情绪\",
      \"emotion_arc\": \"情绪弧线描述\"
    }
  },
  \"shot_breakdown\": [
    {
      \"shot_id\": 1,
      \"timecode\": { \"start\": \"00:00:00\", \"end\": \"00:00:04\", \"duration_seconds\": 4 },
      \"shot_type\": \"特写/中景/全景/近景\",
      \"camera_movement\": \"固定/推进/拉远/摇镜/跟随\",
      \"transition_in\": { \"type\": \"淡入/硬切\", \"duration_seconds\": 0.5 },
      \"transition_out\": { \"type\": \"淡出/硬切\", \"duration_seconds\": 0.5 },
      \"camera_details\": {
        \"angle\": \"平视/俯视/仰视\",
        \"composition\": \"三分法/居中/对称\"
      },
      \"visual\": {
        \"scene\": { \"description\": \"场景环境精确描写（地点、时间、光线、氛围，100字左右）\" },
        \"composition\": { \"description\": \"画面构图精确描写\" },
        \"lighting\": { \"description\": \"光线精确描写（光源方向、色温、质感）\" }
      },
      \"subjects\": [
        {
          \"person_id\": 1,
          \"type\": \"人物\",
          \"description\": \"主体外观描写（包含角色外貌特征，确保后续生成时角色一致）\",
          \"position\": \"画面中的位置\",
          \"body_angle\": \"正面/侧面/背面/四分之三侧\",
          \"action\": \"主体动作\",
          \"movement\": \"运动方向和速度\",
          \"expression\": \"面部表情\"
        }
      ],
      \"audio\": {
        \"music\": { \"mood\": \"背景音乐情绪\" },
        \"sound_effects\": [{ \"description\": \"环境音/音效描述\" }]
      },
      \"shot_description\": \"该分镜的一句话总结（50字以内）\"
    }
  ],
  \"editing_analysis\": {
    \"total_shots\": 分镜总数,
    \"editing_rhythm\": \"剪辑节奏描述\",
    \"pacing\": \"整体节奏\"
  },
  \"main_scene\": \"主要场景概括\",
  \"atmosphere\": \"整体氛围描述\"
}
\`\`\`

## 注意事项
- shot_description 50字以内，visual.scene.description 100字左右
- subjects[0].description 必须包含角色外观描写
- 相邻镜头情绪必须有变化
- 所有字段都必须存在，不要省略
- 数字字段使用数字类型，不要加引号

---USER---
{{userPrompt}}\`;

pool.query('UPDATE nrm_prompt_templates SET content = \$1, updated_at = NOW() WHERE code = \\'fission_story_generation\\'', [newContent])
  .then(r => { console.log('Updated rows:', r.rowCount); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
"
```

- [ ] **步骤 2：验证模板已更新**

```bash
node -e "
const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT code, status, LEFT(content, 100) as preview FROM nrm_prompt_templates WHERE code = \\'fission_story_generation\\'')
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
"
```

预期：content 开头包含 `---SYSTEM---`。

---

### 任务 6：全量验证

- [ ] **步骤 1：TypeScript 全量类型检查**

```bash
npx tsc --noEmit 2>&1 | head -30
```

预期：无关于本次改动的类型错误。

- [ ] **步骤 2：确认所有旧字段引用已清除**

```bash
grep -rn "storyResult\.newStory\|storyResult\.storyboardDescriptions\|newStoryJson\.newStory\|newStoryJson\.storyboardDescriptions" src/ --include="*.ts" | grep -v ".test." | grep -v "node_modules"
```

预期：无输出。

- [ ] **步骤 3：Commit 全部更改**

```bash
git add src/modules/fission-video/fission-video-config.ts src/modules/fission-video/fission-story-generator.ts src/modules/fission-video/fission-newstory-orchestrator.ts src/routes/fission-video-routes.ts
git commit -m "feat: 裂变新故事全流程使用 VideoScriptPayload 结构化脚本

- 阶段1 LLM 输出完整 VideoScriptPayload 而非纯文本
- 阶段1.5 使用 shot_breakdown 构建 segments 传给 shot_prompt_engineer
- 阶段2/3 从 shot_breakdown 获取分镜描述
- 不兼容旧数据格式"
```

---

## 规格自检

### 1. 规格覆盖度

| 规格需求 | 对应任务 |
|---------|---------|
| 提示词模板改为 system/user 分隔 | 任务 5 |
| NewStoryJson 改为 payloadJson | 任务 1 |
| 故事生成器输出 VideoScriptPayload | 任务 2 |
| 编排服务使用新结构 | 任务 3 |
| 并行任务使用新结构 | 任务 4 |
| 不兼容旧数据 | 所有任务 |

### 2. 占位符扫描
无 TODO/待定/后续实现。所有步骤包含完整代码。

### 3. 类型一致性
- `VideoScriptPayload` 从 `src/service/scripts-data-db-service.js` 导入
- `fission-newstory-orchestrator.ts` 已有此导入
- `fission-story-generator.ts` 需新增导入（任务2步骤7）
- `fission-video-config.ts` 使用动态 import 避免循环依赖
- 所有 `shot_breakdown` 访问使用可选链 `?.` 保证安全

### 4. 范围检查
6 个任务，约 150 行改动，一个实现计划可覆盖。
