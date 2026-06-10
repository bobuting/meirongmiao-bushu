# script_data 表重构实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 `nrm_script_data.shot_breakdown` JSONB 数据迁移到独立表 `nrm_shot_breakdown`，核心字段拆解为传统列。

**架构：** 新建 `nrm_shot_breakdown` 表存储镜头数据，通过 `script_data_id` 外键关联 `nrm_script_data`。镜头核心字段（shot_index, shot_type, camera_movement 等）拆解为传统列，复杂嵌套（subjects, audio, visual 等）保持 JSONB。

**技术栈：** TypeScript, PostgreSQL, pg 库, Fastify

---

## 文件结构

### 新增文件
| 文件 | 职责 |
|------|------|
| `src/repositories/pg/shot-breakdown-pg-repository.ts` | 镜头数据 Repository，提供 CRUD 操作 |
| `scripts/migrate-shot-breakdown.ts` | 数据迁移脚本：检查列、创建表、迁移数据、移除列 |
| `migrations/create-shot-breakdown-table.sql` | 新表 DDL（用于版本控制） |

### 修改文件
| 文件 | 变更内容 |
|------|---------|
| `src/repositories/pg/index.ts` | 导出新 Repository，添加到仓库集合 |
| `src/service/scripts-data-db-service.ts` | 移除 shot_breakdown 相关逻辑，调用新 Repository |
| `src/modules/script-effectiveness/db/nrm-script-repository.ts` | 移除 shot_breakdown 插入，调用新 Repository |
| `src/service/user-script-assoc-db-service.ts` | 移除 shot_breakdown 占位空数组 |
| `src/routes/step3-candidate/index.ts` | convertSnapshotItemToScriptData 移除 shot_breakdown |
| `scripts/create_all_tables.ts` | 添加 nrm_shot_breakdown 表定义 |

---

## 任务 1：创建迁移脚本

**文件：**
- 创建：`migrations/create-shot-breakdown-table.sql`
- 创建：`scripts/migrate-shot-breakdown.ts`

- [ ] **步骤 1：编写 DDL 文件**

创建 `migrations/create-shot-breakdown-table.sql`：

```sql
-- 创建镜头分镜表
CREATE TABLE IF NOT EXISTS nrm_shot_breakdown (
  -- 主键与关联
  id VARCHAR(64) PRIMARY KEY,
  script_data_id VARCHAR(64) NOT NULL,
  
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
CREATE INDEX IF NOT EXISTS idx_shot_breakdown_script ON nrm_shot_breakdown(script_data_id);
CREATE INDEX IF NOT EXISTS idx_shot_breakdown_order ON nrm_shot_breakdown(script_data_id, shot_index);

-- 外键约束（创建表后添加）
-- ALTER TABLE nrm_shot_breakdown 
--   ADD CONSTRAINT fk_shot_breakdown_script 
--   FOREIGN KEY (script_data_id) REFERENCES nrm_script_data(id) ON DELETE CASCADE;

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

- [ ] **步骤 2：编写迁移脚本**

创建 `scripts/migrate-shot-breakdown.ts`：

```typescript
/**
 * shot_breakdown 数据迁移脚本
 * 
 * 功能：
 * 1. 检查 nrm_script_data 表是否存在 shot_breakdown 列
 * 2. 创建 nrm_shot_breakdown 新表
 * 3. 迁移数据（从 JSONB 拆解到新表）
 * 4. 移除旧列
 * 
 * 使用方式：npx tsx scripts/migrate-shot-breakdown.ts
 */

