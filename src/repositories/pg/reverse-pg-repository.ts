/**
 * 反向解析 PG 仓库
 */

import type { Pool, PoolClient } from "pg";
import type { ReverseTask, ReverseAttempt, ReverseTrace, SourceCredential } from "../../contracts/types.js";
import type {
  IReverseTaskRepository,
  IReverseAttemptRepository,
  IReverseTraceRepository,
  ISourceCredentialRepository,
} from "../../contracts/repository-ports/reverse-repository.js";
import { PgBaseRepository, nrm } from "./base-pg-repository.js";

// ============================================================================
// 反向任务
// ============================================================================

export class PgReverseTaskRepository extends PgBaseRepository<ReverseTask> implements IReverseTaskRepository {
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("reverse_tasks"), client);
  }

  protected mapRow(row: Record<string, unknown>): ReverseTask {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      projectId: row.project_id as string,
      source: row.source as ReverseTask["source"],
      input: row.input as string,
      status: row.status as ReverseTask["status"],
      scriptVersionId: row.script_version_id as string | null,
      fallbackReason: row.fallback_reason as ReverseTask["fallbackReason"],
      traceId: row.trace_id as string | undefined,
      resolvedVideoUrl: row.resolved_video_url as string | undefined,
      resolvedByStage: row.resolved_by_stage as ReverseTask["resolvedByStage"],
      createdAt: row.created_at as number,
    };
  }

  protected mapEntity(t: ReverseTask): Record<string, unknown> {
    return {
      id: t.id,
      user_id: t.userId,
      project_id: t.projectId,
      source: t.source,
      input: t.input,
      status: t.status,
      script_version_id: t.scriptVersionId,
      fallback_reason: t.fallbackReason,
      trace_id: t.traceId ?? null,
      resolved_video_url: t.resolvedVideoUrl ?? null,
      resolved_by_stage: t.resolvedByStage ?? null,
      created_at: t.createdAt,
    };
  }

  async findByProjectId(projectId: string): Promise<ReverseTask[]> {
    return this.findWhere({ project_id: projectId });
  }
}

// ============================================================================
// 反向尝试（只写不删）
// ============================================================================

export class PgReverseAttemptRepository implements IReverseAttemptRepository {
  private readonly table = nrm("reverse_attempts");

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  /** 事务时用 client，否则用 pool */
  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  private mapRow(row: Record<string, unknown>): ReverseAttempt {
    return {
      id: row.id as string,
      traceId: row.trace_id as string,
      taskId: row.task_id as string | null,
      userId: row.user_id as string,
      projectId: row.project_id as string,
      inputUrl: row.input_url as string,
      stage: row.stage as ReverseAttempt["stage"],
      provider: row.provider as string,
      status: row.status as ReverseAttempt["status"],
      reasonCode: row.reason_code as ReverseAttempt["reasonCode"],
      elapsedMs: row.elapsed_ms as number,
      retryable: row.retryable as boolean,
      nextAction: row.next_action as ReverseAttempt["nextAction"],
      detail: row.detail as string | null,
      createdAt: row.created_at as number,
    };
  }

  async findByTraceId(traceId: string): Promise<ReverseAttempt[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE trace_id = $1`,
      [traceId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async list(): Promise<ReverseAttempt[]> {
    const result = await this.queryClient.query(`SELECT * FROM ${this.table}`);
    return result.rows.map((row) => this.mapRow(row));
  }

  async upsert(attempt: ReverseAttempt): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.table} (id, trace_id, task_id, user_id, project_id,
         input_url, stage, provider, status, reason_code, elapsed_ms,
         retryable, next_action, detail, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         reason_code = EXCLUDED.reason_code,
         elapsed_ms = EXCLUDED.elapsed_ms,
         retryable = EXCLUDED.retryable,
         next_action = EXCLUDED.next_action,
         detail = EXCLUDED.detail`,
      [
        attempt.id, attempt.traceId, attempt.taskId, attempt.userId, attempt.projectId,
        attempt.inputUrl, attempt.stage, attempt.provider, attempt.status,
        attempt.reasonCode, attempt.elapsedMs, attempt.retryable,
        attempt.nextAction, attempt.detail, attempt.createdAt,
      ],
    );
  }
}

