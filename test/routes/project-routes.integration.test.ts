// test/routes/project-routes.integration.test.ts
/**
 * 项目 API 集成测试
 * 覆盖：创建项目、获取项目、删除项目、状态流转
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

async function login(app: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/neirongmiao/api/auth/login",
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  return response.json().token as string;
}

async function registerAndLogin(app: FastifyInstance): Promise<{ token: string; email: string }> {
  const email = `project-test-${Date.now()}@example.com`;
  await app.inject({
    method: "POST",
    url: "/neirongmiao/api/auth/register",
    payload: { email, password: "password123" },
  });
  const token = await login(app, email, "password123");
  return { token, email };
}

describe("Project Routes Integration", () => {
  let app: FastifyInstance;
  let userToken: string;

  beforeAll(async () => {
    app = await buildApp();
    const { token } = await registerAndLogin(app);
    userToken = token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /neirongmiao/api/projects", () => {
    it("可以创建视频项目", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/projects",
        headers: { authorization: `Bearer ${userToken}` },
        payload: { projectKind: "video" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id || body.project?.id).toBeDefined();
    });

    it("可以创建图片项目", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/projects",
        headers: { authorization: `Bearer ${userToken}` },
        payload: { projectKind: "image" },
      });

      expect(response.statusCode).toBe(200);
    });

    it("可以创建反推项目", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/projects",
        headers: { authorization: `Bearer ${userToken}` },
        payload: { projectKind: "reverse" },
      });

      expect(response.statusCode).toBe(200);
    });

    it("可以创建换装项目", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/projects",
        headers: { authorization: `Bearer ${userToken}` },
        payload: { projectKind: "outfit_change" },
      });

      expect(response.statusCode).toBe(200);
    });

    it("未认证用户创建项目返回 401", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/projects",
        payload: { projectKind: "video" },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /neirongmiao/api/projects/:projectId/context", () => {
    let projectId: string;

    beforeAll(async () => {
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/projects",
        headers: { authorization: `Bearer ${userToken}` },
        payload: { projectKind: "video" },
      });
      projectId = response.json().id || response.json().project?.id;
    });

    it("可以获取项目上下文", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/neirongmiao/api/projects/${projectId}/context`,
        headers: { authorization: `Bearer ${userToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.project).toBeDefined();
    });

    it("未认证用户获取项目返回 401", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/neirongmiao/api/projects/${projectId}/context`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("DELETE /neirongmiao/api/projects/:projectId", () => {
    it("可以删除项目", async () => {
      // 创建项目
      const createResponse = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/projects",
        headers: { authorization: `Bearer ${userToken}` },
        payload: { projectKind: "video" },
      });
      const projectId = createResponse.json().id || createResponse.json().project?.id;

      // 删除项目
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/neirongmiao/api/projects/${projectId}`,
        headers: { authorization: `Bearer ${userToken}` },
      });

      expect(deleteResponse.statusCode).toBe(200);
    });
  });
});