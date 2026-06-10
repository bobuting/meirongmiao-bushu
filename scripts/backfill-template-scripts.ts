/**
 * 回填模板脚本数据
 * 对 script_data_id 为空的模板执行反推并关联脚本
 */

import type { Pool } from "pg";
import { Pool } from "pg";
import dotenv from "dotenv";
import { skillLoader } from "../src/services/skills/index.js";
import { requestLlmPlainTextWithMetadata } from "../src/services/llm/llm-transport.js";
import { ProviderRouteKeys } from "../src/contracts/provider-route-keys.js";
import { getLogger } from "../src/core/logger/index.js";
import { decryptSecret } from "../src/core/security.js";

dotenv.config();

const log = getLogger("backfill-template-scripts");

const PROMPT_CODE_VIDEO_STORYBOARD_ANALYSIS = "video_storyboard_analysis";

interface ResolvedProvider {
  id: string;
  vendor: string;
  baseUrl: string;
  model: string;
  callMode: string;
  options: Record<string, unknown>;
  timeoutMs: number;
  secret: string;
  accessKey?: string;
}

async function resolveProvider(pool: Pool, routeKey: string): Promise<ResolvedProvider | null> {
  // 查询 provider policy
  const policyResult = await pool.query<{
    primary_provider_id: string;
    timeout_ms: number | null;
  }>(
    `SELECT primary_provider_id, timeout_ms FROM nrm_provider_policies WHERE route_key = $1 AND enabled = true`,
    [routeKey]
  );
  if (policyResult.rows.length === 0) return null;

  const policy = policyResult.rows[0]!;

  // 查询 provider
  const providerResult = await pool.query<{
    id: string;
    vendor: string;
    base_url: string;
    model: string;
    call_mode: string;
    options: Record<string, unknown>;
    access_key: string | null;
    enabled: boolean;
  }>(
    `SELECT id, vendor, base_url, model, call_mode, options, access_key, enabled FROM nrm_providers WHERE id = $1`,
    [policy.primary_provider_id]
  );
  if (providerResult.rows.length === 0 || !providerResult.rows[0]!.enabled) return null;

  const provider = providerResult.rows[0]!;

  // 查询 secret
  const secretResult = await pool.query<{ cipher_text: string }>(
    `SELECT cipher_text FROM nrm_provider_secrets WHERE provider_id = $1`,
    [provider.id]
  );
  if (secretResult.rows.length === 0) return null;

  const secret = decryptSecret(secretResult.rows[0]!.cipher_text);

  return {
    id: provider.id,
    vendor: provider.vendor,
    baseUrl: provider.base_url,
    model: provider.model,
    callMode: provider.call_mode,
    options: provider.options ?? {},
    timeoutMs: policy.timeout_ms ?? 60000,
    secret,
    accessKey: provider.access_key || undefined,
  };
}

async function backfill() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });

  try {
    // 查询所有无脚本的模板
    const result = await pool.query<{
      id: string;
      title: string;
      video_url: string;
    }>(
      `SELECT id, title, video_url FROM nrm_square_templates WHERE script_data_id IS NULL ORDER BY created_at DESC`
    );

    log.info(`找到 ${result.rows.length} 个无脚本模板需要回填`);

    if (result.rows.length === 0) {
      log.info("无需回填");
      return;
    }

    // 并发控制：每次处理 3 个
    const CONCURRENCY = 3;
    const successCount = { value: 0 };
    const failCount = { value: 0 };

    for (let i = 0; i < result.rows.length; i += CONCURRENCY) {
      const batch = result.rows.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((template) => processTemplate(pool, template))
      );

      for (const r of batchResults) {
        if (r.status === "fulfilled" && r.value.success) {
          successCount.value++;
        } else {
          failCount.value++;
          const error =
            r.status === "rejected"
              ? r.reason
              : r.status === "fulfilled"
                ? r.value.error
                : "unknown";
          log.warn({ error }, "模板处理失败");
        }
      }

      log.info(
        `进度: ${Math.min(i + CONCURRENCY, result.rows.length)}/${result.rows.length}, 成功: ${successCount.value}, 失败: ${failCount.value}`
      );
    }

    log.info(
      `回填完成: 成功 ${successCount.value}, 失败 ${failCount.value}`
    );
  } finally {
    await pool.end();
  }
}

