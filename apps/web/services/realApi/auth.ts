/**
 * realApi/auth.ts - 认证相关 API 实现
 */

import { request } from "../backendApi.request";
import { useAppStore } from "../../store/useAppStore";
import type { UserRole, LoginUser } from "../backendApi.types";

export interface RealAuthApi {
  register(email: string, password: string): Promise<{ id: string; email: string; role: UserRole }>;
  login(email: string, password: string): Promise<{ token: string; user: LoginUser }>;
  logout(): Promise<{ message: string }>;
}

export const realAuthApi: RealAuthApi = {
  register(email: string, password: string) {
    return request<{ id: string; email: string; role: UserRole }>("POST", "/auth/register", {
      body: { email, password },
    });
  },

  login(email: string, password: string) {
    return request<{ token: string; user: LoginUser }>("POST", "/auth/login", {
      body: { email, password },
    });
  },

  logout() {
    // 从 store 获取当前 token，传递给后端销毁 session
    const token = useAppStore.getState().token;
    return request<{ message: string }>("POST", "/auth/logout", { token });
  },
};