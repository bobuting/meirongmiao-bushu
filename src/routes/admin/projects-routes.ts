/**
 * admin/projects-routes.ts
 * 项目管理路由：项目列表、详情、干预操作
 */

import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/app-context.js";

import type { AdminProjectListQuery, AdminProjectListRow } from "../../repositories/pg/project-pg-repository.js";

import { AppError } from "../../core/errors.js";
import { requireAdmin } from "../../services/auth/route-guards.js";
import { scriptTypeToStrategy } from "../../contracts/types.js";
import type { ScriptTypeValue } from "../../contracts/types.js";
import { migrateProjectPreview, migrateProjectExecute } from "./project-migrate-handler.js";

/**
 * 注册 /admin/projects/* 路由
 */
export function registerAdminProjectsRoutes(
  app: FastifyInstance,
  ctx: AppContext
): void {
  /**
   * GET /admin/projects
   * 获取项目列表（支持筛选、排序、分页）
   */
  app.get("/admin/projects", async (request) => {
    await requireAdmin(ctx, request);
    const query = request.query as AdminProjectListQuery;

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;

    const { rows, total } = await ctx.repos.projects.adminListProjects({
      ...query,
      page,
      pageSize,
    });

    return {
      projects: rows.map((row: AdminProjectListRow) => ({
        id: row.id,
        title: row.name,
        projectKind: row.project_kind || "video",
        status: row.status,
        currentStep: calculateCurrentStep(row.status, row.project_kind || "video"),
        totalSteps: row.project_kind === "image" ? 4 : 6,
        companyName: row.company_name || "",
        userId: row.user_id,
        userEmail: row.user_email || "",
        createdAt: Number(row.created_at) || 0,
        updatedAt: Number(row.updated_at) || 0,
        views: row.views || 0,
        thumbnail: row.thumbnail_url || "",
        publishTitle: row.publish_title || "",
        exportUrl: row.export_url || "",
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  });

  /**
   * GET /admin/projects/:id/detail
   * 获取项目详情
   */
  app.get("/admin/projects/:id/detail", async (request) => {
    await requireAdmin(ctx, request);
    const params = request.params as { id: string };

    // 查询项目基本信息（含用户 JOIN）
    const project = await ctx.repos.projects.findDetailWithUser(params.id);

    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
    }

    // 并行查询独立数据
    const [
      tasksRows,
      llmCallCount,
      charactersRows,
      garmentsRows,
      outfitPlansRows,
      modelPhotosRows,
      scriptRows,
      storyboardsRows,
      outfitChangeRow,
      pageSectionsRows,
      clipVideosRows,
      finalVideoRows,
      publishRows,
      step5FinalVideosRows,
      fissionStatusRow,
      fissionVideosRows,
      imageGenerationCount,
      videoGenerationCount,
      creditConsumption,
    ] = await Promise.all([
      ctx.repos.asyncJobs.findByProjectId(params.id, 20),
      ctx.repos.providerCallAudits.countByProject(params.id),
      ctx.repos.projectCharacters.findByProjectWithLibrary(params.id),
      ctx.repos.projectGarmentAssocs.findByProjectWithAsset(params.id),
      ctx.repos.outfitPlans.findByProject(params.id),
      ctx.repos.modelPhotos.findByProject(params.id),
      ctx.repos.scriptData.findByProject(params.id, 20),
      ctx.repos.step3FrameImages.findByProject(params.id),
      ctx.repos.outfitChangeProjects.findByProject(params.id),
      ctx.repos.pageSections.findByProject(params.id),
      ctx.repos.step4VideoScenes.findByProject(params.id),
      ctx.repos.finalVideos.findByProjectAndType(params.id, "step4", 10),
      ctx.repos.squareTemplates.findByProject(params.id, 5),
      ctx.repos.finalVideos.findByProjectAndTypes(params.id, ["step4", "fission"], 15),
      ctx.repos.fissionVideoStatus.findLatestByProject(params.id),
      ctx.repos.fissionVideos.findByProject(params.id),
      ctx.repos.providerCallAudits.countByProjectAndRouteKeyPattern(params.id, "%image%"),
      ctx.repos.providerCallAudits.countByProjectAndRouteKeyPattern(params.id, "%video%"),
      ctx.repos.auditLogs.sumCreditConsumptionByProject(params.id),
    ]);

    // 查询角色五视图（按 character_id 分组）
    const libraryCharacterIds = charactersRows
      .map((c) => c.library_character_id as string)
      .filter(Boolean);
    const fiveViewsRows = libraryCharacterIds.length > 0
      ? await ctx.repos.characterFiveViews.findByCharacterIds(libraryCharacterIds)
      : [];
    const fiveViewsByCharacter: Record<string, string[]> = {};
    for (const row of fiveViewsRows) {
      const charId = row.character_id as string;
      if (!fiveViewsByCharacter[charId]) {
        fiveViewsByCharacter[charId] = [];
      }
      if (row.image_url) {
        fiveViewsByCharacter[charId].push(row.image_url as string);
      }
    }

    // 查询选中角色的五视图
    const selectedCharacter = charactersRows.find((c) => c.is_selected as boolean);
    let characterViews: Array<{ image_url: string }> = [];
    if (selectedCharacter) {
      const viewsRows = await ctx.repos.characterFiveViews.findActiveByCharacterIdRaw(
        selectedCharacter.library_character_id as string
      );
      characterViews = viewsRows.map((v) => ({ image_url: v.image_url as string }));
    }

    // 查询分镜描述（依赖首条脚本数据）
    const isImageProject = (project.project_kind as string) === "image";
    const isOutfitChangeProject = (project.project_kind as string) === "outfit_change";

    let shotBreakdownsRows: Record<string, unknown>[] = [];
    if (!isImageProject && !isOutfitChangeProject && scriptRows[0]) {
      shotBreakdownsRows = await ctx.repos.shotBreakdowns.findByScriptDataIdFull(
        scriptRows[0].id as string
      );
    }

    // 查询换装项目的关联数据
    let garmentAssetRow: Record<string, unknown> | null = null;
    let libraryCharacterRow: Record<string, unknown> | null = null;
    if (isOutfitChangeProject && outfitChangeRow) {
      const targetOutfitId = outfitChangeRow.target_outfit_id as string | null;
      const characterId = outfitChangeRow.character_id as string | null;

      const [gAsset, lChar] = await Promise.all([
        targetOutfitId ? ctx.repos.garmentAssets.findById(targetOutfitId) : Promise.resolve(null),
        characterId ? ctx.repos.libraryCharacters.findById(characterId) : Promise.resolve(null),
      ]);
      garmentAssetRow = gAsset ? { id: gAsset.id, name: gAsset.name, main_image_url: gAsset.mainImageUrl, category: gAsset.category, description: gAsset.description } : null;
      libraryCharacterRow = lChar ? { id: lChar.id, name: lChar.name, thumbnail_url: lChar.thumbnailUrl, five_view_oss_image_url: lChar.fiveViewOssImageUrl } : null;
    }

    // 查询裂变任务项（依赖裂变状态）
    const taskItemsRows = fissionStatusRow
      ? await ctx.repos.fissionTaskItems.findByFissionStatusId(fissionStatusRow.id)
      : [];

    // ========== 构建响应 ==========

    // 角色预设
    const roleDirection = project.selected_role_direction as {
      directionId?: string;
      title?: string;
      styleSummary?: string;
      portraitUrl?: string | null;
      gender?: string | null;
      age?: number | null;
      styleWords?: string[] | null;
      ethnicityOrRegion?: string | null;
    } | null;

    // 处理 tasksRows（来自 findByProjectId 返回 AsyncJobRecord[]，字段是 camelCase）
    const tasks = tasksRows.map((task) => ({
      id: task.id,
      job_type: task.jobType,
      status: task.status,
      error: task.error,
      created_at: Number(task.createdAt) || 0,
      updated_at: Number(task.updatedAt) || 0,
    }));

    return {
      basicInfo: {
        id: project.id as string,
        title: project.name as string,
        projectKind: (project.project_kind as string) || "video",
        status: project.status as string,
        currentStep: calculateCurrentStep(project.status as string, (project.project_kind as string) || "video"),
        companyName: (project.company_name as string) || "",
        userId: project.user_id as string,
        userEmail: (project.user_email as string) || "",
        createdAt: Number(project.created_at) || 0,
        updatedAt: Number(project.updated_at) || 0,
        coverImageUrl: (project.cover_image_url as string) || "",
        garmentImageUrl: (project.garment_image_url as string) || "",
        publishTitle: (project.publish_title as string) || "",
        reverseScriptId: (project.reverse_script_id as string) || null,
      },
      characters: charactersRows.map((row) => ({
        id: row.id as string,
        libraryCharacterId: row.library_character_id as string,
        name: row.name as string,
        thumbnailUrl: (row.five_view_oss_image_url as string) || (row.thumbnail_url as string) || null,
        isSelected: row.is_selected as boolean,
        sourceType: (row.source_type as string) || 'library',
        role: (row.role as string) || 'main',
        fiveViewUrls: fiveViewsByCharacter[row.library_character_id as string] || [],
      })),
      tasks,
      resourceConsumption: {
        llmCalls: llmCallCount,
        imageGenerations: imageGenerationCount,
        videoGenerations: videoGenerationCount,
        creditConsumption,
      },
      // Step1 数据
      step1Data: {
        garments: garmentsRows.map((g) => ({
          id: g.id as string,
          garmentAssetId: g.garment_asset_id as string,
          name: (g.name as string) || null,
          category: g.category as string,
          imageUrl: (g.image_url as string) || (g.main_image_url as string),
          subImageUrls: [g.sub_image_url_1, g.sub_image_url_2, g.sub_image_url_3].filter(Boolean) as string[],
          flatLayImageUrl: (g.flat_lay_image_url as string) || null,
        })),
        outfitPlans: outfitPlansRows.map((op) => ({
          id: op.id as string,
          title: op.title as string,
          reason: op.reason as string,
          assetIds: op.asset_ids,
          selected: op.selected,
        })),
      },
      // Step2 数据
      step2Data: {
        rolePreset: roleDirection ? {
          title: roleDirection.styleSummary ?? roleDirection.title ?? "",
          imageUrl: roleDirection.portraitUrl ?? "",
          gender: roleDirection.gender ?? null,
          age: roleDirection.age ?? null,
          styleWords: roleDirection.styleWords ?? null,
          ethnicityOrRegion: roleDirection.ethnicityOrRegion ?? null,
        } : null,
        characterViews,
      },
      // Step3 数据（视频项目：脚本+分镜，图片项目：模特图，换装项目：换装任务信息）
      step3Data: isImageProject ? {
        modelPhotos: modelPhotosRows.map((mp) => ({
          id: mp.id as string,
          imageUrl: mp.image_url as string,
          poseLabel: mp.pose_label as string,
          bgLabel: mp.bg_label as string,
          isSelected: mp.is_selected as boolean,
          status: mp.status as string,
          errorMessage: mp.error_message as string,
          sortOrder: mp.sort_order as number,
        })),
        script: null,
        storyboards: [],
        shotBreakdowns: [],
      } : isOutfitChangeProject ? {
        outfitChangeTask: outfitChangeRow ? {
          taskId: outfitChangeRow.task_id as string,
          status: outfitChangeRow.status as string,
          errorMessage: outfitChangeRow.error_message as string,
          createdAt: Number(outfitChangeRow.created_at) || 0,
          updatedAt: Number(outfitChangeRow.updated_at) || 0,
          sourceVideoUrl: outfitChangeRow.source_video_url as string,
          targetOutfit: garmentAssetRow ? {
            id: garmentAssetRow.id as string,
            name: garmentAssetRow.name as string,
            imageUrl: garmentAssetRow.main_image_url as string,
            category: garmentAssetRow.category as string,
            description: garmentAssetRow.description as string,
          } : null,
          character: libraryCharacterRow ? {
            id: libraryCharacterRow.id as string,
            name: libraryCharacterRow.name as string,
            thumbnailUrl: libraryCharacterRow.thumbnail_url as string,
            fiveViewImageUrl: libraryCharacterRow.five_view_oss_image_url as string,
          } : null,
        } : null,
        script: null,
        storyboards: [],
        shotBreakdowns: [],
        modelPhotos: [],
      } : {
        script: scriptRows[0] ? {
          id: scriptRows[0].id as string,
          title: scriptRows[0].title as string,
          summary: scriptRows[0].summary as string,
          durationSeconds: scriptRows[0].duration_seconds as number,
          primaryEmotion: scriptRows[0].primary_emotion as string,
          theme: scriptRows[0].theme as string,
          videoStyle: scriptRows[0].video_style as string,
          isConfirmed: scriptRows[0].is_confirmed as boolean,
          isSelected: scriptRows[0].is_selected as boolean,
          strategyType: scriptTypeToStrategy(scriptRows[0].type as ScriptTypeValue) || "unknown",
          source: scriptRows[0].source as string,
          sourceType: scriptRows[0].source_type as string,
          sourceOssUrl: scriptRows[0].source_oss_url as string,
          content: scriptRows[0].content as string,
          createdAt: Number(scriptRows[0].created_at) || 0,
        } : null,
        scriptHistory: scriptRows.map((s) => ({
          id: s.id as string,
          title: s.title as string,
          summary: s.summary as string,
          durationSeconds: s.duration_seconds as number,
          primaryEmotion: s.primary_emotion as string,
          theme: s.theme as string,
          videoStyle: s.video_style as string,
          isConfirmed: s.is_confirmed as boolean,
          isSelected: s.is_selected as boolean,
          strategyType: scriptTypeToStrategy(s.type as ScriptTypeValue) || "unknown",
          source: s.source as string,
          sourceType: s.source_type as string,
          sourceOssUrl: s.source_oss_url as string,
          createdAt: Number(s.created_at) || 0,
        })),
        storyboards: storyboardsRows.map((sb) => ({
          id: sb.id as string,
          frameIndex: sb.frame_index as number,
          selectedImageUrl: sb.selected_image_url as string,
          batches: sb.batches,
          prompt: sb.image_prompt as string,
          imagePrompt: sb.image_prompt as string,
          status: sb.status as string,
        })),
        shotBreakdowns: shotBreakdownsRows.map((sb) => ({
          id: sb.id as string,
          shotIndex: sb.shot_index as number,
          shotType: sb.shot_type as string,
          shotDescription: sb.shot_description as string,
          durationSeconds: sb.duration_seconds as number,
          visualJson: sb.visual_json,
          subjectsJson: sb.subjects_json,
          textElementsJson: sb.text_elements_json,
        })),
        modelPhotos: [],
      },
      // Step4 数据
      step4Data: isImageProject ? {
        pageSections: pageSectionsRows.map((ps) => ({
          id: ps.id as string,
          sectionKey: ps.section_key as string,
          sectionType: ps.section_type as string,
          title: ps.title as string,
          goal: ps.goal as string,
          copy: ps.copy as string,
          status: ps.status as string,
          imageUrl: ps.current_image_asset_id as string,
          sortOrder: ps.sort_order as number,
        })),
        clipVideos: [],
        finalVideo: null,
      } : isOutfitChangeProject ? {
        outfitChangeStages: outfitChangeRow ? {
          stage0: (outfitChangeRow.stage0_result_json as Record<string, unknown> | null) ? {
            backgroundFrames: ((outfitChangeRow.stage0_result_json as Record<string, unknown>)?.backgroundFrames as unknown[]) || [],
            characterFrames: ((outfitChangeRow.stage0_result_json as Record<string, unknown>)?.characterFrames as unknown[]) || [],
            colorStyleFrame: ((outfitChangeRow.stage0_result_json as Record<string, unknown>)?.colorStyleFrame as unknown) || null,
          } : null,
          stage1: (outfitChangeRow.stage1_result_json as Record<string, unknown> | null) ? {
            duration: ((outfitChangeRow.stage1_result_json as Record<string, unknown>)?.duration as number) || 0,
            fps: ((outfitChangeRow.stage1_result_json as Record<string, unknown>)?.fps as number) || 0,
            actionSegments: ((outfitChangeRow.stage1_result_json as Record<string, unknown>)?.actionSegments as unknown[]) || [],
          } : null,
          stage2: (outfitChangeRow.stage2_result_json as Record<string, unknown> | null) ? {
            adaptedCharacterImage: ((outfitChangeRow.stage2_result_json as Record<string, unknown>)?.adaptedCharacterImage as string) || null,
            characterPreservationScore: ((outfitChangeRow.stage2_result_json as Record<string, unknown>)?.characterPreservationScore as number) || 0,
            outfitFitScore: ((outfitChangeRow.stage2_result_json as Record<string, unknown>)?.outfitFitScore as number) || 0,
          } : null,
          stage3: (outfitChangeRow.stage3_result_json as Record<string, unknown> | null) ? {
            generatedVideoUrl: ((outfitChangeRow.stage3_result_json as Record<string, unknown>)?.generatedVideoUrl as string) || null,
            frameCount: ((outfitChangeRow.stage3_result_json as Record<string, unknown>)?.frameCount as number) || 0,
            consistencyScores: ((outfitChangeRow.stage3_result_json as Record<string, unknown>)?.consistencyScores as unknown) || null,
          } : null,
        } : null,
        finalVideo: (() => {
          const asyncJobResult = tasksRows.find(
            (job) => job.jobType === 'outfit_change' && job.status === 'completed'
          );
          if (asyncJobResult && asyncJobResult.result) {
            const resultJson = typeof asyncJobResult.result === 'string'
              ? JSON.parse(asyncJobResult.result) as Record<string, unknown>
              : asyncJobResult.result as unknown as Record<string, unknown>;
            return {
              videoUrl: (resultJson?.finalVideoUrl as string) || (resultJson?.mergedVideoUrl as string) || null,
              durationSec: 0,
              coverImageUrl: (project.cover_image_url as string) || (project.thumbnail_url as string) || null,
              createdAt: Number(asyncJobResult.updatedAt) || 0,
            };
          }
          return null;
        })(),
        clipVideos: [],
        pageSections: [],
      } : {
        clipVideos: clipVideosRows.map((cv) => ({
          id: cv.id as string,
          sceneIndex: cv.scene_index as number,
          clipUrl: cv.clip_url as string,
          variantUrls: cv.variant_urls,
          clipStatus: cv.clip_status as string,
          errorMessage: cv.error_message as string,
          selectedIndex: cv.selected_index as number,
          clipGeneration: cv.clip_generation,
          clipPrompt: cv.clip_prompt as string,
          createdAt: Number(cv.created_at) || 0,
        })),
        finalVideo: finalVideoRows[0] ? {
          id: finalVideoRows[0].id,
          videoUrl: finalVideoRows[0].videoUrl,
          durationSec: finalVideoRows[0].durationSec,
          coverImageUrl: finalVideoRows[0].coverImageUrl,
          backgroundMusicUrl: finalVideoRows[0].backgroundMusicUrl,
          createdAt: Number(finalVideoRows[0].createdAt) || 0,
        } : null,
        finalVideoHistory: finalVideoRows.map((fv) => ({
          id: fv.id,
          videoUrl: fv.videoUrl,
          durationSec: fv.durationSec,
          coverImageUrl: fv.coverImageUrl,
          createdAt: Number(fv.createdAt) || 0,
        })),
        pageSections: [],
      },
      // Step5 数据
      step5Data: {
        publishRecords: publishRows.map((pr) => ({
          id: pr.id as string,
          publishTitle: pr.title as string,
          publishUrl: pr.videoUrl as string,
          createdAt: Number(pr.createdAt) || 0,
          reviewStatus: pr.reviewStatus as string,
        })),
        finalVideos: step5FinalVideosRows.map((fv) => ({
          id: fv.id,
          videoUrl: fv.videoUrl,
          durationSec: fv.durationSec,
          coverImageUrl: fv.coverImageUrl,
          videoType: fv.videoType,
          createdAt: Number(fv.createdAt) || 0,
        })),
      },
      // Step6 数据
      step6Data: {
        fissionStatus: fissionStatusRow ? {
          id: fissionStatusRow.id,
          status: fissionStatusRow.status,
          createdAt: Number(fissionStatusRow.createdAt) || 0,
        } : null,
        taskItems: taskItemsRows.map((item) => ({
          id: item.id,
          taskType: item.taskType,
          itemIndex: item.itemIndex,
          imageUrl: item.imageUrl,
          imageStatus: item.imageStatus,
          videoUrl: item.videoUrl,
          videoStatus: item.videoStatus,
          imageErrorMessage: item.imageErrorMessage,
          videoErrorMessage: item.videoErrorMessage,
        })),
        fissionVideos: fissionVideosRows.map((fv) => ({
          id: fv.id,
          fissionType: fv.fissionType,
          videoPath: fv.videoPath,
          thumbnailUrl: fv.thumbnailUrl,
          status: fv.status,
          createdAt: Number(fv.createdAt) || 0,
        })),
      },
    };
  });

  /**
   * POST /admin/projects/:id/operations
   * 统一操作接口（解锁、重置、删除等）
   */
  app.post("/admin/projects/:id/operations", async (request) => {
    const admin = await requireAdmin(ctx, request);
    const params = request.params as { id: string };
    const body = request.body as {
      operationType:
        | "unlock_script"
        | "unlock_character"
        | "unlock_outfit"
        | "reset_step"
        | "retry_task"
        | "force_complete"
        | "delete_project";
      reason: string;
      targetStep?: number;
      taskId?: string;
      preview?: boolean;
    };

    if (!body.reason || body.reason.trim().length < 5) {
      throw new AppError(400, "REASON_REQUIRED", "操作原因至少需要 5 个字符");
    }

    // 验证项目存在
    const project = await ctx.repos.projects.findById(params.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "项目不存在");
    }

    // 执行解锁操作
    const now = Date.now();
    if (body.operationType === "unlock_script") {
      await ctx.repos.projects.updateStatusConditional(
        params.id,
        "SCRIPT_SELECTED",
        ["SCRIPT_CONFIRMED", "STORYBOARDING", "STORYBOARD_PREVIEW_COMPLETED"],
      );
    } else if (body.operationType === "unlock_character") {
      await ctx.repos.projects.updateStatusConditional(
        params.id,
        "CHARACTER_SELECTED",
        ["CHARACTER_CONFIRMED", "SCRIPT_GENERATED", "SCRIPT_SELECTED", "SCRIPT_CONFIRMED"],
      );
    } else if (body.operationType === "unlock_outfit") {
      await ctx.repos.projects.updateStatusConditional(
        params.id,
        "OUTFIT_SELECTED",
        ["OUTFIT_CONFIRMED", "CHARACTER_VIEW_READY", "CHARACTER_SELECTED", "CHARACTER_CONFIRMED"],
      );
    } else {
      throw new AppError(400, "UNSUPPORTED_OPERATION", "不支持的操作类型");
    }

    // 记录审计日志
    await ctx.repos.adminOperationLogs.create({
      adminUserId: admin.id,
      projectId: params.id,
      operationType: body.operationType,
      reason: body.reason,
      createdAt: now,
    });

    return {
      success: true,
      message: "操作成功",
    };
  });

  /**
   * GET /admin/projects/:id/scripts/raw
   * 返回项目所有脚本的原始数据（VideoScriptPayload 格式 + shot_prompts）
   */
  app.get("/admin/projects/:id/scripts/raw", async (request) => {
    await requireAdmin(ctx, request);
    const params = request.params as { id: string };

    // 查询所有脚本（完整字段）
    const scriptRows = await ctx.repos.scriptData.findByProjectFull(params.id);

    // 查询每个脚本的分镜数据并重建 VideoScriptPayload
    const scripts = await Promise.all(
      scriptRows.map(async (row: Record<string, unknown>) => {
        const rowType = row.type as ScriptTypeValue;
        // 查询分镜
        const shotsRows = await ctx.repos.shotBreakdowns.findByScriptDataIdFull(row.id as string);

        // 解析 JSONB 字段
        const parseJson = (v: unknown) => {
          if (!v) return undefined;
          if (typeof v === "object") return v as Record<string, unknown>;
          try { return JSON.parse(v as string); } catch { return undefined; }
        };

        // 重建 VideoScriptPayload
        const shot_breakdown = shotsRows.map((s: Record<string, unknown>) => ({
          shot_id: s.shot_index,
          shot_type: s.shot_type ?? undefined,
          camera_movement: s.camera_movement ?? undefined,
          shot_description: s.shot_description ?? undefined,
          timecode: {
            start: s.timecode_start ?? undefined,
            end: s.timecode_end ?? undefined,
            duration_seconds: s.duration_seconds ?? undefined,
          },
          transition_in: (parseJson(s.transition_json) as Record<string, unknown> | null)?.in ?? undefined,
          transition_out: (parseJson(s.transition_json) as Record<string, unknown> | null)?.out ?? undefined,
          camera_details: parseJson(s.camera_details_json) ?? undefined,
          visual: parseJson(s.visual_json) ?? undefined,
          subjects: parseJson(s.subjects_json) ?? undefined,
          audio: parseJson(s.audio_json) ?? undefined,
          text_elements: parseJson(s.text_elements_json) ?? undefined,
          speed_effects: parseJson(s.speed_effects_json) ?? undefined,
        }));

        const payload = {
          video_info: {
            title: row.title || undefined,
            title_candidates: parseJson(row.title_candidates) || undefined,
            duration_seconds: row.duration_seconds || undefined,
            source: row.source || undefined,
            time_of_day: row.time_of_day || undefined,
            weather: row.weather || undefined,
            main_scene: row.main_scene || undefined,
          },
          video_analysis: {
            title: row.title || undefined,
            theme: row.theme || undefined,
            summary: row.summary || undefined,
            emotion: parseJson(row.emotion_detail) || undefined,
            video_type: row.video_type || undefined,
            video_style: row.video_style || undefined,
            target_audience: row.target_audience || undefined,
            on_screen_presence: parseJson(row.on_screen_presence) || undefined,
            fashion_placement: {
              suitable: row.fashion_suitable ?? undefined,
              reason: row.fashion_reason || undefined,
              recommended_styles: parseJson(row.fashion_styles) || undefined,
              placement_notes: row.placement_notes || undefined,
            },
            key_elements: parseJson(row.key_elements) || undefined,
            atmosphere: row.atmosphere || undefined,
          },
          shot_breakdown,
          editing_analysis: parseJson(row.editing_analysis) || undefined,
        };

        return {
          scriptId: row.id,
          title: row.title,
          isSelected: row.is_selected ?? false,
          isConfirmed: row.is_confirmed ?? false,
          strategyType: scriptTypeToStrategy(rowType) || "unknown",
          createdAt: Number(row.created_at) || 0,
          payload,
          shotPrompts: parseJson(row.shot_prompts) ?? null,
        };
      })
    );

    return { scripts };
  });

  /**
   * GET /admin/companies
   * 获取公司列表（用于下拉筛选）
   */
  app.get("/admin/companies", async (request) => {
    await requireAdmin(ctx, request);

    const companies = await ctx.repos.users.getDistinctCompanies();

    return { companies };
  });


  /**
   * GET /admin/projects/:id/tasks
   * 获取项目任务列表
   */
  app.get("/admin/projects/:id/tasks", async (request) => {
    await requireAdmin(ctx, request);
    const params = request.params as { id: string };

    const tasks = await ctx.repos.asyncJobs.findByProjectId(params.id, 50);

    return {
      tasks: tasks.map((row) => ({
        id: row.id,
        jobType: row.jobType,
        status: row.status,
        error: row.error,
        createdAt: Number(row.createdAt) || 0,
        updatedAt: Number(row.updatedAt) || 0,
      })),
    };
  });

  /**
   * GET /admin/tasks/anomalies
   * 获取异常任务统计
   */
  app.get("/admin/tasks/anomalies", async (request) => {
    await requireAdmin(ctx, request);

    // 并行查询三种异常统计
    const [failed, stuck, slowStep] = await Promise.all([
      ctx.repos.asyncJobs.countByStatus("failed"),
      ctx.repos.projects.countStuckProjects(),
      ctx.repos.projects.countSlowStepProjects(),
    ]);

    return { failed, stuck, slowStep };
  });

  /**
   * GET /admin/projects/export
   * 导出项目数据为 CSV
   */
  app.get("/admin/projects/export", async (request, reply) => {
    await requireAdmin(ctx, request);
    const query = request.query as AdminProjectListQuery;

    const rows = await ctx.repos.projects.adminExportProjects(query);

    // 生成 CSV
    const headers = ["项目ID", "标题", "类型", "状态", "创建时间", "更新时间", "用户邮箱", "公司"];
    const csvRows = rows.map((row) => [
      row.id,
      row.name,
      row.project_kind,
      row.status,
      new Date(Number(row.created_at)).toLocaleString("zh-CN"),
      new Date(Number(row.updated_at)).toLocaleString("zh-CN"),
      row.user_email || "",
      row.company_name || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...csvRows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    // 设置响应头
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="projects-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    return csvContent;
  });

  // 获取反推源脚本详情（返回完整 payload 格式，与普通脚本一致）
  app.get<{
    Params: { id: string };
  }>(
    "/admin/reverse-scripts/:id",
    async (request) => {
      await requireAdmin(ctx, request);
      const { id } = request.params;

      // 查询脚本基础数据（完整字段）
      const row = await ctx.repos.scriptData.findFullById(id);

      if (!row) {
        throw new AppError(404, "SOURCE_SCRIPT_NOT_FOUND", "源脚本不存在");
      }

      // 查询分镜数据
      const shotsRows = await ctx.repos.shotBreakdowns.findByScriptDataIdFull(id);

      // 解析 JSONB 字段
      const parseJson = (v: unknown) => {
        if (!v) return undefined;
        if (typeof v === "object") return v as Record<string, unknown>;
        try { return JSON.parse(v as string); } catch { return undefined; }
      };

      // 重建 VideoScriptPayload
      const shot_breakdown = shotsRows.map((s: Record<string, unknown>) => ({
        shot_id: s.shot_index,
        shot_type: s.shot_type ?? undefined,
        camera_movement: s.camera_movement ?? undefined,
        shot_description: s.shot_description ?? undefined,
        timecode: {
          start: s.timecode_start ?? undefined,
          end: s.timecode_end ?? undefined,
          duration_seconds: s.duration_seconds ?? undefined,
        },
        transition_in: (parseJson(s.transition_json) as Record<string, unknown> | null)?.in ?? undefined,
        transition_out: (parseJson(s.transition_json) as Record<string, unknown> | null)?.out ?? undefined,
        camera_details: parseJson(s.camera_details_json) ?? undefined,
        visual: parseJson(s.visual_json) ?? undefined,
        subjects: parseJson(s.subjects_json) ?? undefined,
        audio: parseJson(s.audio_json) ?? undefined,
        text_elements: parseJson(s.text_elements_json) ?? undefined,
        speed_effects: parseJson(s.speed_effects_json) ?? undefined,
      }));

      const payload = {
        video_info: {
          title: row.title || undefined,
          title_candidates: parseJson(row.title_candidates) || undefined,
          duration_seconds: row.duration_seconds || undefined,
          source: row.source || undefined,
          time_of_day: row.time_of_day || undefined,
          weather: row.weather || undefined,
          main_scene: row.main_scene || undefined,
        },
        video_analysis: {
          title: row.title || undefined,
          theme: row.theme || undefined,
          summary: row.summary || undefined,
          emotion: parseJson(row.emotion_detail) || undefined,
          video_type: row.video_type || undefined,
          video_style: row.video_style || undefined,
          target_audience: row.target_audience || undefined,
          on_screen_presence: parseJson(row.on_screen_presence) || undefined,
          fashion_placement: {
            suitable: row.fashion_suitable ?? undefined,
            reason: row.fashion_reason || undefined,
            recommended_styles: parseJson(row.fashion_styles) || undefined,
            placement_notes: row.placement_notes || undefined,
          },
          key_elements: parseJson(row.key_elements) || undefined,
          atmosphere: row.atmosphere || undefined,
        },
        shot_breakdown,
        editing_analysis: parseJson(row.editing_analysis) || undefined,
      };

      // 返回与普通脚本相同格式
      return {
        scriptId: row.id,
        title: row.title,
        isSelected: row.is_selected ?? false,
        isConfirmed: row.is_confirmed ?? false,
        strategyType: scriptTypeToStrategy(row.type as ScriptTypeValue) || "reverse",
        createdAt: Number(row.created_at) || 0,
        payload,
        shotPrompts: parseJson(row.shot_prompts) ?? null,
        sourceType: row.source_type as string | undefined,
        sourceOssUrl: row.source_oss_url as string | undefined,
      };
    }
  );

  /**
   * POST /admin/projects/migrate
   * 项目迁移（预览或执行）
   */
  app.post("/admin/projects/migrate", async (request) => {
    await requireAdmin(ctx, request);
    const body = request.body as {
      projectId: string;
      preview?: boolean;
    };

    if (!body.projectId) {
      throw new AppError(400, "INVALID_REQUEST", "缺少 projectId");
    }

    // 从业务配置获取数据库连接
    const configJson = await ctx.repos.businessConfigs.get("system_database");
    if (!configJson) {
      throw new AppError(400, "CONFIG_NOT_FOUND", "请先在业务配置中设置数据库连接");
    }

    const testDbUrl = configJson.testDbUrl as string | undefined;
    const prodDbUrl = configJson.prodDbUrl as string | undefined;

    if (!testDbUrl || !prodDbUrl) {
      throw new AppError(400, "CONFIG_INCOMPLETE", "数据库连接配置不完整");
    }

    const config = { testDbUrl, prodDbUrl };

    if (body.preview === false) {
      // 执行迁移
      const result = await migrateProjectExecute(config, body.projectId);
      return { success: true, data: result };
    } else {
      // 预览迁移
      const result = await migrateProjectPreview(config, body.projectId);
      return { success: true, data: result };
    }
  });
}

/**
 * 根据项目状态计算当前 Step
 */
function calculateCurrentStep(status: string, projectKind: string): number {
  if (projectKind === "video" || projectKind === "reverse" || projectKind === "outfit_change") {
    // 视频项目、反推项目、换装项目使用相同的状态体系
    if (status === "DRAFT") return 0;
    if (["GARMENT_UPLOADED", "ROLE_DIRECTION_CONFIRMED", "OUTFIT_SELECTED", "OUTFIT_CONFIRMED"].includes(status)) return 1;
    if (["CHARACTER_VIEW_READY", "CHARACTER_SELECTED", "CHARACTER_CONFIRMED"].includes(status)) return 2;
    if (["SCRIPT_GENERATED", "SCRIPT_SELECTED", "SCRIPT_CONFIRMED", "STORYBOARDING", "STORYBOARD_PREVIEW_COMPLETED"].includes(status)) return 3;
    if (["FILMING"].includes(status)) return 4;
    if (["FISSIONING"].includes(status)) return 6;
    if (["READY_TO_PUBLISH", "PUBLISHED"].includes(status)) return 5;
    return 0;
  } else if (projectKind === "image") {
    // 图片项目：优先匹配 IMAGE_ 前缀状态
    if (status === "IMAGE_DRAFT") return 0;
    if (["IMAGE_GARMENT_UPLOADED", "IMAGE_ROLE_DIRECTION_CONFIRMED", "IMAGE_OUTFIT_SELECTED", "IMAGE_OUTFIT_CONFIRMED"].includes(status)) return 1;
    if (["IMAGE_CHARACTER_VIEW_READY", "IMAGE_CHARACTER_SELECTED", "IMAGE_CHARACTER_CONFIRMED"].includes(status)) return 2;
    if (["IMAGE_MODEL_PHOTOS_READY"].includes(status)) return 3;
    if (["IMAGE_DETAIL_PAGE_GENERATED", "IMAGE_READY_TO_PUBLISH", "IMAGE_PUBLISHED"].includes(status)) return 4;

    // 图片项目混用视频状态时的兼容处理（历史数据兼容）
    if (status === "DRAFT") return 0;
    if (["GARMENT_UPLOADED", "ROLE_DIRECTION_CONFIRMED", "OUTFIT_SELECTED", "OUTFIT_CONFIRMED"].includes(status)) return 1;
    if (["CHARACTER_VIEW_READY", "CHARACTER_SELECTED", "CHARACTER_CONFIRMED"].includes(status)) return 2;
    if (["SCRIPT_GENERATED", "SCRIPT_SELECTED", "SCRIPT_CONFIRMED", "STORYBOARDING", "STORYBOARD_PREVIEW_COMPLETED"].includes(status)) return 3;
    if (["FILMING", "READY_TO_PUBLISH", "PUBLISHED"].includes(status)) return 4;

    return 0;
  }
  return 0;
}
