# 项目后台管理系统设计规格

**版本**: 1.0
**日期**: 2026-04-18
**作者**: Claude
**状态**: 待审查

---

## 1. 概述

### 1.1 项目背景

内容猫（neirongmiao）是一个 AI 电商短视频生成平台，核心为 **6 步视频工作流** 和 **4 步图片工作流**。随着项目规模增长，管理员需要一个专业的后台管理系统，用于全局掌控项目状态、快速定位问题、高效管理资源。

### 1.2 设计目标

**优先级排序**：
1. **增强数据洞察** - 全局统计、Step 漏斗分析、用户行为、成本追踪
2. **改善用户体验** - 简洁界面、高效操作、直观数据呈现
3. **强化异常监控** - 被动查询 + 规则告警 + 智能检测

### 1.3 核心价值

- **全局掌控**：一屏掌握所有项目状态
- **快速定位**：Step 关键节点监控，快速定位问题
- **高效管理**：批量操作、任务管理、项目干预
- **数据驱动**：统计分析、趋势洞察、异常识别

---

## 2. 整体架构

### 2.1 页面结构

```
/admin/projects（管理后台首页）
├── /admin/projects/dashboard    - 概览仪表盘
├── /admin/projects/list          - 项目列表
├── /admin/projects/:id/detail    - 项目详情
└── /admin/projects/statistics    - 统计分析
```

### 2.2 技术架构

#### 前端层（React）

**新增管理页面**：
- `AdminProjectsDashboard.tsx` - 概览仪表盘
- `AdminProjectsList.tsx` - 项目列表
- `AdminProjectDetail.tsx` - 项目详情
- `AdminProjectsStatistics.tsx` - 统计分析

**新增管理专用组件**：
- `StepNodeTimeline` - Step 执行时间轴
- `StepDataCard` - Step 关键数据卡片
- `AnomalyAlertPanel` - 异常告警面板
- `StatisticsChart` - 统计图表组件
- `TaskManagementPanel` - 任务管理面板
- `VideoPreviewModal` - 视频预览模态框

**复用现有组件**：
- `Layout` - 侧边栏导航
- `Pagination` - 分页
- `Button` - 按钮
- `ConfirmDialog` - 确认弹窗

#### 后端层（Fastify）

**新增管理专用路由**：

| 路由 | 方法 | 说明 |
|------|------|------|
| `/admin/projects/dashboard` | GET | 仪表盘数据 |
| `/admin/projects` | GET | 项目列表（增强筛选） |
| `/admin/projects/:id/detail` | GET | 项目详情（管理视角） |
| `/admin/projects/statistics` | GET | 统计数据 |
| `/admin/projects/anomalies` | GET | 异常项目检测 |
| `/admin/projects/smart-detect` | GET | 智能异常检测 |
| `/admin/projects/:id/unlock-script` | POST | 解锁脚本选择 |
| `/admin/projects/:id/unlock-character` | POST | 解锁角色选择 |
| `/admin/projects/:id/unlock-outfit` | POST | 解锁服装搭配 |
| `/admin/projects/:id/reset-step` | POST | 重置到指定 Step |
| `/admin/projects/:id/retry-step` | POST | 重新生成当前 Step |
| `/admin/projects/:id/force-complete-step` | POST | 强制完成 Step |
| `/admin/projects/:id/export` | GET | 导出项目数据 |
| `/admin/projects/:id/tasks` | GET | 获取项目任务列表 |
| `/admin/tasks/:taskId` | GET | 获取任务详情 |
| `/admin/tasks/:taskId/retry` | POST | 重试任务 |
| `/admin/tasks/:taskId/cancel` | POST | 取消任务 |
| `/admin/tasks/:taskId/force-cancel` | POST | 强制取消任务 |
| `/admin/tasks/batch` | POST | 批量任务操作 |
| `/admin/tasks/metrics` | GET | 任务监控指标 |
| `/admin/tasks/anomalies` | GET | 异常任务检测 |

**数据聚合服务**：
- `ProjectAggregationService` - 项目数据聚合
- `StepMetricsService` - Step 指标计算
- `AnomalyDetectionService` - 异常检测
- `TaskManagementService` - 任务管理服务

**数据库查询优化**：
- 项目列表索引优化
- Step 数据聚合查询
- 统计分析预计算

#### 权限控制

- 路由守卫：检查 `user.role === 'admin'`
- 敏感操作：二次确认 + 操作日志记录

---

## 3. 功能设计

### 3.1 概览仪表盘

**布局结构**：

