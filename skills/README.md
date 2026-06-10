# Skills 提示词管理系统

Skills 是一个现代化的提示词管理系统，用于替代传统的数据库存储方式。它提供了更好的版本控制、更快的加载速度和更灵活的管理方式。

## 📋 目录

- [核心概念](#核心概念)
- [共享规则系统](#共享规则系统)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [创建 Skill](#创建-skill)
- [使用 Skill](#使用-skill)
- [CLI 工具](#cli-工具)
- [API 接口](#api-接口)
- [最佳实践](#最佳实践)
- [迁移指南](#迁移指南)

## 核心概念

### 什么是 Skill？

Skill 是一个独立的提示词单元，包含：

- **元数据**：名称、描述、版本、作者等
- **System Prompt**：定义 AI 的角色和行为
- **User Prompt**：格式化用户输入
- **Schema**：输入参数的类型定义和验证规则
- **示例**：使用示例和测试数据
- **变体**：同一 Skill 的不同版本（可选）
- **共享规则**：可复用的提示词片段（可选）

### 为什么使用 Skills？

**vs 数据库存储：**

| 特性 | Skills 系统 | 数据库存储 |
|------|------------|-----------|
| 版本控制 | ✅ Git 原生支持 | ❌ 需要额外工具 |
| 加载速度 | ✅ 50ms（缓存） | ❌ 200ms（查询） |
| 内存占用 | ✅ 30MB | ❌ 100MB |
| 协作编辑 | ✅ 代码审查流程 | ❌ 直接修改 |
| 回滚能力 | ✅ Git revert | ❌ 需要备份 |
| 本地开发 | ✅ 无需数据库 | ❌ 依赖数据库 |
| 规则复用 | ✅ 共享规则系统 | ❌ 重复定义 |

## 共享规则系统

### 什么是共享规则？

共享规则是可被多个 Skill 复用的提示词片段，用于解决以下问题：

- **内容重复**：相同的规则在多个 Skill 中重复定义
- **维护困难**：修改一处需要同步多处
- **不一致性**：不同 Skill 对同一规则的定义有差异

### 如何使用共享规则？

#### 1. 创建共享规则

在 `skills/_shared/rules/` 目录下创建 Markdown 文件：

```
skills/_shared/rules/
├── shot-description.md     # shot_description 生成规则
├── shot-breakdown-schema.md # shot_breakdown JSON 结构
└── continuity.md           # 故事连贯性规则
```

示例（`shot-description.md`）：

```markdown
# shot_description 生成规则

shot_description 是分镜的一句话总结，必须遵循以下规则：

1. **长度限制**：50 字以内
2. **内容要求**：包含场景、主体、动作的关键信息
3. **格式规范**：简洁明了，无冗余修饰
```

#### 2. 在 Skill 中引用共享规则

在 `SKILL.md` 的 frontmatter 中声明依赖：

```yaml
---
code: my-skill
name: 我的 Skill
includes:
  rules:
    - shot-description
    - continuity
---
```

#### 3. 在模板中注入共享规则

使用 Handlebars 的 `{{{sharedRules.ruleName}}}` 语法：

```handlebars
你是一个专业的短视频脚本导演。

{{{sharedRules.continuity}}}

{{{sharedRules.shotDescription}}}

请根据以上规则生成脚本。
```

**注意**：使用三个花括号 `{{{...}}}` 而非两个 `{{...}}`，避免内容被 HTML 转义。

### 加载时的验证

Skill 加载时会严格验证 includes 依赖：

1. 检查所有声明的规则文件是否存在
2. 规则文件不存在时**直接报错**（不允许降级运行）
3. 规则内容会被缓存以提升性能

```typescript
// 加载时会自动验证
const skill = await loader.load('my-skill');
// 如果 shot-description.md 不存在，会抛出错误：
// Error: Shared rule 'shot-description' not found at skills/_shared/rules/shot-description.md
```

### 检查依赖完整性

使用 `skills:check` 命令检查所有 Skill 的 includes 依赖：

```bash
npm run skills:check
```

输出示例：

```
检查 8 个 Skills 的 includes dependencies:

  shot_prompt_engineer:
    ✓ continuity
    ✓ shot-description
    ✓ shot-breakdown-schema

  video_step3_script_generation:
    ✓ shot-description
    ✓ shot-breakdown-schema

  custom_scenario_script_generation:
    ✗ shot-description - 文件不存在: skills/_shared/rules/shot-description.md
    ⚠ custom_scenario_script_generation 有 1 个缺失的 dependencies

✗ 发现 1 个问题
```

### 共享规则的优势

| 特性 | 说明 |
|------|------|
| **单一来源** | 规则只定义一次，所有 Skill 使用相同版本 |
| **易于维护** | 修改一处，所有引用自动更新 |
| **类型安全** | TypeScript 类型定义确保引用正确 |
| **严格验证** | 加载时验证，不允许降级运行 |
| **缓存优化** | 规则内容预加载缓存，提升性能 |

### 可用的共享规则

当前系统中定义的共享规则：

| 规则名称 | 文件 | 说明 |
|---------|------|------|
| `shot-description` | `shot-description.md` | shot_description 字段的生成规则 |
| `shot-breakdown-schema` | `shot-breakdown-schema.md` | shot_breakdown 的 JSON 结构定义 |
| `continuity` | `continuity.md` | 故事连贯性和镜头衔接规则 |
| `video-output-schema` | `video-output-schema.md` | 视频脚本完整输出格式（统一标准） |

### 最佳实践

1. **规则粒度**：每个规则文件聚焦一个明确的主题
2. **命名规范**：使用 kebab-case，如 `shot-description`
3. **文档完整**：规则文件应包含清晰的说明和示例
4. **避免过度抽象**：只在真正需要复用时提取共享规则
5. **定期审查**：使用 `npm run skills:check` 确保依赖完整

## 快速开始

### 1. 列出所有 Skills

```bash
npm run skills:list
```

输出：
```
📚 可用的 Skills:
  运行 npm run skills:list 查看完整列表
```

### 2. 查看 Skill 详情

```bash
npm run skills:info script-generation
```

### 3. 测试 Skill

```bash
# 使用内置示例
npm run skills:test script-generation -- -e 0

# 使用自定义输入
npm run skills:test script-generation -- -i '{"outfitDescription":"白色衬衫","sceneDescription":"办公室","style":"professional","duration":30,"targetAudience":"职场人士"}'
```

### 4. 在代码中使用

```typescript
import { SkillLoader } from '@/services/skills/skill-loader';

const loader = new SkillLoader();
const skill = await loader.load('script-generation');

const { system, user } = await skill.render({
  outfitDescription: '白色衬衫配黑色西裤',
  sceneDescription: '现代办公室',
  style: 'professional',
  duration: 30,
  targetAudience: '职场白领'
});

// 发送给 AI
const response = await ai.chat({
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
});
```

## 目录结构

每个 Skill 是一个独立的目录：

```
skills/
├── script-generation/           # Skill 目录
│   ├── SKILL.md                # 元数据（必需）
│   ├── system.hbs              # System Prompt 模板（必需）
│   ├── user.hbs                # User Prompt 模板（必需）
│   ├── schema.ts               # 输入参数 Schema（必需）
│   ├── examples.json           # 使用示例（推荐）
│   └── variants/               # 变体目录（可选）
│       └── casual/
│           ├── system.hbs
│           └── user.hbs
└── step4_video_prompt_rewrite/
    ├── SKILL.md
    ├── system.hbs
    ├── user.hbs
    ├── schema.ts
    └── examples.json
```

## 创建 Skill

### 方法 1：使用 CLI 工具（推荐）

```bash
npm run skills:create my-skill
```

这会创建一个完整的 Skill 脚手架。

### 方法 2：手动创建

#### 步骤 1：创建目录

```bash
mkdir -p skills/my-skill
```

#### 步骤 2：创建 SKILL.md

```markdown
---
code: my-skill
name: 我的 Skill
description: Skill 的简短描述
version: 1.0.0
category: general
author: Your Name
created: 2024-01-01T00:00:00Z
tags:
  - tag1
  - tag2
---

# 我的 Skill

详细的 Skill 说明文档。

## 使用场景

描述这个 Skill 适用的场景。

## 输入参数

- `param1`: 参数 1 的说明
- `param2`: 参数 2 的说明

## 输出格式

描述期望的输出格式。
```

#### 步骤 3：创建 system.hbs

```handlebars
你是一个专业的 AI 助手。

你的任务是：
1. 理解用户的需求
2. 提供准确的回答
3. 保持专业和友好的语气

{{#if style}}
风格要求：{{style}}
{{/if}}
```

#### 步骤 4：创建 user.hbs

```handlebars
用户需求：{{userInput}}

{{#if context}}
上下文信息：
{{context}}
{{/if}}

请根据以上信息提供回答。
```

#### 步骤 5：创建 schema.ts

```typescript
import { z } from 'zod';

/**
 * 我的 Skill - 输入参数 Schema
 */
export const inputSchema = z.object({
  userInput: z.string().min(1, '用户输入不能为空'),
  context: z.string().optional(),
  style: z.enum(['formal', 'casual', 'technical']).optional()
});

export type Input = z.infer<typeof inputSchema>;
```

#### 步骤 6：创建 examples.json

```json
[
  {
    "name": "基本示例",
    "description": "最简单的使用方式",
    "input": {
      "userInput": "这是一个示例输入"
    },
    "expectedOutput": "这是预期的输出格式"
  },
  {
    "name": "完整示例",
    "description": "包含所有参数的示例",
    "input": {
      "userInput": "这是一个示例输入",
      "context": "这是上下文信息",
      "style": "formal"
    },
    "expectedOutput": "这是预期的输出格式"
  }
]
```

#### 步骤 7：验证 Skill

```bash
npm run skills:validate my-skill
```

## 使用 Skill

### 在 TypeScript 中使用

```typescript
import { SkillLoader } from '@/services/skills/skill-loader';

// 创建加载器实例
const loader = new SkillLoader();

// 加载 Skill
const skill = await loader.load('my-skill');

// 渲染提示词
const { system, user } = await skill.render({
  userInput: '用户的输入',
  style: 'formal'
});

// 使用提示词调用 AI
const response = await callAI(system, user);
```

### 使用变体

```typescript
// 加载特定变体
const skill = await loader.load('my-skill', 'casual');

// 或者在渲染时指定
const { system, user } = await skill.render(
  { userInput: '用户的输入' },
  'casual'
);
```

### 错误处理

```typescript
try {
  const skill = await loader.load('my-skill');
  const { system, user } = await skill.render(input);
} catch (error) {
  if (error.message.includes('not found')) {
    console.error('Skill 不存在');
  } else if (error.message.includes('validation')) {
    console.error('输入参数验证失败');
  } else {
    console.error('未知错误:', error);
  }
}
```

## CLI 工具

### skills:list

列出所有可用的 Skills。

```bash
npm run skills:list
```

### skills:info

显示 Skill 的详细信息。

```bash
npm run skills:info <skill-code>
```

### skills:test

测试 Skill 的渲染输出。

```bash
# 使用内置示例
npm run skills:test <skill-code> -- -e <example-index>

# 使用自定义输入（JSON 字符串）
npm run skills:test <skill-code> -- -i '{"key":"value"}'

# 使用输入文件
npm run skills:test <skill-code> -- -f input.json

# 指定变体
npm run skills:test <skill-code> -- -v <variant-name>
```

### skills:validate

验证 Skill 的完整性。

```bash
npm run skills:validate <skill-code>
```

检查项：
- ✅ SKILL.md 存在且格式正确
- ✅ system.hbs 存在
- ✅ user.hbs 存在
- ✅ schema.ts 存在且可导入
- ✅ examples.json 格式正确
- ✅ 所有变体完整

### skills:check

检查所有 Skills 的 includes dependencies 是否有效。

```bash
npm run skills:check
```

检查项：
- ✅ 每个 Skill 的 includes.rules 依赖声明
- ✅ 共享规则文件存在性验证
- ✅ 报告缺失的依赖

此命令用于确保共享规则系统的完整性，建议在 CI/CD 流程中使用。

### skills:create

创建新的 Skill 脚手架。

```bash
npm run skills:create <skill-code>
```

## API 接口

### GET /skills-test

列出所有 Skills。

```bash
curl http://localhost:3001/skills-test
```

响应：
```json
{
  "skills": [
    {
      "code": "script-generation",
      "name": "脚本生成",
      "description": "...",
      "version": "1.0.0",
      "tags": ["script", "generation"]
    }
  ]
}
```

### GET /skills-test/:code

获取 Skill 详情。

```bash
curl http://localhost:3001/skills-test/script-generation
```

### POST /skills-test/:code/render

渲染提示词。

```bash
curl -X POST http://localhost:3001/skills-test/script-generation/render \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "outfitDescription": "白色衬衫",
      "sceneDescription": "办公室",
      "style": "professional",
      "duration": 30,
      "targetAudience": "职场人士"
    }
  }'
```

响应：
```json
{
  "system": "你是一个专业的短视频脚本创作者...",
  "user": "服装描述：白色衬衫\n场景描述：办公室..."
}
```

### GET /skills-test/:code/examples

获取示例数据。

```bash
curl http://localhost:3001/skills-test/script-generation/examples
```

### POST /skills-test/:code/validate

验证输入参数。

```bash
curl -X POST http://localhost:3001/skills-test/script-generation/validate \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "outfitDescription": "白色衬衫"
    }
  }'
```

### GET /skills-test/stats

获取系统统计信息。

```bash
curl http://localhost:3001/skills-test/stats
```

响应：
```json
{
  "totalSkills": 2,
  "cache": {
    "size": 5,
    "maxSize": 100,
    "hits": 42,
    "misses": 8,
    "hitRate": 0.84
  }
}
```

## 最佳实践

### 1. 命名规范

- **Skill Code**：使用 kebab-case，如 `script-generation`
- **变体名称**：使用 kebab-case，如 `casual-style`
- **参数名称**：使用 camelCase，如 `outfitDescription`

### 2. 提示词设计

- **System Prompt**：
  - 明确定义 AI 的角色
  - 说明任务目标
  - 提供必要的约束条件
  - 使用条件渲染处理可选参数

- **User Prompt**：
  - 清晰地格式化输入数据
  - 使用结构化的格式（如列表、表格）
  - 避免冗余信息
  - 保持简洁明了

### 3. Schema 设计

```typescript
// ✅ 好的 Schema
export const inputSchema = z.object({
  // 必需字段，带验证规则
  title: z.string().min(1).max(100),
  
  // 枚举类型，限制可选值
  style: z.enum(['formal', 'casual', 'technical']),
  
  // 数字类型，带范围限制
  duration: z.number().min(10).max(300),
  
  // 可选字段
  context: z.string().optional(),
  
  // 数组类型
  tags: z.array(z.string()).min(1).max(5),
  
  // 嵌套对象
  metadata: z.object({
    author: z.string(),
    createdAt: z.string().datetime()
  }).optional()
});

// ❌ 不好的 Schema
export const inputSchema = z.object({
  data: z.any(), // 避免使用 any
  input: z.string() // 缺少验证规则
});
```

### 4. 示例数据

- 至少提供 2-3 个示例
- 覆盖常见使用场景
- 包含边界情况
- 提供清晰的描述

### 5. 版本管理

- 使用语义化版本号（Semantic Versioning）
- 主版本号：不兼容的 API 变更
- 次版本号：向后兼容的功能新增
- 修订号：向后兼容的问题修正

### 6. 文档编写

- SKILL.md 应包含：
  - 清晰的使用说明
  - 参数说明
  - 输出格式说明
  - 使用示例
  - 注意事项

### 7. 性能优化

```typescript
// ✅ 使用缓存
const loader = new SkillLoader(); // 复用实例
const skill = await loader.load('my-skill'); // 自动缓存

// ❌ 重复创建实例
for (const item of items) {
  const loader = new SkillLoader(); // 每次都创建新实例
  const skill = await loader.load('my-skill');
}
```

### 8. 错误处理

```typescript
// ✅ 完整的错误处理
try {
  const skill = await loader.load('my-skill');
  const result = await skill.render(input);
  return result;
} catch (error) {
  if (error instanceof z.ZodError) {
    // 处理验证错误
    console.error('输入验证失败:', error.errors);
  } else if (error.message.includes('not found')) {
    // 处理 Skill 不存在
    console.error('Skill 不存在');
  } else {
    // 处理其他错误
    console.error('未知错误:', error);
  }
  throw error;
}
```

## 迁移指南

### 从数据库提示词迁移到 Skills

#### 步骤 1：导出现有提示词

```bash
npm run migrate:export
```

#### 步骤 2：运行迁移工具

```bash
npm run migrate:to-skills
```

这会：
1. 读取数据库中的提示词
2. 为每个提示词创建 Skill 目录
3. 生成所有必需文件
4. 生成迁移报告

#### 步骤 3：验证迁移结果

```bash
npm run migrate:compare
```

对比旧系统和新系统的输出，确保一致性。

#### 步骤 4：更新代码

```typescript
// 旧代码
const prompt = await getPromptContent('script-generation', {
  userInput: '...'
});

// 新代码
const loader = new SkillLoader();
const skill = await loader.load('script-generation');
const { system, user } = await skill.render({
  outfitDescription: '...',
  sceneDescription: '...'
});
```

#### 步骤 5：测试

```bash
# 测试所有 Skills
npm run skills:test-all

# 运行单元测试
npm test
```

#### 步骤 6：部署

参考 [SKILLS_DEPLOYMENT.md](../docs/SKILLS_DEPLOYMENT.md) 了解详细的部署方案。

## 常见问题

### Q: Skills 和数据库提示词可以共存吗？

A: 可以。在迁移期间，两个系统可以同时运行。建议逐步迁移，确保每个 Skill 都经过充分测试。

### Q: 如何处理动态生成的提示词？

A: 使用 Handlebars 模板的条件渲染和循环功能：

```handlebars
{{#each items}}
- {{this.name}}: {{this.value}}
{{/each}}

{{#if showAdvanced}}
高级选项：
{{advancedOptions}}
{{/if}}
```

### Q: 如何共享通用的提示词片段？

A: 使用 Handlebars partials：

```handlebars
{{> common/header}}

你的内容...

{{> common/footer}}
```

### Q: 缓存会导致内存泄漏吗？

A: 不会。缓存使用 LRU 策略，最多保存 100 个条目，自动淘汰最少使用的项。

### Q: 如何在生产环境中使用？

A: Skills 系统已经过充分测试，可以直接在生产环境使用。建议：
1. 使用 Git 管理 Skills 目录
2. 通过 CI/CD 自动验证
3. 监控缓存命中率
4. 定期审查和更新 Skills

## 技术支持

- 📖 完整文档：[docs/](../docs/)
- 🐛 问题反馈：创建 GitHub Issue
- 💬 讨论交流：团队内部 Slack 频道

## 更新日志

### v1.0.0 (2024-01-01)

- ✨ 初始版本发布
- ✅ 核心加载器
- ✅ CLI 工具
- ✅ API 接口
- ✅ 缓存系统
- ✅ 迁移工具
- ✅ 完整文档
