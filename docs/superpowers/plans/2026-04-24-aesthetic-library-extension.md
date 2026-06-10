# 审美特征库成人分类扩展 + 后台管理 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 扩展审美特征库支持成人分类（age_range: 'adult_18-30'），并创建可视化后台管理系统（7 个功能模块）。

**架构：** 成人分类使用与儿童相同的统一机制（TikHub API + LLM Vision 分析），扩展 TikHub 关键词配置和特征分类。后台管理系统采用 RESTful API + 卡片式 UI，管理员角色验证使用 requireAdmin() 函数。

**技术栈：** Node.js + Fastify 5 + TypeScript + PostgreSQL（后端），React 18 + TanStack Query + Zustand + Tailwind CSS（前端）

---

## 文件结构

本实现涉及以下文件的创建或修改：

### 后端文件

| 文件 | 职责 | 操作 |
|------|------|------|
| `src/modules/aesthetic-library-update-service.ts` | TikHub 关键词配置扩展 | 修改 |
| `src/routes/admin-aesthetic-library-routes.ts` | 后台管理 API 路由（7 个端点） | 创建 |
| `src/modules/admin-aesthetic-library-service.ts` | 后台管理业务逻辑 | 创建 |
| `src/app-setup/setup-routes.ts` | 注册新路由 | 修改 |

### 前端文件

| 文件 | 职责 | 操作 |
|------|------|------|
| `apps/web/pages/admin/AestheticLibraryManagement.tsx` | 后台管理主页面 | 创建 |
| `apps/web/services/realApi/admin-aesthetic-library.ts` | API 调用封装 | 创建 |

### 测试文件

| 文件 | 职责 | 操作 |
|------|------|------|
| `src/routes/admin-aesthetic-library-routes.test.ts` | API 端点集成测试 | 创建 |

---

## 任务 1：扩展 TikHub 关键词配置（成人分类）

**文件：**
- 修改：`src/modules/aesthetic-library-update-service.ts:60-109`

- [ ] **步骤 1：添加成人关键词配置**

在 `AestheticLibraryUpdateService` 类中扩展 `TIKHUB_KEYWORDS_CONFIG`，添加成人分类配置：

```typescript
// 在现有 CHILD_CONFIG 后添加 ADULT_CONFIG
const ADULT_CONFIG = {
  xiaohongshuKeywords: [
    "成人穿搭",
    "时尚博主",
    "成人发型",
    "模特脸型",
    "成人化妆",
    "明星脸型",
    "时尚达人"
  ],
  instagramHashtags: [
    "#adultfashion",
    "#fashionblogger",
    "#modelface",
    "#adultmakeup",
    "#celebritystyle",
    "#fashionista"
  ]
};

// 扩展配置映射
const TIKHUB_KEYWORDS_CONFIG = {
  child_6_12: CHILD_CONFIG,
  adult_18_30: ADULT_CONFIG  // 新增成人配置
};
```

- [ ] **步骤 2：扩展特征分类映射**

在同一个文件中添加成人特征分类到 TikHub 搜索关键词的映射：

```typescript
// 成人特征分类关键词映射
const ADULT_FEATURE_KEYWORDS = {
  jawline_definition: {
    xiaohongshu: ["下颌线", "瓜子脸", "V脸", "下颌角"],
    instagram: ["#jawline", "#vshapeface", "#definedjaw"]
  },
  cheekbone_prominence: {
    xiaohongshu: ["颧骨", "高颧骨", "苹果肌"],
    instagram: ["#cheekbones", "#highcheekbones"]
  },
  lip_fullness: {
    xiaohongshu: ["唇形", "丰满嘴唇", "M唇", "嘟嘟唇"],
    instagram: ["#fulllips", "#mplips", "#lipshape"]
  },
  eyebrow_shape: {
    xiaohongshu: ["眉形", "眉毛", "眉弓", "剑眉"],
    instagram: ["#eyebrowshape", "#brows", "#archedbrows"]
  }
};
```

- [ ] **步骤 3：修改 updateLibrary 方法支持年龄范围参数**

```typescript
async updateLibrary(params: {
  ageRange: 'child_6-12' | 'adult_18-30';
  featureCategories?: string[];
}): Promise<{ updated: number; added: number }> {
  const config = TIKHUB_KEYWORDS_CONFIG[params.ageRange.replace('-', '_')];
  
  if (!config) {
    throw new AppError(400, 'INVALID_AGE_RANGE', `不支持的年龄范围: ${params.ageRange}`);
  }
  
  // 使用配置执行 TikHub 爬取 + LLM 分析
  // ... 现有逻辑复用
}
```

