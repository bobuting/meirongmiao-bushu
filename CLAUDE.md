# 项目规范与开发指南 (CLAUDE.md)

## 核心原则

> 基于 Karpathy 四原则，针对 LLM 编码常见问题设计。

### 1. 先思考，后编码（Think Before Coding）

**不假设，不隐藏困惑，暴露权衡。**

编码前必须：
- **明确假设**：不确定时先问，不要默默选一个解释
- **列出多义**：存在多种理解时，列出所有可能，不要静默选择
- **敢于反对**：如果有更简单的方案，说出来；如果需求有问题，指出来
- **困惑即停**：说不清楚的地方，停下来问，不要猜测继续

### 2. 简洁优先（Simplicity First）

**用最少的代码解决问题，不要预判未来。**

- 不添加未被要求的功能
- 不为单次使用的代码创建抽象
- 不添加未被要求的"灵活性"或"可配置性"
- 不处理不可能发生的错误场景
- 如果 200 行可以写成 50 行，重写它

**判断标准**：资深工程师会说这过度复杂吗？如果是，简化。

### 3. 精准变更（Surgical Changes）

**只改必须改的，只清理自己制造的混乱。**

编辑现有代码时：
- 不要"顺手优化"相邻代码、注释或格式
- 不要重构没出问题的部分
- 匹配现有风格，即使你偏好另一种
- 发现无关的死代码，提到即可，不要删除

你的改动产生的孤儿代码（不再使用的 import/变量/函数）：
- 必须清理
- 但改动前就存在的死代码，除非用户要求，不要动

**验证标准**：每行改动都能追溯到用户的明确请求。

### 4. 目标驱动执行（Goal-Driven Execution）

**定义成功标准，循环直到验证通过。**

将指令式任务转化为可验证的目标：

| 不要只说… | 而是转化为… |
|-----------|------------|
| "加校验" | "写测试覆盖非法输入 → 让测试通过" |
| "修bug" | "写复现测试 → 让它通过" |
| "重构X" | "确保重构前后测试都通过" |

多步骤任务，明确验证点：
```
1. [步骤] → 验证：[检查方式]
2. [步骤] → 验证：[检查方式]
3. [步骤] → 验证：[检查方式]
```

**强成功标准**让你能独立循环完成。**弱标准**（"让它能用"）需要反复澄清。

---

### 最高优先级规则

以下规则**100% 执行，无例外**：

1. **系统提示词最高优先级**
   - 系统提示词（System Prompt）在没有开发者明确允许或主动要求的情况下，任何情况下都不允许修改
   - 所有提示词通过 Skills 系统统一管理和获取，禁止在代码中直接定义或硬编码
   - 这是项目的最高优先级约束

2. **降级处理绝对禁止**
   - 主流程失败时必须直接报错，禁止静默降级或 fallback
   - 目的：暴露真实问题，而不是掩盖问题
   - 示例：
     ```typescript
     // ❌ 禁止
     if (!result) return defaultValue;  // 静默降级
     
     // ✅ 正确
     if (!result) throw new Error('主流程失败');  // 暴露问题
     ```
   - 除非开发者主动要求，否则 100% 执行

### 默认行为：分析优先，不主动修改

**默认保持思考和分析模式，不要直接修改代码或文件。**

- 只有当用户明确要求时（如"帮我修改"、"帮我执行"、"直接执行"、"帮我提交"等），才执行实际修改操作
- 用户的普通提问、分析请求、讨论，只做分析和回答，不要擅自改动任何文件
- **重要**：当用户说"请分析"时，只做分析，不要开始改代码

**权衡说明**：核心原则偏向**谨慎而非速度**。简单任务（改错字、明显的一行修改）可灵活处理，不用完全遵循。

---

## 1. 项目概述

### 业务定位
**AI 电商短视频/图片生成平台**，核心为工作流引擎：

**视频项目流程**（`video`）：
```
Step1(服饰搭配) → Step2(角色定妆) → Step3(脚本+分镜) → Step4(视频生成/成片) → Step5(发布) → Step6(裂变)
```

