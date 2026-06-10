/**
 * Step3 库存脚本 - 数据获取
 * 从 nrm_script_data 表获取 type != 1 的脚本数据
 */

import type { PgRepositoryCollection } from "../../../repositories/pg/index.js";
import type { VideoScriptDataRecord } from "../../../service/scripts-data-db-service.js";
import { getScriptsDataDbService } from "../../../service/scripts-data-db-service.js";

/** 库存脚本获取选项 */
export interface FetchLibraryScriptsOptions {
  /** 数据库仓库集合（必需） */
  repos: PgRepositoryCollection;
  /** 排除的 type 值，默认 1 */
  excludeType?: number;
  /** 最大数量，默认 100 */
  limit?: number;
  /** 是否按时间倒序，默认 true */
  orderByTimeDesc?: boolean;
  /** 排除的脚本ID列表（避免重复推荐） */
  excludeIds?: string[];
}

/**
 * 从 nrm_script_data 获取库存脚本数据（type != 1）
 * SQL 已预过滤 fashion_placement 不为空的记录
 *
 * @param options 获取选项
 * @returns VideoScriptDataRecord 数组
 */
export async function fetchLibraryScriptsFromSource(
  options: FetchLibraryScriptsOptions,
): Promise<VideoScriptDataRecord[]> {
  const {
    repos,
    excludeType = 1,
    limit = 100,
    orderByTimeDesc = true,
    excludeIds = [],
  } = options;


  const service = getScriptsDataDbService(repos);
  const result = await service.queryTypeNot({ excludeType, limit, orderByTimeDesc, excludeIds });

  return result;
}