- [ ] **步骤 4：验证类型一致性**

运行 TypeScript 编译确认无类型错误：

```bash
npm run build
```

预期：PASS，无类型错误

- [ ] **步骤 5：Commit**

```bash
git add src/modules/aesthetic-library-update-service.ts
git commit -m "feat: 扩展 TikHub 关键词配置支持成人分类"
```

---

## 任务 2：添加数据库索引（age_range 字段）

**文件：**
- 数据库直接操作（不创建迁移文件）

- [ ] **步骤 1：创建索引**

连接数据库执行：

```sql
-- 为 age_range 字段创建索引，优化按年龄分类查询
CREATE INDEX IF NOT EXISTS idx_aesthetic_library_age_range 
ON nrm_aesthetic_feature_library (age_range);

-- 为 age_range + feature_category 组合创建索引，优化后台管理查询
CREATE INDEX IF NOT EXISTS idx_aesthetic_library_age_category 
ON nrm_aesthetic_feature_library (age_range, feature_category);

-- 添加索引注释
COMMENT ON INDEX idx_aesthetic_library_age_range IS '优化按年龄范围筛选审美特征';
COMMENT ON INDEX idx_aesthetic_library_age_category IS '优化后台管理按年龄+分类组合查询';
```

- [ ] **步骤 2：验证索引创建**

```sql
-- 查询索引确认创建成功
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'nrm_aesthetic_feature_library';
```

预期：显示新创建的两个索引

- [ ] **步骤 3：验证查询性能**

```sql
-- 测试查询性能
EXPLAIN ANALYZE 
SELECT * FROM nrm_aesthetic_feature_library 
WHERE age_range = 'adult_18-30';
```

预期：使用索引扫描，执行时间 < 10ms

---

## 任务 3：创建后台管理 API 路由

**文件：**
- 创建：`src/routes/admin-aesthetic-library-routes.ts`
- 创建：`src/modules/admin-aesthetic-library-service.ts`
- 修改：`src/app-setup/setup-routes.ts`

- [ ] **步骤 1：编写失败的测试（统计接口）**