**图片项目流程**（`image`）：
```
Step1(服饰搭配) → Step2(角色定妆) → Step3(模特图生成) → Step4(电商详情页生成)
```

**换装项目流程**（`outfit_change`）：
```
Step1(上传源视频) → Step2(确认视频) → Step3(选择角色) → Step4(一键换装)
```

**逆向脚本项目**（`reverse`）：
- 单页面流程：上传视频 → AI 自动反推脚本和分镜
- 页面：`apps/web/pages/reverse-script/ReverseScript.tsx`

**项目类型**（`projectFlowKind`）：
- `video`：视频项目（6 步流程）
- `image`：图片项目（4 步流程）
- `reverse`：逆向脚本项目
- `outfit_change`：换装项目

**注意**：
- 分镜生成属于 Step3（脚本+分镜），而非 Step4（`step4-storyboard` 目录命名是为了避免大规模重构）
- 图片项目的电商详情页编辑器在 `ImageEcommerceEditor.tsx`（Step 4）
- 前后端通过 `projectKind` 字段区分项目类型（数据库字段名为 `project_kind`）

### 技术栈
- **后端**：Node.js + Fastify 5 + TypeScript 5 + PostgreSQL + Sharp
- **前端**：React 19 + TypeScript + Vite 6 + Tailwind CSS + Zustand 5 + TanStack Query 5
- **包管理**：npm（严禁使用 yarn）

### 项目结构
```
项目根目录（后端）
├── src/
│   ├── app.ts                 # 后端主入口（禁止写入新代码）
│   ├── server.ts              # 服务启动
│   ├── routes/                # 路由模块
│   │   ├── step1-outfit/      # Step1 服饰搭配
│   │   ├── step2-character/   # Step2 角色定妆
│   │   ├── step3-candidate/   # Step3 脚本生成
│   │   ├── step4-storyboard/  # Step3 分镜生成（目录命名未改）
│   │   └── step4-video/       # Step4 视频生成
│   ├── modules/               # 业务模块
│   ├── services/              # 基础服务（LLM、媒体等）
│   ├── repositories/pg/       # 数据持久层
│   ├── contracts/             # 类型定义与接口契约
│   ├── core/                  # 核心配置、错误处理
│   ├── storage/               # 对象存储（S3/本地/内存）
│   └── app-setup/             # 应用初始化
├── apps/web/                  # 前端项目
│   ├── pages/
│   │   ├── project-flow/      # 视频项目页面
│   │   ├── image-project/     # 图片项目页面
│   │   ├── outfit-change/     # 换装项目页面
│   │   └── reverse-script/    # 逆向脚本项目页面
│   ├── components/            # 通用组件
│   ├── services/              # API 封装
│   └── store/                 # Zustand 状态管理
├── skills/                    # 提示词管理系统
├── docs/                      # 项目文档
│   ├── 云雾llms.txt          # LLM API 文档
│   └── buss/table/           # 数据库表结构说明
└── logs/                      # 日志文件目录
```

---

## 2. 开发规范

### 常用命令
```bash
# 安装依赖
npm install                     # 后端
npm --prefix apps/web install   # 前端（需单独安装）

# 开发服务
npm run dev                     # 启动后端（端口 3020）
npm --prefix apps/web run dev   # 启动前端（端口 3000，代理到后端）

# 编译
npm run build                   # 编译后端
npm run build:ui                # 编译前端
npm run build:all               # 编译前后端

# 测试
npm test                        # 单元测试
npm run test:e2e               # E2E 测试
```

### 启动项目流程
当用户要求启动项目时：
1. **启动后端**：`PERSISTENCE_REQUIRE_READY=false npm run dev`（端口 3020）
2. **启动前端**：`npm --prefix apps/web run dev`（端口 3000）
3. **打开浏览器**：`http://localhost:3000`

### 本地开发登录凭据
- **邮箱**：`admin@example.com`
- **密码**：`admin123`

### 代码风格

