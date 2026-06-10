# 大文件拆分方案

## 一、admin.ts 拆分方案（3082 行 → 6 个文件）

### 1. 目标目录结构

```
apps/web/services/realApi/admin/
├── index.ts              # 统一导出入口（~50 行）
├── types.ts              # 所有类型定义（~500 行）
├── config.ts             # 配置管理 API（~150 行）
├── users.ts              # 用户管理 API（~250 行）
├── scripts.ts            # 脚本管理 API（含热点脚本）（~400 行）
├── providers.ts          # Provider 管理 API（含 Policy）（~450 行）
├── projects.ts           # 项目管理 API（~350 行）
├── logs.ts               # 日志管理 API（~350 行）
└── capability-lab.ts     # 能力实验室 API（~150 行）
```

### 2. 各文件内容分配

#### 2.1 types.ts（类型定义）
- `AdminConfig` + `AdminConfigPatch`
- `RouteKeyCreditCostItem` + `RouteKeyCreditCostsResponse`
- `AdminUser` + 用户相关类型
- `AdminScript` + 脚本相关类型
- `AdminProvider` + Provider 相关类型
- `AdminFunctionalRoute`
- 日志相关类型（`AdminErrorLog`, `AdminCallAudit`, `AdminAuditLog`）
- 项目相关类型（`AdminProjectListItem`, `AdminProjectDetail`）
- `RealAdminApi` 接口定义（聚合所有方法签名）

#### 2.2 config.ts（配置管理）
| 方法 | 行号范围（原文件） |
|------|------------------|
| `adminConfigGet` | 1346-1349 |
| `adminConfigPatch` | 1351-1358 |
| `adminRouteKeyCreditCostsGet` | 1360-1362 |
| `adminRouteKeyCreditCostUpdate` | 1364-1369 |
| `adminRouteKeyCreditCostDelete` | 1371-1377 |
| `adminCharacterWorkflowSystemSettingsGet` | 1379-1384 |
| `reverseUiSettingsGet` | 2243-2248 |

#### 2.3 users.ts（用户管理）
| 方法 | 行号范围（原文件） |
|------|------------------|
| `adminUsers` | 1399-1412 |
| `adminCreateUser` | 1414-1428 |
| `adminUpdateUser` | 1430-1445 |
| `adminDeleteUser` | 1447-1449 |
| `adminImportUsers` | 1451-1462 |
| `adminExportUsers` | 1464-1473 |
| `adminSetUserLock` | 1763-1768 |
| `adminAdjustUserCredits` | 1770-1779 |
| `adminCreditAudits` | 1781-1802 |
| `adminReviews` | 1386-1397 |
| `adminReviewAction` | 2097-2106 |
| `adminConfirmPublish` | 2108-2112 |

#### 2.4 scripts.ts（脚本管理）
| 方法 | 行号范围（原文件） |
|------|------------------|
| `adminScripts` | 1475-1496 |
| `adminCreateScript` | 1502-1522 |
| `adminUpdateScript` | 1524-1544 |
| `adminDeleteScript` | 1498-1500 |
| `adminImportScripts` | 1546-1563 |
| `adminExportScripts` | 1565-1575 |
| `adminHotTrendScripts` | 1577-1613 |
| `adminSyncHotTrendScripts` | 1619-1632 |
| `adminHotTrendSyncLogs` | 1634-1668 |
| `adminHotTrendDailyReports` | 1670-1696 |
| `adminHotTrendDailyReportDetail` | 1698-1707 |
| `adminUpsertHotTrendScript` | 1709-1734 |
| `adminUpdateHotTrendScript` | 1736-1761 |
| `adminDeleteHotTrendScript` | 1615-1617 |
| `adminDeleteHotTrendAssets` | 2114-2119 |
| `adminReverseHotTrendAssetToSmartStoryboard` | 2134-2140 |
| `adminPruneUnlinkedVideoHotTrendAssets` | 2142-2150 |
| `adminRelabelHotTrendAssets` | 2152-2160 |
| `adminUpdateSmartStoryboard` | 2162-2171 |
| `adminDeleteSmartStoryboards` | 2173-2178 |
| `adminGetScripts` | 2488-2543 |
| `adminGetScriptQualityScore` | 2546-2567 |
| `adminGetScriptStats` | 2570-2583 |
| `getAdminReverseScript` | 2121-2132 |

