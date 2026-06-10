/** 扩展账号数据层 */

import type { Pool, PoolClient } from "pg";
import { z } from "zod";

export interface ExtDouyinAccount {
  id: string;
  userId: string;
  label: string;
  douyinUid: string | null;
  status: "active" | "expired" | "pending" | "revoked";
  lastVerifiedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateExtAccountInput {
  id?: string; // 支持扩展传入本地生成的 ID
  userId: string;
  label: string;
}

/** 创建扩展账号 */
export async function createExtAccount(
  pool: Pool | PoolClient,
  input: CreateExtAccountInput
,
  client?: PoolClient,): Promise<ExtDouyinAccount> {
  const id = input.id ?? crypto.randomUUID(); // 使用传入 ID 或生成新 ID
  const now = Date.now();

  const result = await (client ?? pool).query(
    `INSERT INTO nrm_ext_douyin_accounts (id, user_id, label, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', $4, $4)
     RETURNING *`,
    [id, input.userId, input.label, now]
  );

  return mapRowToAccount(result.rows[0]!);
}

/** 查询用户的所有扩展账号 */
export async function listExtAccounts(
  pool: Pool | PoolClient,
  userId: string
,
  client?: PoolClient,): Promise<ExtDouyinAccount[]> {
  const result = await (client ?? pool).query(
    `SELECT * FROM nrm_ext_douyin_accounts WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows.map(mapRowToAccount);
}

/** 删除扩展账号 */
export async function removeExtAccount(
  pool: Pool | PoolClient,
  userId: string,
  accountId: string
,
  client?: PoolClient,): Promise<void> {
  await (client ?? pool).query(
    `DELETE FROM nrm_ext_douyin_accounts WHERE id = $1 AND user_id = $2`,
    [accountId, userId]
  );
}

/** 更新账号状态（含 ownership 校验） */
export async function updateExtAccountStatus(
  pool: Pool | PoolClient,
  userId: string,
  accountId: string,
  status: ExtDouyinAccount["status"]
,
  client?: PoolClient,): Promise<boolean> {
  const now = Date.now();
  const result = await (client ?? pool).query(
    `UPDATE nrm_ext_douyin_accounts SET status = $1, updated_at = $2 WHERE id = $3 AND user_id = $4`,
    [status, now, accountId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/** 同步账号信息（含 ownership 校验） */
export async function syncExtAccountInfo(
  pool: Pool | PoolClient,
  userId: string,
  accountId: string,
  data: { label?: string; douyinUid?: string | null; status?: ExtDouyinAccount["status"] }
,
  client?: PoolClient,): Promise<boolean> {
  const sets: string[] = ["updated_at = $2"];
  const values: unknown[] = [accountId, Date.now()];
  let paramIdx = 3;

  if (data.label !== undefined) {
    sets.push(`label = $${paramIdx++}`);
    values.push(data.label);
  }
  if (data.douyinUid !== undefined) {
    sets.push(`douyin_uid = $${paramIdx++}`);
    values.push(data.douyinUid);
  }
  if (data.status !== undefined) {
    sets.push(`status = $${paramIdx++}`);
    values.push(data.status);
    if (data.status === "active") {
      sets.push(`last_verified_at = $${paramIdx++}`);
      values.push(Date.now());
    }
  }

  const result = await (client ?? pool).query(
    `UPDATE nrm_ext_douyin_accounts SET ${sets.join(", ")} WHERE id = $1 AND user_id = $${paramIdx}`,
    [...values, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/** 检查账号 Cookie 状态 */
export async function checkExtAccountCookieStatus(
  pool: Pool | PoolClient,
  userId: string,
  accountId: string
,
  client?: PoolClient,): Promise<{ valid: boolean; message: string }> {
  const result = await (client ?? pool).query(
    `SELECT status, last_verified_at FROM nrm_ext_douyin_accounts WHERE id = $1 AND user_id = $2`,
    [accountId, userId]
  );

  if (result.rows.length === 0) {
    return { valid: false, message: "账号不存在" };
  }

  const row = result.rows[0]!;
  const status = row.status as string;
  const lastVerifiedAt = row.last_verified_at as number | null;

  if (status === "active") {
    return { valid: true, message: "Cookie 有效" };
  }

  if (status === "expired") {
    return { valid: false, message: "Cookie 已过期，请重新登录" };
  }

  return { valid: false, message: "账号状态未知" };
}

function mapRowToAccount(row: Record<string, unknown>): ExtDouyinAccount {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    label: row.label as string,
    douyinUid: row.douyin_uid as string | null,
    status: row.status as ExtDouyinAccount["status"],
    lastVerifiedAt: row.last_verified_at as number | null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}
