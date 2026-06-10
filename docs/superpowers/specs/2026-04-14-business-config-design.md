# 业务配置管理模块设计

## 背景

现有 `nrm_config` 表采用单行 JSONB 存储所有配置（100+ 字段），存在以下问题：
- **混乱**：所有配置混在一起，无模块边界
- **难定位**：找某个模块的配置需要在代码里搜索字段名
- **改代码才能加配置**：新增配置需要改 TypeScript 类型 + 验证逻辑 + 前端界面
- **无法独立管理**：后台界面是一个大表单，无法按模块分工

## 目标

建立独立的业务配置管理体系：
- 按业务模块分类存储配置
- 模块隔离，便于维护和排查
- 独立的后台管理界面

## 数据库设计

### 新表 `nrm_business_configs`

```sql
CREATE TABLE nrm_business_configs (
  module VARCHAR(64) PRIMARY KEY,           -- 模块标识：step4_video, step5_publish, ...
  config_json JSONB NOT NULL DEFAULT '{}',  -- 配置内容
  description TEXT,                         -- 模块说明
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  updated_by VARCHAR(64)                    -- 操作人 ID
);

-- 表注释
COMMENT ON TABLE nrm_business_configs IS '业务模块配置表，按模块存储 JSONB 配置';
COMMENT ON COLUMN nrm_business_configs.module IS '模块标识，如 step4_video, step5_publish';
COMMENT ON COLUMN nrm_business_configs.config_json IS '模块配置 JSON';
COMMENT ON COLUMN nrm_business_configs.description IS '模块说明';
```

### 与现有 `nrm_config` 的关系

| 配置类型 | 存储位置 | 说明 |
|----------|----------|------|
| 系统级配置 | `nrm_config`（现有） | 全局唯一的配置，如上传限制、锁账户策略、积分规则等 |
| 业务模块配置 | `nrm_business_configs`（新建） | 按模块分类的业务配置，如 step4 视频生成、step5 发布等 |

## 运行机制

### 加载策略

| 特性 | 实现 |
|------|------|
| 加载时机 | 启动时全量加载 `initialize()` |
| 读取 | 内存缓存，毫秒级 |
| 更新 | `update()` 写 DB + 更新缓存 + `globalVersion++` |
| 热更新 | 下次 `get()` 时自动获取最新值（版本号机制） |
| 新增字段 | 需改代码：类型定义 + defaults + 注释消费位置 |

### 数据结构

```typescript
interface CacheEntry {
  data: Record<string, unknown>;
  version: number;
}

class BusinessConfigService {
  private cache = new Map<string, CacheEntry>();
  private globalVersion = 0;  // 单调递增全局版本号

  // 初始化：启动时全量加载
  async initialize() {
    const rows = await this.repo.listAll();
    for (const row of rows) {
      this.cache.set(row.module, {
        data: row.config,
        version: ++this.globalVersion,
      });
    }
  }

  // 读取：版本过期则返回默认值
  get<T>(module, defaults: T): T {
    const cached = this.cache.get(module);
    if (!cached) return defaults;
    return { ...defaults, ...cached.data } as T;
  }

  // 更新：写 DB + 递增版本
  async update(module, config) {
    await this.repo.upsert(module, config);
    this.globalVersion++;
    this.cache.set(module, { data: config, version: this.globalVersion });
  }
}
```

### 消费追踪：代码注释

在类型定义处注释消费位置，便于维护：

```typescript
/**
 * Step4 视频配置
 * 消费位置：
 *   - src/modules/video-job-service.ts (maxConcurrentJobsPerUser)
 *   - apps/web/pages/project-flow/step4-video-workspace/Step4VideoWorkspaceScreen.tsx (batchGenerateIntervalMs)
 */
interface Step4VideoConfig {
  /** 消费：video-job-service.ts 校验并发数 */
  maxConcurrentJobsPerUser: number;

  /** 消费：Step4VideoWorkspaceScreen.tsx 批量生成间隔 */
  batchGenerateIntervalMs: number;
}
```

## 类型定义

### 模块标识

```typescript
export type BusinessModule =
  | "step1_outfit"
  | "step2_character"
  | "step3_image"
  | "step4_video"
  | "step5_publish"
  | "step6_fission";
```

### Step4 视频配置

```typescript
export interface Step4VideoConfig {
  /** 每个分镜场景生成的视频变体数量 */
  batchGenerateCount: number;
  /** 单视频生成失败重试次数 */
  retryCount: number;
}
```

### 默认值

```typescript
export const DEFAULT_STEP4_VIDEO_CONFIG: Step4VideoConfig = {
  batchGenerateCount: 3,
  retryCount: 2,
};
```

## 使用示例

```typescript
// 1. 定义类型（新增字段时修改）
interface Step4VideoConfig {
  /** 消费：video-job-service.ts 校验并发数 */
  maxConcurrentJobsPerUser: number;

  /** 消费：Step4VideoWorkspaceScreen.tsx 批量生成间隔 */
  batchGenerateIntervalMs: number;
}

// 2. 提供默认值常量（新增字段时修改）
const STEP4_VIDEO_BUSINESS_CONFIG: Step4VideoConfig = {
  maxConcurrentJobsPerUser: 10,
  batchGenerateIntervalMs: 2000,
};

// 3. 业务代码使用
const businessConfig = businessConfigService.get("step4_video", STEP4_VIDEO_BUSINESS_CONFIG);
// businessConfig.maxConcurrentJobsPerUser 有类型提示
```

## API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/neirongmiao/api/admin/business-configs/:module` | 获取指定模块配置 |
| PATCH | `/neirongmiao/api/admin/business-configs/:module` | 更新指定模块配置 |
| GET | `/neirongmiao/api/admin/business-configs` | 获取所有模块配置列表 |

## 前端设计

### 文件结构

```
apps/web/
├── pages/admin/
│   ├── SystemSettings.tsx              # 现有系统配置页面（不变）
│   └── BusinessConfigManagement.tsx    # 新增：业务配置管理页面（独立）
└── services/realApi/
    └── businessConfig.ts               # API 封装
```

### 页面结构

```
┌─────────────────────────────────────────────────────────────┐
│  管理后台 - 业务配置                                          │
│  按模块管理各业务配置参数                                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Step4 视频生成                                      │    │
│  │  ─────────────────────────────────────────────────   │    │
│  │  批量生成数量    [  3  ]  每个分镜场景生成的视频变体数量  │    │
│  │  重试次数        [  2  ]  单视频生成失败后重试次数       │    │
│  │                                         [保存] [重置] │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 路由

```
/admin/business-config → BusinessConfigManagement
```

## 后端文件结构

```
src/
├── contracts/
│   └── business-config-contract.ts    # 类型定义
├── repositories/pg/
│   └── business-config-pg-repository.ts  # 数据访问层
├── modules/
│   └── business-config-service.ts     # 业务服务层
└── routes/
    └── business-config-routes.ts      # API 路由
```
