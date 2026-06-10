const PROJECT_FLOW_ACTIVE_SESSION_KEY = "vogue_ai_active_project_flow";

// 会话过期时间：24 小时（毫秒）
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface ProjectFlowActiveSession {
  projectId: string;
  step: number;
  updatedAt: number;
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readProjectFlowActiveSession(): ProjectFlowActiveSession | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  const raw = window.localStorage.getItem(PROJECT_FLOW_ACTIVE_SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ProjectFlowActiveSession>;
    const projectId = typeof parsed.projectId === "string" ? parsed.projectId.trim() : "";
    const step = Number(parsed.step ?? 0);
    const updatedAt = Number(parsed.updatedAt ?? 0);
    if (!projectId || !Number.isFinite(step) || step < 1) {
      return null;
    }
    // 检查会话是否过期（超过 24 小时）
    const now = Date.now();
    if (updatedAt > 0 && (now - updatedAt) > SESSION_EXPIRY_MS) {
      // 会话已过期，清除并返回 null
      window.localStorage.removeItem(PROJECT_FLOW_ACTIVE_SESSION_KEY);
      return null;
    }
    return {
      projectId,
      step: Math.floor(step),
      updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeProjectFlowActiveSession(input: {
  projectId: string;
  step: number;
}): void {
  if (!canUseLocalStorage()) {
    return;
  }
  const projectId = input.projectId.trim();
  const step = Math.max(1, Math.floor(Number(input.step) || 1));
  if (!projectId) {
    return;
  }
  window.localStorage.setItem(
    PROJECT_FLOW_ACTIVE_SESSION_KEY,
    JSON.stringify({
      projectId,
      step,
      updatedAt: Date.now(),
    } satisfies ProjectFlowActiveSession),
  );
}

export function clearProjectFlowActiveSession(): void {
  if (!canUseLocalStorage()) {
    return;
  }
  window.localStorage.removeItem(PROJECT_FLOW_ACTIVE_SESSION_KEY);
}
