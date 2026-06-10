# 五视图独立存储设计

## 概述

将五视图从角色内嵌存储改为独立表结构，支持一个角色拥有多张五视图（版本历史），并支持用户选择激活版本。

## 业务规则

1. 五视图是一张**合成图片**，包含 5 个视角（正面、左侧、右侧、背面、特写）
2. 一个角色可以有**多张五视图**（版本历史模式）
3. 用户选择**一张作为激活版本**
4. 新建角色时**自动生成**第一张五视图
5. 五视图**异步生成**，失败时后台重试
6. 生成完成后发送**站内通知**

## 数据库设计

### 新建表：m5_character_five_views

```sql
CREATE TABLE m5_character_five_views (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES m5_library_characters(id) ON DELETE CASCADE,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/processing/ready/failed
  is_active BOOLEAN NOT NULL DEFAULT false,

  -- 生成参数
  prompt TEXT,
  model TEXT,
  generation_params JSONB,  -- 其他参数：ratio, resolution, seed等

  -- 错误信息
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- 时间戳
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 索引
CREATE INDEX idx_five_views_character_id ON m5_character_five_views(character_id);
CREATE INDEX idx_five_views_is_active ON m5_character_five_views(character_id, is_active) WHERE is_active = true;
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键，UUID |
| character_id | TEXT | 外键，关联角色 |
| image_url | TEXT | 五视图图片 OSS 地址 |
| status | TEXT | 状态：pending/processing/ready/failed |
| is_active | BOOLEAN | 是否为激活版本 |
| prompt | TEXT | 生成提示词 |
| model | TEXT | 生成模型 |
| generation_params | JSONB | 其他生成参数 |
| error_message | TEXT | 失败时的错误信息 |
| retry_count | INTEGER | 重试次数 |
| created_at | BIGINT | 创建时间戳 |
| updated_at | BIGINT | 更新时间戳 |

## OSS 存储路径

```
/storage/characters/{character_id}/
├── original.jpg           -- 原图（现有）
├── five_views/
│   ├── {five_view_id}.jpg -- 五视图图片
│   └── ...
└── ...
```

## API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/library-characters/{id}/five-views` | 手动触发生成新五视图 |
| GET | `/library-characters/{id}/five-views` | 获取角色的所有五视图 |
| PUT | `/library-characters/{id}/five-views/{viewId}/activate` | 设为激活版本 |
| DELETE | `/library-characters/{id}/five-views/{viewId}` | 删除指定五视图 |

## 流程设计

### 创建角色流程（沿用现有 + 新增）

```
1. 用户上传原图
2. LLM 校验角色（现有逻辑）
3. 上传原图到 OSS（现有逻辑）
4. 创建角色记录（现有逻辑）
5. 【新增】自动创建五视图记录（status=pending）
6. 【新增】后台异步生成五视图
7. 【新增】生成完成 → 上传 OSS → 更新状态 → 发送通知
```

### 五视图生成流程

```
1. 从 OSS 获取角色原图
2. 调用图像生成模型 → 生成五视图（5视角合成图）
3. 上传到 OSS: /storage/characters/{character_id}/five_views/{view_id}.jpg
4. 更新数据库：image_url, status=ready, is_active=true
5. 发送站内通知
```

### 设为激活版本流程

```
1. 校验五视图是否属于该角色
2. 校验五视图状态是否为 ready
3. 将该角色其他五视图的 is_active 设为 false
4. 将目标五视图的 is_active 设为 true
```

## 迁移计划

1. 创建新表 `m5_character_five_views`
2. 迁移现有数据：从 `library_characters.payload_json.viewSession` 提取五视图数据
3. 更新后端 API
4. 更新前端界面
5. 清理旧的 `viewSession` 字段（可选，保留兼容性）

## 类型定义

### TypeScript 接口

```typescript
export interface CharacterFiveView {
  id: string;
  characterId: string;
  imageUrl: string | null;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  isActive: boolean;
  prompt: string | null;
  model: string | null;
  generationParams: Record<string, unknown> | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}
```

## 注意事项

- 删除角色时级联删除所有五视图（ON DELETE CASCADE）
- 每个 `is_active=true` 的五视图对应一个角色，通过唯一索引约束
- 五视图生成失败时记录错误信息，支持后台重试
- 重试次数超过阈值后标记为 failed，不再自动重试