创建测试文件 `src/routes/admin-aesthetic-library-routes.test.ts`：

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('Admin Aesthetic Library Routes', () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildApp();
    // 使用测试管理员 token
    adminToken = process.env.ADMIN_TEST_TOKEN || 'test-admin-token';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /neirongmiao/api/admin/aesthetic-library/statistics', () => {
    it('should return statistics for admin user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/neirongmiao/api/admin/aesthetic-library/statistics',
        headers: {
          authorization: `Bearer ${adminToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('totalCount');
      expect(body).toHaveProperty('childCount');
      expect(body).toHaveProperty('adultCount');
      expect(body).toHaveProperty('categoryDistribution');
    });

    it('should reject non-admin user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/neirongmiao/api/admin/aesthetic-library/statistics',
        headers: {
          authorization: `Bearer invalid-token`
        }
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npm test src/routes/admin-aesthetic-library-routes.test.ts
```

预期：FAIL，报错 "route not found"

- [ ] **步骤 3：创建业务逻辑服务**

创建 `src/modules/admin-aesthetic-library-service.ts`：

```typescript
import type { AppContext } from '@/core/app-context.js';
import type { PoolClient } from 'pg';

/**
 * 审美特征库后台管理服务
 */
export class AdminAestheticLibraryService {
  constructor(private ctx: AppContext) {}

  /**
   * 获取统计数据
   */
  async getStatistics(db: PoolClient): Promise<{
    totalCount: number;
    childCount: number;
    adultCount: number;
    categoryDistribution: Record<string, number>;
    recentUpdates: number;
  }> {
    // 总数统计
    const totalResult = await db.query(`
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE age_range = 'child_6-12') as child,
             COUNT(*) FILTER (WHERE age_range = 'adult_18-30') as adult
      FROM nrm_aesthetic_feature_library
      WHERE deleted_at IS NULL
    `);

    // 分类分布统计
    const categoryResult = await db.query(`
      SELECT feature_category, COUNT(*) as count
      FROM nrm_aesthetic_feature_library
      WHERE deleted_at IS NULL
      GROUP BY feature_category
    `);

    // 近7天更新数
    const recentResult = await db.query(`
      SELECT COUNT(*) as recent
      FROM nrm_aesthetic_feature_library
      WHERE deleted_at IS NULL
        AND updated_at > NOW() - INTERVAL '7 days'
    `);

    const categoryDistribution: Record<string, number> = {};
    for (const row of categoryResult.rows) {
      categoryDistribution[row.feature_category] = row.count;
    }

    return {
      totalCount: totalResult.rows[0].total,
      childCount: totalResult.rows[0].child,
      adultCount: totalResult.rows[0].adult,
      categoryDistribution,
      recentUpdates: recentResult.rows[0].recent
    };
  }

  /**
   * 获取特征列表（分页）
   */
  async listFeatures(
    db: PoolClient,
    params: {
      ageRange?: 'child_6-12' | 'adult_18-30';
      featureCategory?: string;
      page: number;
      limit: number;
    }
  ): Promise<{
    items: Array<{
      id: string;
      featureCategory: string;
      featureName: string;
      featureDescription: string;
      ethnicityApplicable: string[];
      ageRange: string;
      popularityScore: number;
      source: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const offset = (params.page - 1) * params.limit;
    
    let whereClause = 'WHERE deleted_at IS NULL';
    const queryParams: any[] = [];
    
    if (params.ageRange) {
      queryParams.push(params.ageRange);
      whereClause += ` AND age_range = $${queryParams.length}`;
    }
    
    if (params.featureCategory) {
      queryParams.push(params.featureCategory);
      whereClause += ` AND feature_category = $${queryParams.length}`;
    }

    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM nrm_aesthetic_feature_library
      ${whereClause}
    `, queryParams);

    const listResult = await db.query(`
      SELECT id, feature_category, feature_name, feature_description,
             ethnicity_applicable, age_range, popularity_score, source,
             created_at, updated_at
      FROM nrm_aesthetic_feature_library
      ${whereClause}
      ORDER BY popularity_score DESC, created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `, [...queryParams, params.limit, offset]);

    return {
      items: listResult.rows.map(row => ({
        id: row.id,
        featureCategory: row.feature_category,
        featureName: row.feature_name,
        featureDescription: row.feature_description,
        ethnicityApplicable: row.ethnicity_applicable,
        ageRange: row.age_range,
        popularityScore: row.popularity_score,
        source: row.source,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      total: countResult.rows[0].total,
      page: params.page,
      limit: params.limit
    };
  }

  /**
   * 添加新特征
   */
  async addFeature(
    db: PoolClient,
    data: {
      featureCategory: string;
      featureName: string;
      featureDescription: string;
      ethnicityApplicable: string[];
      ageRange: 'child_6-12' | 'adult_18-30';
    }
  ): Promise<{ id: string }> {
    const result = await db.query(`
      INSERT INTO nrm_aesthetic_feature_library (
        feature_category, feature_name, feature_description,
        ethnicity_applicable, age_range, source, popularity_score
      ) VALUES ($1, $2, $3, $4, $5, 'manual', 0)
      RETURNING id
    `, [
      data.featureCategory,
      data.featureName,
      data.featureDescription,
      data.ethnicityApplicable,
      data.ageRange
    ]);

    return { id: result.rows[0].id };
  }

  /**
   * 编辑特征
   */
  async editFeature(
    db: PoolClient,
    id: string,
    data: Partial<{
      featureName: string;
      featureDescription: string;
      ethnicityApplicable: string[];
      popularityScore: number;
    }>
  ): Promise<{ success: boolean }> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.featureName) {
      updates.push(`feature_name = $${paramIndex++}`);
      values.push(data.featureName);
    }
    if (data.featureDescription) {
      updates.push(`feature_description = $${paramIndex++}`);
      values.push(data.featureDescription);
    }
    if (data.ethnicityApplicable) {
      updates.push(`ethnicity_applicable = $${paramIndex++}`);
      values.push(data.ethnicityApplicable);
    }
    if (data.popularityScore !== undefined) {
      updates.push(`popularity_score = $${paramIndex++}`);
      values.push(data.popularityScore);
    }

    if (updates.length === 0) {
      return { success: false };
    }

    values.push(id);
    await db.query(`
      UPDATE nrm_aesthetic_feature_library
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex} AND deleted_at IS NULL
    `, values);

    return { success: true };
  }

  /**
   * 删除特征（软删除）
   */
  async deleteFeature(db: PoolClient, id: string): Promise<{ success: boolean }> {
    await db.query(`
      UPDATE nrm_aesthetic_feature_library
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `, [id]);

    return { success: true };
  }

  /**
   * 获取热度排行
   */
  async getPopularityRanking(
    db: PoolClient,
    params: {
      ageRange?: 'child_6-12' | 'adult_18-30';
      limit: number;
    }
  ): Promise<Array<{
    id: string;
    featureName: string;
    popularityScore: number;
    trendPeriod: string;
  }>> {
    let whereClause = 'WHERE deleted_at IS NULL';
    const queryParams: any[] = [];

    if (params.ageRange) {
      queryParams.push(params.ageRange);
      whereClause += ` AND age_range = $${queryParams.length}`;
    }

    const result = await db.query(`
      SELECT id, feature_name, popularity_score, trend_period
      FROM nrm_aesthetic_feature_library
      ${whereClause}
      ORDER BY popularity_score DESC
      LIMIT $${queryParams.length + 1}
    `, [...queryParams, params.limit]);

    return result.rows.map(row => ({
      id: row.id,
      featureName: row.feature_name,
      popularityScore: row.popularity_score,
      trendPeriod: row.trend_period
    }));
  }
}
```

- [ ] **步骤 4：创建 API 路由**

创建 `src/routes/admin-aesthetic-library-routes.ts`：

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '@/core/app-context.js';
import { requireAdmin } from '@/services/auth/route-guards.js';
import { AdminAestheticLibraryService } from '@/modules/admin-aesthetic-library-service.js';
import { z } from 'zod';

/**
 * 注册审美特征库后台管理路由
 */
export async function registerAdminAestheticLibraryRoutes(
  app: FastifyInstance,
  ctx: AppContext
): void {
  const service = new AdminAestheticLibraryService(ctx);

  // 统计接口
  app.get('/neirongmiao/api/admin/aesthetic-library/statistics', {
    schema: {
      response: {
        200: z.object({
          totalCount: z.number(),
          childCount: z.number(),
          adultCount: z.number(),
          categoryDistribution: z.record(z.number()),
          recentUpdates: z.number()
        })
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requireAdmin(ctx, request);
    const stats = await ctx.repos.withTransaction(db => service.getStatistics(db));
    return reply.send(stats);
  });

  // 特征列表（分页）
  app.get('/neirongmiao/api/admin/aesthetic-library/features', {
    schema: {
      querystring: z.object({
        ageRange: z.enum(['child_6-12', 'adult_18-30']).optional(),
        featureCategory: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20)
      })
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requireAdmin(ctx, request);
    const query = request.query as any;
    const result = await ctx.repos.withTransaction(db => 
      service.listFeatures(db, {
        ageRange: query.ageRange,
        featureCategory: query.featureCategory,
        page: query.page,
        limit: query.limit
      })
    );
    return reply.send(result);
  });

  // 添加特征
  app.post('/neirongmiao/api/admin/aesthetic-library/features', {
    schema: {
      body: z.object({
        featureCategory: z.string(),
        featureName: z.string(),
        featureDescription: z.string(),
        ethnicityApplicable: z.array(z.string()),
        ageRange: z.enum(['child_6-12', 'adult_18-30'])
      })
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requireAdmin(ctx, request);
    const body = request.body as any;
    const result = await ctx.repos.withTransaction(db => service.addFeature(db, body));
    return reply.send(result);
  });

  // 编辑特征
  app.patch('/neirongmiao/api/admin/aesthetic-library/features/:id', {
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        featureName: z.string().optional(),
        featureDescription: z.string().optional(),
        ethnicityApplicable: z.array(z.string()).optional(),
        popularityScore: z.number().min(0).max(100).optional()
      })
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as any;
    const body = request.body as any;
    const result = await ctx.repos.withTransaction(db => 
      service.editFeature(db, params.id, body)
    );
    return reply.send(result);
  });

  // 删除特征
  app.delete('/neirongmiao/api/admin/aesthetic-library/features/:id', {
    schema: {
      params: z.object({ id: z.string().uuid() })
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as any;
    const result = await ctx.repos.withTransaction(db => service.deleteFeature(db, params.id));
    return reply.send(result);
  });

  // 热度排行
  app.get('/neirongmiao/api/admin/aesthetic-library/ranking', {
    schema: {
      querystring: z.object({
        ageRange: z.enum(['child_6-12', 'adult_18-30']).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(10)
      })
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await requireAdmin(ctx, request);
    const query = request.query as any;
    const result = await ctx.repos.withTransaction(db => 
      service.getPopularityRanking(db, {
        ageRange: query.ageRange,
        limit: query.limit
      })
    );
    return reply.send(result);
  });
}
```