- **命名**：变量 camelCase，组件/类 PascalCase，常量 UPPER_SNAKE_CASE
- **类型安全**：TypeScript 严禁使用 `any`，必须定义清晰的 Interface 或 Type
- **函数长度**：单个函数不超过 50 行，过长必须拆分
- **文件长度**：单个文件不超过 1200 行，超过需提示拆分
- **注释规范**：
  - 所有复杂的定义、方法函数、大模块、if 语句都要加中文注释
  - 简单代码不加废话，注释要说明"为什么"而非"是什么"
- **禁止启发式判断**：
  - 代码逻辑中禁止使用模糊条件判断（如基于概率、猜测、阈值的分支）
  - 所有条件分支必须有明确的业务语义或数据边界
  - 不允许使用魔法数值作为决策依据（如 `score > 0.7`、`probability > 50`）
- **日志规范**：
  - 使用统一的 `AppLogger`，禁止直接使用 `console.log`
  - 获取日志器：`import { getLogger } from "@/core/logger"; const log = getLogger("模块名");`
  - 日志级别：`trace < debug < info < warn < error < fatal`
  - 结构化日志：`log.info({ userId, action }, "操作描述")`（敏感信息自动脱敏）
  - 日志保持精简：最好 1-2 行，除非必要；日志不能影响任何主流程

### 架构约束

- **禁止往 `app.ts` 写入新代码**，路由和逻辑应放到 `src/routes/` 中
- **添加新 API 路由后，必须在 `src/app-setup/setup-routes.ts` 中注册**
- **数据持久层放在 `src/repositories/pg/` 目录下**
- **禁止创建数据库迁移文件**，直接操作数据库即可
- **表名和字段都要加备注**，数据库说明文档在 `docs/buss/table/`

### 数据访问层规范（三层严格分层）

```
Route (HTTP) → Module/Service (业务逻辑) → Repository (SQL 唯一归属) → Pool
```

**核心规则：**

1. **Route 层绝对禁止 `pool.query`**，无例外。Route 只做 HTTP 解析、鉴权、调用 Module/Repo、响应格式化
2. **Repository 按"驱动表"归属所有 SQL**（包括多表 JOIN/聚合），每张 `nrm_*` 表对应一个 Repository 文件
3. **Module/Service 仅事务协调可持有 Pool**，其他场景必须通过 Repository 访问数据
4. **新增 `nrm_*` 表必须同步创建对应 Repository**，继承 `PgBaseRepository` 或 `PgSoftDeletableRepository`

**Repository 归属判断：**
- 单表操作 → 该表的 Repository
- 多表 JOIN → 驱动表（主体表）的 Repository
- 无明确驱动表的统计/报表查询 → `src/repositories/pg/report-queries.ts`

**Route handler 标准：** 单个 handler ≤ 15 行，超出则业务逻辑下沉到 Module

### 代码组织

- 代码需要考虑上下文定义，如果能复用请复用，不要新建
- 单个文件超过 1200 行时需要提示是否拆分
- 数据层和逻辑层分开，不要所有逻辑都放到一个文件里
- **减少适配层**：尽可能少使用适配层，根据需求直接修改上游数据供给和下游数据消费，而不是简单定义适配层。适配层会增加维护成本和数据转换的隐式复杂性

### 数据库规范

- **禁止创建数据库迁移文件**，直接操作数据库即可
- 数据库连接用 .env 配置
- 所有数据库创建不要先 DROP，防止出错
- 表不要用 `payload_json` 存储，用传统字段模式，除非明确注明
- 表名和表属性都要加备注
- 数据库操作按表名或相似逻辑放到不同文件中
- 数据库说明文档：`docs/buss/table/project-relation`

---

## 3. 工作流程

> 目标驱动执行和精准变更已在上文"核心原则"中详细说明，本节补充 Git 操作规范。

### Git 操作规范
- **禁止主动提交到远程仓库**，除非用户明确提及
- **禁止简单的覆盖合并**：逐行审查冲突，不确定时询问用户
- **执行破坏性操作前**（reset、rebase），必须先保存未提交的修改（stash 或 patch）

