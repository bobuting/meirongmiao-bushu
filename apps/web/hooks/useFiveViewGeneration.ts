/**
 * 五视图生成业务逻辑 Hook
 *
 * 职责：
 * - 调用五视图生成 API
 * - 更新本地 workflow 状态
 * - 监听全局任务队列自动刷新
 *
 * 注意：此 hook 直接操作 store，不依赖 useProjectState，避免循环依赖
 */

import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../store/useAppStore";
import { backendApi } from "../services/backendApi";
import type { FiveViewCharacterBrief, ProjectCharacterItem } from "./useProjectState";
import { GlobalTaskType, TaskStatus } from "../components/layout/taskQueueConfig";

/** 五视图生成选项 */
export interface FiveViewGenerationOptions {
  /** 已有角色ID（重试模式） */
  baseCharacterId?: string;
  /** 项目ID */
  projectId: string;
  /** 提示词覆盖 */
  promptOverride?: string;
  /** 槽位值 */
  slotValues?: { coreFeatures?: string; phase1Outfit?: string };
  /** 参考图片 */
  referenceImages?: string[];
  /** 生成槽位 (1-3) */
  generationSlot?: number | null;
}

/** 五视图生成结果 */
export interface FiveViewGenerationResult {
  success: boolean;
  jobId?: string;
  character?: FiveViewCharacterBrief;
  message?: string;
}

/** 批量五视图生成选项 */
export interface BatchFiveViewGenerationOptions {
  /** 项目ID */
  projectId: string;
  /** 要生成的槽位列表 */
  slots: number[];
}

/** 批量五视图生成结果 */
export interface BatchFiveViewGenerationResult {
  success: boolean;
  jobId?: string;
  children?: Array<{
    jobId: string;
    slot: number;
    character: FiveViewCharacterBrief;
  }>;
  message?: string;
}

/**
 * 五视图生成 Hook
 */
