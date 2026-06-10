# 管理后台与系统参数整合设计

## 背景

当前管理后台（SystemSettings.tsx）存在以下问题：

1. **配置分散**：同一张表 `admin_config` 的数据拆成两个 API、两套类型、两套状态管理
2. **命名混淆**：页面叫"管理后台"，但 Tab 里又有"系统设置"子标签
3. **重复逻辑**：两个配置的保存/重置逻辑几乎相同但分别实现
4. **Step1 参数跨域**：`maxOutfitAnalysisCards` 在全局配置，`step1RoleDirectionCount` 在工作流配置

## 目标

- 合并后端 API 为一个
- 统一类型定义
- 精简前端状态管理
- 按业务域重新组织 Tab 结构

## 后端改动

### 1. 删除独立 API

**删除路由**：
- `GET /admin/system-settings/character-workflow` — `adminCharacterWorkflowSystemSettingsGet`
- `PUT /admin/system-settings/character-workflow` — `adminCharacterWorkflowSystemSettingsPut`

**保留 API**：
- `GET /admin/config` — 已包含所有配置
- `PATCH /admin/config` — 已支持部分更新

### 2. 合并类型定义

`CharacterWorkflowSystemSettings` 的参数合并到 `AdminConfig`：

| 参数 | 类型 | 说明 |
|------|------|------|
| step1AutoReverseOnConfirm | boolean | Step1 确认后自动反推 |
| step1HideVisualRecommendationCards | boolean | 隐藏 Step1 图片搭配推荐卡 |
| step1RoleDirectionCount | number | Step1 角色方向数量 |
| step2AutoGenerateOnEnter | boolean | Step2 进入即自动定妆生成 |
| step2SelectedRoleDirectionPanelVisible | boolean | Step2 右侧已选推荐角色面板 |
| step2ImageToImagePanelVisible | boolean | Step2 图生图右侧面板 |
| step2PromptImage1Mode | "code" \| "llm" | Step2 图片一提示词模式 |
| step2PromptImage2Mode | "code" \| "llm" | Step2 图片二提示词模式 |
| step2PromptImage3Mode | "code" \| "llm" | Step2 图片三提示词模式 |
| step3CompactStoryboardPanelEnabled | boolean | Step3 分镜紧凑模式 |
| step4AutoGenerateOnEnter | boolean | Step4 进入即自动预览视频生成 |

### 3. 改动文件清单

| 文件 | 改动 |
|------|------|
| `src/contracts/character-workflow-system-settings.ts` | 标记废弃，类型合并到 AdminConfig |
| `src/routes/admin-routes.ts` | 删除 `/admin/system-settings/character-workflow` 路由 |
| `src/modules/admin-config-service.ts` | 确保合并字段已包含 |
| `src/core/config.ts` | 添加默认值 |

## 前端改动

### 1. Tab 新结构

**删除**："推荐模块" Tab

**新结构**：

| Tab | 包含卡片 |
|-----|----------|
| 全部 | 所有卡片 |
| 系统配置 | 上传限制、安全策略、OSS 配置、音乐能力设置 |
| 任务调度 | 调度参数配置 |
| 生成与积分 | 生成参数、积分策略 |
| 热榜处理 | 热榜抓取参数、热榜打标标准、推荐函数参数 |
| AI 工作流 | Step1-5 配置、反推模块开关 |

### 2. 卡片归属变更

| 卡片 | 原 Tab | 新 Tab |
|------|--------|--------|
| 音乐能力设置 | 推荐模块 | 系统配置 |
| 推荐函数参数 | 推荐模块 | 热榜处理 |
| 反推模块开关 | 推荐模块 | AI 工作流（Step3 区域） |

### 3. 状态管理简化

**删除**：
- `draft` 状态（CharacterWorkflowSystemSettings）
- `settingsQuery` 独立查询
- `persistWorkflowDraft` 函数
- `saveWorkflowSection` 函数
- `resetWorkflowSection` 函数

**保留**：
- `globalDraft` 状态（AdminConfig）
- `configQuery` 查询
- 统一的保存/重置逻辑

### 4. 改动文件清单

| 文件 | 改动 |
|------|------|
| `apps/web/pages/admin/SystemSettings.tsx` | 删除独立 draft，简化状态管理，更新 Tab 配置 |
| `apps/web/pages/admin/adminGlobalSystemSettingsPanel.tsx` | 添加工作流相关卡片配置，更新 GLOBAL_CARDS |
| `apps/web/services/realApi/admin.ts` | 删除 `adminCharacterWorkflowSystemSettingsGet/Put` |
| `apps/web/services/backendApi.ts` | 删除废弃方法和类型 |
| `apps/web/services/backendApi.squareAdminLibrary.ts` | 删除废弃方法映射 |

## 数据库改动

无需改动。两个配置源实际已存储在同一张 `admin_config` 表。

## 迁移步骤

1. 后端：合并类型定义，确保 AdminConfig 包含所有字段
2. 后端：删除废弃路由
3. 前端：更新类型定义
4. 前端：删除废弃 API 调用
5. 前端：简化状态管理
6. 前端：更新 Tab 和卡片配置
7. 测试：验证所有配置保存/读取正常

## 影响评估

| 影响 | 说明 | 风险等级 |
|------|------|----------|
| API 删除 | 旧 API 返回 404 | 低（前后端同步更新） |
| 类型变更 | 合并两个类型 | 低（向后兼容） |
| UI 变更 | Tab 精简，卡片移动 | 低（用户需适应） |
| 功能不变 | 所有配置项保留 | 无 |

## 验收标准

1. 后端编译通过
2. 前端编译通过
3. 所有配置项可正常读取
4. 所有配置项可正常保存
5. Tab 结构符合设计
6. 卡片归属符合设计