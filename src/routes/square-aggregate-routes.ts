/**
 * 广场聚合路由
 * 提供行为追踪和聚合查询 API（仅模板数据）
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";
import { requireUser } from "../services/auth/route-guards.js";
import { SquareBehaviorService, type ItemType, type BehaviorType } from "../service/square-behavior-service.js";
import { SquareAggregateService } from "../service/square-aggregate-service.js";
import type { SquarePublishCategory } from "../contracts/square-publish-category.js";
import { getLogger } from "../core/logger/index.js";
const log = getLogger("square-aggregate-routes");
import {
  SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS,
} from "../contracts/square-publish-category.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 行为追踪请求体 */
interface TrackBehaviorRequestBody {
  itemId: string;
  itemType: ItemType;
  itemCategory: string;
  behaviorType: BehaviorType;
  sessionId?: string;
}

/** 行为追踪响应 */
interface TrackBehaviorResponse {
  success: boolean;
}

/** 聚合查询请求参数 */
interface AggregateQueryParams {
  category?: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
}

/** 聚合查询响应 */
interface AggregateQueryResponse {
  success: boolean;
  data: Array<{
    id: string;
    title: string;
    coverUrl: string;
    videoUrl: string | null;
    category: string;
    sourceType: "template";
    sourceLabel: string;
    author: string | null;
    views: number;
    likes: number;
    createdAt: number;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// 路由注册
// ============================================================================

/**
 * 注册广场聚合路由
 */
export function registerSquareAggregateRoutes(app: FastifyInstance, ctx: AppContext): void {
  // 创建服务实例
  const behaviorService = new SquareBehaviorService(ctx.pool);
  const aggregateService = new SquareAggregateService(ctx.repos.squareTemplates);

  // ============================================================================
  // POST /square/track-behavior - 行为追踪
  // ============================================================================

  app.post<{ Body: TrackBehaviorRequestBody; Reply: TrackBehaviorResponse }>(
    "/square/track-behavior",
    async (request, reply) => {
      // 需要用户登录
      const user = await requireUser(ctx, request);
      const body = request.body;

      // 参数校验
      if (!body.itemId || !body.itemType || !body.itemCategory || !body.behaviorType) {
        return reply.code(400).send({ success: false });
      }

      // 验证 itemType（仅支持 template）
      if (body.itemType !== "template") {
        return reply.code(400).send({ success: false });
      }

      // 验证 behaviorType
      const validBehaviorTypes: BehaviorType[] = ["view", "click"];
      if (!validBehaviorTypes.includes(body.behaviorType)) {
        return reply.code(400).send({ success: false });
      }

      // 记录行为
      const result = await behaviorService.trackBehavior({
        userId: user.id,
        itemId: body.itemId,
        itemType: body.itemType,
        itemCategory: body.itemCategory as SquarePublishCategory,
        behaviorType: body.behaviorType,
        sessionId: body.sessionId,
      });

      return reply.send({ success: result.success });
    }
  );

  // ============================================================================
  // GET /square/aggregate - 聚合查询（仅模板）
  // ============================================================================

  app.get<{ Querystring: AggregateQueryParams; Reply: AggregateQueryResponse }>(
    "/square/aggregate",
    async (request, reply) => {
      // 解析查询参数
      const query = request.query;
      const page = Math.max(1, query.page || 1);
      const pageSize = Math.min(50, Math.max(1, query.pageSize || 20));
      const category = query.category?.trim() || undefined;
      const keyword = query.keyword?.trim() || undefined;

      // 验证 category 参数，使用 SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS
      if (category) {
        const validFilters = SQUARE_PUBLISH_CATEGORY_FILTER_OPTIONS as readonly string[];
        if (!validFilters.includes(category)) {
          return reply.code(400).send({
            success: false,
            data: [],
            pagination: { page, pageSize, total: 0, totalPages: 0 },
          });
        }
      }

      // 执行聚合查询（仅模板）
      try {
        const result = await aggregateService.aggregate({
          category,
          keyword,
          page,
          pageSize,
        });

        return reply.send({
          success: true,
          data: result.data,
          pagination: {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
            totalPages: result.totalPages,
          },
        });
      } catch (error) {
        log.error({ err: error }, "square/aggregate 查询失败");
        return reply.code(500).send({
          success: false,
          data: [],
          pagination: { page, pageSize, total: 0, totalPages: 0 },
        });
      }
    }
  );
}