```
┌─────────────────────────────────────────────────────────────┐
│  📊 项目概览仪表盘                         2026-04-18 11:50 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  核心指标卡片（第一行）                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 总项目   │ │ 进行中   │ │ 已完成   │ │ 异常     │       │
│  │  1,247   │ │   156    │ │  1,089   │ │   23     │       │
│  │ ↑ 12%    │ │ ↓ 5%     │ │ ↑ 18%    │ │ ↑ 3      │       │
│  │ 较昨日   │ │ 较昨日   │ │ 较昨日   │ │ 新增     │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
│  任务指标卡片（第二行）                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 任务总数 │ │ 进行中   │ │ 失败     │ │ 卡住     │       │
│  │  3,842   │ │   45     │ │   12     │ │   3      │       │
│  │ 今日新增 │ │ 当前执行 │ │ 待处理   │ │ 需关注   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
│  左侧面板（60% 宽度）         │ 右侧面板（40% 宽度）        │
│  ┌─────────────────────────┐  │ ┌─────────────────────────┐│
│  │ Step 漏斗分析           │  │ │ ⚠️ 异常项目告警         ││
│  │                         │  │ │                         ││
│  │ Step 1: 100% (1247)     │  │ │ • #1247 卡住 Step4 2h  ││
│  │ Step 2:  95% (1185)     │  │ │ • #1245 裂变失败 3次   ││
│  │ Step 3:  88% (1097)     │  │ │ • #1240 图片生成异常   ││
│  │ Step 4:  75% (935) ⚠️   │  │ │ • #1238 Step5超时      ││
│  │ Step 5:  89% (1082)     │  │ │                         ││
│  │ Step 6:  96% (1038)     │  │ │ [查看全部异常 →]        ││
│  │                         │  │ └─────────────────────────┘│
│  │ ⚠️ Step4 流失率较高     │  │                             │
│  └─────────────────────────┘  │ ┌─────────────────────────┐│
│  ┌─────────────────────────┐  │ │ 📈 项目创建趋势         ││
│  │ 用户活跃度              │  │ │                         ││
│  │ 今日活跃: 156 人        │  │ │     ___/               ││
│  │ 新增用户: 23 人         │  │ │    /      \___         ││
│  │ 人均项目: 2.3 个        │  │ │   /           \___     ││
│  └─────────────────────────┘  │ │  4/11  4/14   4/17     ││
│  ┌─────────────────────────┐  │ └─────────────────────────┘│
│  │ 成本消耗                │  │                             │
│  │ 今日LLM: 1,234 次       │  │                             │
│  │ 图片生成: 456 张        │  │                             │
│  │ 视频生成: 23 个         │  │                             │
│  └─────────────────────────┘  │                             │
└─────────────────────────────────────────────────────────────┘
```

**数据刷新机制**：
- 自动刷新：每 30 秒
- 手动刷新：右上角刷新按钮
- 数据范围：今日/近7天/近30天 切换

**异常告警规则**：

| 规则 | 触发条件 | 告警级别 | 展示样式 |
|------|---------|---------|---------|
| 项目卡住 | Step 执行时长 > 预期 × 2 | 🟡 中 | 黄色高亮 |
| 任务失败 | 失败次数 ≥ 3 | 🔴 高 | 红色高亮 |
| Step 流失 | 流失率 > 20% | 🟡 中 | 黄色标记 ⚠️ |
| 队列积压 | 等待任务 > 50 | 🟡 中 | 黄色数字 |

---

### 3.2 项目列表页

**页面布局**：

```
┌──────────────────────────────────────────────────────────────────┐
│  📋 项目管理                                       [导出数据]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  筛选栏                                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [项目类型 ▼] [项目状态 ▼] [当前Step ▼] [用户搜索...]       ││
│  │ [时间范围: 近7天 ▼] [异常筛选 ▼] [搜索项目标题...]         ││
│  │                                          [重置] [筛选]      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  批量操作栏（选中项目后显示）                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 已选中 3 个项目  [批量删除] [批量导出] [批量重置Step]      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  ☑ │ 缩略图   │ 标题/ID      │ 类型 │ 状态   │ Step进度       │ 操作│
├────┼──────────┼──────────────┼──────┼────────┼────────────────┼─────┤
│  □ │ ┌──────┐│ 春季新品     │ 视频 │🟡处理中│ [1][2][3][4🔄] │ ⋮  │
│    │ │ 📷  ▶️││ #1247        │      │        │ [5⏳][6⏳]     │     │
│    │ └──────┘│ 张三 04-17   │      │        │                │     │
├────┼──────────┼──────────────┼──────┼────────┼────────────────┼─────┤
│  ☑ │ ┌──────┐│ 夏装搭配     │ 图片 │✅完成  │ [1][2][3][4]   │ ⋮  │
│    │ │ 📷   ││ #1246        │      │        │                │     │
│    │ └──────┘│ 李四 04-18   │      │        │                │     │
├────┼──────────┼──────────────┼──────────────┼────────────────┼─────┤
│  □ │ ┌──────┐│ 秋季上新     │ 视频 │🔴异常  │ [1][2][3][4]   │ ⋮  │
│    │ │ 📷  ▶️││ #1245        │      │        │ [5][6❌]       │     │
│    │ └──────┘│ 王五 04-16   │      │        │                │     │
└────┴──────────┴──────────────┴──────┴────────┴────────────────┴─────┘
│                                                                  │
│  显示 1-20 / 共 1,247 条              [<] 1 2 3 ... 63 [>]      │
└──────────────────────────────────────────────────────────────────┘
```

**缩略图状态**：

| 项目状态 | 缩略图显示 | 操作 |
|---------|-----------|------|
| 草稿/Step1-3 | 默认占位图 | 无 |
| Step4-5 | 分镜/场景预览图 | 点击放大查看 |
| Step5 完成 | 视频封面 + ▶️ 按钮 | 点击播放视频 |
| Step6 完成 | 裂变视频封面 + ▶️ 按钮 | 点击播放视频（多个） |

**视频预览交互**：

点击缩略图上的 ▶️ 按钮，弹出视频预览模态框：
- 显示视频播放器
- 显示视频信息（时长、分辨率）
- 提供"下载视频"、"查看项目详情"操作

**Step 进度可视化**：

```
Step 状态标识：
[1] = ✅ 已完成（绿色）
[2] = 🔄 进行中（蓝色动画）
[3] = ⚠️ 异常（黄色）
[4] = ❌ 失败（红色）
[5] = ⏳ 待处理（灰色）
[6] = 🔒 已锁定（深灰，表示用户已确认）
```

**行操作菜单（⋮）**：