---

## 4. 调试与排错

### 日志查询优先级
1. **logs 目录文件日志**（优先）— 完整上下文，适合详细排查
   - 位置：`logs/app-{info|error}-{YYYY-MM-DD}.{log|json}`
   - 命令：`tail -f logs/app-error-$(date +%Y-%m-%d).log`
2. **LLM 调用审计日志**（次选）— LLM 相关问题排查
   - 表：`nrm_provider_call_audits`（含入参 messages_json）
3. **数据库错误日志表**（最后）— 结构化数据，适合统计分析
   - 表：`nrm_error_logs`

### 排错流程
1. **查询 logs 目录日志** → 获取完整错误上下文和堆栈
2. **分析根本原因** → 定位代码位置，理解错误触发条件
3. **修复代码** → 解决根本问题，不添加降级处理
4. **验证修复** → 确认错误不再出现

---

## 5. Skills 提示词管理

**本项目中所有提示词通过 Skills 系统统一管理，绝对禁止硬编码。**

### Skills 系统概述

Skills 是一个现代化的提示词管理系统，替代传统的数据库存储方式：

| 特性 | Skills 系统 | 旧数据库存储 |
|------|------------|-------------|
| 版本控制 | ✅ Git 原生支持 | ❌ 需要额外工具 |
| 加载速度 | ✅ 50ms（缓存） | ❌ 200ms（查询） |
| 协作编辑 | ✅ 代码审查流程 | ❌ 直接修改 |
| 回滚能力 | ✅ Git revert | ❌ 需要备份 |
| 本地开发 | ✅ 无需数据库 | ❌ 依赖数据库 |

### 目录结构

每个 Skill 是一个独立目录：

```
skills/
├── {skill-code}/           # Skill 目录
│   ├── SKILL.md           # 元数据（必需）
│   ├── system.md          # System Prompt 模板（必需，或 .hbs）
│   ├── user.md            # User Prompt 模板（必需，或 .hbs）
│   ├── schema.ts          # 输入参数 Schema（可选）
│   └── examples.json      # 使用示例（可选）
└── _shared/
    └── rules/             # 共享规则（可复用的提示词片段）
        ├── shot-description.md
        └── continuity.md
```

### 修改流程

**直接修改 skill 文件，无需同步数据库：**
1. **修改 `skills/{skill-code}/` 目录下的模板文件**（system.md/user.md）
2. **展示修改内容给开发者审阅**
3. **开发者同意后，Git 提交变更**
4. **运行 `npm run skills:validate {skill-code}` 验证完整性**

**新增 Skill：**
```bash
npm run skills:create {skill-code}
```
这会创建完整的 Skill 脚手架，包含 SKILL.md、system.md、user.md、schema.ts、examples.json。

### CLI 工具

```bash
# 列出所有 Skills
npm run skills:list

# 查看 Skill 详情
npm run skills:info {skill-code}

# 测试 Skill 渲染输出
npm run skills:test {skill-code} -- -e 0

# 验证 Skill 完整性
npm run skills:validate {skill-code}

# 检查所有 Skills 的依赖完整性
npm run skills:check
```

### 共享规则系统

多个 Skill 可复用相同的提示词片段：

1. **创建共享规则**：在 `skills/_shared/rules/` 下创建 .md 文件
2. **声明依赖**：在 SKILL.md 的 frontmatter 中添加 `includes.rules: [rule-name]`
3. **引用规则**：在模板中使用 `{{{sharedRules.ruleName}}}`

### 在代码中使用

```typescript
import { SkillLoader } from '@/services/skills/skill-loader';

const loader = new SkillLoader();
const skill = await loader.load('script-generation');

const { system, user } = await skill.render({
  outfitDescription: '白色衬衫配黑色西裤',
  sceneDescription: '现代办公室'
});

// 发送给 AI
const response = await ai.chat({
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
});
```

### 模板格式

