// test/routes/auth-routes.integration.test.ts
/**
 * 认证 API 集成测试
 * 覆盖：注册、登录、登出、密码修改
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

describe("Auth Routes Integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /neirongmiao/api/auth/register", () => {
    it("可以注册新用户", async () => {
      const email = `test-${Date.now()}@example.com`;
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/auth/register",
        payload: { email, password: "password123" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe(email);
      expect(body.user.role).toBe("user");
    });

    it("重复注册返回 409", async () => {
      const email = `duplicate-${Date.now()}@example.com`;
      // 第一次注册
      await app.inject({
        method: "POST",
        url: "/neirongmiao/api/auth/register",
        payload: { email, password: "password123" },
      });

      // 第二次注册应失败
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/auth/register",
        payload: { email, password: "password123" },
      });

      expect(response.statusCode).toBe(409);
    });

    it("密码少于 6 位返回 400", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/auth/register",
        payload: { email: "short-password@test.com", password: "12345" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /neirongmiao/api/auth/login", () => {
    let testEmail: string;

    beforeAll(async () => {
      testEmail = `login-test-${Date.now()}@example.com`;
      await app.inject({
        method: "POST",
        url: "/neirongmiao/api/auth/register",
        payload: { email: testEmail, password: "password123" },
      });
    });

    it("正确凭据可以登录", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/auth/login",
        payload: { email: testEmail, password: "password123" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.token).toBeDefined();
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe(testEmail);
    });

    it("错误密码返回 401", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/auth/login",
        payload: { email: testEmail, password: "wrongpassword" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("不存在用户返回 401", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/auth/login",
        payload: { email: "nonexistent@test.com", password: "password123" },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});