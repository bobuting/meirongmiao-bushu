/**
 * Step3 视频脚本生成 - 数据源获取
 * 从 nrm_script_data 表获取视频脚本结构化数据
 */

import type { PgRepositoryCollection } from "../../../repositories/pg/index.js";
import type { VideoScriptDataRecord } from "../../../service/scripts-data-db-service.js";
import { getScriptsDataDbService } from "../../../service/scripts-data-db-service.js";

/** 获取视频脚本选项 */
export interface FetchVideoScriptsOptions {
  /** 数据库仓库集合（必需） */
  repos: PgRepositoryCollection;
  /** 最大数量，默认 100 */
  limit?: number;
  /** 是否按时间倒序，默认 true */
  orderByTimeDesc?: boolean;
  /** 脚本类型，默认 1 */
  type?: number;
  /** 排除的脚本ID列表（避免重复推荐） */
  excludeIds?: string[];
  /** 时间范围过滤：只查询最近 N 天的脚本（默认 7 天） */
  recentDays?: number;
}

/**
 * 从 nrm_script_data 获取视频脚本数据
 * payload_json 已包含完整 video_analysis + shot_breakdown 结构
 *
 * @param options 获取选项
 * @returns VideoScriptDataRecord 数组（包含完整 payload）
 */
export async function fetchVideoScriptsFromSource(
  options: FetchVideoScriptsOptions,
): Promise<VideoScriptDataRecord[]> {
  const {
    repos,
    limit = 100,
    orderByTimeDesc = true,
    type = 1,  // 反推脚本，用于 LLM 重写
    excludeIds = [],
    recentDays = 7,  // 默认只查询最近 7 天的热榜脚本
  } = options;


  const service = getScriptsDataDbService(repos);

  // 计算时间范围：最近 N 天
  const minUpdatedAt = Date.now() - recentDays * 24 * 60 * 60 * 1000;

  const result = await service.queryByType({ type, limit, orderByTimeDesc, excludeIds, minUpdatedAt });

  return result;
}