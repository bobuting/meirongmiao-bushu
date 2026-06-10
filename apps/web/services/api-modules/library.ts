// apps/web/services/api-modules/library.ts
/**
 * 素材库 API 模块
 * 包含角色库、脚本库、分镜库等方法
 */

import type { MyLibraryQueryDto, LibraryCharacterDto } from '../backendApi.types';
import type { MyLibraryPagedResponse, UserScriptRecordDto, MyStoryboardLibraryRecordDto } from '../../../../src/contracts/my-library-api';

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
// 素材库 API 方法
// ============================================================================

/**
 * 获取我的角色库
 */
export async function getMyLibraryCharacters(
  request: RequestFunction,
  token: string,
  query?: MyLibraryQueryDto
): Promise<{ items: LibraryCharacterDto[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.pageSize) params.set("pageSize", String(query.pageSize));
  if (query?.keyword) params.set("keyword", query.keyword);
  if (query?.tags?.length) params.set("tags", query.tags.join(","));

  const queryString = params.toString();
  const path = queryString ? `/library/characters?${queryString}` : "/library/characters";

  return request("GET", path, { token });
}

/**
 * 获取单个角色详情
 */
export async function getLibraryCharacter(
  request: RequestFunction,
  token: string,
  characterId: string
): Promise<LibraryCharacterDto> {
  return request("GET", `/library/characters/${characterId}`, { token });
}

/**
 * 获取我的脚本库
 */
export async function getMyLibraryScripts(
  request: RequestFunction,
  token: string,
  query?: MyLibraryQueryDto
): Promise<MyLibraryPagedResponse<UserScriptRecordDto>> {
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.pageSize) params.set("pageSize", String(query.pageSize));
  if (query?.keyword) params.set("keyword", query.keyword);
  if (query?.tags?.length) params.set("tags", query.tags.join(","));

  const queryString = params.toString();
  const path = queryString ? `/library/scripts?${queryString}` : "/library/scripts";

  return request("GET", path, { token });
}

/**
 * 获取单个脚本详情
 */
export async function getMyLibraryScript(
  request: RequestFunction,
  token: string,
  scriptId: string
): Promise<UserScriptRecordDto> {
  return request("GET", `/library/scripts/${scriptId}`, { token });
}

/**
 * 获取我的分镜库
 */
export async function getMyLibraryStoryboards(
  request: RequestFunction,
  token: string,
  query?: MyLibraryQueryDto
): Promise<MyLibraryPagedResponse<MyStoryboardLibraryRecordDto>> {
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.pageSize) params.set("pageSize", String(query.pageSize));
  if (query?.keyword) params.set("keyword", query.keyword);
  if (query?.tags?.length) params.set("tags", query.tags.join(","));

  const queryString = params.toString();
  const path = queryString ? `/library/storyboards?${queryString}` : "/library/storyboards";

  return request("GET", path, { token });
}