import { Pool } from "pg";
import "dotenv/config";

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log("=== 开始 shot_breakdown 迁移 ===\n");

    // 步骤 1：检查 shot_breakdown 列是否存在
    console.log("[1/4] 检查 shot_breakdown 列是否存在...");
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'nrm_script_data' 
        AND column_name = 'shot_breakdown'
    `);
    const hasColumn = columnCheck.rows.length > 0;
    console.log(`  结果: ${hasColumn ? "存在" : "不存在"}\n`);

    // 步骤 2：创建新表
    console.log("[2/4] 创建 nrm_shot_breakdown 表...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nrm_shot_breakdown (
        id VARCHAR(64) PRIMARY KEY,
        script_data_id VARCHAR(64) NOT NULL,
        shot_index INTEGER NOT NULL,
        shot_type VARCHAR(50),
        camera_movement VARCHAR(100),
        shot_description TEXT,
        timecode_start VARCHAR(20),
        timecode_end VARCHAR(20),
        duration_seconds NUMERIC(6,2),
        transition_json JSONB,
        camera_details_json JSONB,
        visual_json JSONB,
        subjects_json JSONB,
        audio_json JSONB,
        text_elements_json JSONB,
        speed_effects_json JSONB,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
    console.log("  ✓ 表创建成功\n");

    // 步骤 3：创建索引
    console.log("[3/4] 创建索引...");
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shot_breakdown_script 
      ON nrm_shot_breakdown(script_data_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shot_breakdown_order 
      ON nrm_shot_breakdown(script_data_id, shot_index)
    `);
    console.log("  ✓ 索引创建成功\n");

    // 步骤 4：迁移数据（如果列存在）
    if (hasColumn) {
      console.log("[4/4] 迁移数据...");
      
      // 先统计待迁移数据量
      const countResult = await pool.query(`
        SELECT COUNT(*) as total
        FROM nrm_script_data 
        WHERE shot_breakdown IS NOT NULL 
          AND jsonb_array_length(shot_breakdown) > 0
      `);
      const totalScripts = parseInt(countResult.rows[0].total, 10);
      console.log(`  待迁移脚本数: ${totalScripts}`);

      if (totalScripts > 0) {
        // 执行迁移
        const migrateResult = await pool.query(`
          INSERT INTO nrm_shot_breakdown (
            id, script_data_id, shot_index, shot_type, camera_movement, shot_description,
            timecode_start, timecode_end, duration_seconds,
            transition_json, camera_details_json, visual_json, subjects_json, audio_json,
            text_elements_json, speed_effects_json, created_at, updated_at
          )
          SELECT 
            CONCAT(sd.id, '-shot-', (sb->>'shot_id')::text) as id,
            sd.id as script_data_id,
            (sb->>'shot_id')::integer as shot_index,
            sb->>'shot_type' as shot_type,
            sb->>'camera_movement' as camera_movement,
            sb->>'shot_description' as shot_description,
            sb->'timecode'->>'start' as timecode_start,
            sb->'timecode'->>'end' as timecode_end,
            CASE 
              WHEN sb->'timecode'->>'duration_seconds' IS NOT NULL 
              THEN (sb->'timecode'->>'duration_seconds')::numeric 
              ELSE NULL 
            END as duration_seconds,
            CASE 
              WHEN sb->'transition_in' IS NOT NULL OR sb->'transition_out' IS NOT NULL
              THEN jsonb_build_object('in', sb->transition_in, 'out', sb->transition_out)
              ELSE NULL 
            END as transition_json,
            sb->'camera_details' as camera_details_json,
            sb->'visual' as visual_json,
            sb->'subjects' as subjects_json,
            sb->'audio' as audio_json,
            sb->'text_elements' as text_elements_json,
            sb->'speed_effects' as speed_effects_json,
            sd.created_at,
            sd.updated_at
          FROM nrm_script_data sd,
               jsonb_array_elements(sd.shot_breakdown) as sb
          WHERE sd.shot_breakdown IS NOT NULL
            AND jsonb_array_length(sd.shot_breakdown) > 0
          ON CONFLICT (id) DO NOTHING
        `);
        const migratedCount = migrateResult.rowCount ?? 0;
        console.log(`  ✓ 已迁移 ${migratedCount} 条镜头数据\n`);

        // 步骤 5：移除旧列
        console.log("[5/5] 移除 shot_breakdown 列...");
        await pool.query(`ALTER TABLE nrm_script_data DROP COLUMN IF EXISTS shot_breakdown`);
        console.log("  ✓ 列已移除\n");
      } else {
        console.log("  无数据需要迁移\n");
        
        // 仍然移除空列
        console.log("[5/5] 移除 shot_breakdown 列...");
        await pool.query(`ALTER TABLE nrm_script_data DROP COLUMN IF EXISTS shot_breakdown`);
        console.log("  ✓ 列已移除\n");
      }
    } else {
      console.log("[4/4] 跳过数据迁移（列不存在）\n");
    }

    console.log("=== 迁移完成 ===");
  } catch (error) {
    console.error("迁移失败:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate();
```

- [ ] **步骤 3：Commit**

```bash
git add migrations/create-shot-breakdown-table.sql scripts/migrate-shot-breakdown.ts
git commit -m "feat: 添加 shot_breakdown 迁移脚本和 DDL"
```

---

## 任务 2：创建 Repository

**文件：**
- 创建：`src/repositories/pg/shot-breakdown-pg-repository.ts`

- [ ] **步骤 1：编写 Repository**

创建 `src/repositories/pg/shot-breakdown-pg-repository.ts`：

```typescript
/**
 * 镜头分镜数据 PG 仓库
 * 操作 nrm_shot_breakdown 表
 */

import type { Pool, PoolClient } from "pg";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

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

/** 镜头原始数据（来自 VideoScriptPayload.shot_breakdown） */
export interface ShotBreakdownRaw {
  shot_id: number;
  timecode?: {
    start?: string;
    end?: string;
    duration_seconds?: number;
  };
  shot_type?: string;
  camera_movement?: string;
  transition_in?: Record<string, unknown>;
  transition_out?: Record<string, unknown>;
  camera_details?: Record<string, unknown>;
  visual?: Record<string, unknown>;
  subjects?: unknown[];
  text_elements?: unknown[];
  speed_effects?: Record<string, unknown>;
  audio?: Record<string, unknown>;
  shot_description?: string;
}

/** 批量插入参数 */
export interface BatchInsertParams {
  scriptDataId: string;
  shots: ShotBreakdownRaw[];
  createdAt: number;
  updatedAt: number;
}

/**
 * 镜头分镜 Repository
 */
export class PgShotBreakdownRepository extends PgBaseRepository<ShotBreakdown> {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("shot_breakdown"), client);
  }

  protected mapRow(row: Record<string, unknown>): ShotBreakdown {
    return {
      id: row.id as string,
      scriptDataId: row.script_data_id as string,
      shotIndex: row.shot_index as number,
      shotType: row.shot_type as string | null,
      cameraMovement: row.camera_movement as string | null,
      shotDescription: row.shot_description as string | null,
      timecodeStart: row.timecode_start as string | null,
      timecodeEnd: row.timecode_end as string | null,
      durationSeconds: row.duration_seconds as number | null,
      transitionJson: PgBaseRepository.fromJsonb<Record<string, unknown>>(row.transition_json),
      cameraDetailsJson: PgBaseRepository.fromJsonb<Record<string, unknown>>(row.camera_details_json),
      visualJson: PgBaseRepository.fromJsonb<Record<string, unknown>>(row.visual_json),
      subjectsJson: PgBaseRepository.fromJsonb<unknown[]>(row.subjects_json),
      audioJson: PgBaseRepository.fromJsonb<Record<string, unknown>>(row.audio_json),
      textElementsJson: PgBaseRepository.fromJsonb<unknown[]>(row.text_elements_json),
      speedEffectsJson: PgBaseRepository.fromJsonb<Record<string, unknown>>(row.speed_effects_json),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  protected mapEntity(entity: ShotBreakdown): Record<string, unknown> {
    return {
      id: entity.id,
      script_data_id: entity.scriptDataId,
      shot_index: entity.shotIndex,
      shot_type: entity.shotType,
      camera_movement: entity.cameraMovement,
      shot_description: entity.shotDescription,
      timecode_start: entity.timecodeStart,
      timecode_end: entity.timecodeEnd,
      duration_seconds: entity.durationSeconds,
      transition_json: PgBaseRepository.toJsonb(entity.transitionJson),
      camera_details_json: PgBaseRepository.toJsonb(entity.cameraDetailsJson),
      visual_json: PgBaseRepository.toJsonb(entity.visualJson),
      subjects_json: PgBaseRepository.toJsonb(entity.subjectsJson),
      audio_json: PgBaseRepository.toJsonb(entity.audioJson),
      text_elements_json: PgBaseRepository.toJsonb(entity.textElementsJson),
      speed_effects_json: PgBaseRepository.toJsonb(entity.speedEffectsJson),
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

  /** 根据脚本 ID 查询所有镜头 */
  async findByScriptDataId(scriptDataId: string): Promise<ShotBreakdown[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.tableName} WHERE script_data_id = $1 ORDER BY shot_index`,
      [scriptDataId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /** 批量插入镜头数据 */
  async batchInsert(params: BatchInsertParams): Promise<number> {
    if (params.shots.length === 0) return 0;

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const shot of params.shots) {
      const id = `${params.scriptDataId}-shot-${shot.shot_id}`;
      const transitionJson = shot.transition_in || shot.transition_out
        ? { in: shot.transition_in, out: shot.transition_out }
        : null;

      placeholders.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}::jsonb, $${paramIndex + 10}::jsonb, $${paramIndex + 11}::jsonb, $${paramIndex + 12}::jsonb, $${paramIndex + 13}::jsonb, $${paramIndex + 14}::jsonb, $${paramIndex + 15}::jsonb, $${paramIndex + 16}, $${paramIndex + 17})`
      );

      values.push(
        id,
        params.scriptDataId,
        shot.shot_id,
        shot.shot_type ?? null,
        shot.camera_movement ?? null,
        shot.shot_description ?? null,
        shot.timecode?.start ?? null,
        shot.timecode?.end ?? null,
        shot.timecode?.duration_seconds ?? null,
        transitionJson ? JSON.stringify(transitionJson) : null,
        shot.camera_details ? JSON.stringify(shot.camera_details) : null,
        shot.visual ? JSON.stringify(shot.visual) : null,
        shot.subjects ? JSON.stringify(shot.subjects) : null,
        shot.audio ? JSON.stringify(shot.audio) : null,
        shot.text_elements ? JSON.stringify(shot.text_elements) : null,
        shot.speed_effects ? JSON.stringify(shot.speed_effects) : null,
        params.createdAt,
        params.updatedAt,
      );

      paramIndex += 18;
    }

    const query = `
      INSERT INTO ${this.tableName} (
        id, script_data_id, shot_index, shot_type, camera_movement, shot_description,
        timecode_start, timecode_end, duration_seconds,
        transition_json, camera_details_json, visual_json, subjects_json, audio_json,
        text_elements_json, speed_effects_json, created_at, updated_at
      )
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (id) DO NOTHING
    `;

    try {
      const result = await this.queryClient.query(query, values);
      return result.rowCount ?? 0;
    } catch (error) {
      console.error("[PgShotBreakdownRepository] batchInsert failed:", error);
      return 0;
    }
  }

  /** 删除脚本的所有镜头 */
  async deleteByScriptDataId(scriptDataId: string): Promise<void> {
    await this.queryClient.query(
      `DELETE FROM ${this.tableName} WHERE script_data_id = $1`,
      [scriptDataId],
    );
  }
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/repositories/pg/shot-breakdown-pg-repository.ts
git commit -m "feat: 添加 PgShotBreakdownRepository"
```

---

## 任务 3：注册 Repository 到仓库集合

**文件：**
- 修改：`src/repositories/pg/index.ts`

- [ ] **步骤 1：导入并注册 Repository**

在 `src/repositories/pg/index.ts` 中：

1. 添加导入语句（在其他导入之后）：
```typescript
import { PgShotBreakdownRepository } from "./shot-breakdown-pg-repository.js";
```

2. 在 `PgRepositoryCollection` 接口中添加（在 `functionalRoutes` 之后）：
```typescript
  shotBreakdowns: PgShotBreakdownRepository;
```

3. 在 `createPgRepositories` 函数的 repos 对象中添加（在 `functionalRoutes` 之后）：
```typescript
    shotBreakdowns: new PgShotBreakdownRepository(pool),
```

4. 在 `createPgRepositoriesFromClient` 函数中添加（在 `functionalRoutes` 之后）：
```typescript
    shotBreakdowns: new PgShotBreakdownRepository(pool, client),
```

- [ ] **步骤 2：Commit**

```bash
git add src/repositories/pg/index.ts
git commit -m "feat: 注册 PgShotBreakdownRepository 到仓库集合"
```

---

## 任务 4：修改 scripts-data-db-service

**文件：**
- 修改：`src/service/scripts-data-db-service.ts`

- [ ] **步骤 1：移除 shot_breakdown 相关代码**

1. 从 `VideoScriptPayload` 接口中移除 `shot_breakdown` 字段（约第 62-113 行）

2. 从 `VideoScriptDataRecord` 接口中移除 `payload.shot_breakdown` 占位（约第 172-173 行）

3. 在 `extractColumns` 函数中移除 `shot_breakdown` 相关处理（如果有）

4. 修改 `batchInsertIfNotExists` 方法：
   - 移除 `shot_breakdown` 参数
   - 改为调用 `PgShotBreakdownRepository.batchInsert`

5. 修改 `mapRow` 函数：
   - 移除 `payload.shot_breakdown` 占位空数组

**关键变更点：**

在 `extractColumns` 函数后添加镜头数据处理函数：

```typescript
/** 从 shot_breakdown 数组提取插入参数 */
function extractShotBreakdownParams(
  scriptDataId: string,
  shots: VideoScriptPayload["shot_breakdown"],
  now: number,
): BatchInsertParams | null {
  if (!shots || shots.length === 0) return null;
  return {
    scriptDataId,
    shots: shots.map((s) => ({
      shot_id: s.shot_id,
      timecode: s.timecode,
      shot_type: s.shot_type,
      camera_movement: s.camera_movement,
      transition_in: s.transition_in,
      transition_out: s.transition_out,
      camera_details: s.camera_details,
      visual: s.visual,
      subjects: s.subjects,
      text_elements: s.text_elements,
      speed_effects: s.speed_effects,
      audio: s.audio,
      shot_description: s.shot_description,
    })),
    createdAt: now,
    updatedAt: now,
  };
}
```

修改 `batchInsertIfNotExists` 方法，在插入脚本数据后调用镜头数据插入：

```typescript
// 在批量插入完成后，插入镜头数据
const shotRepo = new PgShotBreakdownRepository(this.pool);
for (const item of items) {
  if (item.payloadJson.shot_breakdown && item.payloadJson.shot_breakdown.length > 0) {
    const shotParams = extractShotBreakdownParams(
      item.id,
      item.payloadJson.shot_breakdown,
      now,
    );
    if (shotParams) {
      await shotRepo.batchInsert(shotParams);
    }
  }
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/service/scripts-data-db-service.ts
git commit -m "refactor: 移除 shot_breakdown，改用独立 Repository"
```

---

## 任务 5：修改 nrm-script-repository

**文件：**
- 修改：`src/modules/script-effectiveness/db/nrm-script-repository.ts`

- [ ] **步骤 1：移除 shot_breakdown 相关代码**

1. 从 INSERT SQL 中移除 `shot_breakdown` 列（约第 32 行）

2. 从 VALUES 中移除 `$22` 参数（约第 40 行）

3. 从参数数组中移除 `p.shot_breakdown` 相关（约第 78 行）

4. 在 `insert` 方法中添加镜头数据插入逻辑：

```typescript
import { PgShotBreakdownRepository } from "../../../repositories/pg/shot-breakdown-pg-repository.js";

// 在 insert 方法末尾添加
if (record.payloadJson.shot_breakdown && record.payloadJson.shot_breakdown.length > 0) {
  const shotRepo = new PgShotBreakdownRepository(this.pool);
  await shotRepo.batchInsert({
    scriptDataId: record.id,
    shots: record.payloadJson.shot_breakdown,
    createdAt: now,
    updatedAt: now,
  });
}
```

5. 修改 `reconstructPayload` 方法，从新表查询镜头数据或返回空数组：

```typescript
// 修改 shot_breakdown 行
shot_breakdown: [],  // 镜头数据需要单独查询
```

- [ ] **步骤 2：Commit**

```bash
git add src/modules/script-effectiveness/db/nrm-script-repository.ts
git commit -m "refactor: nrm-script-repository 移除 shot_breakdown，使用新 Repository"
```

---

## 任务 6：修改 user-script-assoc-db-service

**文件：**
- 修改：`src/service/user-script-assoc-db-service.ts`

- [ ] **步骤 1：移除 shot_breakdown 占位**

在 `mapRowToDto` 函数中（约第 327 行），移除 `shot_breakdown: []` 占位：

```typescript
const payload: Record<string, unknown> = {
  video_info: {
    title: row.script_title,
  },
  video_analysis: {
    theme: row.theme,
    summary: row.summary,
    video_type: row.video_type,
    video_style: row.video_style,
    target_audience: row.target_audience,
    emotion: row.emotion_detail,
    on_screen_presence: row.on_screen_presence,
    fashion_placement: row.fashion_suitable != null ? {
      suitable: row.fashion_suitable,
      reason: row.fashion_reason,
      recommended_styles: row.fashion_styles,
    } : undefined,
  },
  editing_analysis: row.editing_analysis,
  // shot_breakdown 已迁移到独立表，需要单独查询
};
```

- [ ] **步骤 2：Commit**

```bash
git add src/service/user-script-assoc-db-service.ts
git commit -m "refactor: user-script-assoc 移除 shot_breakdown 占位"
```

---

## 任务 7：修改 step3-candidate 路由

**文件：**
- 修改：`src/routes/step3-candidate/index.ts`

- [ ] **步骤 1：移除 shot_breakdown 参数**

在 `convertSnapshotItemToScriptData` 函数中（约第 78-115 行）：

1. 修改函数参数类型，移除 `shot_breakdown`：
```typescript
function convertSnapshotItemToScriptData(
  item: { 
    candidateId: string; 
    trendType: string; 
    title?: string; 
    content?: string; 
    sourceScriptId?: string | null; 
    video_info?: unknown; 
    video_analysis?: unknown; 
    editing_analysis?: unknown 
  },
  projectId: string,
): InsertScriptDataItem | null {
```

2. 移除 payload 中的 `shot_breakdown`：
```typescript
  const payload = {
    video_info: item.video_info,
    video_analysis: item.video_analysis,
    editing_analysis: item.editing_analysis,
  } as VideoScriptPayload;
```

**注意**：镜头数据（`shot_breakdown`）现在由 `scripts-data-db-service.ts` 的 `batchInsertIfNotExists` 方法自动处理，不需要在此处单独处理。

- [ ] **步骤 2：Commit**

```bash
git add src/routes/step3-candidate/index.ts
git commit -m "refactor: step3-candidate 移除 shot_breakdown 参数"
```

---

## 任务 8：更新建表脚本

**文件：**
- 修改：`scripts/create_all_tables.ts`

- [ ] **步骤 1：添加新表定义**

在 `[7/12] 脚本与分镜相关表...` 部分，`script_data` 表定义之后添加：

```typescript
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${t("shot_breakdown")} (
        id VARCHAR(64) PRIMARY KEY,
        script_data_id VARCHAR(64) NOT NULL,
        shot_index INTEGER NOT NULL,
        shot_type VARCHAR(50),
        camera_movement VARCHAR(100),
        shot_description TEXT,
        timecode_start VARCHAR(20),
        timecode_end VARCHAR(20),
        duration_seconds NUMERIC(6,2),
        transition_json JSONB,
        camera_details_json JSONB,
        visual_json JSONB,
        subjects_json JSONB,
        audio_json JSONB,
        text_elements_json JSONB,
        speed_effects_json JSONB,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
    console.log("  ✓ script_data, shot_breakdown, library_scripts, ...");
```

- [ ] **步骤 2：添加索引定义**

在索引创建部分添加：

```typescript
      // shot_breakdown
      `CREATE INDEX IF NOT EXISTS idx_shot_breakdown_script ON ${t("shot_breakdown")}(script_data_id)`,
      `CREATE INDEX IF NOT EXISTS idx_shot_breakdown_order ON ${t("shot_breakdown")}(script_data_id, shot_index)`,
```

- [ ] **步骤 3：Commit**

```bash
git add scripts/create_all_tables.ts
git commit -m "feat: 建表脚本添加 nrm_shot_breakdown 表"
```

---

## 任务 9：执行迁移并验证

- [ ] **步骤 1：编译项目**

```bash
npm run build
```

- [ ] **步骤 2：执行迁移脚本**

```bash
npx tsx scripts/migrate-shot-breakdown.ts
```

预期输出：
```
=== 开始 shot_breakdown 迁移 ===

[1/4] 检查 shot_breakdown 列是否存在...
  结果: 存在/不存在

[2/4] 创建 nrm_shot_breakdown 表...
  ✓ 表创建成功

[3/4] 创建索引...
  ✓ 索引创建成功

[4/4] 迁移数据...
  待迁移脚本数: N
  ✓ 已迁移 M 条镜头数据

[5/5] 移除 shot_breakdown 列...
  ✓ 列已移除

=== 迁移完成 ===
```

- [ ] **步骤 3：验证表结构**

```bash
npx tsx -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT COUNT(*) as cnt FROM nrm_shot_breakdown')
  .then(r => { console.log('镜头数据量:', r.rows[0].cnt); return pool.end(); })
  .catch(e => { console.error(e); pool.end(); });
"
```

- [ ] **步骤 4：验证编译和测试**

```bash
npm run build
npm test  # 如果有相关测试
```

---

## 验收清单

- [ ] 新表 `nrm_shot_breakdown` 创建成功
- [ ] 索引和外键约束生效
- [ ] 现有数据正确迁移
- [ ] `nrm_script_data.shot_breakdown` 列已移除
- [ ] Repository 已创建并注册
- [ ] Service 层代码已更新
- [ ] 编译通过
- [ ] 功能测试通过（Step3 脚本生成流程）