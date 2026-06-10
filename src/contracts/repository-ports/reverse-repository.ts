import type { ReverseTask, ReverseAttempt, ReverseTrace, SourceCredential } from "../types.js";

/** 反向任务仓库端口 */
export interface IReverseTaskRepository {
  findById(id: string): Promise<ReverseTask | null>;
  findByProjectId(projectId: string): Promise<ReverseTask[]>;
  list(): Promise<ReverseTask[]>;
  upsert(task: ReverseTask): Promise<void>;
  delete(id: string): Promise<void>;
}

/** 反向尝试仓库端口 */
export interface IReverseAttemptRepository {
  findByTraceId(traceId: string): Promise<ReverseAttempt[]>;
  list(): Promise<ReverseAttempt[]>;
  upsert(attempt: ReverseAttempt): Promise<void>;
}

/** 反向追踪仓库端口 */
export interface IReverseTraceRepository {
  findById(id: string): Promise<ReverseTrace | null>;
  findByProjectId(projectId: string): Promise<ReverseTrace[]>;
  list(): Promise<ReverseTrace[]>;
  upsert(trace: ReverseTrace): Promise<void>;
}

/** 来源凭证仓库端口 */
export interface ISourceCredentialRepository {
  findById(id: string): Promise<SourceCredential | null>;
  findByUserIdAndScope(userId: string, scope: string): Promise<SourceCredential | null>;
  list(): Promise<SourceCredential[]>;
  upsert(credential: SourceCredential): Promise<void>;
  delete(id: string): Promise<void>;
}