- **Markdown (.md)**：直接使用，支持 `{{fileName}}` 简单变量替换
- **Handlebars (.hbs)**：支持复杂模板语法（条件渲染、循环、partials）

```handlebars
{{#each items}}
- {{this.name}}: {{this.value}}
{{/each}}

{{#if showAdvanced}}
高级选项：
{{advancedOptions}}
{{/if}}

{{{sharedRules.continuity}}}
```

### 最佳实践

1. **命名规范**：Skill code 使用 kebab-case，如 `script-generation`
2. **版本管理**：使用语义化版本号（Semantic Versioning）
3. **文档完整**：SKILL.md 应包含清晰的说明、参数说明、输出格式
4. **示例数据**：至少提供 2-3 个示例，覆盖常见场景和边界情况
5. **定期检查**：运行 `npm run skills:check` 确保依赖完整

---

## 6. 界面查找与定位

**查找界面代码时，优先使用界面文本搜索，而非功能名称搜索。**

### 搜索策略优先级
1. **界面精确文本**（最优先）
   - 搜索界面上显示的文字，如按钮文本、标题、提示语
   - 示例：`grep -rn "上传服饰图片，自动生成电商平铺图" apps/web`
2. **用户操作路径**（次选）
   - 描述触发路径："点击 X 按钮后弹出的界面"
   - 反向推导：找到按钮 → 找到触发函数 → 找到组件
3. **视觉特征描述**（辅助）
   - 描述 UI 元素：进度条、图标、颜色、徽章等
4. **组件名或文件名**（如果知道）

### 查找失败时的处理
如果首次搜索未找到目标界面：
1. **主动询问**：不要盲目尝试多种关键词
2. **请求更多信息**：
   - "界面上显示的文字是什么？"
   - "这个界面是怎么触发的？"
   - "能描述一下界面的布局或视觉元素吗？"
3. **提供可能的候选**：列出找到的相似界面，让用户确认

---

## 7. 前端开发规范

涉及前端页面设计时，请参考以下技能：
- **技能 `frontend-design`**：组件设计、样式规范、状态管理、表单处理、性能优化
- **技能 `ui-ux-pro-max`**：用户体验设计、交互设计、视觉设计、移动端适配

### 组件设计

- 单一职责：每个组件只做一件事
- 单个组件代码不超过 300 行，超过需拆分
- 可复用逻辑提取为自定义 Hook
- 复杂状态使用 Zustand 管理，服务端状态使用 TanStack Query

### 样式规范

- 优先使用 Tailwind CSS 内置类
- 类名顺序：布局 → 尺寸 → 间距 → 边框 → 背景 → 文字 → 其他
- 响应式断点：`sm:640px` `md:768px` `lg:1024px` `xl:1280px`
- 移动端优先（Mobile First）

### 交互规范

- 所有可点击元素必须有 hover/focus/active 状态
- 加载状态必须显示 loading 指示器
- 操作结果必须有明确的成功/失败反馈
- 表单验证即时反馈，错误信息清晰具体

### 可访问性

- 所有图片必须有 `alt` 属性
- 表单元素必须有 `label` 关联
- 颜色对比度符合 WCAG 2.1 AA 标准
- 支持键盘导航

### 性能优化

- 路由级懒加载
- 图片懒加载、使用 WebP 格式
- 使用 `React.memo`、`useMemo`、`useCallback` 减少重渲染

---

## 8. 禁止事项

- 禁止删除现有的注释，除非它们明显错误
- 禁止引入新的第三方库，除非经过用户明确同意
- 禁止硬编码敏感信息（API Key, Password），必须使用环境变量
- 禁止主动提交到远程仓库，除非用户明确提及
- 禁止简单的覆盖合并，逐行审查冲突
- 禁止修改与本次任务无关的错误文件
- 禁止降级处理，主流程失败直接报错
- 禁止硬编码提示词，所有提示词通过 Skills 系统
- **禁止 Route 层直接调用 `pool.query`**：所有 SQL 必须通过 Repository 访问，Route 只调用 `ctx.repos` 或 `ctx.xxxService`
- **禁止对正式库做任何要求外的事情**：操作正式库时，只做用户明确要求的操作，绝不多做一步（不多查、不多改、不多删）