async function processTemplate(
  pool: Pool,
  template: { id: string; title: string; video_url: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    log.info({ templateId: template.id, title: template.title }, "开始处理模板");

    // 1. 执行反推
    const reverseScript = await reverseVideoToScript(
      pool,
      template.title,
      template.video_url
    );

    // 2. 清理 markdown 包裹并解析 JSON
    let cleanText = reverseScript.trim();
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.slice(7);
    }
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.slice(3);
    }
    if (cleanText.endsWith("```")) {
      cleanText = cleanText.slice(0, -3);
    }
    cleanText = cleanText.trim();

    const scriptJson = JSON.parse(cleanText);
    const videoInfo = scriptJson?.video_info;
    const videoAnalysis = scriptJson?.video_analysis;

    // 3. 存储到 nrm_script_data
    const scriptDataId = await insertScriptData(pool, {
      title: videoInfo?.title ?? template.title,
      durationSeconds: videoInfo?.duration_seconds ?? null,
      source: "backfill",
      sourceOssUrl: template.video_url,
      timeOfDay: videoInfo?.time_of_day ?? null,
      weather: videoInfo?.weather ?? null,
      mainScene: videoInfo?.main_scene ?? null,
      atmosphere: videoAnalysis?.atmosphere ?? null,
      theme: videoInfo?.summary ?? null,
      summary: videoInfo?.summary ?? null,
      primaryEmotion: videoAnalysis?.primary_emotion ?? null,
      videoType: videoInfo?.video_type ?? null,
      videoStyle: videoInfo?.video_style ?? null,
      fashionSuitable: scriptJson?.fashion_placement?.is_suitable ?? null,
      fashionReason: scriptJson?.fashion_placement?.reason ?? null,
      emotionDetail: videoAnalysis?.emotion_detail ?? null,
      onScreenPresence: scriptJson?.on_screen_presence ?? null,
      fashionStyles: scriptJson?.fashion_placement?.recommended_styles ?? null,
      editingAnalysis: videoAnalysis?.editing_analysis ?? null,
      payloadJson: scriptJson,
    });

    // 4. 存储分镜数据
    const shots = scriptJson?.shots ?? [];
    if (shots.length > 0 && scriptDataId) {
      await insertShotBreakdown(pool, scriptDataId, shots);
      log.info({ templateId: template.id, scriptDataId, shotCount: shots.length }, "分镜数据存储成功");
    }

    // 5. 更新模板关联
    await pool.query(
      `UPDATE nrm_square_templates SET script_data_id = $1, updated_at = $2 WHERE id = $3`,
      [scriptDataId, Date.now(), template.id]
    );

    log.info({ templateId: template.id, scriptDataId }, "模板回填成功");
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error({ templateId: template.id, error: errorMsg }, "模板回填失败");
    return { success: false, error: errorMsg };
  }
}

async function reverseVideoToScript(
  pool: Pool,
  description: string,
  ossVideoUrl: string
): Promise<string> {
  const provider = await resolveProvider(pool, ProviderRouteKeys.SQUARE_VIDEO_REVERSE);
  if (!provider) {
    throw new Error("无可用的 LLM provider (square_video_reverse)");
  }

  const { system, user: baseUserPrompt } = await skillLoader.render(
    PROMPT_CODE_VIDEO_STORYBOARD_ANALYSIS,
    {
      variables: {
        topicId: `backfill-${Date.now()}`,
        topicLabel: description.slice(0, 30) || "回填模板",
        videoUrl: ossVideoUrl,
      },
    }
  );

  const finalUserPrompt = baseUserPrompt + `\n\n视频公开链接（OSS）: ${ossVideoUrl}`;

  const result = await requestLlmPlainTextWithMetadata(
    provider,
    system,
    finalUserPrompt,
    0.3,
    {
      routeKey: ProviderRouteKeys.SQUARE_VIDEO_REVERSE,
      userId: "backfill",
      businessContext: "模板脚本回填",
      videoInput: { base64: "", mimeType: "video/mp4", videoUrl: ossVideoUrl },
    }
  );

  return result.text;
}

