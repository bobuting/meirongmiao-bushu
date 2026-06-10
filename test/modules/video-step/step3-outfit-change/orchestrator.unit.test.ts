/**
 * 服装换装流水线编排器单元测试
 *
 * 测试目标：
 * - 流水线执行逻辑（4 个阶段按正确顺序执行）
 * - 状态转换（pending → capturing → captured → ... → succeeded）
 * - 数据库更新（updateStatus、updateStageResult、setError）
 * - 错误处理（失败时状态设置为 'failed'）
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { AppContext } from "@/core/app-context.js";
import type {
  OutfitChangeTaskInput,
  OutfitChangeTaskStatus,
  ReferenceCaptureResult,
  VideoUnderstandingResult,
  CharacterAdaptResult,
  VideoGenerationResult,
} from "@/contracts/outfit-change-contract.js";
import type { IOutfitChangeTaskRepository } from "@/repositories/pg/outfit-change-task-pg-repository.js";
import { executeOutfitChangePipeline, type OrchestratorInput, type OrchestratorOutput } from "@/modules/video-step/step3-outfit-change/orchestrator.js";

// ============================================================================
// Mock Stage 执行函数
// ============================================================================

vi.mock("@/modules/video-step/step3-outfit-change/index.js", () => ({
  executeStage0: vi.fn(),
  executeStage1: vi.fn(),
  executeStage2: vi.fn(),
  executeStage3: vi.fn(),
}));

import {
  executeStage0,
  executeStage1,
  executeStage2,
  executeStage3,
} from "@/modules/video-step/step3-outfit-change/index.js";

// ============================================================================
// Mock 工厂
// ============================================================================

/** 创建 Mock Repository */
function createMockRepository(): IOutfitChangeTaskRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByStatus: vi.fn(),
    updateStatus: vi.fn(),
    updateStageResult: vi.fn(),
    setError: vi.fn(),
  };
}

/** 创建 Mock AppContext */
function createMockAppContext(repository: IOutfitChangeTaskRepository): AppContext {
  return {
    repos: {
      outfitChangeTasks: repository,
    } as unknown as AppContext["repos"],
    pool: {} as AppContext["pool"],
    clock: {
      generateId: () => `test-${Date.now()}`,
      now: () => Date.now(),
    },
    configService: {} as AppContext["configService"],
    store: {} as AppContext["store"],
    authService: {} as AppContext["authService"],
    adminConfigService: {} as AppContext["adminConfigService"],
    projectService: {} as AppContext["projectService"],
    uploadService: {} as AppContext["uploadService"],
    outfitService: {} as AppContext["outfitService"],
    characterService: {} as AppContext["characterService"],
    scriptService: {} as AppContext["scriptService"],
    storyboardService: {} as AppContext["storyboardService"],
    videoJobService: {} as AppContext["videoJobService"],
    creditService: {} as AppContext["creditService"],
    fissionExportService: {} as AppContext["fissionExportService"],
    reverseService: {} as AppContext["reverseService"],
    reviewService: {} as AppContext["reviewService"],
    squareService: {} as AppContext["squareService"],
    providerAdminService: {} as AppContext["providerAdminService"],
    modelPresetService: {} as AppContext["modelPresetService"],
    userAdminService: {} as AppContext["userAdminService"],
    assetLibraryService: {} as AppContext["assetLibraryService"],
    characterLibraryService: {} as AppContext["characterLibraryService"],
    projectCharacterService: {} as AppContext["projectCharacterService"],
    scriptLibraryService: {} as AppContext["scriptLibraryService"],
    reverseStoryboardLibraryService: {} as AppContext["reverseStoryboardLibraryService"],
    smartStoryboardLibraryService: {} as AppContext["smartStoryboardLibraryService"],
    myLibraryService: {} as AppContext["myLibraryService"],
    douyinPublishService: {} as AppContext["douyinPublishService"],
    douyinAuthService: {} as AppContext["douyinAuthService"],
    douyinRemoteLoginService: {} as AppContext["douyinRemoteLoginService"],
    functionalRouteService: {} as AppContext["functionalRouteService"],
    fileService: {} as AppContext["fileService"],
    projectPromptDataService: {} as AppContext["projectPromptDataService"],
    projectContextService: {} as AppContext["projectContextService"],
    businessConfigService: {} as AppContext["businessConfigService"],
    storage: null,
    auditStore: {} as AppContext["auditStore"],
  };
}

