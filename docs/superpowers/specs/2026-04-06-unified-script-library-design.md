# 统一脚本库设计规格

> 统一脚本库，使用 `nrm_script_data` 作为唯一脚本存储表

## 背景

当前脚本库架构涉及 5 个表，维护成本高：

| 表名 | 用途 |
|------|------|
| `nrm_script_data` | 核心脚本数据表 |
| `nrm_project_script_assoc` | 项目-脚本版本关联 |
| `nrm_user_script_assoc` | 用户收藏/关联脚本 |
| `nrm_library_scripts` | 用户个人脚本库 |
| `nrm_library_script_versions` | 用户个人脚本库版本历史 |

## 设计决策

| 决策项 | 选择 |
|--------|------|
| 版本管理 | 移除（脚本不支持修改） |
| 用户收藏层 | 移除（脚本归属用户，无需额外收藏层） |
| 项目多版本 | 保留（一个项目对应多个脚本） |
| 项目选中脚本 | 项目表 `active_script_id` 字段标识 |

## 一、数据库表结构

### 1.1 `nrm_script_data` 扩展字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `user_id` | VARCHAR(64) | 脚本归属用户，NOT NULL |
| `project_id` | VARCHAR(64) | 脚本归属项目，可为 NULL（热榜脚本可能无项目） |
| `source_script_id` | VARCHAR(64) | 重写链源脚本ID，链头为 NULL |
| `previous_script_id` | VARCHAR(64) | 直接前驱脚本ID，首条为 NULL |
| `tags` | JSONB | 用户自定义标签数组，默认 `[]` |
| `content` | TEXT | 脚本正文内容，NOT NULL |

### 1.2 重写链路设计

```
源脚本 A (source_script_id = null, previous_script_id = null)
    ↓ 重写生成
脚本 B (source_script_id = A.id, previous_script_id = A.id)
    ↓ 重写生成
脚本 C (source_script_id = A.id, previous_script_id = B.id)
    ↓ 重写生成
脚本 D (source_script_id = A.id, previous_script_id = C.id)
```

| 字段 | 含义 |
|------|------|
| `source_script_id` | 链路源头 — 重写链最开始的原始脚本，整条链都指向它 |
| `previous_script_id` | 直接前驱 — 当前脚本的直接上一个脚本 |

### 1.3 项目-脚本关系

一个项目可以有多个脚本，其中只有一个选中：

```
项目 X
├── 脚本 A (选中 ✓)  — active_script_id = A.id
├── 脚本 B (备选)
├── 脚本 C (备选)
```

### 1.4 项目表新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `active_script_id` | VARCHAR(64) | 当前选中的脚本ID，可为 NULL（项目初始无脚本） |

### 1.5 移除表

- `nrm_library_scripts`
- `nrm_library_script_versions`
- `nrm_user_script_assoc`
- `nrm_project_script_assoc`

## 二、Repository 层改动

### 2.1 移除文件

- `src/repositories/pg/user-script-assoc-pg-repository.ts`
- `src/contracts/repository-ports/user-script-assoc-repository.ts`（如存在）

### 2.2 修改文件

| 文件 | 改动内容 |
|------|----------|
| `src/repositories/pg/script-data-pg-repository.ts` | 扩展字段映射 |
| `src/repositories/pg/index.ts` | 移除 userScriptAssocs 导出 |

### 2.3 新增方法

`PgScriptDataRepository` 新增：

| 方法 | 说明 |
|------|------|
| `findByProjectId(projectId)` | 查询项目所有脚本 |
| `findActiveByProjectId(projectId)` | 查询项目选中脚本（结合项目表 active_script_id） |
| `findBySourceScriptId(sourceScriptId)` | 查询某源脚本的衍生链 |
| `findByUserId(userId)` | 查询用户所有脚本 |

## 三、Service 层改动

### 3.1 移除服务

- `src/modules/script-library-service.ts` — 基于 `nrm_library_scripts` 的内存服务
- `src/service/library-scripts-db-service.ts` — 库脚本数据库服务（如存在）

### 3.2 核心方法设计

```typescript
interface IScriptService {
  // 创建脚本
  create(userId: string, params: {
    projectId?: string;
    title: string;
    content: string;
    type: ScriptTypeValue;
    tags?: string[];
    sourceScriptId?: string;
    previousScriptId?: string;
  }): Promise<ScriptData>;
  
  // 查询项目所有脚本
  listByProjectId(projectId: string): Promise<ScriptData[]>;
  
  // 查询用户所有脚本
  listByUserId(userId: string): Promise<ScriptData[]>;
  
  // 删除脚本（检查是否为项目选中脚本）
  remove(userId: string, scriptId: string): Promise<void>;
}
```

### 3.3 注意事项

- 脚本不支持修改，故无 `update` 方法
- 删除脚本时需校验是否为项目 `active_script_id`，若为选中脚本则禁止删除或自动清空

## 四、路由层改动

### 4.1 移除路由

- `/library/scripts/:scriptId/versions` — 无版本管理
- `/library/scripts/:scriptId/rollback` — 无版本管理

### 4.2 统一路由设计

| 路由 | 方法 | 说明 |
|------|------|------|
| `/scripts` | GET | 查询脚本列表（按 user_id 或 project_id 过滤） |
| `/scripts` | POST | 创建脚本 |
| `/scripts/:scriptId` | GET | 获取脚本详情 |
| `/scripts/:scriptId` | DELETE | 删除脚本 |
| `/scripts/batch-delete` | POST | 批量删除脚本 |
| `/projects/:projectId/scripts` | GET | 查询项目所有脚本 |
| `/projects/:projectId/active-script` | PUT | 设置项目选中脚本 |

