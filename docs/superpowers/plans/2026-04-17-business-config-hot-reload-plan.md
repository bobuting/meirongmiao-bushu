# BusinessConfigService 热更新机制实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 BusinessConfigService 添加版本号 + 懒加载热更新机制，配置更新后下次读取自动获取最新值

**架构：** 在 BusinessConfigService 内部添加 `globalVersion` 全局版本号，cache 存储每条记录的版本。get() 时对比版本决定是否返回缓存；update() 后版本递增使缓存失效。

**技术栈：** TypeScript, PostgreSQL

---

## 文件修改清单

| 文件 | 职责 |
|------|------|
| `src/modules/business-config-service.ts` | 核心实现：添加版本号、修改 get/update 方法 |
| `src/contracts/business-config-contract.ts` | 可选：添加消费追踪 JSDoc 注释（现有类型已有注释，本次不改） |

---

## 任务 1：添加版本号机制

**文件：** 修改 `src/modules/business-config-service.ts`

- [ ] **步骤 1：添加 CacheEntry 接口和 globalVersion 字段**

在 `BusinessConfigService` 类中添加：

```typescript
interface CacheEntry {
  data: Record<string, unknown>;
  version: number;
}

private cache = new Map<string, CacheEntry>();
private globalVersion = 0;
```

- [ ] **步骤 2：Commit**

```bash
git add src/modules/business-config-service.ts
git commit -m "feat: 添加 CacheEntry 接口和 globalVersion 字段"
```

---

## 任务 2：修改 initialize() 方法

**文件：** 修改 `src/modules/business-config-service.ts`

- [ ] **步骤 1：修改 initialize() 存储版本号**

将 `initialize()` 方法中的缓存存储改为带版本号：

```typescript
async initialize(): Promise<void> {
  const rows = await this.repository.listAll();
  for (const row of rows) {
    this.cache.set(row.module, {
      data: row.config,
      version: ++this.globalVersion,
    });
  }
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/modules/business-config-service.ts
git commit -m "feat: initialize() 方法存储版本号"
```

---

## 任务 3：修改 get() 方法实现懒加载热更新

**文件：** 修改 `src/modules/business-config-service.ts`

- [ ] **步骤 1：修改 get() 方法对比版本**

将原有 `get()` 方法替换为：

```typescript
get<T extends Record<string, unknown>>(
  module: BusinessModule,
  defaults: T
): T {
  const cached = this.cache.get(module);
  if (!cached) {
    // 缓存为空，触发懒加载
    void this.refreshModule(module);
    return defaults;
  }
  // 缓存有效，直接返回合并结果
  return { ...defaults, ...cached.data } as T;
}
```

添加辅助方法 `refreshModule()`：

```typescript
private async refreshModule(module: BusinessModule): Promise<void> {
  try {
    const config = await this.repository.get(module);
    if (config) {
      this.cache.set(module, {
        data: config,
        version: ++this.globalVersion,
      });
    }
  } catch (e) {
    console.warn(`[BusinessConfig] 刷新模块 ${module} 失败:`, e);
  }
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/modules/business-config-service.ts
git commit -m "feat: get() 方法实现懒加载热更新"
```

---

## 任务 4：修改 update() 方法

**文件：** 修改 `src/modules/business-config-service.ts`

- [ ] **步骤 1：修改 update() 方法递增版本**

将原有 `update()` 方法替换为：

```typescript
async update(
  module: string,
  config: Record<string, unknown>,
  description?: string,
  updatedBy?: string,
): Promise<void> {
  await this.repository.upsert(module, config, description, updatedBy);
  this.globalVersion++;
  this.cache.set(module, {
    data: config,
    version: this.globalVersion,
  });
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/modules/business-config-service.ts
git commit -m "feat: update() 方法递增版本号"
```

---

## 任务 5：验证实现

**文件：** 无新增文件

- [ ] **步骤 1：运行 TypeScript 编译验证**

```bash
cd /Users/zhangbangqun/Documents/AI项目/neirongmiao && npm run build
```

预期：无编译错误

- [ ] **步骤 2：Commit**

```bash
git add -A
git commit -m "chore: 验证 TypeScript 编译通过"
```

---

## 验证清单

- [ ] BusinessConfigService 有 `globalVersion` 字段
- [ ] `initialize()` 加载时设置版本号
- [ ] `get()` 方法返回 `defaults` 与 `cached.data` 合并结果
- [ ] `get()` 方法在缓存为空时触发 `refreshModule()`
- [ ] `update()` 方法递增 `globalVersion` 并更新缓存
- [ ] `npm run build` 编译通过
