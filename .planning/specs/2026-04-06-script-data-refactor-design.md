# script_data 表重构设计

## 背景

`nrm_script_data` 表当前使用混合存储模式：部分字段已拆解为传统列，部分字段仍为 JSONB。其中 `shot_breakdown` (JSONB) 存储镜头分镜数据，结构复杂，查询不便，需要独立建表。

## 目标

1. 将 `shot_breakdown` JSONB 数据迁移到独立表 `nrm_shot_breakdown`
2. 镜头核心字段拆解为传统列，复杂嵌套保持 JSONB
3. 移除 `nrm_script_data.shot_breakdown` 列
4. 保持其他 JSONB 列不变

## 表结构设计

### nrm_script_data 变更

**移除列**：
- `shot_breakdown` (JSONB)

**保持不变**：
- 所有现有传统列：`id`, `type`, `title`, `theme`, `summary`, `video_type`, `video_style`, `target_audience`, `fashion_suitable`, `fashion_reason`, `primary_emotion`, `emotion_arc`, `duration_seconds`, `source`, `time_of_day`, `weather`, `source_script_id`, `project_id`, `source_oss_url`, `created_at`, `updated_at`
- JSONB 列：`emotion_detail`, `on_screen_presence`, `fashion_styles`, `editing_analysis`, `shot_prompts`

### nrm_shot_breakdown 新表

```sql
CREATE TABLE nrm_shot_breakdown (
  -- 主键与关联
  id VARCHAR(32) PRIMARY KEY,
  script_data_id VARCHAR(32) NOT NULL,
  
  -- 核心字段（传统列）
  shot_index INTEGER NOT NULL,
  shot_type VARCHAR(50),
  camera_movement VARCHAR(100),
  shot_description TEXT,
  timecode_start VARCHAR(20),
  timecode_end VARCHAR(20),
  duration_seconds NUMERIC(6,2),
  
  -- 复杂嵌套字段（JSONB）
  transition_json JSONB,
  camera_details_json JSONB,
  visual_json JSONB,
  subjects_json JSONB,
  audio_json JSONB,
  text_elements_json JSONB,
  speed_effects_json JSONB,
  
  -- 元数据
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 索引
CREATE INDEX idx_shot_breakdown_script ON nrm_shot_breakdown(script_data_id);
CREATE INDEX idx_shot_breakdown_order ON nrm_shot_breakdown(script_data_id, shot_index);

-- 外键约束
ALTER TABLE nrm_shot_breakdown 
  ADD CONSTRAINT fk_shot_breakdown_script 
  FOREIGN KEY (script_data_id) REFERENCES nrm_script_data(id) ON DELETE CASCADE;

-- 表备注
COMMENT ON TABLE nrm_shot_breakdown IS '脚本分镜镜头数据表';
COMMENT ON COLUMN nrm_shot_breakdown.id IS '主键ID';
COMMENT ON COLUMN nrm_shot_breakdown.script_data_id IS '关联脚本数据ID';
COMMENT ON COLUMN nrm_shot_breakdown.shot_index IS '镜头序号';
COMMENT ON COLUMN nrm_shot_breakdown.shot_type IS '镜头类型：远景/中景/近景/特写等';
COMMENT ON COLUMN nrm_shot_breakdown.camera_movement IS '镜头运动：推/拉/摇/移/跟等';
COMMENT ON COLUMN nrm_shot_breakdown.shot_description IS '镜头画面描述';
COMMENT ON COLUMN nrm_shot_breakdown.timecode_start IS '开始时间码';
COMMENT ON COLUMN nrm_shot_breakdown.timecode_end IS '结束时间码';
COMMENT ON COLUMN nrm_shot_breakdown.duration_seconds IS '镜头持续时长（秒）';
COMMENT ON COLUMN nrm_shot_breakdown.transition_json IS '转场信息（transition_in + transition_out）';
COMMENT ON COLUMN nrm_shot_breakdown.camera_details_json IS '镜头细节参数';
COMMENT ON COLUMN nrm_shot_breakdown.visual_json IS '视觉信息（场景/构图/光线/色彩）';
COMMENT ON COLUMN nrm_shot_breakdown.subjects_json IS '人物信息数组';
COMMENT ON COLUMN nrm_shot_breakdown.audio_json IS '音频信息（对话/旁白/音乐/音效）';
COMMENT ON COLUMN nrm_shot_breakdown.text_elements_json IS '文字元素数组';
COMMENT ON COLUMN nrm_shot_breakdown.speed_effects_json IS '速度特效信息';
```

## 字段映射规则

| 原 shot_breakdown JSONB 字段 | 新表字段 | 说明 |
|------------------------------|----------|------|
| `shot_id` | `shot_index` | 直接映射 |
| `shot_type` | `shot_type` | 直接映射 |
| `camera_movement` | `camera_movement` | 直接映射 |
| `shot_description` | `shot_description` | 直接映射 |
| `timecode.start` | `timecode_start` | 拆解 |
| `timecode.end` | `timecode_end` | 拆解 |
| `timecode.duration_seconds` | `duration_seconds` | 拆解 |
| `transition_in` + `transition_out` | `transition_json` | 合并存储 |
| `camera_details` | `camera_details_json` | 保持 JSONB |
| `visual` | `visual_json` | 保持 JSONB |
| `subjects` | `subjects_json` | 保持 JSONB |
| `audio` | `audio_json` | 保持 JSONB |
| `text_elements` | `text_elements_json` | 保持 JSONB |
| `speed_effects` | `speed_effects_json` | 保持 JSONB |

## 数据层变更

### 新增文件

**`src/repositories/pg/shot-breakdown-pg-repository.ts`**

