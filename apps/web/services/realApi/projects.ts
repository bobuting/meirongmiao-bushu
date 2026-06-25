/**
 * realApi/projects.ts - 项目管理相关 API 实现
 */

import { request } from "../backendApi.request";

export interface RealProjectsApi {
  createProject(
    token: string,
    name: string,
    options?: { projectKind?: "image" | "video" | "reverse" | "outfit_change"; reverseScriptId?: string | null },
  ): Promise<{ id: string; name: string; status: string; projectKind: "image" | "video" | "reverse" | "outfit_change"; exportUrl: string | null }>;
  updateProject(token: string, projectId: string, name: string): Promise<{ id: string; name: string; status: string; updatedAt: number }>;
  updateProjectStatus(token: string, projectId: string, status: string): Promise<{ success: boolean; id: string; status: string; updatedAt: number }>;
  getProject(token: string, projectId: string): Promise<{ id: string; name: string; status: string; updatedAt: number; exportUrl: string | null; lastVisitedStep: number | null; projectKind: "image" | "video" | "reverse" | "outfit_change"; reverseScriptId: string | null; activeScriptId: string | null; selectedRoleDirection: Record<string, unknown> | null; coverImageUrl: string | null; videoCoverImageUrl: string | null }>;
  saveProjectWorkflowState(
    token: string,
    projectId: string,
    payload: {
      step: number;
      workflow: Record<string, unknown>;
      projectData: Record<string, unknown>;
    },
  ): Promise<{ id: string; projectId: string; lastVisitedStep: number; updatedAt: number }>;
  deleteProject(token: string, projectId: string): Promise<{ ok: boolean }>;
  myProjects(token: string, params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    projectKind?: 'image' | 'video' | 'reverse' | 'outfit_change';
    search?: string;
    garmentCategory?: string;
  }): Promise<{
    projects: Array<{
      id: string;
      name: string;
      status: string;
      createdAt: number;
      updatedAt: number;
      thumbnailUrl: string;
      formatLabel: string;
      durationSec: number;
      views: number;
      lastVisitedStep: number;
      lastReverseTaskId: string | null;
      lastReverseScriptVersionId: string | null;
      lastReverseLibraryScriptId: string | null;
      projectKind: "image" | "video" | "reverse" | "outfit_change";
      exportUrl: string | null;
      reverseScriptId: string | null;
      coverImageUrl: string | null;
      garmentImageUrl: string | null;
    }>;
    pagination?: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }>;
  projectResumeSnapshot(token: string, projectId: string): Promise<{
    project: {
      id: string;
      name: string;
      status: string;
      thumbnailUrl: string;
      formatLabel: string;
      durationSec: number;
      views: number;
      lastVisitedStep: number;
      lastReverseTaskId: string | null;
      lastReverseScriptVersionId: string | null;
      projectKind: "image" | "video" | "reverse" | "outfit_change";
      reverseScriptId: string | null;
      createdAt: number;
      updatedAt: number;
    };
    workflowState: {
      lastVisitedStep: number;
      snapshotVersion?: string;
      backgroundGenerationTask: unknown;
      pageContentSnapshot: unknown;
    } | null;
    /** 原始持久化数据（供裂变等功能使用） */
    persistedWorkflowState: Record<string, unknown> | null;
    uploads: unknown[];
    outfitPlans: unknown[];
    selectedOutfitPlanId: string | null;
    selectedOutfitPlan: unknown;
    scriptVersions: unknown[];
    storyboardFrames: unknown[];
    videoJobs: unknown[];
    /** 包装常用数据，保持前端兼容 */
    state: {
      outfitPlans: unknown[];
      selectedOutfitPlanId: string | null;
      storyboardFrames: unknown[];
      latestScript: unknown;
      latestVideoJob: unknown;
      confirmedCharacterReferences: unknown[];
      selectedPreviewImageUrl: string | null;
      step2V2GeneratedCandidateUrls: string[];
    };
  }>;

  /** Step1 独立数据接口 */
  getStep1Garments(
  token: string,
  projectId: string,
): Promise<{
  projectId: string;
  projectStatus: string;
  garments: Array<{
    id: string;
    categoryId: string;
    name: string;
    category: string;
    description: string | null;
    imageUrl: string | null;
    libraryAssetId: string | null;
    subImages: string[];
  }>;
}>;