/** 创建 Mock Stage 输入 */
function createMockOrchestratorInput(): OrchestratorInput {
  return {
    taskId: "test-task-001",
    input: {
      sourceVideoUrl: "https://example.com/source-video.mp4",
      targetOutfitId: "outfit-001",
      characterType: "library",
      characterId: "character-001",
      projectId: "project-001",
      userId: "user-001",
    } as OutfitChangeTaskInput,
  };
}

/** 创建 Mock Stage 0 结果 */
function createMockStage0Result(): ReferenceCaptureResult {
  return {
    backgroundFrames: [
      "https://example.com/background-1.jpg",
      "https://example.com/background-2.jpg",
      "https://example.com/background-3.jpg",
    ],
    characterFrames: [
      "https://example.com/character-1.jpg",
      "https://example.com/character-2.jpg",
      "https://example.com/character-3.jpg",
    ],
    colorStyleFrame: "https://example.com/color-style.jpg",
    metadata: {
      totalFrameCount: 7,
      capturedAt: Date.now(),
      resolution: "1920x1080",
    },
  };
}

/** 创建 Mock Stage 1 结果 */
function createMockStage1Result(): VideoUnderstandingResult {
  return {
    poseSequence: [
      {
        timestamp: 0,
        keypoints: [
          { name: "nose", x: 100, y: 100, confidence: 0.9 },
          { name: "left_eye", x: 90, y: 95, confidence: 0.85 },
        ],
        confidence: 0.88,
      },
    ],
    actionSegments: [
      { startTime: 0, endTime: 2, actionType: "standing" },
      { startTime: 2, endTime: 5, actionType: "walking" },
    ],
    duration: 10,
    fps: 30,
  };
}

/** 创建 Mock Stage 2 结果 */
function createMockStage2Result(): CharacterAdaptResult {
  return {
    adaptedCharacterImage: "https://example.com/adapted-character.jpg",
    characterPreservationScore: 0.85,
    outfitFitScore: 0.92,
    metadata: {
      generatedAt: Date.now(),
      generationTimeMs: 5000,
      modelUsed: "flux-1.0",
    },
  };
}

/** 创建 Mock Stage 3 结果 */
function createMockStage3Result(): VideoGenerationResult {
  return {
    generatedVideoUrl: "https://example.com/generated-video.mp4",
    frameCount: 300,
    consistencyScores: {
      characterConsistency: 0.9,
      outfitConsistency: 0.88,
      motionConsistency: 0.85,
      overallConsistency: 0.87,
    },
    generationTime: 15000,
  };
}

// ============================================================================
// Mock Stage 设置 Helper 函数
// ============================================================================

/** 设置所有 4 个 Stage 成功返回 */
function setupAllStagesSuccess() {
  vi.mocked(executeStage0).mockResolvedValueOnce({
    result: createMockStage0Result(),
    elapsedMs: 1000,
  });
  vi.mocked(executeStage1).mockResolvedValueOnce({
    result: createMockStage1Result(),
    elapsedMs: 2000,
  });
  vi.mocked(executeStage2).mockResolvedValueOnce({
    result: createMockStage2Result(),
    elapsedMs: 3000,
  });
  vi.mocked(executeStage3).mockResolvedValueOnce({
    result: createMockStage3Result(),
    elapsedMs: 4000,
  });
}

/** 设置指定 Stage 失败（前置 Stage 自动设置为成功） */
function setupStageFailure(stageIndex: number, errorMessage: string) {
  const stages = [executeStage0, executeStage1, executeStage2, executeStage3];
  const results = [createMockStage0Result, createMockStage1Result, createMockStage2Result, createMockStage3Result];
  const elapsedMs = [1000, 2000, 3000, 4000];

  // 设置前置 Stage 成功
  for (let i = 0; i < stageIndex; i++) {
    vi.mocked(stages[i]).mockResolvedValueOnce({
      result: results[i](),
      elapsedMs: elapsedMs[i],
    });
  }

  // 设置指定 Stage 失败
  vi.mocked(stages[stageIndex]).mockRejectedValueOnce(new Error(errorMessage));
}

// ============================================================================
// 测试套件
// ============================================================================