#### 2.5 providers.ts（Provider 管理）
| 方法 | 行号范围（原文件） |
|------|------------------|
| `adminProviders` | 1804-1821 |
| `adminCreateProvider` | 1823-1841 |
| `adminUpdateProvider` | 1843-1861 |
| `adminDeleteProvider` | 1863-1865 |
| `adminUpdateProviderSecret` | 1867-1872 |
| `adminTestProviderConnectivity` | 1874-1889 |
| `adminProviderPolicies` | 1891-1907 |
| `adminCreateProviderPolicy` | 1909-1926 |
| `adminUpdateProviderPolicy` | 1928-1947 |
| `adminDeleteProviderPolicy` | 1949-1951 |
| `adminTestProviderPolicy` | 1953-1968 |
| `adminProviderAudits` | 1970-2003 |
| `adminClearProviderAudits` | 2005-2007 |
| `adminClearTasks` | 2009-2011 |
| `adminFunctionalRoutes` | 2182-2197 |
| `adminSetFunctionalRoute` | 2199-2213 |
| `adminBatchSetFunctionalRoutes` | 2215-2237 |
| `adminDeleteFunctionalRoute` | 2239-2241 |

#### 2.6 projects.ts（项目管理）
| 方法 | 行号范围（原文件） |
|------|------------------|
| `listAdminProjects` | 2698-2749 |
| `getAdminProjectDetail` | 2752-2981 |
| `getAdminProjectScriptsRaw` | 2984-2997 |
| `listAdminCompanies` | 3000-3004 |
| `getAdminAnomalies` | 3008-3014 |
| `performAdminOperation` | 3017-3035 |
| `exportAdminProjects` | 3038-3082 |

#### 2.7 logs.ts（日志管理）
| 方法 | 行号范围（原文件） |
|------|------------------|
| `errorLogsList` | 2253-2288 |
| `errorLogDetail` | 2291-2303 |
| `errorLogsStatsByCode` | 2306-2321 |
| `errorLogsStatsByDate` | 2324-2339 |
| `callAuditsList` | 2342-2381 |
| `callAuditsStats` | 2384-2396 |
| `callAuditDetail` | 2399-2401 |
| `auditLogsList` | 2404-2439 |
| `auditLogDetail` | 2442-2444 |
| `logsExport` | 2447-2483 |

#### 2.8 capability-lab.ts（能力实验室）
| 方法 | 行号范围（原文件） |
|------|------------------|
| `adminCapabilityLabText` | 2013-2021 |
| `adminCapabilityLabImageInsight` | 2023-2031 |
| `adminCapabilityLabImageGenerate` | 2033-2041 |
| `adminCapabilityLabVideoGenerate` | 2043-2051 |
| `adminCapabilityLabReverseFetch` | 2053-2065 |
| `adminCapabilityLabVideoReverse` | 2067-2079 |
| `adminCapabilityLabVideoReverseUpload` | 2081-2095 |

#### 2.9 index.ts（统一导出）
```typescript
export * from './types';
export { configApi } from './config';
export { usersApi } from './users';
export { scriptsApi } from './scripts';
export { providersApi } from './providers';
export { projectsApi } from './projects';
export { logsApi } from './logs';
export { capabilityLabApi } from './capability-lab';

// 聚合为 realAdminApi
import { configApi } from './config';
import { usersApi } from './users';
// ... 其他导入

export const realAdminApi: RealAdminApi = {
  ...configApi,
  ...usersApi,
  ...scriptsApi,
  ...providersApi,
  ...projectsApi,
  ...logsApi,
  ...capabilityLabApi,
};
```

---

## 二、ProjectDetailModal.tsx 拆分方案（2010 行 → 多个文件）

### 1. 目标目录结构

```
apps/web/pages/admin/project-detail/
├── index.tsx                     # 主弹窗容器（~250 行）
├── types.ts                      # TabId + Props 类型
├── tabs/
│   ├── Step1Tab.tsx              # Step1 服饰搭配（~180 行）
│   ├── Step2Tab.tsx              # Step2 角色定妆（~180 行）
│   ├── Step3Tab.tsx              # Step3 脚本+分镜/模特图（~280 行）
│   ├── Step4Tab.tsx              # Step4 视频成片/电商详情页（~280 行）
│   ├── Step5Tab.tsx              # Step5 发布（~120 行）
│   ├── Step6Tab.tsx              # Step6 裂变（~200 行）
│   ├── TasksTab.tsx              # 任务列表（~80 行）
│   ├── ResourcesTab.tsx          # 资源消耗（~100 行）
│   └── LlmLogsTab.tsx            # LLM 日志（~180 行）
└── components/
    ├── InfoItem.tsx               # 信息项组件（~40 行）
    ├── CharacterCard.tsx          # 角色卡片（~40 行）
    ├── ProjectCreditList.tsx     # 积分列表（~50 行）
    └── LlmLogsPanel.tsx          # LLM 日志面板（~140 行）
```