| 操作 | 说明 | 风险等级 |
|------|------|---------|
| 📋 查看详情 | 打开项目详情页 | 🟢 低 |
| 🔄 恢复项目 | 跳转到用户编辑页（管理员预览模式） | 🟢 低 |
| 🔓 解锁脚本选择 | 解锁 Step3 脚本 | 🟡 中 |
| 🔓 解锁角色选择 | 解锁 Step2 角色 | 🟡 中 |
| 🔄 重置到 Step N | 回退到指定步骤 | 🔴 高 |
| 🧹 清理失败任务 | 清理卡住/失败任务 | 🟢 低 |
| 📤 导出项目数据 | 导出完整数据 | 🟢 低 |
| 🗑️ 删除项目 | 永久删除项目 | 🔴 高 |

**高级筛选维度**：

- **项目类型**：视频 / 图片 / 反向
- **项目状态**：草稿 / 处理中 / 已完成 / 异常
- **当前步骤**：Step1-Step6 + 图片项目 4 步
- **时间范围**：今日 / 近7天 / 近30天 / 自定义
- **用户筛选**：按用户 ID 或用户名搜索
- **异常筛选**：卡住项目 / 失败任务 / 异常Step / 高风险

**批量操作**：

- 批量删除（带二次确认）
- 批量导出（CSV/JSON）
- 批量重置状态（仅管理员）

---

### 3.3 项目详情页

**页面布局**：

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 项目详情 #1247                              [返回列表]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  顶部信息栏                                                 │
│  ┌────────────────────────────────────────────────────────┐│
│  │ 📹 春季新品推广视频        🟡 处理中    Step 4/6       ││
│  │ 用户: 张三 (user123)  |  创建: 2026-04-17 14:23       ││
│  │                                           [🔧干预操作] ││
│  └────────────────────────────────────────────────────────┘│
│                                                             │
│  左侧面板（Step 执行时间轴 - 40%）  │ 右侧面板（60%）      │
│  ┌──────────────────────────┐       │ ┌────────────────────┐│
│  │ Step 执行时间轴           │       │ │ 📊 Step 4 关键数据 ││
│  │                          │       │ │                    ││
│  │ Step 1 服装上传           │       │ │ ┌────────────────┐││
│  │ ✅ 04-17 14:30 (15分钟)  │       │ │ │ 分镜帧数: 12帧 │││
│  │  └─ 服装: 3件 搭配: 2套  │       │ │ │ 已生成: 8帧    │││
│  │                          │       │ │ │ 进行中: 3帧    │││
│  │ Step 2 角色定妆           │       │ │ │ 失败: 1帧 ⚠️   │││
│  │ ✅ 04-17 15:45 (1小时)   │       │ │ └────────────────┘││
│  │  └─ 角色: 1个 图片: 15张 │       │ │                    ││
│  │                          │       │ │ ┌────────────────┐││
│  │ Step 3 脚本生成           │       │ │ │ 🎵 音乐选择    │││
│  │ ✅ 04-17 16:20 (35分钟)  │       │ │ │ 已选: 流行风格 │││
│  │  └─ 脚本: 3版本 分镜: 12 │       │ │ │ 时长: 30秒     │││
│  │                          │       │ │ └────────────────┘││
│  │ Step 4 分镜制作 ⬅️       │       │ │                    ││
│  │ 🔄 04-18 09:00 (进行中)  │       │ │ ┌────────────────┐││
│  │  └─ ⚠️ 卡住超过2小时     │       │ │ │ ⏱️ 执行时长    │││
│  │                          │       │ │ │ 已耗时: 2h 15m │││
│  │ Step 5 视频生成           │       │ │ │ 预计剩余: 45m  │││
│  │ ⏳ 待处理                │       │ │ └────────────────┘││
│  │                          │       │ │                    ││
│  │ Step 6 视频裂变           │       │ │ [查看Step详情]    ││
│  │ ⏳ 待处理                │       │ └────────────────────┘│
│  └──────────────────────────┘       │ ┌────────────────────┐│
│                                     │ │ 📋 任务列表        ││
│                                     │ │                    ││
│                                     │ │ task_001 ✅ 12m    ││
│                                     │ │ task_002 ✅ 3m     ││
│                                     │ │ task_003 🔄 8m     ││
│                                     │ │ task_004 ❌ 15m ⚠️ ││
│                                     │ │                    ││
│                                     │ │ [查看全部任务 →]   ││
│                                     │ └────────────────────┘│
│                                     │ ┌────────────────────┐│
│                                     │ │ 💰 资源消耗        ││
│                                     │ │ LLM: 23次          ││
│                                     │ │ 图片: 15张         ││
│                                     │ │ 视频: 0个          ││
│                                     │ └────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Step 执行时间轴交互**：

- 点击已完成 Step → 展开 Step 详情面板
- 点击进行中 Step → 显示实时进度
- 点击待处理 Step → 显示预期数据
- 悬停任意 Step → 显示关键指标 tooltip

**Step 关键数据展示**：

根据当前选中的 Step，显示对应的关键数据：

**Step 1 - 服装上传**：
- 上传服装数量、缩略图
- 搭配方案数、方案详情
- 角色方向、场景设定

**Step 2 - 角色定妆**：
- 角色数量、缩略图
- 定妆状态、生成图片数
- 角色详情信息

**Step 3 - 脚本生成**：
- 脚本版本数、当前版本
- 分镜数量、总时长
- 场景数、已锁定状态

**Step 4 - 分镜制作**：
- 分镜帧数、已生成/进行中/失败数量
- 音乐选择、时长
- 执行时长、预计剩余时间

**Step 5 - 视频生成**：
- 视频时长、分辨率
- 生成进度、合成状态
- 预览视频

