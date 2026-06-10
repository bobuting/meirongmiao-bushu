/**
 * 日志管理后台路由
 * 整合错误日志、LLM调用审计、操作审计的查询与导出
 */
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";
import type { ErrorSeverity } from "../../contracts/error-log-contract.js";
import { requireAdmin } from "../../services/auth/route-guards.js";

/** 统一查询参数类型 */
interface LogsQueryParams {
  page?: number;
  pageSize?: number;
  startDate?: number;
  endDate?: number;
  keyword?: string;
  severity?: ErrorSeverity;
  errorCode?: string;
  provider?: string;
  userId?: string;
  projectId?: string;
}

/** 导出请求体类型 */
interface LogsExportRequest {
  type: "error" | "llm" | "audit";
  filters: LogsQueryParams;
  format: "csv" | "json";
}

/** snake_case → camelCase 字段映射 */
const CALL_AUDIT_KEYS: Record<string, string> = {
  id: "id",
  provider_id: "providerId",
  route_key: "routeKey",
  status: "status",
  latency_ms: "latencyMs",
  cost: "cost",
  created_at: "createdAt",
  error_message: "errorMessage",
  actual_model: "actualModel",
  provider_vendor: "providerVendor",
  input_tokens: "inputTokens",
  output_tokens: "outputTokens",
  project_id: "projectId",
  messages_json: "messagesJson",
  call_mode: "callMode",
  call_context: "callContext",
};

/** 将 snake_case 行转换为 camelCase */
function mapCallAuditRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [snakeKey, camelKey] of Object.entries(CALL_AUDIT_KEYS)) {
    if (snakeKey in row) {
      result[camelKey] = row[snakeKey];
    }
  }
  return result;
}

/** 注册日志管理路由 */
export async function registerLogsRoutes(
  app: FastifyInstance,
  ctx: AppContext
): Promise<void> {
  // ---- 错误日志详情 ----
  app.get("/admin/error-logs/:id", async (request, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params as { id: string };
    const log = await ctx.repos.errorLogs.findById(id);
    if (!log) {
      return reply.code(404).send({ error: "日志不存在" });
    }
    reply.send(log);
  });

  // ---- LLM 调用审计列表 ----
  app.get("/admin/call-audits", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as LogsQueryParams;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const { items, total } = await ctx.repos.providerCallAudits.findPaginated(
      { startDate: query.startDate, endDate: query.endDate, provider: query.provider, projectId: query.projectId },
      page,
      pageSize,
    );

    reply.send({
      items: items.map(mapCallAuditRow),
      total,
      page,
      pageSize,
    });
  });

  // ---- LLM 调用审计统计 ----
  app.get("/admin/call-audits/stats", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as { startDate?: number; endDate?: number; projectId?: string };

    const stats = await ctx.repos.providerCallAudits.findStats({
      startDate: query.startDate,
      endDate: query.endDate,
      projectId: query.projectId,
    });

    reply.send(stats);
  });

  // ---- LLM 调用审计详情 ----
  app.get("/admin/call-audits/:id", async (request, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params as { id: string };
    const audit = await ctx.auditStore.findCallAudit(id);
    if (!audit) {
      return reply.code(404).send({ error: "审计记录不存在" });
    }
    reply.send(audit);
  });

  // ---- 操作审计日志列表 ----
  app.get("/admin/audit-logs", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as LogsQueryParams;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const { items, total } = await ctx.repos.auditLogs.findPaginated(
      { startDate: query.startDate, endDate: query.endDate, userId: query.userId, keyword: query.keyword },
      page,
      pageSize,
    );

    reply.send({ items, total, page, pageSize });
  });

  // ---- 操作审计日志详情 ----
  app.get("/admin/audit-logs/:id", async (request, reply) => {
    await requireAdmin(ctx, request);
    const { id } = request.params as { id: string };
    const log = await ctx.repos.auditLogs.findRawById(id);
    if (!log) {
      return reply.code(404).send({ error: "审计日志不存在" });
    }
    reply.send(log);
  });

  // ---- 日志导出 ----
  app.post("/admin/logs/export", async (request, reply) => {
    await requireAdmin(ctx, request);
    const body = request.body as LogsExportRequest;
    const { type, filters, format } = body;

    // 根据 type 获取数据
    let data: Record<string, unknown>[] = [];
    if (type === "error") {
      const errorLogs = await ctx.repos.errorLogs.findByFilters({
        ...filters,
        page: 1,
        pageSize: 10000, // 导出最多 10000 条
      });
      data = errorLogs as unknown as Record<string, unknown>[];
    } else if (type === "llm") {
      data = await ctx.repos.providerCallAudits.exportAll(10000);
    } else if (type === "audit") {
      data = await ctx.repos.auditLogs.exportAll(10000);
    }

    // 格式化输出
    const filename = `logs-${type}-export-${new Date().toISOString().split("T")[0]}`;

    if (format === "csv") {
      // CSV 格式化
      const headers = Object.keys(data[0] || {});
      const csvRows = [
        headers.join(","),
        ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? "")).join(","))
      ];
      const csvContent = csvRows.join("\n");

      reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${filename}.csv"`)
        .send(csvContent);
    } else {
      reply
        .header("Content-Type", "application/json")
        .header("Content-Disposition", `attachment; filename="${filename}.json"`)
        .send(JSON.stringify(data, null, 2));
    }
  });
}
