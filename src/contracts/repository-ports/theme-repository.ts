/**
 * 主题仓库端口
 */

import type { Theme, UserThemePreference } from "../types.js";

/** 主题仓库端口 */
export interface IThemeRepository {
  findById(id: string): Promise<Theme | null>;
  list(): Promise<Theme[]>;
  listEnabled(): Promise<Theme[]>;
  upsert(theme: Theme): Promise<void>;
  delete(id: string): Promise<void>;
}

/** 用户主题偏好仓库端口 */
export interface IUserThemePreferenceRepository {
  findByUserId(userId: string): Promise<UserThemePreference | null>;
  upsert(preference: UserThemePreference): Promise<void>;
  delete(userId: string): Promise<void>;
}