**Step 6 - 视频裂变**：
- 原视频信息
- 裂变视频数量、状态
- 发布平台、发布状态

**资源消耗统计**：
- LLM 调用次数
- 图片生成数量
- 视频生成数量
- 总耗时

---

### 3.4 管理员预览模式

**设计原则**：管理员跳转到用户 Step 界面，但**只读查看**，仅保留必要的管理按钮。

**管理员预览界面**（跳转到 `/create/:projectId/step4`）：

```
┌─────────────────────────────────────────────────────────────┐
│  🔧 管理员预览模式                          [返回管理后台]  │
│  项目: #1247 春季新品推广  |  当前: Step 4 分镜制作         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │                                                     │   │
│  │           用户 Step 4 界面（只读模式）              │   │
│  │                                                     │   │
│  │           - 所有交互按钮禁用                        │   │
│  │           - 表单输入禁用                            │   │
│  │           - 仅显示数据和状态                        │   │
│  │                                                     │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  管理操作（底部固定栏）                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [解锁脚本选择]  [重置到 Step3]  [清理失败任务]      │   │
│  │                                                     │   │
│  │ 说明：此页面为只读预览，操作需通过管理按钮执行       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**管理按钮**：

| 按钮 | 说明 | 出现条件 |
|------|------|---------|
| 🔓 解锁脚本选择 | 解锁 Step3 脚本 | Step3 已锁定且 Step4+ 未完成 |
| 🔄 重置到 Step N | 回退到指定步骤 | 非第一步 |
| 🧹 清理失败任务 | 清理卡住/失败任务 | 存在失败任务 |
| 📤 导出项目数据 | 导出完整数据 | 始终显示 |

**安全机制**：
- 操作前显示影响范围
- 高风险操作需要二次确认
- 所有操作记录审计日志

---

### 3.5 项目干预操作

**操作类型划分**：

#### Step 解锁操作

| 操作 | 说明 | 适用 Step | 风险等级 |
|------|------|-----------|---------|
| 解锁脚本选择 | 允许用户重新选择脚本版本 | Step3 | 🟡 中 |
| 解锁角色选择 | 允许用户重新选择角色 | Step2 | 🟡 中 |
| 解锁服装搭配 | 允许用户重新上传/选择服装 | Step1 | 🟡 中 |
| 解锁分镜 | 允许用户重新编辑分镜 | Step4 | 🟡 中 |

#### Step 重置操作

| 操作 | 说明 | 风险等级 |
|------|------|---------|
| 重置到 Step N | 将项目回退到指定步骤，清除后续步骤数据 | 🔴 高 |
| 重新生成当前 Step | 触发当前步骤重新执行 | 🟡 中 |

#### 任务管理操作

| 操作 | 说明 | 风险等级 |
|------|------|---------|
| 清理失败任务 | 清理卡住/失败的任务，释放资源 | 🟢 低 |
| 强制完成 Step | 标记某个 Step 为完成状态（跳过异常） | 🔴 高 |
| 取消进行中任务 | 取消正在执行的任务 | 🟡 中 |

#### 数据操作

| 操作 | 说明 | 风险等级 |
|------|------|---------|
| 恢复已删除项目 | 恢复软删除的项目 | 🟢 低 |
| 导出项目数据 | 导出项目完整数据（JSON/ZIP） | 🟢 低 |
| 删除项目 | 永久删除项目（物理删除） | 🔴 高 |

**操作确认流程**：

```
点击操作 → 二次确认弹窗（显示操作影响）
        → 输入管理员密码/备注原因
        → 执行操作 → 记录操作日志
        → 刷新页面数据
```

**操作日志记录**：

```sql
-- 操作日志表
INSERT INTO admin_operation_logs (
  admin_user_id,
  project_id,
  operation_type,
  operation_detail,
  reason,
  created_at
) VALUES (?, ?, 'unlock_script', '解锁 Step3 脚本选择', '用户反馈脚本选择错误', NOW());
```

---

### 3.6 任务管理

**任务类型识别**：

**视频项目任务**：

| Step | 任务类型 | 任务名称 | 执行内容 |
|------|---------|---------|---------|
| Step2 | `character_generation` | 角色定妆生成 | 生成角色五视图、定妆图 |
| Step3 | `script_generation` | 脚本生成 | LLM 生成脚本、分镜描述 |
| Step4 | `storyboard_generation` | 分镜生成 | 生成分镜图片、场景图 |
| Step4 | `music_selection` | 音乐选择 | 音乐匹配/推荐 |
| Step5 | `video_generation` | 视频生成 | AI 视频合成 |
| Step5 | `video_merge` | 视频合并 | 多片段合并 |
| Step6 | `fission_video` | 视频裂变 | 生成裂变视频 |
| Step6 | `publish_task` | 发布任务 | 发布到抖音等平台 |

**图片项目任务**：

| Step | 任务类型 | 任务名称 | 执行内容 |
|------|---------|---------|---------|
| Step3 | `model_photo_generation` | 模特图生成 | AI 生成模特展示图 |
| Step4 | `ecommerce_page_generation` | 详情页生成 | 生成电商详情页 |

**任务状态定义**：

```
任务状态流转：
pending → running → success
   ↓         ↓