describe("服装换装流水线编排器", () => {
  let mockRepository: IOutfitChangeTaskRepository;
  let mockContext: AppContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
    mockContext = createMockAppContext(mockRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 流水线执行逻辑测试
  // ============================================================================

  describe("流水线执行逻辑", () => {
    it("应按正确顺序执行 4 个阶段（Stage 0 → Stage 1 → Stage 2 → Stage 3）", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      setupAllStagesSuccess();

      // Act
      const output = await executeOutfitChangePipeline(mockContext, input);

      // Assert
      expect(output.success).toBe(true);
      expect(output.finalVideoUrl).toBe("https://example.com/generated-video.mp4");

      // 验证阶段按顺序执行
      expect(executeStage0).toHaveBeenCalledTimes(1);
      expect(executeStage1).toHaveBeenCalledTimes(1);
      expect(executeStage2).toHaveBeenCalledTimes(1);
      expect(executeStage3).toHaveBeenCalledTimes(1);

      // 验证 Stage 1 使用 Stage 0 的输出作为输入
      const stage1Call = vi.mocked(executeStage1).mock.calls[0][1];
      expect(stage1Call.characterFrames).toEqual(createMockStage0Result().characterFrames);

      // 验证 Stage 2 使用 Stage 0 和 Stage 1 的输出作为输入
      const stage2Call = vi.mocked(executeStage2).mock.calls[0][1];
      expect(stage2Call.characterFrames).toEqual(createMockStage0Result().characterFrames);
      expect(stage2Call.poseSequence).toEqual(createMockStage1Result().poseSequence);

      // 验证 Stage 3 使用 Stage 0、Stage 1、Stage 2 的输出作为输入
      const stage3Call = vi.mocked(executeStage3).mock.calls[0][1];
      expect(stage3Call.backgroundFrames).toEqual(createMockStage0Result().backgroundFrames);
      expect(stage3Call.poseSequence).toEqual(createMockStage1Result().poseSequence);
      expect(stage3Call.adaptedCharacterImage).toBe(createMockStage2Result().adaptedCharacterImage);
    });

    it("应返回正确的 OrchestratorOutput 类型", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      setupAllStagesSuccess();

      // Act
      const output = await executeOutfitChangePipeline(mockContext, input);

      // Assert
      expect(output).toHaveProperty("success");
      expect(output).toHaveProperty("taskId");
      expect(output).toHaveProperty("elapsedMs");

      if (output.success) {
        expect(output).toHaveProperty("finalVideoUrl");
        expect(output.finalVideoUrl).toBeDefined();
        expect(output.error).toBeUndefined();
      } else {
        expect(output).toHaveProperty("error");
        expect(output.error).toBeDefined();
        expect(output.finalVideoUrl).toBeUndefined();
      }

      expect(typeof output.success).toBe("boolean");
      expect(typeof output.taskId).toBe("string");
      expect(output.elapsedMs).toBeDefined();
    });
  });

  // ============================================================================
  // 状态转换测试
  // ============================================================================

  describe("状态转换", () => {
    it("应正确转换状态：pending → capturing → captured → understanding → understood → adapting → adapted → generating → succeeded", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      setupAllStagesSuccess();

      // Act
      await executeOutfitChangePipeline(mockContext, input);

      // Assert - 验证状态转换顺序
      const statusCalls = vi.mocked(mockRepository.updateStatus).mock.calls;

      // Stage 0: capturing → captured
      expect(statusCalls[0][1]).toBe("capturing");
      expect(statusCalls[1][1]).toBe("captured");

      // Stage 1: understanding → understood
      expect(statusCalls[2][1]).toBe("understanding");
      expect(statusCalls[3][1]).toBe("understood");

      // Stage 2: adapting → adapted
      expect(statusCalls[4][1]).toBe("adapting");
      expect(statusCalls[5][1]).toBe("adapted");

      // Stage 3: generating → succeeded
      expect(statusCalls[6][1]).toBe("generating");
      expect(statusCalls[7][1]).toBe("succeeded");

      // 验证总共调用 8 次 updateStatus
      expect(mockRepository.updateStatus).toHaveBeenCalledTimes(8);
    });

    it("Stage 0 失败时应设置状态为 'failed'", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      const errorMessage = "Stage 0 失败：视频帧提取失败";
      setupStageFailure(0, errorMessage);

      // Act
      const output = await executeOutfitChangePipeline(mockContext, input);

      // Assert
      expect(output.success).toBe(false);
      expect(output.error).toBe(errorMessage);

      // 验证状态转换：capturing → failed
      const statusCalls = vi.mocked(mockRepository.updateStatus).mock.calls;
      expect(statusCalls[0][1]).toBe("capturing"); // Stage 0 开始
      expect(statusCalls[1][1]).toBe("failed");    // 失败

      // 验证 setError 被调用
      expect(mockRepository.setError).toHaveBeenCalledTimes(1);
      expect(mockRepository.setError).toHaveBeenCalledWith(
        input.taskId,
        errorMessage
      );

      // 验证后续阶段未执行
      expect(executeStage1).not.toHaveBeenCalled();
      expect(executeStage2).not.toHaveBeenCalled();
      expect(executeStage3).not.toHaveBeenCalled();
    });

    it("Stage 1 失败时应设置状态为 'failed'", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      const errorMessage = "Stage 1 失败：骨架识别失败";
      setupStageFailure(1, errorMessage);

      // Act
      const output = await executeOutfitChangePipeline(mockContext, input);

      // Assert
      expect(output.success).toBe(false);
      expect(output.error).toBe(errorMessage);

      // 验证状态转换：capturing → captured → understanding → failed
      const statusCalls = vi.mocked(mockRepository.updateStatus).mock.calls;
      expect(statusCalls[0][1]).toBe("capturing");
      expect(statusCalls[1][1]).toBe("captured");
      expect(statusCalls[2][1]).toBe("understanding");
      expect(statusCalls[3][1]).toBe("failed");

      // 验证 setError 被调用
      expect(mockRepository.setError).toHaveBeenCalledTimes(1);

      // 验证后续阶段未执行
      expect(executeStage2).not.toHaveBeenCalled();
      expect(executeStage3).not.toHaveBeenCalled();
    });

    it("Stage 2 失败时应设置状态为 'failed'", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      const errorMessage = "Stage 2 失败：服装适配失败";
      setupStageFailure(2, errorMessage);

      // Act
      const output = await executeOutfitChangePipeline(mockContext, input);

      // Assert
      expect(output.success).toBe(false);
      expect(output.error).toBe(errorMessage);

      // 验证状态转换：capturing → captured → understanding → understood → adapting → failed
      const statusCalls = vi.mocked(mockRepository.updateStatus).mock.calls;
      expect(statusCalls[0][1]).toBe("capturing");
      expect(statusCalls[1][1]).toBe("captured");
      expect(statusCalls[2][1]).toBe("understanding");
      expect(statusCalls[3][1]).toBe("understood");
      expect(statusCalls[4][1]).toBe("adapting");
      expect(statusCalls[5][1]).toBe("failed");

      // 验证 setError 被调用
      expect(mockRepository.setError).toHaveBeenCalledTimes(1);

      // 验证 Stage 3 未执行
      expect(executeStage3).not.toHaveBeenCalled();
    });

    it("Stage 3 失败时应设置状态为 'failed'", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      const errorMessage = "Stage 3 失败：视频生成失败";
      setupStageFailure(3, errorMessage);

      // Act
      const output = await executeOutfitChangePipeline(mockContext, input);

      // Assert
      expect(output.success).toBe(false);
      expect(output.error).toBe(errorMessage);

      // 验证状态转换：capturing → captured → understanding → understood → adapting → adapted → generating → failed
      const statusCalls = vi.mocked(mockRepository.updateStatus).mock.calls;
      expect(statusCalls[0][1]).toBe("capturing");
      expect(statusCalls[1][1]).toBe("captured");
      expect(statusCalls[2][1]).toBe("understanding");
      expect(statusCalls[3][1]).toBe("understood");
      expect(statusCalls[4][1]).toBe("adapting");
      expect(statusCalls[5][1]).toBe("adapted");
      expect(statusCalls[6][1]).toBe("generating");
      expect(statusCalls[7][1]).toBe("failed");

      // 验证 setError 被调用
      expect(mockRepository.setError).toHaveBeenCalledTimes(1);
    });

    // TODO: 取消功能尚未在 orchestrator 层实现
    // 路由层取消端点 (POST /outfit-change/tasks/:taskId/cancel) 直接更新数据库状态为 'cancelled'
    // orchestrator 启动后异步执行，暂不支持中途取消
    // 待后续实现取消信号机制（如 AbortController 或检查状态轮询）后补充此测试
    it.skip("流水线执行中途被取消时应停止后续阶段执行", async () => {
      // 预期行为：
      // 1. 流水线执行到某个阶段（如 Stage 1）时，外部调用 repo.updateStatus(taskId, 'cancelled')
      // 2. 流水线检测到取消信号，停止执行后续阶段
      // 3. 不再调用后续阶段的 executeStage 函数
      // 4. 最终状态保持为 'cancelled'，不设置为 'failed' 或 'succeeded'

      // 当前实现状态：
      // - orchestrator 使用 async startPipeline() 启动后无法中断
      // - 没有取消信号检查机制
      // - 取消端点只更新数据库状态，不影响正在执行的流水线

      // Arrange - 模拟流水线执行中途被取消的场景
      const input = createMockOrchestratorInput();

      vi.mocked(executeStage0).mockResolvedValueOnce({
        result: createMockStage0Result(),
        elapsedMs: 1000,
      });

      vi.mocked(executeStage1).mockResolvedValueOnce({
        result: createMockStage1Result(),
        elapsedMs: 2000,
      });

      // 模拟 Stage 1 完成后被取消
      // 在实际实现中，需要在每个阶段开始前检查状态
      vi.mocked(mockRepository.findById).mockResolvedValueOnce({
        id: input.taskId,
        status: "cancelled",
        input: input.input,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as any);

      // Act
      const output = await executeOutfitChangePipeline(mockContext, input);

      // Assert - 预期行为（当前实现不支持，测试会失败）
      expect(output.success).toBe(false);
      expect(output.error).toContain("cancelled");

      // 验证后续阶段未执行
      expect(executeStage2).not.toHaveBeenCalled();
      expect(executeStage3).not.toHaveBeenCalled();

      // 验证状态保持为 'cancelled'
      const statusCalls = vi.mocked(mockRepository.updateStatus).mock.calls;
      expect(statusCalls[statusCalls.length - 1][1]).toBe("cancelled");
    });

    it.skip("任务状态为 'cancelled' 时不应启动流水线", async () => {
      // 预期行为：
      // 1. 调用 executeOutfitChangePipeline 时，首先检查任务状态
      // 2. 如果状态已经是 'cancelled'，直接返回不执行任何阶段
      // 3. 返回结果包含取消标识

      // 当前实现状态：
      // - orchestrator 不检查初始状态，直接开始执行
      // - 需要在 orchestrator 入口添加状态检查

      // Arrange - 模拟任务已被取消
      const input = createMockOrchestratorInput();

      vi.mocked(mockRepository.findById).mockResolvedValueOnce({
        id: input.taskId,
        status: "cancelled",
        input: input.input,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as any);

      // Act
      const output = await executeOutfitChangePipeline(mockContext, input);

      // Assert - 预期行为（当前实现不支持，测试会失败）
      expect(output.success).toBe(false);
      expect(output.error).toContain("cancelled");

      // 验证没有任何阶段被执行
      expect(executeStage0).not.toHaveBeenCalled();
      expect(executeStage1).not.toHaveBeenCalled();
      expect(executeStage2).not.toHaveBeenCalled();
      expect(executeStage3).not.toHaveBeenCalled();

      // 验证没有状态更新调用（状态已是 'cancelled')
      expect(mockRepository.updateStatus).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 数据库更新测试
  // ============================================================================

  describe("数据库更新", () => {
    it("每个阶段完成后应调用 updateStageResult 保存结果", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      setupAllStagesSuccess();

      // Act
      await executeOutfitChangePipeline(mockContext, input);

      // Assert
      expect(mockRepository.updateStageResult).toHaveBeenCalledTimes(4);

      // 验证每个阶段结果存储到正确的列
      const stageResultCalls = vi.mocked(mockRepository.updateStageResult).mock.calls;

      expect(stageResultCalls[0][1]).toBe("stage0");
      expect(stageResultCalls[0][2]).toEqual(createMockStage0Result());

      expect(stageResultCalls[1][1]).toBe("stage1");
      expect(stageResultCalls[1][2]).toEqual(createMockStage1Result());

      expect(stageResultCalls[2][1]).toBe("stage2");
      expect(stageResultCalls[2][2]).toEqual(createMockStage2Result());

      expect(stageResultCalls[3][1]).toBe("stage3");
      expect(stageResultCalls[3][2]).toEqual(createMockStage3Result());
    });

    it("失败时应调用 setError 记录错误信息", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      const errorMessage = "测试错误信息";

      vi.mocked(executeStage0).mockRejectedValueOnce(new Error(errorMessage));

      // Act
      await executeOutfitChangePipeline(mockContext, input);

      // Assert
      expect(mockRepository.setError).toHaveBeenCalledTimes(1);
      expect(mockRepository.setError).toHaveBeenCalledWith(
        input.taskId,
        errorMessage
      );
    });

    it("每个阶段开始时应调用 updateStatus 更新运行状态", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      setupAllStagesSuccess();

      // Act
      await executeOutfitChangePipeline(mockContext, input);

      // Assert - 验证每个阶段开始时更新状态为 "running"
      const statusCalls = vi.mocked(mockRepository.updateStatus).mock.calls;

      // Stage 0 开始 → capturing
      expect(statusCalls[0][1]).toBe("capturing");

      // Stage 1 开始 → understanding
      expect(statusCalls[2][1]).toBe("understanding");

      // Stage 2 开始 → adapting
      expect(statusCalls[4][1]).toBe("adapting");

      // Stage 3 开始 → generating
      expect(statusCalls[6][1]).toBe("generating");
    });

    it("每个阶段完成时应调用 updateStatus 更新完成状态", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      setupAllStagesSuccess();

      // Act
      await executeOutfitChangePipeline(mockContext, input);

      // Assert - 验证每个阶段完成时更新状态为 "completed"
      const statusCalls = vi.mocked(mockRepository.updateStatus).mock.calls;

      // Stage 0 完成 → captured
      expect(statusCalls[1][1]).toBe("captured");

      // Stage 1 完成 → understood
      expect(statusCalls[3][1]).toBe("understood");

      // Stage 2 完成 → adapted
      expect(statusCalls[5][1]).toBe("adapted");

      // Stage 3 完成 → succeeded
      expect(statusCalls[7][1]).toBe("succeeded");
    });
  });

  // ============================================================================
  // 耗时记录测试
  // ============================================================================

  describe("耗时记录", () => {
    it("应记录每个阶段的执行耗时", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      setupAllStagesSuccess();

      // Act
      const output = await executeOutfitChangePipeline(mockContext, input);

      // Assert
      expect(output.elapsedMs).toBeDefined();
      expect(output.elapsedMs?.stage0).toBe(1000);
      expect(output.elapsedMs?.stage1).toBe(2000);
      expect(output.elapsedMs?.stage2).toBe(3000);
      expect(output.elapsedMs?.stage3).toBe(4000);
      expect(output.elapsedMs?.total).toBeDefined();
    });

    it("失败时也应记录耗时", async () => {
      // Arrange
      const input = createMockOrchestratorInput();

      vi.mocked(executeStage0).mockRejectedValueOnce(new Error("测试错误"));

      // Act
      const output = await executeOutfitChangePipeline(mockContext, input);

      // Assert
      expect(output.elapsedMs).toBeDefined();
      expect(output.elapsedMs?.total).toBeDefined();
    });
  });

  // ============================================================================
  // 边界情况测试
  // ============================================================================

  describe("边界情况", () => {
    it("非 Error 类型的异常应转换为字符串", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      const errorMessage = "字符串错误";

      vi.mocked(executeStage0).mockRejectedValueOnce(errorMessage);

      // Act
      const output = await executeOutfitChangePipeline(mockContext, input);

      // Assert
      expect(output.success).toBe(false);
      expect(output.error).toBe(errorMessage);
      expect(mockRepository.setError).toHaveBeenCalledWith(
        input.taskId,
        errorMessage
      );
    });

    it("taskId 应正确传递到所有 repository 方法", async () => {
      // Arrange
      const input = createMockOrchestratorInput();
      setupAllStagesSuccess();

      // Act
      const output = await executeOutfitChangePipeline(mockContext, input);

      // Assert - 验证所有 repository 调用使用正确的 taskId
      const statusCalls = vi.mocked(mockRepository.updateStatus).mock.calls;
      statusCalls.forEach((call) => {
        expect(call[0]).toBe(input.taskId);
      });

      const stageResultCalls = vi.mocked(mockRepository.updateStageResult).mock.calls;
      stageResultCalls.forEach((call) => {
        expect(call[0]).toBe(input.taskId);
      });

      expect(output.taskId).toBe(input.taskId);
    });
  });
});