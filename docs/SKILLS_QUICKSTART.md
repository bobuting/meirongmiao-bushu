# Skills 系统快速开始

## 🎯 5 分钟上手

### 1. 查看可用的 Skills

```bash
npm run skills:list
```

输出：
```
找到 2 个 Skills:

  script-generation - 脚本生成
    根据服装搭配和场景信息生成电商短视频脚本
    标签: script, video, ecommerce

  storyboard-generation - 分镜生成
    根据脚本内容生成视频分镜方案
    标签: storyboard, video, production
```

### 2. 查看 Skill 详情

```bash
npm run skills:info script-generation
```

### 3. 测试 Skill（使用内置示例）

```bash
npm run skills:test script-generation -- -e 0
```

这会使用第一个示例（职场穿搭推荐）渲染提示词。

### 4. 测试 Skill（自定义输入）

```bash
npm run skills:test script-generation -- -i '{
  "outfitDescription": "牛仔外套搭配白T恤",
  "sceneDescription": "咖啡馆",
  "style": "casual",
  "duration": 45,
  "targetAudience": "年轻人"
}'
```

### 5. 在代码中使用

```typescript
import { SkillLoader } from './src/services/skills/skill-loader.js';

const loader = new SkillLoader();
const skill = await loader.load('script-generation');

// 渲染提示词
const { system, user } = await skill.render({
  outfitDescription: '白色衬衫搭配黑色西裤',
  sceneDescription: '办公室',
  style: 'professional',
  duration: 30,
  targetAudience: '职场白领'
});

// 发送给 LLM
const response = await llm.chat({
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
});
```

## 🔧 创建新 Skill

### 方法 1: 使用 CLI 工具（推荐）

```bash
npm run skills:create product-description -- \
  -n "商品描述生成" \
  -d "根据商品信息生成吸引人的描述"
```

这会创建完整的 Skill 模板：
```
skills/product-description/
├── SKILL.md          # 元数据
├── schema.ts         # 输入验证
├── system.hbs        # System Prompt 模板
├── user.hbs          # User Prompt 模板
└── examples.json     # 示例
```

### 方法 2: 手动创建

1. 创建目录：`skills/my-skill/`
2. 创建 `SKILL.md`：
```markdown
---
code: my-skill
name: 我的技能
description: 技能描述
version: 1.0.0
author: Your Name
tags: tag1, tag2
---

# 我的技能

## 功能说明
...
```

3. 创建 `schema.ts`：
```typescript
import { z } from 'zod';

export const inputSchema = z.object({
  field1: z.string(),
  field2: z.number().optional()
});
```

4. 创建 `system.hbs` 和 `user.hbs`
5. 创建 `examples.json`

### 验证新 Skill

```bash
npm run skills:validate my-skill
```

## 📡 API 使用

### 启动服务

```bash
npm run dev
```

### API 端点

#### 1. 列出所有 Skills
```bash
curl http://localhost:3020/neirongmiao/api/skills-test
```

#### 2. 获取 Skill 详情
```bash
curl http://localhost:3020/neirongmiao/api/skills-test/script-generation
```

#### 3. 渲染提示词
```bash
curl -X POST http://localhost:3020/neirongmiao/api/skills-test/script-generation/render \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "outfitDescription": "白色衬衫",
      "sceneDescription": "办公室",
      "style": "professional",
      "duration": 30,
      "targetAudience": "职场白领"
    }
  }'
```

#### 4. 获取示例
```bash
curl http://localhost:3020/neirongmiao/api/skills-test/script-generation/examples
```

#### 5. 验证输入
```bash
curl -X POST http://localhost:3020/neirongmiao/api/skills-test/script-generation/validate \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "outfitDescription": "白色衬衫"
    }
  }'
```

## 🎨 高级功能

### 变体系统

创建多个提示词风格：

```
skills/my-skill/
├── SKILL.md
├── schema.ts
├── variants/
│   ├── formal/
│   │   ├── system.hbs
│   │   └── user.hbs
│   ├── casual/
│   │   ├── system.hbs
│   │   └── user.hbs
│   └── creative/
│       ├── system.hbs
│       └── user.hbs
└── examples.json
```

使用变体：
```bash
npm run skills:test my-skill -- -e 0 -v casual
```

### 共享模块

在模板中使用共享工具函数：

```handlebars
{{! system.hbs }}
你的任务是处理以下文本：

{{truncate description 100}}

字数统计：{{countWords description}}
```

可用的共享模块：
- `text-utils`: truncate, normalizeWhitespace, escapeMarkdown, countWords
- `array-utils`: unique, chunk, shuffle
- `format-utils`: formatJson, formatList, formatTable

## 📊 性能优化

### 缓存统计

```bash
curl http://localhost:3020/neirongmiao/api/skills-test-stats
```

### 清空缓存

```typescript
const loader = new SkillLoader();
loader.clearCache();
```

### 预热缓存

```typescript
await loader.cache.warmup(loader, [
  'script-generation',
  'storyboard-generation'
]);
```

## 🐛 故障排查

### Skill 加载失败

1. 检查 SKILL.md frontmatter 格式
2. 验证 schema.ts 语法
3. 确认模板文件存在

```bash
npm run skills:validate my-skill
```

### 渲染失败

1. 检查输入是否符合 Schema
2. 验证模板语法
3. 查看错误日志

```bash
npm run skills:test my-skill -- -i '{"field":"value"}' 2>&1 | less
```

### 性能问题

1. 检查缓存命中率
2. 减少模板复杂度
3. 使用变体而非重复 Skills

## 📚 更多资源

- [完整文档](./SKILLS_STATUS.md)
- [部署指南](./SKILLS_DEPLOYMENT.md)（待创建）
- [最佳实践](./SKILLS_BEST_PRACTICES.md)（待创建）

## 🎉 开始使用

现在你已经掌握了 Skills 系统的基础！试试创建你的第一个 Skill：

```bash
npm run skills:create my-first-skill -- \
  -n "我的第一个技能" \
  -d "这是我创建的第一个 Skill"
```

然后编辑生成的文件，运行验证和测试。祝你使用愉快！🚀
