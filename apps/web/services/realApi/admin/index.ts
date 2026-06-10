/**
 * 管理后台 API 统一导出
 */

// 导出所有类型
export * from './types';

// 导出各模块 API
import { configApi } from './config';
import { usersApi } from './users';
import { scriptsApi } from './scripts';
import { providersApi } from './providers';
import { projectsApi } from './projects';
import { logsApi } from './logs';
import { tasksApi } from './tasks';
import { capabilityLabApi } from './capability-lab';

import type { RealAdminApi } from './types';
import type { CharacterWorkflowSystemSettings } from '@contracts/character-workflow-system-settings';

// 聚合为 realAdminApi
export const realAdminApi: RealAdminApi = {
  // 配置管理
  ...configApi,

  // 用户管理
  ...usersApi,

  // 脚本管理
  ...scriptsApi,

  // Provider 管理
  ...providersApi,

  // 项目管理
  ...projectsApi,

  // 日志管理
  ...logsApi,

  // 任务管理
  ...tasksApi,

  // 能力实验室
  ...capabilityLabApi,

  // 特殊方法：需要从 config 中获取并转换
  async adminCharacterWorkflowSystemSettingsGet(token: string): Promise<CharacterWorkflowSystemSettings> {
    const response = await configApi.adminConfigGet(token);
    return {};
  },
};

export default realAdminApi;