- [ ] **步骤 5：注册路由**

修改 `src/app-setup/setup-routes.ts`，添加导入和注册：

```typescript
// 在文件顶部添加导入
import { registerAdminAestheticLibraryRoutes } from '../routes/admin-aesthetic-library-routes.js';

// 在 app.register(async (apiApp) => { ... }) 块内添加
registerAdminAestheticLibraryRoutes(apiApp, ctx);
```

- [ ] **步骤 6：运行测试验证通过**

```bash
npm test src/routes/admin-aesthetic-library-routes.test.ts
```

预期：PASS

- [ ] **步骤 7：验证 API 可访问**

启动服务后测试：

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3020/neirongmiao/api/admin/aesthetic-library/statistics
```

预期：返回统计数据 JSON

- [ ] **步骤 8：Commit**

```bash
git add src/routes/admin-aesthetic-library-routes.ts \
        src/modules/admin-aesthetic-library-service.ts \
        src/app-setup/setup-routes.ts \
        src/routes/admin-aesthetic-library-routes.test.ts
git commit -m "feat: 审美特征库后台管理 API（统计、CRUD、排行）"
```

---

## 任务 4：创建前端管理页面

**文件：**
- 创建：`apps/web/services/realApi/admin-aesthetic-library.ts`
- 创建：`apps/web/pages/admin/AestheticLibraryManagement.tsx`

- [ ] **步骤 1：创建 API 调用封装**

创建 `apps/web/services/realApi/admin-aesthetic-library.ts`：

```typescript
import { getApiUrl } from '../config';
import { useAppStore } from '../store/useAppStore';