export function useFiveViewGeneration(projectId: string | undefined) {
  const token = useAppStore((state) => state.token);
  const globalTaskQueue = useAppStore((state) => state.globalTaskQueue);
  const updateWorkflowForProject = useAppStore((state) => state.updateWorkflowForProject);

  // 监听全局任务队列，五视图任务完成时从远端拉取角色数据
  // 记录已处理的任务 ID，避免重复处理
  const processedTaskIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!projectId || !token) return;

    // 确保 ref 是 Set（热更新后可能丢失类型）
    if (!(processedTaskIdsRef.current instanceof Set)) {
      processedTaskIdsRef.current = new Set();
    }

    // 监听视频项目和图片项目的五视图任务
    const fiveViewTasks = globalTaskQueue.filter(
      (t) => (t.type === GlobalTaskType.STEP2_FIVE_VIEW || t.type === GlobalTaskType.IMAGE_STEP2_FIVE_VIEW) && t.projectId === projectId
    );

    // 处理完成的任务：从远端拉取单个角色数据
    for (const task of fiveViewTasks.filter((t) => t.status === TaskStatus.COMPLETED)) {
      if (processedTaskIdsRef.current.has(task.id)) continue;
      // 标记为已处理，避免重复
      processedTaskIdsRef.current.add(task.id);

      const result = task.result as {
        characterId?: string;
        slot?: number;
      } | null;

      // 从远端拉取单个角色信息并更新
      const characterId = result?.characterId;
      if (characterId) {
        void refreshSingleCharacterFromRemote(projectId, characterId, result?.slot);
      }
    }

    // 处理失败的任务
    for (const task of fiveViewTasks.filter((t) => t.status === TaskStatus.FAILED)) {
      if (processedTaskIdsRef.current.has(task.id)) continue;
      processedTaskIdsRef.current.add(task.id);

      try {
        const input = JSON.parse(task.input) as {
          characterId?: string;
          slot?: number;
        } | null;
        if (input?.characterId) {
          updateCharacterStatusToFailed(projectId, input.characterId, input.slot);
        }
      } catch {
        // 解析失败，忽略
      }
    }
  }, [globalTaskQueue, projectId, token]);

  /**
   * 更新或添加角色到 workflow（本地更新）
   * 生成角色存入 GeneratedCharacters，角色库角色存入 LibraryCharacters
   */
  const upsertCharacterToLocalWorkflow = useCallback((character: FiveViewCharacterBrief, generationSlot?: number | null): void => {
    if (!projectId) return;
    const newCharacterItem: ProjectCharacterItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      projectId,
      libraryCharacterId: character.id,
      role: "main",
      sourceType: "generated",
      isSelected: true,
      generationSlot: generationSlot ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      character: {
        id: character.id,
        name: character.name,
        thumbnailUrl: character.thumbnailUrl ?? "",
        fiveViewOssImageUrl: character.fiveViewOssImageUrl ?? null,
        tags: [],
        kind: "image",
        status: character.status,
        views: [],
        // 同步设置 activeFiveViewStatus（生成开始时为 processing）
        activeFiveViewStatus: character.status,
      },
    };
    const state = useAppStore.getState();
    const entry = state.projectStateMap[projectId];

    // 根据项目类型选择正确的字段
    const projectKind = entry?.projectData?.projectKind;
    // 生成角色 (generationSlot 1-3) 使用 GeneratedCharacters 字段
    const generatedField = projectKind === "image" ? "imageProjectGeneratedCharacters" : "videoProjectGeneratedCharacters";
    const libraryField = projectKind === "image" ? "imageProjectLibraryCharacters" : "videoProjectLibraryCharacters";

    // 判断是生成角色还是角色库角色
    const isGeneratedCharacter = typeof generationSlot === "number" && generationSlot >= 1 && generationSlot <= 3;
    const targetField = isGeneratedCharacter ? generatedField : libraryField;
    const currentCharacters = (entry?.workflow?.[targetField] || []) as ProjectCharacterItem[];

    const existingIndex = currentCharacters.findIndex(
      (c) => c.libraryCharacterId === character.id
    );
    const updatedCharacters = existingIndex >= 0
      ? currentCharacters.map((c, i) => i === existingIndex ? newCharacterItem : c)
      : [...currentCharacters, newCharacterItem];

    // 根据项目类型和角色类型只更新对应字段
    const updatePayload = projectKind === "image"
      ? { imageProjectGeneratedCharacters: updatedCharacters }
      : { videoProjectGeneratedCharacters: updatedCharacters };

    updateWorkflowForProject(projectId, updatePayload);
  }, [projectId, updateWorkflowForProject]);

  /**
   * 生成五视图角色
   * - 有 baseCharacterId：重试模式，更新现有角色
   * - 无 baseCharacterId：创建模式，创建新角色
   */
  const generateFiveViewCharacter = useCallback(async (
    options: FiveViewGenerationOptions
  ): Promise<FiveViewGenerationResult> => {
    if (!token) return { success: false };

    try {
      const result = options.baseCharacterId
        ? await backendApi.retryDressedupFiveView(token, {
            characterId: options.baseCharacterId,
            projectId: options.projectId,
            generationSlot: options.generationSlot ?? undefined,
          })
        : await backendApi.generateDressedupFiveViewBoard(token, {
            projectId: options.projectId,
            prompt: options.promptOverride || undefined,
            coreFeatures: options.promptOverride ? undefined : options.slotValues?.coreFeatures,
            phase1Outfit: options.promptOverride ? undefined : options.slotValues?.phase1Outfit,
            referenceImages: options.referenceImages,
            allInOneSlot: options.generationSlot ?? undefined,
          });

      // 立即更新 workflow 角色列表
      upsertCharacterToLocalWorkflow(result.character, options.generationSlot ?? null);

      return {
        success: true,
        jobId: result.jobId,
        character: result.character,
        message: result.message,
      };
    } catch (err) {
      console.error("[useFiveViewGeneration] generateFiveViewCharacter failed:", err);
      return { success: false, message: err instanceof Error ? err.message : "生成失败" };
    }
  }, [token, upsertCharacterToLocalWorkflow]);

  /**
   * 批量生成五视图角色（创建父任务 + 多个子任务）
   */
  const batchGenerateFiveViewCharacters = useCallback(async (
    options: BatchFiveViewGenerationOptions
  ): Promise<BatchFiveViewGenerationResult> => {
    if (!token) return { success: false };

    try {
      const result = await backendApi.batchGenerateDressedupFiveView(token, {
        projectId: options.projectId,
        slots: options.slots,
      });

      // 立即更新 workflow 角色列表（所有子任务的角色）
      for (const child of result.children) {
        upsertCharacterToLocalWorkflow(child.character, child.slot);
      }

      return {
        success: true,
        jobId: result.jobId,
        children: result.children,
        message: result.message,
      };
    } catch (err) {
      console.error("[useFiveViewGeneration] batchGenerateFiveViewCharacters failed:", err);
      return { success: false, message: err instanceof Error ? err.message : "批量生成失败" };
    }
  }, [token, upsertCharacterToLocalWorkflow]);

  return {
    generateFiveViewCharacter,
    batchGenerateFiveViewCharacters,
    upsertCharacterToLocalWorkflow,
  };
}

/**
 * 内部函数：从远端拉取单个角色信息并更新 workflow
 */