### 2. 各文件内容分配

#### 2.1 types.ts
```typescript
export type TabId = 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'step6' | 'tasks' | 'resources' | 'scripts' | 'prompts' | 'llm-logs';

export interface ProjectDetailModalProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  onOperationClick: (operationType: string) => void;
}
```

#### 2.2 index.tsx（主弹窗）
- 导入所有 Tab 组件
- 弹窗容器结构
- 基本信息展示（封面、服饰图、项目信息网格）
- Tab 导航栏
- Tab 内容渲染（switch-case）
- 图片/视频预览弹窗
- 分享弹窗

#### 2.3 tabs/Step1Tab.tsx
- 换装项目源视频展示
- 服饰网格展示
- 搭配推荐列表

#### 2.4 tabs/Step2Tab.tsx
- 换装项目目标服装
- 角色预设展示
- 角色列表（AI生成 + 角色库分组）
- 角色五视图

#### 2.5 tabs/Step3Tab.tsx
- 换装项目任务信息
- 图片项目模特图网格
- 视频项目脚本展示
- 脚本历史记录
- 分镜详情网格

#### 2.6 tabs/Step4Tab.tsx
- 换装项目各阶段结果
- 图片项目电商详情页板块
- 视频项目分镜视频网格
- 最终合成视频
- 成片历史

#### 2.7 tabs/Step5Tab.tsx
- 分享按钮
- 发布记录列表
- 成片历史网格

#### 2.8 tabs/Step6Tab.tsx
- 分镜任务项网格（图片+视频）
- 裂变视频网格

#### 2.9 tabs/TasksTab.tsx
- 任务列表展示

#### 2.10 tabs/ResourcesTab.tsx
- 资源消耗统计卡片
- 积分消耗明细列表

#### 2.11 tabs/LlmLogsTab.tsx
- LLM 调用统计卡片
- 日志表格
- 分页
- 详情弹窗

#### 2.12 components/InfoItem.tsx
- 信息项组件（带复制功能）

#### 2.13 components/CharacterCard.tsx
- 角色卡片组件

#### 2.14 components/ProjectCreditList.tsx
- 项目积分消耗列表

#### 2.15 components/LlmLogsPanel.tsx
- LLM 日志面板（统计 + 表格 + 分页）

---

## 三、引用更新清单

### 3.1 admin.ts 引用更新
需要更新以下文件的导入路径：
```
apps/web/services/realApi/admin.ts → apps/web/services/realApi/admin/index.ts
```

搜索命令：
```bash
grep -rn "from.*realApi/admin" apps/web
grep -rn "from.*services/realApi" apps/web
```

### 3.2 ProjectDetailModal.tsx 引用更新
需要更新以下文件的导入路径：
```
apps/web/pages/admin/ProjectDetailModal.tsx → apps/web/pages/admin/project-detail/index.tsx
```

搜索命令：
```bash
grep -rn "ProjectDetailModal" apps/web
```

---

## 四、执行顺序

1. **admin.ts 拆分**
   - [ ] 创建 `admin/` 目录
   - [ ] 创建 `types.ts`（类型定义）
   - [ ] 创建 `config.ts`
   - [ ] 创建 `users.ts`
   - [ ] 创建 `scripts.ts`
   - [ ] 创建 `providers.ts`
   - [ ] 创建 `projects.ts`
   - [ ] 创建 `logs.ts`
   - [ ] 创建 `capability-lab.ts`
   - [ ] 创建 `index.ts`（统一导出）
   - [ ] 更新引用路径

2. **ProjectDetailModal.tsx 拆分**
   - [ ] 创建 `project-detail/` 目录
   - [ ] 创建 `types.ts`
   - [ ] 创建 `components/` 目录及组件
   - [ ] 创建 `tabs/` 目录及 Tab 组件
   - [ ] 创建 `index.tsx`（主弹窗）
   - [ ] 更新引用路径

3. **验证**
   - [ ] TypeScript 编译通过
   - [ ] 功能测试通过

---

## 五、风险点

1. **循环依赖**：types.ts 需要导入外部类型，确保不产生循环依赖
2. **类型兼容性**：拆分后的 API 方法签名必须与原 `RealAdminApi` 接口一致
3. **引用路径**：确保所有引用路径更新正确