cancelled  failed → retrying → running
```

**状态说明**：

| 状态 | 说明 | 可执行操作 |
|------|------|-----------|
| `pending` | 等待执行 | 取消、调整优先级 |
| `running` | 执行中 | 取消、查看进度 |
| `success` | 执行成功 | 查看结果 |
| `failed` | 执行失败 | 重试、查看错误、清理 |
| `cancelled` | 已取消 | 重新触发 |
| `stuck` | 卡住（超时） | 强制取消、重试 |

**任务管理 UI**：

任务列表视图（嵌入项目详情页）：
- 显示任务ID、类型、状态、进度、耗时
- 支持筛选（全部状态、全部类型、时间范围）
- 提供单任务操作和批量操作

**单任务操作**：

| 操作 | 适用状态 | 说明 | 风险等级 |
|------|---------|------|---------|
| 查看详情 | 全部 | 查看任务执行详情、参数、日志 | 🟢 低 |
| 重试任务 | failed | 重新执行失败的任务 | 🟡 中 |
| 取消任务 | pending, running | 取消等待中或执行中的任务 | 🟡 中 |
| 强制取消 | stuck | 强制取消卡住的任务（清理资源） | 🟡 中 |
| 调整优先级 | pending | 调整等待中任务的执行优先级 | 🟢 低 |
| 查看日志 | 全部 | 查看完整执行日志 | 🟢 低 |
| 导出数据 | 全部 | 导出任务参数和执行数据 | 🟢 低 |
| 清理任务 | failed, cancelled, stuck | 清理任务记录和临时文件 | 🟢 低 |

**批量任务操作**：

| 操作 | 说明 | 风险等级 |
|------|------|---------|
| 批量重试 | 批量重试所有失败任务 | 🟡 中 |
| 批量取消 | 批量取消等待中/进行中任务 | 🟡 中 |
| 批量清理 | 批量清理失败/取消/卡住的任务 | 🟢 低 |
| 导出任务列表 | 导出任务列表数据（CSV/JSON） | 🟢 低 |

**任务监控指标**：

```
任务概览
├── 进行中任务数: 12
├── 等待中任务数: 45
├── 失败任务数: 3
├── 卡住任务数: 1
├── 平均等待时间: 5分钟
└── 平均执行时长: 8分钟

任务队列
├── 队列长度: 45
├── 处理能力: 5任务/分钟
└── 预计等待: 9分钟
```

**异常检测规则**：

| 规则 | 触发条件 | 告警级别 |
|------|---------|---------|
| 任务卡住 | 执行时长 > 预期时长 × 2 | 🟡 中 |
| 任务失败率过高 | 最近 1 小时失败率 > 20% | 🔴 高 |
| 队列积压 | 等待队列 > 100 | 🟡 中 |
| 任务超时 | 执行时长 > 最大限制 | 🔴 高 |

---

### 3.7 统计分析中心

**页面布局**：

```
┌─────────────────────────────────────────────────────────────┐
│  📈 统计分析中心                        时间: [近7天 ▼]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  第一行：核心趋势图                                         │
│  ┌──────────────────────────┐ ┌──────────────────────────┐│
│  │ 📊 项目创建趋势          │ │ 📊 项目完成趋势          ││
│  │                          │ │                          ││
│  │      ___/                │ │           ___            ││
│  │     /    \___            │ │      ____/   \___        ││
│  │    /         \___        │ │     /            \       ││
│  │   4/11  4/14   4/17      │ │   4/11  4/14   4/17      ││
│  │                          │ │                          ││
│  │ 新增: 156  ↑12%          │ │ 完成: 134  ↑18%          ││
│  └──────────────────────────┘ └──────────────────────────┘│
│                                                             │
│  第二行：Step 漏斗 + 用户活跃                               │
│  ┌──────────────────────────┐ ┌──────────────────────────┐│
│  │ 🔻 Step 转化漏斗         │ │ 👥 用户活跃度            ││
│  │                          │ │                          ││
│  │ Step 1: 100% ██████████ │ │ 活跃用户: 156人          ││
│  │ Step 2:  95% █████████  │ │ 新增用户: 23人           ││
│  │ Step 3:  88% ████████   │ │ 人均项目: 2.3个          ││
│  │ Step 4:  75% ████████ ⚠️│ │ 平均时长: 1.2h           ││
│  │ Step 5:  89% █████████  │ │                          ││
│  │ Step 6:  96% ██████████ │ │ 活跃度趋势:              ││
│  │                          │ │      ___/                ││
│  │ ⚠️ Step4 流失率高       │ │     /                    ││
│  └──────────────────────────┘ └──────────────────────────┘│
│                                                             │
│  第三行：成本 + 异常                                        │
│  ┌──────────────────────────┐ ┌──────────────────────────┐│
│  │ 💰 成本消耗分析          │ │ ⚠️ 异常模式识别          ││
│  │                          │ │                          ││
│  │ LLM 调用: 1,234次        │ │ 异常项目: 23个           ││
│  │ ├─ 成功率: 98.5%         │ │ ├─ 卡住: 15个            ││
│  │ └─ 失败率: 1.5%          │ │ ├─ 失败: 6个             ││
│  │                          │ │ └─ 其他: 2个             ││
│  │ 图片生成: 456张          │ │                          ││
│  │ 视频生成: 23个           │ │ 高发异常:                ││
│  │                          │ │ • Step4 分镜超时 (45%)   ││
│  │ 成本趋势:                │ │ • Step5 视频失败 (30%)   ││
│  │      ___/                │ │ • Step6 裂变异常 (15%)   ││
│  │     /                    │ │                          ││
│  └──────────────────────────┘ └──────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**图表类型**：

| 图表 | 类型 | 说明 |
|------|------|------|
| 项目创建趋势 | 折线图 | 每日新增项目数 |
| 项目完成趋势 | 折线图 | 每日完成项目数 |
| Step 转化漏斗 | 漏斗图 | Step1→Step6 转化率 |
| 用户活跃度 | 卡片 + 趋势 | 活跃用户数、新增用户 |
| 成本消耗 | 柱状图 + 趋势 | LLM/图片/视频消耗 |
| 异常模式 | 饼图 + 列表 | 异常类型分布 |

