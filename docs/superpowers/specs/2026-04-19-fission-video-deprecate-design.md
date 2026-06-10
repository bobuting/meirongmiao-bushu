# 裂变视频弃用功能设计

## 需求背景

用户对不满意的裂变视频（`nrm_fission_videos` 表）需要"删除"功能，但实际业务逻辑应为"弃用"：
- 弃用的组合在下次裂变时应被排除
- 如果可用组合数量不足，从弃用组合中补充
- 不需要恢复功能

## 数据库变更

新增字段到 `nrm_fission_videos` 表：

```sql
ALTER TABLE nrm_fission_videos 
ADD COLUMN is_deprecated boolean NOT NULL DEFAULT false,
ADD COLUMN deprecated_at bigint,
ADD COLUMN deprecated_by text;

COMMENT ON COLUMN nrm_fission_videos.is_deprecated IS '是否弃用';
COMMENT ON COLUMN nrm_fission_videos.deprecated_at IS '弃用时间戳（毫秒）';
COMMENT ON COLUMN nrm_fission_videos.deprecated_by IS '弃用操作者ID';
```

## 后端服务变更

### FissionVideoService

| 变更类型 | 方法 | 说明 |
|---------|------|------|
| 新增 | `deprecate(id, userId)` | 弃用视频（设置 is_deprecated=true） |
| 修改 | `listByProject(projectId, includeDeprecated?)` | 新增参数控制是否包含弃用记录 |
| 移除 | `checkCombinationExists()` | 不再需要唯一性拦截 |

### API 变更

| 接口 | 变更 |
|------|------|
| `DELETE /fission/videos/:id` | 从物理删除改为弃用逻辑 |
| `GET /fission/videos?projectId=xxx` | 默认返回未弃用记录 |

## 组合生成逻辑

### 弃用组合排除/补充逻辑（独立于组合类型优先级）

修改 `getCombinations` 方法中的查询逻辑：

```typescript
// 1. 查询未弃用已存在的组合（需要排除）
const activeCombinationIds = new Set<string>(); // is_deprecated = false

// 2. 查询已弃用的组合（可用于补充）
const deprecatedCombinationIds = new Set<string>(); // is_deprecated = true

// 3. 排除池 = 未弃用已存在的组合
const usedCombinationIds = activeCombinationIds;

// 4. 补充池 = 弃用组合 - 未弃用已存在组合
const supplementPool = [...deprecatedCombinationIds].filter(
  id => !activeCombinationIds.has(id)
);
```

### 组合选择规则

| 阶段 | 规则 |
|------|------|
| 第一轮 | 确保每种类型（原始分镜、图生视频、新故事分镜）至少有 1 个组合 |
| 第二轮 | 填充剩余数量，优先选择数量较少的类型 |
| 第三轮 | 如果组合数量仍然不足，从补充池中随机选择 |

### 组合类型优先级（保持不变）

| 组合类型 | 优先来源 | 备用来源 |
|---------|---------|---------|
| 原始分镜 | originalList | imageToVideoList → newStoryList |
| 图生视频 | imageToVideoList | originalList |
| 新故事分镜 | newStoryList | originalList |

**此逻辑完全独立于弃用功能，不做任何修改。**

## 前端变更

- 删除按钮保持"删除"文案
- 删除后视频从列表移除
- 无需显示已弃用列表

## 两者关系说明

| 功能 | 影响范围 | 修改内容 |
|------|---------|---------|
| **弃用组合排除/补充** | 决定哪些 `storyboard_ids` 被视为"已使用" | 修改 `usedCombinationIds` 的查询逻辑 |
| **组合类型优先级** | 决定分镜来源的选择顺序 | 保持不变 |

**交互流程：**

```
1. 组合类型优先级逻辑：决定从哪些来源选择分镜
2. 弃用组合排除逻辑：决定哪些组合ID已被使用，需要排除
3. 组合生成：在排除后的池子中，按优先级选择分镜组合
4. 数量不足时：从弃用组合补充池中选择
```

## 实现文件

| 文件 | 变更说明 |
|------|---------|
| `src/contracts/types.ts` | FissionVideo 类型新增 isDeprecated、deprecatedAt、deprecatedBy 字段 |
| `src/contracts/services.ts` | IFissionVideoService 接口新增 deprecate 方法，移除 checkCombinationExists、delete 方法 |
| `src/modules/fission-video/fission-video-service.ts` | 实现 deprecate 方法，修改 listByProject |
| `src/routes/fission-video-routes.ts` | 删除接口改为弃用逻辑，创建视频时添加新字段 |
| `src/service/services-sub.ts` | getCombinations 方法新增弃用组合排除/补充逻辑 |