async function insertScriptData(
  pool: Pool,
  input: {
    title: string;
    durationSeconds?: number | null;
    source: string;
    sourceOssUrl?: string | null;
    timeOfDay?: string | null;
    weather?: string | null;
    mainScene?: string | null;
    atmosphere?: string | null;
    theme?: string | null;
    summary?: string | null;
    primaryEmotion?: string | null;
    videoType?: string | null;
    videoStyle?: string | null;
    fashionSuitable?: boolean | null;
    fashionReason?: string | null;
    emotionDetail?: Record<string, unknown> | null;
    onScreenPresence?: Record<string, unknown> | null;
    fashionStyles?: Record<string, unknown>[] | null;
    editingAnalysis?: Record<string, unknown> | null;
  }
): Promise<string> {
  const id = `script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  await pool.query(
    `INSERT INTO nrm_script_data (
      id, type, title, duration_seconds, source, source_oss_url,
      time_of_day, weather, main_scene, atmosphere, theme, summary,
      primary_emotion, video_type, video_style,
      fashion_suitable, fashion_reason,
      emotion_detail, on_screen_presence, fashion_styles, editing_analysis,
      created_at, updated_at
    ) VALUES (
      $1, 1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10, $11,
      $12, $13, $14,
      $15, $16,
      $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb,
      $21, $21
    )`,
    [
      id,
      input.title,
      input.durationSeconds ?? null,
      input.source,
      input.sourceOssUrl ?? null,
      input.timeOfDay ?? null,
      input.weather ?? null,
      input.mainScene ?? null,
      input.atmosphere ?? null,
      input.theme ?? null,
      input.summary ?? null,
      input.primaryEmotion ?? null,
      input.videoType ?? null,
      input.videoStyle ?? null,
      input.fashionSuitable ?? null,
      input.fashionReason ?? null,
      JSON.stringify(input.emotionDetail ?? {}),
      JSON.stringify(input.onScreenPresence ?? {}),
      JSON.stringify(input.fashionStyles ?? []),
      JSON.stringify(input.editingAnalysis ?? {}),
      now,
    ]
  );

  return id;
}

async function insertShotBreakdown(
  pool: Pool,
  scriptDataId: string,
  shots: Record<string, unknown>[]
): Promise<number> {
  let inserted = 0;
  for (const shot of shots) {
    const shotId = shot.shot_id ?? shot.shot_index ?? `shot-${inserted}`;
    const id = `${scriptDataId}-shot-${shotId}`;

    try {
      await pool.query(
        `INSERT INTO nrm_shot_breakdown (
          id, script_data_id, shot_index, shot_type, camera_movement,
          shot_description, duration_seconds, narration, visual_cue,
          technical_notes, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12
        )`,
        [
          id,
          scriptDataId,
          shot.shot_index ?? inserted,
          shot.shot_type ?? null,
          shot.camera_movement ?? null,
          shot.shot_description ?? shot.description ?? null,
          shot.duration_seconds ?? shot.duration ?? null,
          shot.narration ?? null,
          shot.visual_cue ?? null,
          shot.technical_notes ?? null,
          Date.now(),
          Date.now(),
        ]
      );
      inserted++;
    } catch (e) {
      log.warn({ err: e, shotId }, "分镜插入失败（跳过）");
    }
  }
  return inserted;
}

// 执行回填
backfill().catch((e) => {
  log.error({ err: e }, "回填脚本异常退出");
  process.exit(1);
});