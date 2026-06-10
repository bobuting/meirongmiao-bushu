// apps/web/services/mock/mock-api.ts
/**
 * 精简 Mock API 实现
 * 只保留核心调试功能（登录/注册/项目 CRUD）
 * 其他方法返回固定数据或占位响应
 */

import type { UserRole, CharacterViewKey, UserThemeResponse } from '../backendApi.types';
import type { ThemeConfig } from '../../types';
import { mockState, ensureMockSeeded, MockProjectRecord } from './mock-state';
import { mockId, mockDelay, unauthorized, notFound, badRequest, conflict, getUserByToken } from './mock-utils';

// ============================================================================
// Mock API 实现
// ============================================================================

export const mockBackendApi = {
  // === 认证（完整实现） ===

  async register(email: string, password: string) {
    ensureMockSeeded();
    await mockDelay();
    const key = email.trim().toLowerCase();
    if (!key || !password) {
      badRequest("Email and password are required");
    }
    if (mockState.users.has(key)) {
      conflict("Email already registered");
    }
    const role: UserRole = key.includes("admin") ? "admin" : "user";
    const user = { id: mockId("usr"), email: key, password, role };
    mockState.users.set(key, user);
    return { id: user.id, email: user.email, role: user.role };
  },

  async login(email: string, password: string) {
    ensureMockSeeded();
    await mockDelay();
    const key = email.trim().toLowerCase();
    const user = mockState.users.get(key);
    if (!user || user.password !== password) {
      unauthorized("Invalid credentials");
    }
    const token = `mock-token-${user.id}-${Date.now()}`;
    mockState.sessions.set(token, user.id);
    return { token, user: { id: user.id, email: user.email, role: user.role } };
  },

  async logout(): Promise<{ message: string }> {
    await mockDelay();
    return { message: "ok" };
  },

  // === 项目 CRUD（完整实现） ===

  async createProject(token: string, name: string, options?: { projectKind?: "image" | "video" | "reverse" | "outfit_change" }) {
    ensureMockSeeded();
    await mockDelay();
    const user = getUserByToken(token);
    const projectKind = options?.projectKind ?? "video";
    const project: MockProjectRecord = {
      id: mockId("prj"),
      ownerId: user.id,
      name: name.trim() || "Untitled",
      status: "draft",
      createdAt: Date.now(),
      thumbnailUrl: "https://placehold.co/450x800/1a1a1a/FFF?text=Project+Preview",
      formatLabel: "30秒 • 9:16",
      durationSec: 30,
      views: 0,
      lastVisitedStep: 1,
      lastReverseTaskId: null,
      lastReverseScriptVersionId: null,
      lastReverseLibraryScriptId: null,
      projectKind,
      exportUrl: null,
      reverseScriptId: options?.projectKind === "reverse" ? (options as any).reverseScriptId ?? null : null,
    };
    mockState.projects.unshift(project);
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      projectKind: project.projectKind,
      exportUrl: project.exportUrl,
    };
  },

  async updateProject(token: string, projectId: string, name: string) {
    ensureMockSeeded();
    await mockDelay();
    const user = getUserByToken(token);
    const project = mockState.projects.find((item) => item.id === projectId && item.ownerId === user.id);
    if (!project) {
      notFound("Project not found");
    }
    const normalizedName = String(name ?? "").trim();
    if (!normalizedName) {
      badRequest("Project name required");
    }
    project.name = normalizedName;
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      updatedAt: Date.now(),
    };
  },

  async deleteProject(token: string, projectId: string): Promise<{ ok: boolean }> {
    ensureMockSeeded();
    await mockDelay();
    const user = getUserByToken(token);
    const index = mockState.projects.findIndex((item) => item.id === projectId && item.ownerId === user.id);
    if (index === -1) {
      notFound("Project not found");
    }
    mockState.projects.splice(index, 1);
    return { ok: true };
  },

  async myProjects(token: string) {
    ensureMockSeeded();
    await mockDelay();
    const user = getUserByToken(token);
    const projects = mockState.projects
      .filter((p) => p.ownerId === user.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt ?? p.createdAt,
        thumbnailUrl: p.thumbnailUrl ?? "https://placehold.co/450x800/1a1a1a/FFF?text=Project+Preview",
        formatLabel: p.formatLabel ?? "30秒 • 9:16",
        durationSec: p.durationSec ?? 30,
        views: p.views ?? 0,
        lastVisitedStep: p.lastVisitedStep ?? 1,
        lastReverseTaskId: p.lastReverseTaskId ?? null,
        lastReverseScriptVersionId: p.lastReverseScriptVersionId ?? null,
        lastReverseLibraryScriptId: p.lastReverseLibraryScriptId ?? null,
        projectKind: p.projectKind ?? "video",
        exportUrl: p.exportUrl ?? null,
        reverseScriptId: p.reverseScriptId ?? null,
      }));
    return { projects };
  },

  async getProjectDetail(token: string, projectId: string) {
    ensureMockSeeded();
    await mockDelay();
    const user = getUserByToken(token);
    const project = mockState.projects.find((item) => item.id === projectId && item.ownerId === user.id);
    if (!project) {
      notFound("Project not found");
    }
    return project;
  },

  // === 项目数据（简化实现） ===

  async getProjectPageContent(_token: string, _projectId: string) {
    await mockDelay();
    return null;
  },

  async saveProjectWorkflowState(_token: string, projectId: string, _state: unknown) {
    await mockDelay();
    return { id: mockId("wfs"), projectId, lastVisitedStep: 1, updatedAt: Date.now() };
  },

  // === Step1（返回固定数据） ===

  async classifyStep1Image(_token: string, _imageUrl: string) {
    await mockDelay();
    return {
      mode: "fallback",
      classification: {
        category: "unknown",
        confidence: 0,
        viewLabel: "unknown",
        reason: "mock fallback",
      },
      classificationFeedback: null,
      multiViewWarning: null,
      isClothingImage: false,
      clothingImageReason: null,
    };
  },

  async removeStep1ImageBackground(_token: string, _imageUrl: string) {
    await mockDelay();
    return {
      taskId: mockId("task"),
      status: "succeeded",
      mode: "fallback",
      sourceImageUrl: _imageUrl,
      outputImageUrl: _imageUrl,
      errorCode: null,
      errorMessage: null,
    };
  },

  async analyzeStep1OutfitModule(_token: string, _projectId: string, moduleId: string, _images: string[]) {
    await mockDelay();
    return {
      moduleId,
      analysisText: "Mock analysis result",
      subjects: [],
    };
  },

  // === Step2（返回固定数据） ===

  async createStep2Character(_token: string, _projectId: string, name: string) {
    await mockDelay();
    return {
      id: mockId("char"),
      name,
    };
  },

  async generateStep2View(_token: string, _projectId: string, _characterId: string, viewKey: CharacterViewKey) {
    await mockDelay();
    return {
      viewKey,
      status: "pending",
      candidates: [],
    };
  },

  async confirmStep2ViewSelection(_token: string, _projectId: string, _characterId: string, _viewKey: CharacterViewKey, _imageUrl: string) {
    await mockDelay();
    return { confirmed: true };
  },

  // === Step3（返回固定数据） ===

  async generateScriptCandidateViewModels(_token: string, _projectId: string) {
    await mockDelay();
    return {
      items: [],
      recommendedCount: 0,
      tryCount: 0,
      totalCount: 0,
      snapshotId: mockId("snap"),
      createdAt: Date.now(),
      generationMode: "degraded",
    };
  },

  async confirmStep3Candidate(_token: string, _projectId: string, request: { snapshotId: string; candidateId: string; expectedLockVersion: number }) {
    await mockDelay();
    return {
      snapshot: {
        items: [],
        recommendedCount: 0,
        tryCount: 0,
        totalCount: 0,
        snapshotId: request.snapshotId,
        createdAt: Date.now(),
        generationMode: "degraded",
      },
      scriptSegmentCount: 0,
      scriptSegments: [],
    };
  },

  // === Step4（返回固定数据） ===

  async createStep4VideoJob(_token: string, _projectId: string) {
    await mockDelay();
    return { jobId: mockId("job") };
  },

  async getStep4VideoJobStatus(_token: string, jobId: string) {
    await mockDelay();
    return {
      jobId,
      status: "pending",
      segments: [],
    };
  },

  async updateStep4ClipVariant(_token: string, _jobId: string, _sceneIndex: number, _variantIndex: number) {
    await mockDelay();
    return { updated: true };
  },

  // === 素材库（返回空数组） ===

  async getMyLibraryCharacters(_token: string, query?: { page?: number; pageSize?: number; keyword?: string }) {
    await mockDelay();
    return {
      items: [],
      total: 0,
      page: query?.page ?? 1,
      pageSize: query?.pageSize ?? 20,
    };
  },

  async getMyLibraryScripts(_token: string, query?: { page?: number; pageSize?: number; keyword?: string }) {
    await mockDelay();
    return {
      items: [],
      total: 0,
      page: query?.page ?? 1,
      pageSize: query?.pageSize ?? 20,
    };
  },

  async getMyLibraryStoryboards(_token: string, query?: { page?: number; pageSize?: number; keyword?: string }) {
    await mockDelay();
    return {
      items: [],
      total: 0,
      page: query?.page ?? 1,
      pageSize: query?.pageSize ?? 20,
    };
  },

  // === 逆向解析（返回占位数据） ===

  async startReverseParseV2Job(_token: string, _payload: { input: string; mode?: string }) {
    await mockDelay();
    return { jobId: mockId("rev-job") };
  },

  async getReverseParseV2Job(_token: string, jobId: string) {
    await mockDelay();
    return {
      jobId,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      inputMode: "douyin_url",
      projectId: null,
      input: "",
      result: null,
      error: null,
    };
  },

  async reverseParse(_token: string, payload: { input: string; mode?: string }) {
    await mockDelay();
    return {
      status: "pending",
      input: payload.input,
      nextAction: { mode: "douyin_url" },
    };
  },

  // === 审核（返回空数据） ===

  async getReviewQueue(_token: string) {
    await mockDelay();
    return { items: [], total: 0 };
  },

  async approveReviewItem(_token: string, _itemId: string) {
    await mockDelay();
    return { approved: true };
  },

  // === 主题（返回默认主题） ===

  async listEnabledThemes() {
    await mockDelay();
    return [
      {
        id: "theme-default",
        name: "neirongmiao",
        displayName: "内容喵",
        category: "tech" as const,
        isSystem: true,
        isEnabled: true,
        config: {
          colors: {
            primary: "#1890ff",
            primaryHover: "#40a9ff",
            primaryActive: "#096dd9",
            primaryLight: "#e6f7ff",
            accent: "#52c41a",
            accentHover: "#73d13d",
            accentActive: "#389e0d",
            secondary: "#1A1A1A",
            background: "#f0f2f5",
            backgroundWarm: "#fcfaf7",
            surface: "#ffffff",
            text: { primary: "#333333", secondary: "#666666", muted: "#999999" },
            border: "#e0e0e0",
            borderFocus: "#1890ff",
          },
          gradients: {
            primary: "linear-gradient(135deg, #1890ff 0%, #52c41a 100%)",
            primaryHover: "linear-gradient(135deg, #40a9ff 0%, #73d13d 100%)",
            primaryActive: "linear-gradient(135deg, #096dd9 0%, #389e0d 100%)",
          },
          fonts: { main: "sans-serif", display: "sans-serif" },
          animations: { transitionSpeed: "200ms", hoverTransform: "translateY(-2px)" },
        },
        logoUrl: "/logo.png",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
  },

  async getCurrentUserTheme(token: string): Promise<UserThemeResponse> {
    await mockDelay();
    const user = getUserByToken(token);
    return {
      userId: user.id,
      themeId: "theme-default",
      systemName: "内容喵",
      customConfig: undefined,
      customLogoUrl: "/logo.png",
      updatedAt: Date.now(),
      theme: {
        id: "theme-default",
        name: "neirongmiao",
        displayName: "内容喵",
        category: "tech",
        isSystem: true,
        isEnabled: true,
        config: {
          colors: {
            primary: "#1890ff",
            primaryHover: "#40a9ff",
            primaryActive: "#096dd9",
            primaryLight: "#e6f7ff",
            accent: "#52c41a",
            accentHover: "#73d13d",
            accentActive: "#389e0d",
            secondary: "#1A1A1A",
            background: "#f0f2f5",
            backgroundWarm: "#fcfaf7",
            surface: "#ffffff",
            text: { primary: "#333333", secondary: "#666666", muted: "#999999" },
            border: "#e0e0e0",
            borderFocus: "#1890ff",
          },
          gradients: {
            primary: "linear-gradient(135deg, #1890ff 0%, #52c41a 100%)",
            primaryHover: "linear-gradient(135deg, #40a9ff 0%, #73d13d 100%)",
            primaryActive: "linear-gradient(135deg, #096dd9 0%, #389e0d 100%)",
          },
          fonts: { main: "sans-serif", display: "sans-serif" },
          animations: { transitionSpeed: "200ms", hoverTransform: "translateY(-2px)" },
        },
        logoUrl: "/logo.png",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };
  },

  async setCurrentUserTheme(token: string, payload: { themeId: string; systemName?: string; customConfig?: Partial<ThemeConfig> }) {
    await mockDelay();
    const user = getUserByToken(token);
    return {
      userId: user.id,
      themeId: payload.themeId,
      systemName: payload.systemName || "内容喵",
      customConfig: payload.customConfig,
      customLogoUrl: "/logo.png",
      updatedAt: Date.now(),
      theme: {
        id: payload.themeId,
        name: "neirongmiao",
        displayName: payload.systemName || "内容喵",
        category: "tech" as const,
        isSystem: true,
        isEnabled: true,
        config: payload.customConfig ? {
          colors: (payload.customConfig as Partial<ThemeConfig>).colors ?? {
            primary: "#1890ff",
            primaryHover: "#40a9ff",
            primaryActive: "#096dd9",
            primaryLight: "#e6f7ff",
            accent: "#52c41a",
            accentHover: "#73d13d",
            accentActive: "#389e0d",
            secondary: "#1A1A1A",
            background: "#f0f2f5",
            backgroundWarm: "#fcfaf7",
            surface: "#ffffff",
            text: { primary: "#333333", secondary: "#666666", muted: "#999999" },
            border: "#e0e0e0",
            borderFocus: "#1890ff",
          },
          gradients: (payload.customConfig as Partial<ThemeConfig>).gradients ?? {
            primary: "linear-gradient(135deg, #1890ff 0%, #52c41a 100%)",
            primaryHover: "linear-gradient(135deg, #40a9ff 0%, #73d13d 100%)",
            primaryActive: "linear-gradient(135deg, #096dd9 0%, #389e0d 100%)",
          },
          fonts: (payload.customConfig as Partial<ThemeConfig>).fonts ?? { main: "sans-serif", display: "sans-serif" },
          animations: (payload.customConfig as Partial<ThemeConfig>).animations ?? { transitionSpeed: "200ms", hoverTransform: "translateY(-2px)" },
        } : {
          colors: {
            primary: "#1890ff",
            primaryHover: "#40a9ff",
            primaryActive: "#096dd9",
            primaryLight: "#e6f7ff",
            accent: "#52c41a",
            accentHover: "#73d13d",
            accentActive: "#389e0d",
            secondary: "#1A1A1A",
            background: "#f0f2f5",
            backgroundWarm: "#fcfaf7",
            surface: "#ffffff",
            text: { primary: "#333333", secondary: "#666666", muted: "#999999" },
            border: "#e0e0e0",
            borderFocus: "#1890ff",
          },
          gradients: {
            primary: "linear-gradient(135deg, #1890ff 0%, #52c41a 100%)",
            primaryHover: "linear-gradient(135deg, #40a9ff 0%, #73d13d 100%)",
            primaryActive: "linear-gradient(135deg, #096dd9 0%, #389e0d 100%)",
          },
          fonts: { main: "sans-serif", display: "sans-serif" },
          animations: { transitionSpeed: "200ms", hoverTransform: "translateY(-2px)" },
        },
        logoUrl: "/logo.png",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    };
  },

  async uploadUserLogo(_token: string, logoUrl: string) {
    await mockDelay();
    return { logoUrl };
  },
};