```typescript
/** 镜头数据实体 */
export interface ShotBreakdown {
  id: string;
  scriptDataId: string;
  shotIndex: number;
  shotType: string | null;
  cameraMovement: string | null;
  shotDescription: string | null;
  timecodeStart: string | null;
  timecodeEnd: string | null;
  durationSeconds: number | null;
  transitionJson: Record<string, unknown> | null;
  cameraDetailsJson: Record<string, unknown> | null;
  visualJson: Record<string, unknown> | null;
  subjectsJson: unknown[] | null;
  audioJson: Record<string, unknown> | null;
  textElementsJson: unknown[] | null;
  speedEffectsJson: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

/** 插入参数（从 VideoScriptPayload.shot_breakdown 映射） */
export interface InsertShotBreakdownParams {
  scriptDataId: string;
  shotIndex: number;
  shotType?: string;
  cameraMovement?: string;
  shotDescription?: string;
  timecodeStart?: string;
  timecodeEnd?: string;
  durationSeconds?: number;
  transitionJson?: Record<string, unknown>;
  cameraDetailsJson?: Record<string, unknown>;
  visualJson?: Record<string, unknown>;
  subjectsJson?: unknown[];
  audioJson?: Record<string, unknown>;
  textElementsJson?: unknown[];
  speedEffectsJson?: Record<string, unknown>;
}

export class PgShotBreakdownRepository extends PgBaseRepository<ShotBreakdown> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("shot_breakdown"), client);
  }

  // findByScriptDataId, batchInsert, deleteByScriptDataId 等方法
}
```

### 修改文件

| 文件 | 变更内容 |
|------|---------|
| `src/service/scripts-data-db-service.ts` | 移除 shot_breakdown 相关逻辑，改为调用 PgShotBreakdownRepository |
| `src/modules/script-effectiveness/db/nrm-script-repository.ts` | 移除 shot_breakdown 插入/读取，改为调用新 Repository |
| `src/persistence/hot-trend-db-operations.ts` | 同上（如有涉及） |
| `src/service/user-script-assoc-db-service.ts` | 移除 shot_breakdown 占位空数组，改为关联查询 |

### VideoScriptPayload 类型变更

移除 `shot_breakdown` 字段，镜头数据通过独立查询获取。

## 数据迁移步骤

1. **创建新表** — 执行 DDL 创建 `nrm_shot_breakdown`
2. **迁移数据** — 从现有 JSONB 拆解并批量插入新表
3. **移除旧列** — `ALTER TABLE nrm_script_data DROP COLUMN shot_breakdown`

### 迁移脚本核心逻辑

```sql
-- 拆解 JSONB 数组并插入新表
INSERT INTO nrm_shot_breakdown (
  id, script_data_id, shot_index, shot_type, camera_movement, shot_description,
  timecode_start, timecode_end, duration_seconds,
  transition_json, camera_details_json, visual_json, subjects_json, audio_json,
  text_elements_json, speed_effects_json, created_at, updated_at
)
SELECT 
  CONCAT(sd.id, '-shot-', sb.shot_id) as id,
  sd.id as script_data_id,
  sb.shot_id as shot_index,
  sb.shot_type,
  sb.camera_movement,
  sb.shot_description,
  sb.timecode->>'start' as timecode_start,
  sb.timecode->>'end' as timecode_end,
  (sb.timecode->>'duration_seconds')::numeric as duration_seconds,
  jsonb_build_object('in', sb.transition_in, 'out', sb.transition_out) as transition_json,
  sb.camera_details,
  sb.visual,
  sb.subjects,
  sb.audio,
  sb.text_elements,
  sb.speed_effects,
  sd.created_at,
  sd.updated_at
FROM nrm_script_data sd,
     jsonb_array_elements(sd.shot_breakdown) as sb
WHERE sd.shot_breakdown IS NOT NULL;
```

## 影响范围

### 需同步修改的代码模块

| 模块 | 文件 | 改动内容 |
|------|------|---------|
| 脚本数据服务 | `src/service/scripts-data-db-service.ts` | 移除 `shot_breakdown` 插入/读取，改为调用 `PgShotBreakdownRepository` |
| 脚本有效性 | `src/modules/script-effectiveness/db/nrm-script-repository.ts` | 移除 `shot_breakdown` 插入/读取，改为调用新 Repository |
| 用户脚本关联 | `src/service/user-script-assoc-db-service.ts` | `payload.shot_breakdown` 占位空数组改为关联查询 |
| Step3 候选 | `src/routes/step3-candidate/index.ts` | `convertSnapshotItemToScriptData` 函数移除 `shot_breakdown` 参数，改为独立插入镜头数据 |

### 需更新的类型定义

| 文件 | 变更 |
|------|------|
| `src/service/scripts-data-db-service.ts` | `VideoScriptPayload` 移除 `shot_breakdown` |
| `src/contracts/step3-candidate-snapshot-contract.ts` | 检查 `shot_breakdown` 使用情况 |

## 验收标准

1. 新表 `nrm_shot_breakdown` 创建成功，索引和外键约束生效
2. 所有现有 shot_breakdown 数据正确迁移到新表
3. `nrm_script_data.shot_breakdown` 列已移除
4. 相关 Service/Repository 代码已更新，测试通过
5. 前端功能不受影响（镜头数据仍可通过关联查询获取）

## 风险与回滚

**风险**：
- 迁移过程中数据丢失 — 通过预校验和事务保证
- 代码遗漏调用点 — 通过代码审查和测试覆盖

**回滚方案**：
- 迁移前备份 `nrm_script_data.shot_breakdown` 数据
- 如需回滚，可从备份恢复并删除新表