// apps/web/services/api-modules/project.ts
/**
 * 项目 API 模块
 * 包含项目 CRUD、工作流状态保存等方法
 */

// ============================================================================
// 请求函数类型（与新签名匹配）
// ============================================================================

type RequestOptions = {
  token?: string;
  body?: unknown;
};

type RequestFunction = <T>(
  method: string,
  path: string,
  options?: RequestOptions
) => Promise<T>;

// ============================================================================
// 项目 API 方法
// ============================================================================

/**
 * 创建项目
 */
export async function createProject(
  request: RequestFunction,
  token: string,
  name: string,
  options?: { projectKind?: "image" | "video" | "reverse" | "outfit_change" }
): Promise<{ id: string; name: string; status: string; projectKind: "image" | "video" | "reverse" | "outfit_change"; exportUrl: string | null }> {
  return request("POST", "/projects", { token, body: { name, ...options } });
}

/**
 * 更新项目名称
 */
export async function updateProject(
  request: RequestFunction,
  token: string,
  projectId: string,
  name: string
): Promise<{ id: string; name: string; status: string; updatedAt: number }> {
  return request("PATCH", `/projects/${projectId}`, { token, body: { name } });
}

/**
 * 删除项目
 */
export async function deleteProject(
  request: RequestFunction,
  token: string,
  projectId: string
): Promise<void> {
  return request("DELETE", `/projects/${projectId}`, { token });
}

/**
 * 获取用户项目列表
 */
export async function getProjects(
  request: RequestFunction,
  token: string
): Promise<Array<{
  id: string;
  name: string;
  status: string;
  createdAt: number;
  thumbnailUrl: string;
  formatLabel: string;
  durationSec: number;
  views: number;
  lastVisitedStep: number;
  lastReverseTaskId: string | null;
  lastReverseScriptVersionId: string | null;
  lastReverseLibraryScriptId: string | null;
  projectKind: "image" | "video";
  exportUrl: string | null;
}>> {
  return request("GET", "/projects", { token });
}

/**
 * 获取项目详情
 */
export async function getProjectDetail(
  request: RequestFunction,
  token: string,
  projectId: string
): Promise<{
  id: string;
  name: string;
  status: string;
  createdAt: number;
  thumbnailUrl: string;
  formatLabel: string;
  durationSec: number;
  views: number;
  lastVisitedStep: number;
  lastReverseTaskId: string | null;
  lastReverseScriptVersionId: string | null;
  lastReverseLibraryScriptId: string | null;
  projectKind: "image" | "video";
  exportUrl: string | null;
}> {
  return request("GET", `/projects/${projectId}`, { token });
}

/**
 * 获取项目页面内容
 */
export async function getProjectPageContent(
  request: RequestFunction,
  token: string,
  projectId: string
): Promise<unknown> {
  return request("GET", `/projects/${projectId}/page-content`, { token });
}

/**
 * 保存项目工作流状态
 */
export async function saveProjectWorkflowState(
  request: RequestFunction,
  token: string,
  projectId: string,
  state: unknown
): Promise<{ saved: boolean }> {
  return request("POST", `/projects/${projectId}/workflow-state`, { token, body: { state } });
}