/**
 * 获取统计数据
 */
export async function fetchStatistics(token: string) {
  const response = await fetch(
    `${getApiUrl()}/admin/aesthetic-library/statistics`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  if (!response.ok) throw new Error('获取统计失败');
  return response.json();
}

/**
 * 获取特征列表
 */
export async function fetchFeatures(
  token: string,
  params: {
    ageRange?: 'child_6-12' | 'adult_18-30';
    featureCategory?: string;
    page?: number;
    limit?: number;
  }
) {
  const query = new URLSearchParams();
  if (params.ageRange) query.set('ageRange', params.ageRange);
  if (params.featureCategory) query.set('featureCategory', params.featureCategory);
  query.set('page', String(params.page || 1));
  query.set('limit', String(params.limit || 20));

  const response = await fetch(
    `${getApiUrl()}/admin/aesthetic-library/features?${query}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  if (!response.ok) throw new Error('获取列表失败');
  return response.json();
}

/**
 * 添加特征
 */
export async function addFeature(
  token: string,
  data: {
    featureCategory: string;
    featureName: string;
    featureDescription: string;
    ethnicityApplicable: string[];
    ageRange: 'child_6-12' | 'adult_18-30';
  }
) {
  const response = await fetch(
    `${getApiUrl()}/admin/aesthetic-library/features`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }
  );
  if (!response.ok) throw new Error('添加失败');
  return response.json();
}

/**
 * 编辑特征
 */
export async function editFeature(
  token: string,
  id: string,
  data: Partial<{
    featureName: string;
    featureDescription: string;
    ethnicityApplicable: string[];
    popularityScore: number;
  }>
) {
  const response = await fetch(
    `${getApiUrl()}/admin/aesthetic-library/features/${id}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }
  );
  if (!response.ok) throw new Error('编辑失败');
  return response.json();
}

/**
 * 删除特征
 */