### 4.3 修改文件

- `src/routes/library-routes.ts` — 移除旧脚本库路由
- `src/routes/project-routes.ts` 或新建 `src/routes/script-routes.ts`

## 五、数据迁移方案

### 5.1 迁移顺序

```
步骤1: 扩展 nrm_script_data 表结构（ALTER TABLE）
步骤2: 项目表新增 active_script_id 字段
步骤3: 迁移 nrm_library_scripts → nrm_script_data
步骤4: 迁移 nrm_user_script_assoc 数据合并入 nrm_script_data
步骤5: 迁移 nrm_project_script_assoc → 设置项目 active_script_id
步骤6: 韧证数据完整性
步骤7: 移除旧表（DROP TABLE）
```

### 5.2 迁移 SQL

```sql
-- 步骤1: 扩展 nrm_script_data
ALTER TABLE nrm_script_data 
  ADD COLUMN user_id VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN project_id VARCHAR(64),
  ADD COLUMN source_script_id VARCHAR(64),
  ADD COLUMN previous_script_id VARCHAR(64),
  ADD COLUMN tags JSONB DEFAULT '[]',
  ADD COLUMN content TEXT NOT NULL DEFAULT '';

-- 步骤2: 项目表加字段
ALTER TABLE nrm_project 
  ADD COLUMN active_script_id VARCHAR(64);

-- 步骤3: 迁移 nrm_library_scripts
INSERT INTO nrm_script_data (id, user_id, title, content, type, tags, created_at, updated_at)
SELECT id, user_id, title, content, type, tags, created_at, updated_at
FROM nrm_library_scripts
WHERE deleted_at IS NULL;

-- 步骤4: 迁移 nrm_user_script_assoc（合并用户自定义标题和标签）
-- 先更新已存在的脚本记录的用户自定义信息
UPDATE nrm_script_data sd
SET 
  title = COALESCE(usa.title, sd.title),
  tags = COALESCE(usa.tags, sd.tags)
FROM nrm_user_script_assoc usa
WHERE sd.id = usa.script_data_id;

-- 再插入关联表中独有的脚本（script_data_id 对应记录不存在的情况）
INSERT INTO nrm_script_data (id, user_id, title, tags, type, created_at, updated_at)
SELECT 
  usa.script_data_id,
  usa.user_id,
  usa.title,
  usa.tags,
  0, -- 默认类型为普通脚本
  usa.created_at,
  usa.updated_at
FROM nrm_user_script_assoc usa
WHERE NOT EXISTS (
  SELECT 1 FROM nrm_script_data sd WHERE sd.id = usa.script_data_id
);

-- 步骤5: 迁移项目关联，设置 active_script_id
UPDATE nrm_project p
SET active_script_id = (
  SELECT script_data_id 
  FROM nrm_project_script_assoc 
  WHERE project_id = p.id AND is_active = true 
  ORDER BY version DESC LIMIT 1
);

-- 步骤7: 移除旧表（迁移验证通过后执行）
DROP TABLE IF EXISTS nrm_library_scripts;
DROP TABLE IF EXISTS nrm_library_script_versions;
DROP TABLE IF EXISTS nrm_user_script_assoc;
DROP TABLE IF EXISTS nrm_project_script_assoc;
```

### 5.3 数据验证方法

步骤6验证数据完整性：

```sql
-- 验证1: 检查迁移后的脚本数量
SELECT 
  'nrm_script_data' AS table_name,
  COUNT(*) AS count
FROM nrm_script_data
WHERE user_id != '';

-- 对比源表（迁移前记录）
SELECT 
  'nrm_library_scripts' AS table_name,
  COUNT(*) AS count
FROM nrm_library_scripts WHERE deleted_at IS NULL;

-- 验证2: 检查项目 active_script_id 设置情况
SELECT 
  COUNT(*) AS projects_with_active_script,
  COUNT(*) FILTER (WHERE active_script_id IS NOT NULL) AS has_active,
  COUNT(*) FILTER (WHERE active_script_id IS NULL) AS no_active
FROM nrm_project;

-- 验证3: 检查重写链完整性（如有）
SELECT 
  COUNT(*) AS scripts_with_source,
  COUNT(*) FILTER (WHERE source_script_id IS NOT NULL AND previous_script_id IS NULL) AS chain_head_only,
  COUNT(*) FILTER (WHERE source_script_id IS NOT NULL AND previous_script_id IS NOT NULL) AS chain_middle
FROM nrm_script_data;

-- 验证4: 检查无 orphan 脚本（user_id 为空但不应为空）
SELECT COUNT(*) AS orphan_scripts
FROM nrm_script_data
WHERE user_id = '' OR user_id IS NULL;
```

### 5.4 回滚策略

- 迁移前备份旧表数据
- 若迁移失败，可从备份恢复
- 新字段允许默认值，不影响现有数据完整性

## 六、影响范围

### 6.1 模块影响

| 模块 | 影响程度 | 改动内容 |
|------|----------|----------|
| 脚本库服务 | 高 | 移除旧服务，新建统一服务 |
| 项目服务 | 中 | 新增 active_script_id 字段处理 |
| Step3 脚本生成 | 中 | 改用新脚本表存储 |
| 热榜同步 | 中 | 改用新脚本表存储 |
| 裂变模块 | 低 | 脚本类型字段调整 |

### 6.2 前端影响

- 脚本库页面 API 调用调整
- 移除版本管理相关 UI
- 项目脚本选择逻辑调整