**数据导出**：
- 支持导出 CSV/JSON 格式
- 支持自定义时间范围
- 支持按项目类型/用户筛选

---

### 3.8 异常监控机制

**三层监控架构**：

```
┌─────────────────────────────────────────────────────────────┐
│  异常监控三层架构                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  第 1 层：被动查询（管理员主动查询）                         │
│  └─ 异常项目列表、筛选、排序                                │
│                                                             │
│  第 2 层：规则告警（预设规则自动标记）                       │
│  └─ 卡住检测、失败阈值、队列积压                            │
│                                                             │
│  第 3 层：智能检测（历史数据分析异常模式）                   │
│  └─ 偏离正常流程、异常耗时、异常失败率                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**第 1 层：被动查询**

**异常类型分类**：

| 类型 | 说明 | 严重级别 |
|------|------|---------|
| `stuck` | 任务卡住 | 🟡 中 |
| `failed` | 任务失败 | 🔴 高 |
| `timeout` | 执行超时 | 🔴 高 |
| `high_cost` | 成本异常 | 🟡 中 |
| `slow_step` | 步骤耗时异常 | 🟢 低 |

**第 2 层：规则告警**

**预设规则表**：

| 规则 ID | 规则名称 | 触发条件 | 告警级别 | 自动操作 |
|---------|---------|---------|---------|---------|
| `RULE_001` | 任务卡住 | 执行时长 > 预期 × 2 | 🟡 中 | 标记异常 |
| `RULE_002` | 任务失败 | 失败次数 ≥ 3 | 🔴 高 | 标记异常 |
| `RULE_003` | 队列积压 | 等待任务 > 50 | 🟡 中 | 标记异常 |
| `RULE_004` | Step 超时 | Step 耗时 > 最大限制 | 🔴 高 | 标记异常 |
| `RULE_005` | 高失败率 | 1小时失败率 > 20% | 🔴 高 | 全局告警 |
| `RULE_006` | 异常耗时 | 耗时 > 历史均值 × 3 | 🟢 低 | 记录日志 |

**规则执行引擎**：

```typescript
// 后端定时任务（每 5 分钟执行）
async function checkAnomalyRules() {
  const rules = await getActiveRules();

  for (const rule of rules) {
    const anomalies = await detectAnomalies(rule);

    for (const anomaly of anomalies) {
      await markProjectAsAnomaly(anomaly);
      await logAnomalyAlert(anomaly, rule);
    }
  }
}
```

**异常标记存储**：

```sql
-- 异常标记表
CREATE TABLE project_anomaly_marks (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL,
  rule_id VARCHAR(50) NOT NULL,
  anomaly_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by VARCHAR(50),

  INDEX idx_project_id (project_id),
  INDEX idx_created_at (created_at)
);
```

**第 3 层：智能检测**

**异常模式识别**：

```typescript
// 基于历史数据分析异常模式
interface AnomalyPattern {
  patternId: string;
  patternName: string;
  detectionLogic: (project: Project, history: ProjectHistory) => boolean;
}