getOutfitPlans(
    token: string,
    projectId: string,
  ): Promise<{
    projectId: string;
    selectedOutfitPlanId: string | null;
    outfitPlans: Array<{
      id: string;
      index: number;
      title: string | null;
      styleName: string | null;
      reason: string | null;
      analysis: string | null;
      optimizedPrompt: string | null;
      suitableScene: string | null;
      tags: string[];
      groundingSources: Array<{ title: string; url: string }>;
      items: Array<{ type: string; name: string; style?: string; description?: string; assetId?: string }>;
    }>;
  }>;
  getStep1State(
    token: string,
    projectId: string,
  ): Promise<{
    projectId: string;
    projectStatus: string;
    selectedOutfitPlanId: string | null;
    selectedOutfitId: string | number | null;
    selectedOutfitSource: string | null;
    step1Step2Ready: boolean;
    step1SelectedRoleDirectionId: string | null;
    step1RoleDirectionCards: unknown[];
    outfitAnalysisCards: unknown[];
    step1HiddenRoleSettingPrompt: string | null;
    step1AdminDebugPrompt: string | null;
  }>;

  /** 更新项目的选中角色方向（Step1 角色预设） */
  updateProjectRoleDirection(
    token: string,
    projectId: string,
    roleDirection: Record<string, unknown> | null,
  ): Promise<{ success: boolean }>;

  /** 更新项目的发布标题（Step5） */
  updatePublishTitle(
    token: string,
    projectId: string,
    publishTitle: string | null,
  ): Promise<{ success: boolean; projectId: string; publishTitle: string | null; updatedAt: number }>;

  /** 获取项目上下文（角色、服饰、穿搭方案） */
  getProjectContext(
    token: string,
    projectId: string,
  ): Promise<{
    projectId: string;
    projectName: string;
    character: {
      libraryCharacterId: string;
      name: string;
      gender: "male" | "female" | null;
      age: number | null;
      style: string | null;
      tags: string[];
      thumbnailUrl: string | null;
      fiveViewOssImageUrl: string | null;
    } | null;
    characterDescription: string;
    matchingReference: string;
    outfitDescription: string;
    clothingStyles: string[];
    garments: Array<{
      garmentAssetId: string;
      name: string;
      category: string;
      description: string | null;
      style: string | null;
      mainImageUrl: string | null;
      flatLayImageUrl: string | null;
    }>;
    selectedOutfit: {
      outfitPlanId: string;
      title: string | null;
      styleName: string | null;
      tags: string[];
      analysis: string | null;
      optimizedPrompt: string | null;
      suitableScene: string | null;
    } | null;
  }>;

  /** 获取 Step3 分镜图片（从 nrm_step3_frame_images 表） */
  getStep3FrameImages(
    token: string,
    projectId: string,
  ): Promise<{ frames: Array<{ frameIndex: number; imageUrl: string; prompt?: string; candidates?: string[]; status: "pending" | "running" | "succeeded" | "failed" }> }>;

  /** 选择 Step3 分镜图片（更新选中状态） */
  selectStep3FrameImage(
    token: string,
    projectId: string,
    frameIndex: number,
    imageUrl: string,
  ): Promise<{ success: boolean; frameIndex: number; imageUrl: string }>;

  /** Step4 分镜视频场景 API */
  getStep4VideoScenes(
    token: string,
    projectId: string,
  ): Promise<{ scenes: Step4VideoScene[] }>;
  batchSaveStep4VideoScenes(
    token: string,
    projectId: string,
    scenes: Array<{
      sceneIndex: number;
      variantUrls: string[];
      selectedIndex: number;
      clipStatus: string;
      clipUrl: string | null;
      clipPrompt: string | null;
      clipProgress: number;
    }>,
  ): Promise<{ scenes: Step4VideoScene[] }>;
  patchStep4VideoScene(
    token: string,
    projectId: string,
    sceneIndex: number,
    payload: Record<string, unknown>,
  ): Promise<{ scene: Step4VideoScene }>;
  deleteStep4VideoSceneVariant(
    token: string,
    projectId: string,
    sceneIndex: number,
    variantUrl: string,
  ): Promise<{ scene: Step4VideoScene }>;

  /** 获取项目最新脚本 */
  latestProjectScript(
    token: string,
    projectId: string,
  ): Promise<{
    id: string;
    version: number;
    sourceType: string;
    durationSec: number | null;
    payload: Record<string, unknown>;
  }>;

  /** 并行裂变相关 API（后端自动计算 imageVideoCount 和 newStoryCount） */
  startParallelFission(
    token: string,
    params: {
      projectId: string;
      imageVideoCount?: number;
      newStoryCount?: number;
    },
  ): Promise<{
    success: boolean;
    fissionVideoStatusId: string;
    message: string;
  }>;
  // 已删除：getFissionProgress（前端已改用 globalTaskQueue 订阅）
  retryFailedItems(
    token: string,
    params: {
      projectId: string;
      taskType: "image_video" | "new_story";
      itemIds?: string[];
    },
  ): Promise<{
    success: boolean;
    resetCount: number;
    message: string;
  }>;

  /** 恢复卡住的 pending 任务 */
  resumePendingTasks(
    token: string,
    params: { projectId: string },
  ): Promise<{
    success: boolean;
    resumedCount: number;
    imageVideoCount: number;
    newStoryCount: number;
    message: string;
  }>;

  /** 同步裂变相关 API（新版流程）*/
  /** 更新项目导出视频 URL */
  updateExportUrl(
    token: string,
    projectId: string,
    params: { exportUrl: string; durationSec?: number },
  ): Promise<{ success: boolean }>;

  /** 完成 Step4 视频合成，原子更新项目状态 */
  completeProjectVideo(
    token: string,
    projectId: string,
    params: {
      exportUrl: string;
      durationSec?: number;
      lastVisitedStep?: number;
      videoCoverImageUrl?: string | null;
      backgroundMusicUrl?: string | null;
      backgroundMusicTitle?: string | null;
      transitionType?: string;
      transitionDurationFrames?: number;  // FreeCut 帧数模式
    },
  ): Promise<{ success: boolean }>;

  /** 更新项目缩略图 URL */
  updateThumbnailUrl(token: string, projectId: string, thumbnailUrl: string): Promise<{ success: boolean }>;

  /** 更新项目封面图片 URL */
  updateCoverImageUrl(token: string, projectId: string, coverImageUrl: string | null): Promise<{ success: boolean }>;

  /** 更新项目视频封面图片 URL */
  updateVideoCoverImageUrl(token: string, projectId: string, videoCoverImageUrl: string | null): Promise<{ success: boolean }>;

  /** 远程加载分镜脚本内容（从已确认脚本的 shot_breakdown 获取） */
  getStep4ScriptSegments(
    token: string,
    projectId: string,
  ): Promise<{ segments: Step4ScriptSegment[] }>;

  completeFission(
    token: string,
    projectId: string,
  ): Promise<{ success: boolean; message: string }>;

  /** 获取已确认/已选中脚本的概要 */
  getScriptSummary(
    token: string,
    projectId: string,
  ): Promise<{ summary: string | null; title: string | null; titleCandidates: string[] | null }>;
}