// ============================================================================
// 反向追踪
// ============================================================================

export class PgReverseTraceRepository implements IReverseTraceRepository {
  private readonly table = nrm("reverse_traces");

  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient,
  ) {}

  /** 事务时用 client，否则用 pool */
  private get queryClient(): Pool | PoolClient {
    return this.client ?? this.pool;
  }

  private mapRow(row: Record<string, unknown>): ReverseTrace {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      projectId: row.project_id as string,
      inputUrl: row.input_url as string,
      stageOrder: PgBaseRepository.fromJsonb<ReverseTrace["stageOrder"]>(row.stage_order) ?? [],
      finalStage: row.final_stage as ReverseTrace["finalStage"],
      success: row.success as boolean,
      resolvedVideoUrl: row.resolved_video_url as string | null,
      scriptHints: PgBaseRepository.fromJsonb<ReverseTrace["scriptHints"]>(row.script_hints) ?? null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  async findById(id: string): Promise<ReverseTrace | null> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByProjectId(projectId: string): Promise<ReverseTrace[]> {
    const result = await this.queryClient.query(
      `SELECT * FROM ${this.table} WHERE project_id = $1`,
      [projectId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async list(): Promise<ReverseTrace[]> {
    const result = await this.queryClient.query(`SELECT * FROM ${this.table}`);
    return result.rows.map((row) => this.mapRow(row));
  }

  async upsert(trace: ReverseTrace): Promise<void> {
    await this.queryClient.query(
      `INSERT INTO ${this.table} (id, user_id, project_id, input_url,
         stage_order, final_stage, success, resolved_video_url,
         script_hints, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         stage_order = EXCLUDED.stage_order,
         final_stage = EXCLUDED.final_stage,
         success = EXCLUDED.success,
         resolved_video_url = EXCLUDED.resolved_video_url,
         script_hints = EXCLUDED.script_hints,
         updated_at = EXCLUDED.updated_at`,
      [
        trace.id, trace.userId, trace.projectId, trace.inputUrl,
        PgBaseRepository.toJsonb(trace.stageOrder), trace.finalStage,
        trace.success, trace.resolvedVideoUrl,
        PgBaseRepository.toJsonb(trace.scriptHints),
        trace.createdAt, trace.updatedAt,
      ],
    );
  }
}

// ============================================================================
// 来源凭证
// ============================================================================

export class PgSourceCredentialRepository
  extends PgBaseRepository<SourceCredential>
  implements ISourceCredentialRepository
{
  constructor(pool: Pool, client?: PoolClient) {
    super(pool, nrm("source_credentials"), client);
  }

  protected mapRow(row: Record<string, unknown>): SourceCredential {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      scope: row.scope as SourceCredential["scope"],
      provider: row.provider as string,
      keyHint: row.key_hint as string,
      cipherText: row.cipher_text as string,
      maskedValue: row.masked_value as string,
      expiresAt: row.expires_at as number | null,
      revokedAt: row.revoked_at as number | null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  protected mapEntity(c: SourceCredential): Record<string, unknown> {
    return {
      id: c.id,
      user_id: c.userId,
      scope: c.scope,
      provider: c.provider,
      key_hint: c.keyHint,
      cipher_text: c.cipherText,
      masked_value: c.maskedValue,
      expires_at: c.expiresAt,
      revoked_at: c.revokedAt,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    };
  }

  async findByUserIdAndScope(userId: string, scope: string): Promise<SourceCredential | null> {
    return this.findOneWhere({ user_id: userId, scope });
  }
}
