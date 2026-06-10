/**
 * Repository 统一导出与工厂
 * 仅支持 PG repos 模式
 */

// PG 仓库工厂
export { createPgRepositories } from "./pg/index.js";
export type { PgRepositoryCollection } from "./pg/index.js";

// 类型导出（从 PG 模块推断）
import type { PgRepositoryCollection } from "./pg/index.js";

/** 仓库集合 + withTransaction 事务支持 */
export type RepositoryCollection = PgRepositoryCollection;