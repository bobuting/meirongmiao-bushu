// test/routes/admin-aesthetic-library-routes.test.ts
/**
 * 审美特征库后台管理 API 测试
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

// 登录函数获取真实 token
async function login(app: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/neirongmiao/api/auth/login",
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  return response.json().token as string;
}

describe("Admin Aesthetic Library Routes", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testFeatureId: string;

  beforeAll(async () => {
    app = await buildApp();
    // 使用真实的 admin 用户登录获取 token
    adminToken = await login(app, "admin@example.com", "admin123");
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /neirongmiao/api/admin/aesthetic-library/statistics", () => {
    it("should return statistics for admin user", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/neirongmiao/api/admin/aesthetic-library/statistics",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      // 验证响应状态码
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      // 验证返回数据结构
      expect(body).toHaveProperty("totalCount");
      expect(body).toHaveProperty("childCount");
      expect(body).toHaveProperty("adultCount");
      expect(body).toHaveProperty("categoryDistribution");
      expect(body).toHaveProperty("recentUpdates");
      expect(typeof body.totalCount).toBe("number");
      expect(typeof body.childCount).toBe("number");
      expect(typeof body.adultCount).toBe("number");
      expect(typeof body.categoryDistribution).toBe("object");
      expect(typeof body.recentUpdates).toBe("number");
    });

    it("should reject non-admin user", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/neirongmiao/api/admin/aesthetic-library/statistics",
        headers: {
          authorization: `Bearer invalid-token`,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /neirongmiao/api/admin/aesthetic-library/features", () => {
    it("should return features list with pagination", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/neirongmiao/api/admin/aesthetic-library/features?page=1&limit=10",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("items");
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("page");
      expect(body).toHaveProperty("limit");
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(10);
    });

    it("should filter by ageRange", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/neirongmiao/api/admin/aesthetic-library/features?ageRange=7-12&page=1&limit=20",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("items");
      // 如果有数据，验证 ageRange 过滤正确
      if (body.items.length > 0) {
        expect(body.items[0].ageRange).toBe("7-12");
      }
    });

    it("should validate page parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/neirongmiao/api/admin/aesthetic-library/features?page=0&limit=10",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      // page 应该 >= 1
      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /neirongmiao/api/admin/aesthetic-library/features", () => {
    it("should add new feature for admin", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/admin/aesthetic-library/features",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        body: {
          featureCategory: "jawline_definition",
          featureName: "test_clear_jawline_" + randomUUID(),
          featureDescription: "轮廓分明的下颌线条",
          ethnicityApplicable: ["asian", "western"],
          ageRange: "19-25",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("id");
      expect(typeof body.id).toBe("string");

      // 保存 ID 用于后续测试
      testFeatureId = body.id;
    });

    it("should validate required fields", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/admin/aesthetic-library/features",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        body: {
          featureCategory: "test_category",
          // 缺少 featureName
          featureDescription: "测试描述",
          ethnicityApplicable: [],
          ageRange: "7-12",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should validate ageRange enum", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/admin/aesthetic-library/features",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        body: {
          featureCategory: "test_category",
          featureName: "test_feature",
          featureDescription: "测试描述",
          ethnicityApplicable: [],
          ageRange: "invalid_age_range", // 无效值
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("PATCH /neirongmiao/api/admin/aesthetic-library/features/:id", () => {
    it("should edit feature for admin", async () => {
      // 独立准备测试数据：先添加一个特征用于编辑
      const addResponse = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/admin/aesthetic-library/features",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        body: {
          featureCategory: "test_edit_category",
          featureName: "test_edit_feature_" + randomUUID(),
          featureDescription: "编辑前描述",
          ethnicityApplicable: [],
          ageRange: "7-12",
        },
      });

      expect(addResponse.statusCode).toBe(200);
      const featureId = JSON.parse(addResponse.body).id;
      expect(featureId).toBeDefined();

      const editResponse = await app.inject({
        method: "PATCH",
        url: `/neirongmiao/api/admin/aesthetic-library/features/${featureId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        body: {
          featureName: "更新后的名称",
          popularityScore: 50,
        },
      });

      expect(editResponse.statusCode).toBe(200);

      const body = JSON.parse(editResponse.body);
      expect(body).toHaveProperty("success");
      expect(body.success).toBe(true);
    });

    it("should validate popularityScore range", async () => {
      // 独立准备测试数据
      const addResponse = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/admin/aesthetic-library/features",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        body: {
          featureCategory: "test_validation_category",
          featureName: "test_validation_feature_" + randomUUID(),
          featureDescription: "验证测试",
          ethnicityApplicable: [],
          ageRange: "7-12",
        },
      });
      const featureId = JSON.parse(addResponse.body).id;

      const response = await app.inject({
        method: "PATCH",
        url: `/neirongmiao/api/admin/aesthetic-library/features/${featureId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        body: {
          popularityScore: 150, // 超出 0-100 范围
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("DELETE /neirongmiao/api/admin/aesthetic-library/features/:id", () => {
    it("should soft delete feature for admin", async () => {
      // 先添加一个待删除特征
      const addResponse = await app.inject({
        method: "POST",
        url: "/neirongmiao/api/admin/aesthetic-library/features",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        body: {
          featureCategory: "test_delete_category",
          featureName: "test_delete_feature_" + randomUUID(),
          featureDescription: "将被删除",
          ethnicityApplicable: [],
          ageRange: "19-25",
        },
      });

      const featureId = JSON.parse(addResponse.body).id;

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/neirongmiao/api/admin/aesthetic-library/features/${featureId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(deleteResponse.statusCode).toBe(200);

      const body = JSON.parse(deleteResponse.body);
      expect(body).toHaveProperty("success");
      expect(body.success).toBe(true);
    });

    it("should validate UUID format", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/neirongmiao/api/admin/aesthetic-library/features/invalid-uuid",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /neirongmiao/api/admin/aesthetic-library/ranking", () => {
    it("should return popularity ranking", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/neirongmiao/api/admin/aesthetic-library/ranking?limit=10",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      // 验证排序正确（按 popularityScore 降序）
      if (body.length > 1) {
        for (let i = 0; i < body.length - 1; i++) {
          expect(body[i].popularityScore).toBeGreaterThanOrEqual(body[i + 1].popularityScore);
        }
      }
    });

    it("should filter ranking by ageRange", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/neirongmiao/api/admin/aesthetic-library/ranking?ageRange=19-25&limit=5",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeLessThanOrEqual(5);
    });

    it("should validate limit parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/neirongmiao/api/admin/aesthetic-library/ranking?limit=100",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      // limit 最大值 50
      expect(response.statusCode).toBe(400);
    });
  });
});