async function refreshSingleCharacterFromRemote(
  projectId: string,
  characterId: string,
  slot?: number,
): Promise<void> {
  const state = useAppStore.getState();
  const token = state.token;
  if (!token) {
    return;
  }

  try {
    // 从远端拉取单个角色详情
    const character = await backendApi.getLibraryCharacter(token, characterId);

    // 重新获取最新 state
    const latestState = useAppStore.getState();
    const entry = latestState.projectStateMap[projectId];

    // 根据项目类型选择正确的字段
    const projectKind = entry?.projectData?.projectKind;
    // 判断是生成角色还是角色库角色
    const isGeneratedCharacter = typeof slot === "number" && slot >= 1 && slot <= 3;
    const generatedField = projectKind === "image" ? "imageProjectGeneratedCharacters" : "videoProjectGeneratedCharacters";
    const libraryField = projectKind === "image" ? "imageProjectLibraryCharacters" : "videoProjectLibraryCharacters";
    const characterField = isGeneratedCharacter ? generatedField : libraryField;

    // 获取当前角色列表
    const currentCharacters = (entry?.workflow?.[characterField] || []) as ProjectCharacterItem[];

    // 构建新的角色项
    const newCharacterItem: ProjectCharacterItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      projectId,
      libraryCharacterId: character.id,
      role: "main",
      sourceType: "generated",
      isSelected: true,
      generationSlot: slot ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      character: {
        id: character.id,
        name: character.name,
        thumbnailUrl: character.thumbnailUrl ?? "",
        fiveViewOssImageUrl: character.fiveViewOssImageUrl ?? null,
        tags: character.tags ?? [],
        kind: (character.kind as "image" | "video") ?? "image",
        status: (character.status as "ready" | "processing" | "failed") ?? "ready",
        views: [],
        // 同步设置 activeFiveViewStatus（从后端获取）
        activeFiveViewStatus: character.activeFiveViewStatus ?? null,
      },
    };

    // 查找并替换
    const existingIndex = currentCharacters.findIndex(
      (c) => c.libraryCharacterId === characterId || (slot !== undefined && c.generationSlot === slot)
    );

    // 构建更新后的角色列表
    const updatedCharacters = existingIndex >= 0
      ? currentCharacters.map((c, i) => i === existingIndex ? newCharacterItem : c)
      : [...currentCharacters, newCharacterItem];

    // 更新 store（根据项目类型和角色类型只更新对应字段）
    const updatePayload = isGeneratedCharacter
      ? (projectKind === "image"
        ? { imageProjectGeneratedCharacters: updatedCharacters }
        : { videoProjectGeneratedCharacters: updatedCharacters })
      : (projectKind === "image"
        ? { imageProjectLibraryCharacters: updatedCharacters }
        : { videoProjectLibraryCharacters: updatedCharacters });
    latestState.updateWorkflowForProject(projectId, updatePayload);

  } catch (err) {
    console.error("[refreshSingleCharacterFromRemote] 拉取角色失败:", err);
  }
}

/**
 * 内部函数：更新角色状态为失败
 */
function updateCharacterStatusToFailed(
  projectId: string,
  characterId: string,
  slot?: number,
): void {
  const state = useAppStore.getState();
  const entry = state.projectStateMap[projectId];

  // 根据项目类型选择正确的字段
  const projectKind = entry?.projectData?.projectKind;
  // 判断是生成角色还是角色库角色
  const isGeneratedCharacter = typeof slot === "number" && slot >= 1 && slot <= 3;
  const generatedField = projectKind === "image" ? "imageProjectGeneratedCharacters" : "videoProjectGeneratedCharacters";
  const libraryField = projectKind === "image" ? "imageProjectLibraryCharacters" : "videoProjectLibraryCharacters";
  const characterField = isGeneratedCharacter ? generatedField : libraryField;
  const currentCharacters = (entry?.workflow?.[characterField] || []) as ProjectCharacterItem[];

  // 查找对应槽位或角色ID的角色
  const existingIndex = currentCharacters.findIndex(
    (c) => c.libraryCharacterId === characterId || (slot !== undefined && c.generationSlot === slot)
  );

  if (existingIndex >= 0) {
    // 更新现有角色的状态为失败
    const updatedCharacters = currentCharacters.map((c, i) => {
      if (i === existingIndex) {
        return {
          ...c,
          character: c.character ? {
            ...c.character,
            status: "failed",
            // 同时更新 activeFiveViewStatus（前端优先使用此字段判断状态）
            activeFiveViewStatus: "failed",
          } : c.character,
        };
      }
      return c;
    });

    // 根据项目类型和角色类型只更新对应字段
    const updatePayload = isGeneratedCharacter
      ? (projectKind === "image"
        ? { imageProjectGeneratedCharacters: updatedCharacters }
        : { videoProjectGeneratedCharacters: updatedCharacters })
      : (projectKind === "image"
        ? { imageProjectLibraryCharacters: updatedCharacters }
        : { videoProjectLibraryCharacters: updatedCharacters });
    state.updateWorkflowForProject(projectId, updatePayload);
  }
}
