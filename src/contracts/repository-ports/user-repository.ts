/**
 * 用户仓库端口
 */

import type { User, Session } from "../types.js";

/** 用户仓库端口 */
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(): Promise<User[]>;
  upsert(user: User): Promise<void>;
  delete(id: string): Promise<void>;
}

/** 会话仓库端口 */
export interface ISessionRepository {
  findByToken(token: string): Promise<Session | null>;
  upsert(session: Session): Promise<void>;
  delete(token: string): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
}