/** Step4 分镜脚本段落（API 返回） */
export interface Step4ScriptSegment {
  title: string;
  content: string;
  visualCue: string;
  visualPrompt: string;
  shotSize?: string;
  durationSec?: number;
}

/** Step4 分镜视频场景 */
export interface Step4VideoScene {
  id: string;
  projectId: string;
  userId: string;
  sceneIndex: number;
  variantUrls: string[];
  selectedIndex: number;
  clipStatus: string;
  clipUrl: string | null;
  clipPrompt: string | null;
  clipProgress: number;
  /** 被删除的视频变体URL列表（软删除） */
  deletedVariantUrls: string[];
  createdAt: number;
  updatedAt: number;
}

export const realProjectsApi: RealProjectsApi = {
  createProject(token: string, name: string, options?: { projectKind?: "image" | "video" | "reverse" | "outfit_change"; reverseScriptId?: string | null }) {
    return request<{ id: string; name: string; status: string; projectKind: "image" | "video" | "reverse" | "outfit_change"; exportUrl: string | null }>(
      "POST",
      "/projects",
      { token, body: { name, projectKind: options?.projectKind, reverseScriptId: options?.reverseScriptId } },
    );
  },

  updateProject(token: string, projectId: string, name: string) {
    return request<{ id: string; name: string; status: string; updatedAt: number }>(
      "PATCH",
      `/projects/${projectId}`,
      {
        token,
        body: { name },
      },
    );
  },

  updateProjectStatus(token: string, projectId: string, status: string) {
    return request<{ success: boolean; id: string; status: string; updatedAt: number }>(
      "PATCH",
      `/projects/${projectId}/status`,
      {
        token,
        body: { status },
      },
    );
  },

  getProject(token: string, projectId: string) {
    return request<{ id: string; name: string; status: string; updatedAt: number; exportUrl: string | null; lastVisitedStep: number | null; projectKind: "image" | "video" | "reverse" | "outfit_change"; reverseScriptId: string | null; activeScriptId: string | null; selectedRoleDirection: Record<string, unknown> | null; coverImageUrl: string | null; videoCoverImageUrl: string | null }>(
      "GET",
      `/projects/${projectId}`,
      { token },
    );
  },

  saveProjectWorkflowState(
    token: string,
    projectId: string,
    payload: {
      step: number;
      workflow: Record<string, unknown>;
      projectData: Record<string, unknown>;
    },
  ) {
    return request<{ id: string; projectId: string; lastVisitedStep: number; updatedAt: number }>(
      "POST",
      `/projects/${projectId}/workflow-state`,
      {
        token,
        body: payload,
      },
    );
  },

  deleteProject(token: string, projectId: string) {
    return request<{ ok: boolean }>("DELETE", `/projects/${projectId}`, {
      token,
    });
  },

  myProjects(token: string, params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    projectKind?: 'image' | 'video' | 'reverse' | 'outfit_change';
    search?: string;
    garmentCategory?: string;
  }) {
    // 构建查询字符串
    const queryParts: string[] = [];
    if (params?.page) queryParts.push(`page=${params.page}`);
    if (params?.pageSize) queryParts.push(`pageSize=${params.pageSize}`);
    if (params?.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.projectKind) queryParts.push(`projectKind=${params.projectKind}`);
    if (params?.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
    if (params?.garmentCategory) queryParts.push(`garmentCategory=${encodeURIComponent(params.garmentCategory)}`);

    const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    const path = `/me/projects${queryString}`;

    return request<{
      projects: Array<{
        id: string;
        name: string;
        status: string;
        createdAt: number;
        updatedAt: number;
        thumbnailUrl: string;
        formatLabel: string;
        durationSec: number;
        views: number;
        lastVisitedStep: number;
        lastReverseTaskId: string | null;
        lastReverseScriptVersionId: string | null;
        lastReverseLibraryScriptId: string | null;
        projectKind: "image" | "video" | "reverse" | "outfit_change";
        exportUrl: string | null;
        reverseScriptId: string | null;
        coverImageUrl: string | null;
        garmentImageUrl: string | null;
      }>;
      pagination?: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        hasMore: boolean;
      };
    }>("GET", path, { token });
  },

  projectResumeSnapshot(token: string, projectId: string) {
    return request<{
      // ... same type as interface
      project: any;
      workflowState: any;
      persistedWorkflowState: any;
      uploads: any[];
      outfitPlans: any[];
      selectedOutfitPlanId: string | null;
      selectedOutfitPlan: any;
      scriptVersions: any[];
      storyboardFrames: any[];
      videoJobs: any[];
      state: any;
    }>("GET", `/projects/${projectId}/resume-snapshot`, { token });
  },

  getStep1Garments(token: string, projectId: string) {
    return request<{
      projectId: string;
      projectStatus: string;
      garments: Array<{
        id: string;
        categoryId: string;
        name: string;
        category: string;
        description: string | null;
        imageUrl: string | null;
        libraryAssetId: string | null;
        subImages: string[];
      }>;
    }>("GET", `/projects/${projectId}/garments`, { token });
  },

  getOutfitPlans(token: string, projectId: string) {
    return request<{
      projectId: string;
      projectStatus: string;
      selectedOutfitPlanId: string | null;
      outfitPlans: Array<{
        id: string;
        projectId: string;
        userId: string;
        assetIds: string[];
        index: number;
        title: string | null;
        reason: string | null;
        deletedAt: number | null;
        deletedBy: string | null;
        garmentAssetId: string | null;
        styleName: string | null;
        analysis: string | null;
        optimizedPrompt: string | null;
        analysisPrompt: string | null;
        trendSummary: string | null;
        groundingSources: Array<{ title: string; url: string }>;
        items: Array<{ type: string; name: string; style?: string; description?: string; assetId?: string }>;
        suitableScene: string | null;
        tags: string[];
      }>;
    }>("GET", `/projects/${projectId}/outfit-plans`, { token });
  },

  getStep1State(token: string, projectId: string) {
    return request<{
      projectId: string;
      projectStatus: string;
      selectedOutfitPlanId: string | null;
      selectedOutfitId: string | number | null;
      selectedOutfitSource: string | null;
      step1Step2Ready: boolean;
      step1SelectedRoleDirectionId: string | null;
      step1RoleDirectionCards: unknown[];
      outfitAnalysisCards: unknown[];
      step1HiddenRoleSettingPrompt: string | null;
      step1AdminDebugPrompt: string | null;
    }>("GET", `/projects/${projectId}/step1-state`, { token });
  },

  /** 更新项目的选中角色方向（Step1 角色预设） */
  updateProjectRoleDirection(token: string, projectId: string, roleDirection: Record<string, unknown> | null) {
    return request<{ success: boolean }>("PUT", `/projects/${projectId}/role-direction`, {
      token,
      body: { roleDirection },
    });
  },

  /** 更新项目的发布标题（Step5） */
  updatePublishTitle(token: string, projectId: string, publishTitle: string | null) {
    return request<{ success: boolean; projectId: string; publishTitle: string | null; updatedAt: number }>(
      "PATCH", `/projects/${projectId}/publish-title`, {
        token,
        body: { publishTitle },
      },
    );
  },

  /** 获取项目上下文（角色、服饰、穿搭方案） */
  getProjectContext(token: string, projectId: string) {
    return request<{
      projectId: string;
      projectName: string;
      character: {
        libraryCharacterId: string;
        name: string;
        gender: "male" | "female" | null;
        age: number | null;
        style: string | null;
        tags: string[];
        thumbnailUrl: string | null;
        fiveViewOssImageUrl: string | null;
      } | null;
      characterDescription: string;
      matchingReference: string;
      outfitDescription: string;
      clothingStyles: string[];
      garments: Array<{
        garmentAssetId: string;
        name: string;
        category: string;
        description: string | null;
        style: string | null;
        mainImageUrl: string | null;
        flatLayImageUrl: string | null;
      }>;
      selectedOutfit: {
        outfitPlanId: string;
        title: string | null;
        styleName: string | null;
        tags: string[];
        analysis: string | null;
        optimizedPrompt: string | null;
        suitableScene: string | null;
      } | null;
    }>("GET", `/projects/${projectId}/context`, { token });
  },

  getStep4VideoScenes(token: string, projectId: string) {
    return request<{ scenes: Step4VideoScene[] }>("GET", `/projects/${projectId}/video-scenes`, { token });
  },

  /** 获取 Step3 分镜图片（从 nrm_step3_frame_images 表） */
  getStep3FrameImages(token: string, projectId: string) {
    return request<{ frames: Array<{ frameIndex: number; imageUrl: string; prompt?: string; candidates?: string[]; status: "pending" | "running" | "succeeded" | "failed" }> }>(
      "GET", `/projects/${projectId}/step3-frame-images`, { token },
    );
  },

  /** 选择 Step3 分镜图片（更新选中状态） */
  selectStep3FrameImage(token: string, projectId: string, frameIndex: number, imageUrl: string) {
    return request<{ success: boolean; frameIndex: number; imageUrl: string }>(
      "PUT", `/projects/${projectId}/step3-frame-images/${frameIndex}/select`, {
        token,
        body: { imageUrl },
      },
    );
  },

  /** 远程加载分镜脚本内容（从已确认脚本的 shot_breakdown 获取） */
  getStep4ScriptSegments(token: string, projectId: string) {
    return request<{ segments: Step4ScriptSegment[] }>("GET", `/projects/${projectId}/step4/script-segments`, { token });
  },

  /** 获取已确认/已选中脚本的概要 */
  getScriptSummary(token: string, projectId: string) {
    return request<{ summary: string | null; title: string | null; titleCandidates: string[] | null }>("GET", `/projects/${projectId}/script-summary`, { token });
  },

  batchSaveStep4VideoScenes(
    token: string,
    projectId: string,
    scenes: Array<{
      sceneIndex: number;
      variantUrls: string[];
      selectedIndex: number;
      clipStatus: string;
      clipUrl: string | null;
      clipPrompt: string | null;
      clipProgress: number;
    }>,
  ) {
    return request<{ scenes: Step4VideoScene[] }>("POST", `/projects/${projectId}/video-scenes/batch`, {
      token,
      body: { scenes },
    });
  },

  patchStep4VideoScene(
    token: string,
    projectId: string,
    sceneIndex: number,
    payload: Record<string, unknown>,
  ) {
    return request<{ scene: Step4VideoScene }>("PATCH", `/projects/${projectId}/video-scenes/${sceneIndex}`, {
      token,
      body: payload,
    });
  },

  deleteStep4VideoSceneVariant(
    token: string,
    projectId: string,
    sceneIndex: number,
    variantUrl: string,
  ) {
    return request<{ scene: Step4VideoScene }>("DELETE", `/projects/${projectId}/video-scenes/${sceneIndex}/variant`, {
      token,
      body: { variantUrl },
    });
  },

  /** 获取项目最新脚本 */
  latestProjectScript(
    token: string,
    projectId: string,
  ): Promise<{
    id: string;
    version: number;
    sourceType: string;
    durationSec: number | null;
    payload: Record<string, unknown>;
  }> {
    return request<{
      id: string;
      version: number;
      sourceType: string;
      durationSec: number | null;
      payload: Record<string, unknown>;
    }>("GET", `/projects/${projectId}/scripts/latest`, { token });
  },

  // ========== 并行裂变相关 API ==========

  /** 启动并行裂变任务（后端自动计算 imageVideoCount 和 newStoryCount） */
  startParallelFission(
    token: string,
    params: {
      projectId: string;
      imageVideoCount?: number;
      newStoryCount?: number;
    },
  ) {
    return request<{
      success: boolean;
      fissionVideoStatusId: string;
      message: string;
    }>("POST", "/fission/parallel/start", {
      token,
      body: params,
    });
  },

  // 已删除：getFissionProgress（前端已改用 globalTaskQueue 订阅）

  /** 重试失败的裂变分镜项 */
  retryFailedItems(
    token: string,
    params: {
      projectId: string;
      taskType: "image_video" | "new_story";
      itemIds?: string[];
    },
  ) {
    return request<{
      success: boolean;
      resetCount: number;
      message: string;
    }>("POST", "/fission/retry", {
      token,
      body: params,
    });
  },

  /** 恢复卡住的 pending 任务 */
  resumePendingTasks(
    token: string,
    params: { projectId: string },
  ) {
    return request<{
      success: boolean;
      resumedCount: number;
      imageVideoCount: number;
      newStoryCount: number;
      message: string;
    }>("POST", "/fission/resume", {
      token,
      body: params,
    });
  },

  updateExportUrl(token: string, projectId: string, params: { exportUrl: string; durationSec?: number }) {
    return request<{ success: boolean }>("PUT", `/projects/${projectId}/export-url`, { token, body: params });
  },

  completeProjectVideo(token: string, projectId: string, params: {
    exportUrl: string;
    durationSec?: number;
    lastVisitedStep?: number;
    videoCoverImageUrl?: string | null;
    backgroundMusicUrl?: string | null;
    backgroundMusicTitle?: string | null;
    transitionType?: string;
    transitionDurationFrames?: number;  // FreeCut帧数模式
  }) {
    return request<{ success: boolean }>("PUT", `/projects/${projectId}/complete-video`, { token, body: params });
  },

  updateThumbnailUrl(token: string, projectId: string, thumbnailUrl: string) {
    return request<{ success: boolean }>("PUT", `/projects/${projectId}/thumbnail-url`, { token, body: { thumbnailUrl } });
  },

  updateCoverImageUrl(token: string, projectId: string, coverImageUrl: string | null) {
    return request<{ success: boolean }>("PUT", `/projects/${projectId}/cover-image-url`, { token, body: { coverImageUrl } });
  },

  updateVideoCoverImageUrl(token: string, projectId: string, videoCoverImageUrl: string | null) {
    return request<{ success: boolean }>("PUT", `/projects/${projectId}/video-cover-image-url`, { token, body: { videoCoverImageUrl } });
  },

  // ========== 同步裂变相关 API（新版流程）==========

  completeFission(token: string, projectId: string) {
    return request<{ success: boolean; message: string }>(
      "POST",
      "/fission/complete",
      { token, body: { projectId } },
    );
  },
};