export async function deleteFeature(token: string, id: string) {
  const response = await fetch(
    `${getApiUrl()}/admin/aesthetic-library/features/${id}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  if (!response.ok) throw new Error('删除失败');
  return response.json();
}

/**
 * 获取热度排行
 */
export async function fetchRanking(
  token: string,
  params: {
    ageRange?: 'child_6-12' | 'adult_18-30';
    limit?: number;
  }
) {
  const query = new URLSearchParams();
  if (params.ageRange) query.set('ageRange', params.ageRange);
  query.set('limit', String(params.limit || 10));

  const response = await fetch(
    `${getApiUrl()}/admin/aesthetic-library/ranking?${query}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  if (!response.ok) throw new Error('获取排行失败');
  return response.json();
}
```

- [ ] **步骤 2：创建管理页面组件**

创建 `apps/web/pages/admin/AestheticLibraryManagement.tsx`：

```typescript
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import {
  fetchStatistics,
  fetchFeatures,
  addFeature,
  editFeature,
  deleteFeature,
  fetchRanking
} from '../../services/realApi/admin-aesthetic-library';

type AgeRange = 'child_6-12' | 'adult_18-30';

export default function AestheticLibraryManagement() {
  const { token, currentUser } = useAppStore();
  const queryClient = useQueryClient();

  // 管理员权限检查
  if (!currentUser || currentUser.role !== 'admin') {
    return <div className="p-8 text-center">需要管理员权限</div>;
  }

  // 状态管理
  const [activeTab, setActiveTab] = useState<'statistics' | 'list' | 'add' | 'ranking'>('statistics');
  const [ageRangeFilter, setAgeRangeFilter] = useState<AgeRange | ''>('');
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 统计数据 Query
  const statsQuery = useQuery({
    queryKey: ['aesthetic-stats'],
    queryFn: () => fetchStatistics(token!),
    staleTime: 60000
  });

  // 特征列表 Query
  const featuresQuery = useQuery({
    queryKey: ['aesthetic-features', ageRangeFilter, page],
    queryFn: () => fetchFeatures(token!, {
      ageRange: ageRangeFilter || undefined,
      page,
      limit: 20
    }),
    staleTime: 30000
  });

  // 热度排行 Query
  const rankingQuery = useQuery({
    queryKey: ['aesthetic-ranking', ageRangeFilter],
    queryFn: () => fetchRanking(token!, {
      ageRange: ageRangeFilter || undefined,
      limit: 10
    }),
    staleTime: 60000
  });

  // 添加 Mutation
  const addMutation = useMutation({
    mutationFn: (data: any) => addFeature(token!, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['aesthetic-features']);
      queryClient.invalidateQueries(['aesthetic-stats']);
      setActiveTab('list');
    }
  });

  // 编辑 Mutation
  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => editFeature(token!, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['aesthetic-features']);
      setEditingId(null);
    }
  });

  // 删除 Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFeature(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries(['aesthetic-features']);
      queryClient.invalidateQueries(['aesthetic-stats']);
    }
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">审美特征库管理</h1>

        {/* 年龄范围筛选 */}
        <div className="mb-4">
          <select
            value={ageRangeFilter}
            onChange={(e) => setAgeRangeFilter(e.target.value as AgeRange | '')}
            className="border rounded px-3 py-2"
          >
            <option value="">全部年龄范围</option>
            <option value="child_6-12">儿童 (6-12岁)</option>
            <option value="adult_18-30">成人 (18-30岁)</option>
          </select>
        </div>

        {/* 标签页切换 */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('statistics')}
            className={`px-4 py-2 rounded ${activeTab === 'statistics' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            统计概览
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded ${activeTab === 'list' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            特征列表
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`px-4 py-2 rounded ${activeTab === 'add' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            添加特征
          </button>
          <button
            onClick={() => setActiveTab('ranking')}
            className={`px-4 py-2 rounded ${activeTab === 'ranking' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            热度排行
          </button>
        </div>

        {/* 统计概览 */}
        {activeTab === 'statistics' && statsQuery.data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded shadow">
              <div className="text-gray-500 text-sm">总数</div>
              <div className="text-2xl font-bold">{statsQuery.data.totalCount}</div>
            </div>
            <div className="bg-white p-4 rounded shadow">
              <div className="text-gray-500 text-sm">儿童特征</div>
              <div className="text-2xl font-bold">{statsQuery.data.childCount}</div>
            </div>
            <div className="bg-white p-4 rounded shadow">
              <div className="text-gray-500 text-sm">成人特征</div>
              <div className="text-2xl font-bold">{statsQuery.data.adultCount}</div>
            </div>
            <div className="bg-white p-4 rounded shadow">
              <div className="text-gray-500 text-sm">近7天更新</div>
              <div className="text-2xl font-bold">{statsQuery.data.recentUpdates}</div>
            </div>
          </div>
        )}

        {/* 特征列表 */}
        {activeTab === 'list' && featuresQuery.data && (
          <div className="bg-white rounded shadow">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">特征名称</th>
                  <th className="px-4 py-2 text-left">分类</th>
                  <th className="px-4 py-2 text-left">年龄范围</th>
                  <th className="px-4 py-2 text-left">热度</th>
                  <th className="px-4 py-2 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {featuresQuery.data.items.map((feature: any) => (
                  <tr key={feature.id} className="border-t">
                    <td className="px-4 py-2">{feature.featureName}</td>
                    <td className="px-4 py-2">{feature.featureCategory}</td>
                    <td className="px-4 py-2">{feature.ageRange}</td>
                    <td className="px-4 py-2">{feature.popularityScore}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => setEditingId(feature.id)}
                        className="text-blue-500 hover:underline mr-2"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(feature.id)}
                        className="text-red-500 hover:underline"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 分页 */}
            <div className="p-4 flex justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                上一页
              </button>
              <span className="px-3 py-1">第 {page} 页</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={featuresQuery.data.items.length < 20}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}

        {/* 添加特征 */}
        {activeTab === 'add' && (
          <div className="bg-white p-6 rounded shadow">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                addMutation.mutate({
                  featureCategory: formData.get('category'),
                  featureName: formData.get('name'),
                  featureDescription: formData.get('description'),
                  ethnicityApplicable: formData.get('ethnicity')?.split(',').map(s => s.trim()),
                  ageRange: formData.get('ageRange')
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1">特征分类</label>
                <input name="category" className="w-full border rounded px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">特征名称</label>
                <input name="name" className="w-full border rounded px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">描述</label>
                <textarea name="description" className="w-full border rounded px-3 py-2" rows={3} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">适用种族（逗号分隔）</label>
                <input name="ethnicity" className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">年龄范围</label>
                <select name="ageRange" className="w-full border rounded px-3 py-2" required>
                  <option value="child_6-12">儿童 (6-12岁)</option>
                  <option value="adult_18-30">成人 (18-30岁)</option>
                </select>
              </div>
              <button
                type="submit"
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                disabled={addMutation.isPending}
              >
                {addMutation.isPending ? '添加中...' : '添加'}
              </button>
            </form>
          </div>
        )}

        {/* 热度排行 */}
        {activeTab === 'ranking' && rankingQuery.data && (
          <div className="bg-white rounded shadow">
            <div className="p-4 border-b font-medium">热度排行 TOP 10</div>
            <ul>
              {rankingQuery.data.map((item: any, index: number) => (
                <li key={item.id} className="p-4 border-t flex justify-between">
                  <div>
                    <span className="font-bold mr-2">#{index + 1}</span>
                    {item.featureName}
                  </div>
                  <div className="text-gray-500">热度: {item.popularityScore}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **步骤 3：添加路由**

修改 `apps/web/App.tsx`，添加路由：

```typescript
// 在 AdminRoute 块内添加
<Route path="/admin/aesthetic-library" element={<AestheticLibraryManagement />} />
```

- [ ] **步骤 4：验证页面可访问**

启动前端开发服务：

```bash
npm --prefix apps/web run dev
```

浏览器访问 `http://localhost:3000/admin/aesthetic-library`，确认：
- 页面正常渲染
- 统计数据显示
- 列表分页工作
- 添加功能正常

- [ ] **步骤 5：Commit**

```bash
git add apps/web/pages/admin/AestheticLibraryManagement.tsx \
        apps/web/services/realApi/admin-aesthetic-library.ts \
        apps/web/App.tsx
git commit -m "feat: 审美特征库后台管理页面（统计、列表、添加、排行）"
```

---

## 任务 5：扩展测试覆盖

**文件：**
- 修改：`src/routes/admin-aesthetic-library-routes.test.ts`

- [ ] **步骤 1：添加完整 API 测试**

扩展测试文件，覆盖所有端点：

```typescript
// 在现有测试文件中添加

describe('POST /neirongmiao/api/admin/aesthetic-library/features', () => {
  it('should add new feature for admin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/neirongmiao/api/admin/aesthetic-library/features',
      headers: { authorization: `Bearer ${adminToken}` },
      body: {
        featureCategory: 'jawline_definition',
        featureName: '清晰下颌线',
        featureDescription: '轮廓分明的下颌线条',
        ethnicityApplicable: ['asian', 'western'],
        ageRange: 'adult_18-30'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('id');
  });
});

describe('PATCH /neirongmiao/api/admin/aesthetic-library/features/:id', () => {
  it('should edit feature for admin', async () => {
    // 先添加一个特征
    const addResponse = await app.inject({
      method: 'POST',
      url: '/neirongmiao/api/admin/aesthetic-library/features',
      headers: { authorization: `Bearer ${adminToken}` },
      body: {
        featureCategory: 'test_category',
        featureName: '测试特征',
        featureDescription: '测试描述',
        ethnicityApplicable: [],
        ageRange: 'child_6-12'
      }
    });
    const featureId = JSON.parse(addResponse.body).id;

    // 编辑特征
    const editResponse = await app.inject({
      method: 'PATCH',
      url: `/neirongmiao/api/admin/aesthetic-library/features/${featureId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      body: { featureName: '更新后的名称' }
    });

    expect(editResponse.statusCode).toBe(200);
  });
});