// 示例：检测偏离正常流程
const patterns: AnomalyPattern[] = [
  {
    patternId: 'PATTERN_001',
    patternName: '异常流程跳转',
    detectionLogic: (project, history) => {
      // Step 从 4 跳到 2（非正常回退）
      return history.stepTransitions.some(
        t => t.fromStep === 4 && t.toStep === 2
      );
    }
  },
  {
    patternId: 'PATTERN_002',
    patternName: '异常耗时',
    detectionLogic: (project, history) => {
      const avgDuration = calculateAvgStepDuration(project.step);
      const currentDuration = project.currentStepDuration;
      // 当前耗时超过历史均值 3 倍
      return currentDuration > avgDuration * 3;
    }
  },
  {
    patternId: 'PATTERN_003',
    patternName: '异常重试',
    detectionLogic: (project, history) => {
      // 同一步骤重试超过 5 次
      return history.retries.filter(r => r.step === project.step).length > 5;
    }
  }
];
```

---

## 4. 数据库设计

### 4.1 新增表结构

**管理操作日志表**：

```sql
CREATE TABLE admin_operation_logs (
  id SERIAL PRIMARY KEY,
  admin_user_id VARCHAR(50) NOT NULL,
  project_id VARCHAR(50),
  operation_type VARCHAR(50) NOT NULL,
  operation_detail TEXT,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_admin_user_id (admin_user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_created_at (created_at)
);

COMMENT ON TABLE admin_operation_logs IS '管理员操作日志表';
COMMENT ON COLUMN admin_operation_logs.admin_user_id IS '管理员用户ID';
COMMENT ON COLUMN admin_operation_logs.project_id IS '项目ID';
COMMENT ON COLUMN admin_operation_logs.operation_type IS '操作类型：unlock_script, reset_step, delete_project等';
COMMENT ON COLUMN admin_operation_logs.operation_detail IS '操作详情';
COMMENT ON COLUMN admin_operation_logs.reason IS '操作原因';
```

**异常标记表**：

```sql
CREATE TABLE project_anomaly_marks (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL,
  rule_id VARCHAR(50) NOT NULL,
  anomaly_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by VARCHAR(50),

  INDEX idx_project_id (project_id),
  INDEX idx_created_at (created_at)
);

COMMENT ON TABLE project_anomaly_marks IS '项目异常标记表';
COMMENT ON COLUMN project_anomaly_marks.project_id IS '项目ID';
COMMENT ON COLUMN project_anomaly_marks.rule_id IS '触发规则ID';
COMMENT ON COLUMN project_anomaly_marks.anomaly_type IS '异常类型：stuck, failed, timeout等';
COMMENT ON COLUMN project_anomaly_marks.severity IS '严重级别：high, medium, low';
COMMENT ON COLUMN project_anomaly_marks.details IS '异常详情JSON';
COMMENT ON COLUMN project_anomaly_marks.resolved_at IS '解决时间';
COMMENT ON COLUMN project_anomaly_marks.resolved_by IS '解决人';
```

### 4.2 索引优化

**项目表索引**：

```sql
-- 项目列表查询优化
CREATE INDEX idx_projects_status_kind ON projects (status, project_kind);
CREATE INDEX idx_projects_last_visited_step ON projects (last_visited_step);
CREATE INDEX idx_projects_updated_at ON projects (updated_at DESC);
CREATE INDEX idx_projects_user_id ON projects (user_id);
```

---

## 5. API 接口设计

### 5.1 仪表盘接口

**GET /admin/projects/dashboard**

**请求参数**：
```typescript
{
  timeRange?: 'today' | '7days' | '30days'; // 时间范围，默认 '7days'
}
```

**响应数据**：
```typescript
{
  projectStats: {
    total: number;
    processing: number;
    completed: number;
    anomaly: number;
    totalTrend: number; // 较昨日增长率
  };
  taskStats: {
    total: number;
    running: number;
    failed: number;
    stuck: number;
  };
  stepFunnel: {
    step: number;
    count: number;
    percentage: number;
  }[];
  userActivity: {
    activeUsers: number;
    newUsers: number;
    avgProjectsPerUser: number;
  };
  costConsumption: {
    llmCalls: number;
    imageGenerations: number;
    videoGenerations: number;
  };
  anomalyProjects: {
    projectId: string;
    title: string;
    type: string;
    severity: string;
    message: string;
  }[];
}
```

### 5.2 项目列表接口

**GET /admin/projects**

**请求参数**：
```typescript
{
  projectKind?: 'video' | 'image' | 'reverse';
  status?: 'DRAFT' | 'PROCESSING' | 'COMPLETED' | 'ANOMALY';
  step?: number;
  userId?: string;
  timeRange?: 'today' | '7days' | '30days';
  anomalyType?: 'stuck' | 'failed' | 'timeout' | 'high_cost';
  search?: string; // 项目标题搜索
  page?: number;
  pageSize?: number;
}
```

**响应数据**：
```typescript
{
  total: number;
  items: {
    id: string;
    title: string;
    thumbnail: string;
    hasVideo: boolean; // 是否有视频
    videoUrl?: string; // 视频地址
    projectKind: string;
    status: string;
    currentStep: number;
    totalSteps: number;
    stepProgress: {
      step: number;
      status: 'completed' | 'running' | 'failed' | 'pending' | 'locked';
    }[];
    userId: string;
    userName: string;
    createdAt: string;
    updatedAt: string;
  }[];
}
```

### 5.3 项目详情接口

**GET /admin/projects/:id/detail**

**响应数据**：
```typescript
{
  basicInfo: {
    id: string;
    title: string;
    projectKind: string;
    status: string;
    currentStep: number;
    userId: string;
    userName: string;
    createdAt: string;
    updatedAt: string;
  };
  stepTimeline: {
    step: number;
    stepName: string;
    status: 'completed' | 'running' | 'failed' | 'pending';
    startTime?: string;
    endTime?: string;
    duration?: number; // 分钟
    keyData: Record<string, any>; // Step 关键数据
  }[];
  tasks: {
    taskId: string;
    taskType: string;
    status: string;
    progress: number;
    duration: number;
  }[];
  resourceConsumption: {
    llmCalls: number;
    imageGenerations: number;
    videoGenerations: number;
    totalDuration: number; // 总耗时（分钟）
  };
  errorLogs: {
    timestamp: string;
    step: number;
    errorCode: string;
    errorMessage: string;
  }[];
}
```

### 5.4 项目干预操作接口

**POST /admin/projects/:id/unlock-script**

**请求参数**：
```typescript
{
  reason: string; // 操作原因
}
```

**响应数据**：
```typescript
{
  success: boolean;
  message: string;
}
```

**POST /admin/projects/:id/reset-step**

**请求参数**：
```typescript
{
  targetStep: number; // 目标步骤
  reason: string;
}
```

**响应数据**：
```typescript
{
  success: boolean;
  message: string;
  affectedData: string[]; // 受影响的数据项
}
```

### 5.5 任务管理接口

**GET /admin/projects/:id/tasks**

**请求参数**：
```typescript
{
  status?: 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'stuck';
  taskType?: string;
}
```

**响应数据**：
```typescript
{
  total: number;
  items: {
    taskId: string;
    taskType: string;
    taskName: string;
    status: string;
    progress: number;
    startTime?: string;
    endTime?: string;
    duration?: number;
    errorMessage?: string;
  }[];
}
```

**POST /admin/tasks/:taskId/retry**

**请求参数**：
```typescript
{
  reason: string;
}
```

**响应数据**：
```typescript
{
  success: boolean;
  message: string;
  newTaskId?: string; // 新任务ID
}
```

### 5.6 统计分析接口

**GET /admin/projects/statistics**

**请求参数**：
```typescript
{
  timeRange: '7days' | '30days' | 'custom';
  startDate?: string; // 自定义开始日期
  endDate?: string; // 自定义结束日期
  projectKind?: 'video' | 'image' | 'reverse';
}
```

**响应数据**：
```typescript
{
  creationTrend: {
    date: string;
    count: number;
  }[];
  completionTrend: {
    date: string;
    count: number;
  }[];
  stepFunnel: {
    step: number;
    count: number;
    percentage: number;
    dropOff: number; // 流失数
  }[];
  userActivity: {
    activeUsers: number;
    newUsers: number;
    avgProjectsPerUser: number;
    avgDuration: number;
  };
  costConsumption: {
    llmCalls: number;
    llmSuccessRate: number;
    imageGenerations: number;
    videoGenerations: number;
    trend: {
      date: string;
      llmCalls: number;
      imageGenerations: number;
      videoGenerations: number;
    }[];
  };
  anomalyPatterns: {
    type: string;
    count: number;
    percentage: number;
  }[];
}
```

### 5.7 异常检测接口

**GET /admin/projects/anomalies**

**请求参数**：
```typescript
{
  type?: 'stuck' | 'failed' | 'timeout' | 'high_cost' | 'slow_step';
  severity?: 'high' | 'medium' | 'low';
  hours?: number; // 卡住时长阈值
  minFailures?: number; // 最小失败次数
}
```

**响应数据**：
```typescript
{
  total: number;
  items: {
    projectId: string;
    title: string;
    type: string;
    step?: number;
    stuckHours?: number;
    failureCount?: number;
    lastUpdate: string;
    severity: string;
  }[];
}
```

**GET /admin/projects/smart-detect**

**请求参数**：
```typescript
{
  patterns?: string[]; // 模式ID列表
}
```

**响应数据**：
```typescript
{
  detectedCount: number;
  patterns: {
    patternId: string;
    patternName: string;
    count: number;
    projects: string[];
  }[];
}
```

---

## 6. 前端实现要点

### 6.1 路由配置

```typescript
// apps/web/App.tsx
<Route path="/admin/projects" element={<AdminLayout />}>
  <Route index element={<Navigate to="dashboard" replace />} />
  <Route path="dashboard" element={<AdminProjectsDashboard />} />
  <Route path="list" element={<AdminProjectsList />} />
  <Route path=":id/detail" element={<AdminProjectDetail />} />
  <Route path="statistics" element={<AdminProjectsStatistics />} />
</Route>
```

### 6.2 权限守卫

```typescript
// AdminLayout.tsx
const AdminLayout: React.FC = () => {
  const user = useAppStore(state => state.user);

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};
```

### 6.3 管理员预览模式

```typescript
// 跳转到用户 Step 界面时，添加管理员模式标识
const handlePreviewProject = (projectId: string, step: number) => {
  // 设置管理员预览模式标识
  sessionStorage.setItem('adminPreviewMode', 'true');
  navigate(`/create/${projectId}/step${step}`);
};

// 在 ProjectLayout 中检测管理员预览模式
const ProjectLayout: React.FC = () => {
  const user = useAppStore(state => state.user);
  const isAdminPreview = sessionStorage.getItem('adminPreviewMode') === 'true';

  if (isAdminPreview && user?.role === 'admin') {
    // 显示管理员预览模式提示栏
    // 禁用所有交互按钮
  }
};
```

---

## 7. 实现优先级

### Phase 1：核心功能（高优先级）

1. **项目列表页**
   - 基础列表展示
   - 高级筛选
   - 缩略图 + 视频预览
   - 行操作菜单

2. **项目详情页**
   - Step 执行时间轴
   - Step 关键数据展示
   - 任务列表
   - 资源消耗统计

3. **项目干预操作**
   - 解锁脚本选择
   - 重置到 Step N
   - 清理失败任务

### Phase 2：数据洞察（中优先级）

4. **概览仪表盘**
   - 核心指标卡片
   - Step 漏斗分析
   - 异常项目告警

5. **统计分析中心**
   - 项目创建/完成趋势
   - 用户活跃度
   - 成本消耗分析

### Phase 3：智能监控（低优先级）

6. **异常监控机制**
   - 规则告警
   - 智能检测
   - 异常标记存储

---

## 8. 风险与注意事项

### 8.1 安全风险

- **权限控制**：确保所有管理接口都有管理员权限验证
- **操作审计**：所有敏感操作记录审计日志
- **数据安全**：导出数据时注意敏感信息脱敏

### 8.2 性能风险

- **大数据量查询**：项目列表需要分页和索引优化
- **实时刷新**：仪表盘自动刷新注意频率控制
- **统计计算**：复杂统计考虑预计算或缓存

### 8.3 业务风险

- **误操作**：高风险操作需要二次确认
- **数据一致性**：Step 重置需要清理关联数据
- **用户体验**：管理员预览模式不能影响正常用户

---

## 9. 后续扩展

### 9.1 功能扩展

- **批量导入项目**：支持批量创建测试项目
- **项目模板管理**：管理项目模板
- **用户管理**：用户权限、配额管理
- **系统配置**：全局参数配置

### 9.2 数据扩展

- **实时监控**：WebSocket 实时推送
- **自定义报表**：用户自定义统计报表
- **数据对比**：时间段对比分析

---

## 10. 附录

### 10.1 术语表

| 术语 | 说明 |
|------|------|
| Step | 项目工作流的步骤，视频项目 1-6，图片项目 1-4 |
| 任务 | Step 执行过程中的具体任务，如角色生成、脚本生成等 |
| 异常 | 项目执行过程中的异常情况，如卡住、失败、超时等 |
| 干预操作 | 管理员对项目执行的特殊操作，如解锁、重置等 |

### 10.2 相关文档

- 项目工作流文档：`docs/buss/table/project-relation.md`
- 数据库设计文档：`docs/buss/table/`
- API 接口文档：`src/contracts/`