---

## 9. 错误处理原则

**主流程失败时直接报错，禁止静默降级。**
- 如果主流程跑不通，不要使用默认策略或降级策略，直接抛出错误
- 降级策略会掩盖问题，导致难以排查根本原因
- 只有在明确设计为可选功能时，才允许失败时静默跳过

**追根溯源，禁止用错误处理掩盖问题。**
- 遇到问题时，第一时间分析并解决根本原因，而不是添加健壮的错误处理来"绕过"错误
- 错误处理的目的是让错误可观测，而不是让错误"消失"
- 典型反例：某个字段偶尔为空，正确的做法是查明为什么为空并修复上游；错误的做法是加个 `if (!field) return default` 了事

---

## 10. 调试与排错规范

**当用户提到"改bug"、"错误处理"、"接口错误"、"报错"、"异常"等关键词时，必须先查询日志获取实际错误信息。**

### 日志查询优先级

1. **logs 目录文件日志**（优先）— 完整上下文，适合详细排查
   - 位置：`logs/app-{info|error}-{YYYY-MM-DD}.{log|json}`
   - 命令：`tail -f logs/app-error-$(date +%Y-%m-%d).log`
2. **LLM 调用审计日志**（次选）— LLM 相关问题排查
   - 表：`nrm_provider_call_audits`（含入参 messages_json）
3. **数据库错误日志表**（最后）— 结构化数据，适合统计分析
   - 表：`nrm_error_logs`

### 排错流程

1. **查询 logs 目录日志** → 获取完整错误上下文和堆栈
2. **分析根本原因** → 定位代码位置，理解错误触发条件
3. **修复代码** → 解决根本问题，不添加降级处理
4. **验证修复** → 确认错误不再出现

---

## 11. Memory 使用规范

执行以下操作前，**必须先检查 `memory/` 目录**中是否有相关参考：

| 操作 | 检查文件 |
|------|---------|
| 数据库连接/查询 | `reference_database-connection.md` |
| 其他项目特定配置 | 查看 `MEMORY.md` 索引 |

Memory 索引在 `MEMORY.md`，每次会话自动加载到上下文中。

---

## 12. 回复风格

- 保持简洁，直接给出代码块
- 如果不确定需求，先提问，不要盲目猜测
- 解释复杂逻辑时，使用简短的列表或流程图
- 引用代码位置时使用 markdown 链接格式：`[文件名](路径#行号)`

---

## 13. LLM 对接文档

项目使用 **云雾 API** 作为 LLM 中转服务，详细文档见 `docs/云雾llms.txt`。

### 常用 API 文档
| 类别 | 说明 | 链接 |
|------|------|------|
| ChatGPT 聊天 | 流式/非流式补全 | https://yunwu.apifox.cn/api-232421916.md |
| ChatGPT 识图 | 图片理解 | https://yunwu.apifox.cn/api-232421918.md |
| Claude 接口 | 原生/chat兼容格式 | https://yunwu.apifox.cn/api-264600675.md |
| Gemini 接口 | 原生/chat兼容格式 | https://yunwu.apifox.cn/api-305048984.md |
| DALL·E 3 | 图像生成 | https://yunwu.apifox.cn/api-326547908.md |
| FLUX 系列 | 图像生成/编辑 | https://yunwu.apifox.cn/api-232421932.md |
| 视频生成 | Runway/Luma/海螺等 | https://yunwu.apifox.cn/api-247132317.md |

### 排查 LLM 问题
1. 查看 `docs/云雾llms.txt` 获取完整 API 文档索引
2. 检查分组详细表格：https://yunwu.apifox.cn/doc-5459009.md
3. 查看 HTTP 状态码：https://yunwu.apifox.cn/doc-5459022.md
4. 联系客服：https://yunwu.apifox.cn/doc-5459026.md