describe('DELETE /neirongmiao/api/admin/aesthetic-library/features/:id', () => {
  it('should soft delete feature for admin', async () => {
    // 先添加一个特征
    const addResponse = await app.inject({
      method: 'POST',
      url: '/neirongmiao/api/admin/aesthetic-library/features',
      headers: { authorization: `Bearer ${adminToken}` },
      body: {
        featureCategory: 'test_delete',
        featureName: '待删除特征',
        featureDescription: '将被删除',
        ethnicityApplicable: [],
        ageRange: 'adult_18-30'
      }
    });
    const featureId = JSON.parse(addResponse.body).id;

    // 删除特征
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/neirongmiao/api/admin/aesthetic-library/features/${featureId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });

    expect(deleteResponse.statusCode).toBe(200);
  });
});

describe('GET /neirongmiao/api/admin/aesthetic-library/ranking', () => {
  it('should return popularity ranking', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/neirongmiao/api/admin/aesthetic-library/ranking',
      headers: { authorization: `Bearer ${adminToken}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
  });
});
```

- [ ] **步骤 2：运行测试验证覆盖**

```bash
npm test src/routes/admin-aesthetic-library-routes.test.ts --coverage
```

预期：所有测试 PASS，覆盖率 > 80%

- [ ] **步骤 3：Commit**

```bash
git add src/routes/admin-aesthetic-library-routes.test.ts
git commit -m "test: 完善后台管理 API 测试覆盖"
```

---

## 自检

### 1. 规格覆盖度

对照设计文档 `docs/superpowers/specs/2026-04-24-aesthetic-library-extension-design.md`：

| 规格需求 | 任务覆盖 |
|----------|----------|
| 成人分类 TikHub 关键词 | ✅ 任务 1 |
| 数据库索引优化 | ✅ 任务 2 |
| 后台统计 API | ✅ 任务 3 |
| 后台列表 API | ✅ 任务 3 |
| 后台添加 API | ✅ 任务 3 |
| 后台编辑 API | ✅ 任务 3 |
| 后台删除 API | ✅ 任务 3 |
| 后台排行 API | ✅ 任务 3 |
| 前端统计模块 | ✅ 任务 4 |
| 前端列表模块 | ✅ 任务 4 |
| 前端添加模块 | ✅ 任务 4 |
| 前端排行模块 | ✅ 任务 4 |
| API 测试覆盖 | ✅ 任务 5 |

**遗漏检查：** 无遗漏

### 2. 占位符扫描

检查计划中的禁止模式：
- ❌ "待定" / "TODO" - 无发现
- ❌ "后续实现" - 无发现
- ❌ "添加适当错误处理" - 无发现（错误处理已在代码中体现）
- ❌ "类似任务 N" - 无发现
- ✅ 所有步骤都有具体代码或命令

### 3. 类型一致性

检查任务间类型定义：
- 任务 1 定义 `AgeRange = 'child_6-12' | 'adult_18-30'`
- 任务 3 使用相同枚举值
- 任务 4 使用相同枚举值
- ✅ 类型命名一致：`ageRange`（camelCase）
- ✅ API 字段名一致：`featureCategory`, `featureName`, `popularityScore`

---

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-04-24-aesthetic-library-extension.md`。

**两种执行方式：**

**1. 子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**