# 审美特征库扩展与后台管理设计文档

> **设计日期**: 2026-04-24
> **设计状态**: 已批准
> **实现计划**: 待创建

---

## 1. 设计目标

### 1.1 核心目标

**扩展审美特征库支持成人分类**，使用与儿童相同的统一机制（TikHub API + LLM 分析），并创建**可视化后台管理系统**，供内部管理员维护特征库数据。

### 1.2 价值主张

- **统一机制**：成人特征沿用儿童的 TikHub API + AI 分析流程，降低维护成本
- **可视化管理**：7 个功能模块覆盖完整生命周期（查看、编辑、筛选、调整、来源查看、监控、手动触发）
- **卡片式 UI**：直观展示儿童/成人特征差异，内联编辑提升操作效率

---

## 2. 系统架构

### 2.1 现有架构（已完成）

```
┌─────────────────────────────────────────────────────────┐
│  审美特征库核心系统（儿童）                                │
├─────────────────────────────────────────────────────────┤
│  • nrm_aesthetic_feature_library（15 条种子数据）        │
│  • AestheticLibraryService（特征提取、反馈分析）         │
│  • TikHubClient（小红书/Instagram 爬取）                  │
│  • AestheticLibraryUpdateService（每日定时更新）         │
│  • 14 个儿童细化特征类别                                  │
│  • 智能 30% 概率混血逻辑                                  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 扩展架构（本次设计）

```
┌─────────────────────────────────────────────────────────┐
│  审美特征库扩展系统                                       │
├─────────────────────────────────────────────────────────┤
│  1. 成人特征分类                                          │
│     • age_range 字段扩展：'child_6-12' | 'adult_18-30'  │
│     • 4 个新增成人特征类别                                │
│     • TikHub 关键词扩展（成人穿搭、成人发型等）           │
│                                                           │
│  2. 后台管理系统                                          │
│     • 前端：React 组件（卡片式 UI + 内联编辑）            │
│     • 路由：/admin/aesthetic-library                     │
│     • API：RESTful CRUD 接口                             │
│     • 权限：管理员角色验证                                │
│                                                           │
│  3. 7 个功能模块                                          │
│     • 数据总览（统计概览、流行度分布）                    │
│     • 特征管理（CRUD）                                    │
│     • 分类筛选（年龄、种族、类别）                        │
│     • 流行度调整（手动评分、批量操作）                    │
│     • 数据来源查看（小红书/Instagram 链接）               │
│     • 定时任务监控（每日更新状态）                        │
│     • 手动触发更新（管理员触发 TikHub 爬取）              │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 成人特征分类设计

### 3.1 数据库扩展

**表结构保持不变**，通过 `age_range` 字段区分：

```sql
-- 现有字段
age_range VARCHAR(20) NOT NULL DEFAULT 'child_6-12'
  -- 扩展为：'child_6-12' | 'adult_18-30'

-- 现有索引（需扩展）
CREATE INDEX idx_age_range ON nrm_aesthetic_feature_library(age_range);
```

**数据分布**：
- 儿童：15 条种子数据（已完成）
- 成人：0 条种子数据（待 TikHub API 爬取填充）

### 3.2 成人特征类别（4 个新增）

| 类别代码 | 中文名称 | 描述 |
|---------|---------|------|
| `jawline_definition` | 下颌线清晰度 | 成年面部轮廓立体感（清晰/柔和/圆润） |
| `cheekbone_prominence` | 颧骨立体感 | 面部骨骼结构立体度（高颧骨/扁平/适中） |
| `lip_fullness` | 嘴唇丰满度 | 嘴唇形态特征（丰满/薄唇/适中） |
| `eyebrow_shape` | 眉形风格 | 眉毛形状与风格（浓密/细长/拱形/平直） |

**儿童 vs 成人对比**：

```
儿童（14 个）：                        成人（4 个）：
  eye_shape_width                      jawline_definition
  eye_shape_almond                     cheekbone_prominence
  eye_shape_round                      lip_fullness
  eye_color_hazel                      eyebrow_shape
  eye_color_dark_brown
  eye_color_light_brown
  skin_tone_warm_beige
  skin_tone_olive
  skin_tone_rosy_cheeks
  hair_style_soft_waves
  hair_style_natural_straight
  hair_style_chestnut_brown
  nose_shape_button_defined
  nose_shape_small_flat
```

### 3.3 TikHub 关键词扩展

**现有儿童关键词**：
```typescript
xiaohongshuKeywords: [
  "儿童穿搭", "混血宝宝", "潮童", "儿童发型", "儿童时尚"
]
instagramHashtags: [
  "#childfashion", "#mixedracechild", "#kidstyle", "#childrenswear"
]
```

**新增成人关键词**：
```typescript
// 小红书成人关键词
adultXiaohongshuKeywords: [
  "成人穿搭", "时尚博主", "成年发型", "妆容教程", "面部轮廓"
]

// Instagram 成人标签
adultInstagramHashtags: [
  "#adultfashion", "#fashionblogger", "#makeuptutorial", "#facialcontour"
]
```

### 3.4 LLM 提示词扩展

**成人特征提取提示词**（在现有基础上扩展）：

```markdown
分析这张成人角色图片，提取细化审美特征（符合成人解剖学比例）。

请从以下细化类别中提取特征：

**儿童类别（14 个）**：
1. 眼型宽度 (eye_shape_width)
2. 眼型形状 (eye_shape_almond / eye_shape_round)
...

**成人类别（4 个）**：
1. 下颌线清晰度 (jawline_definition)：defined_sharp, soft_natural, round_soft
2. 颧骨立体感 (cheekbone_prominence)：high_prominent, flat_natural, moderate_balanced
3. 嘴唇丰满度 (lip_fullness)：full_plump, thin_delicate, moderate_natural
4. 眉形风格 (eyebrow_shape)：thick_bold, thin_arched, curved_graceful, straight_natural

返回格式（JSON）：
{
  "feature_category": "jawline_definition",
  "feature_name": "defined_sharp",
  "feature_description": "清晰下颌线条，成年面部轮廓立体感...",
  "ethnicity_applicable": ["Asian", "Caucasian"],
  "age_range": "adult_18-30",
  "popularity_score": 0.85
}

只返回一个最明显的特征（根据图片内容选择）。
```

---

## 4. 后台管理系统设计

### 4.1 路由与权限

**前端路由**：
```typescript
// apps/web/App.tsx 新增路由
<Route path="/admin/aesthetic-library" element={<AestheticLibraryAdmin />} />
```

**权限验证**：
- 前端：检查 `user.role === 'admin'`，否则跳转登录页
- 后端：所有 `/neirongmiao/api/admin/aesthetic-library/*` 接口需验证 `Authorization: Bearer {token}` 且角色为管理员

### 4.2 UI 布局（卡片式 + 内联编辑）

**顶部数据总览卡片（4 个统计指标）**：

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ 儿童特征总数   │ 成人特征总数   │ 细化类别数    │ 定时任务状态  │
│     15       │      0       │     14       │     ✅       │
│  child_6-12  │  adult_18-30 │  categories  │  scheduler   │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

**左侧功能导航（7 个模块）**：

```
┌─────────────────────────────────────┐
│ ① 数据总览                          │
│   统计概览、流行度分布图表            │
├─────────────────────────────────────┤
│ ② 特征管理                          │
│   查看/新增/编辑/删除特征            │
├─────────────────────────────────────┤
│ ③ 分类筛选                          │
│   按年龄、种族、类别筛选              │
├─────────────────────────────────────┤
│ ④ 流行度调整                        │
│   手动评分、批量操作、淘汰/激活       │
├─────────────────────────────────────┤
│ ⑤ 数据来源查看                      │
│   小红书/Instagram 链接、点赞数      │
├─────────────────────────────────────┤
│ ⑥ 定时任务监控                      │
│   每日更新状态、成功/失败记录         │
├─────────────────────────────────────┤
│ ⑦ 手动触发更新                      │
│   管理员触发 TikHub API 爬取         │
└─────────────────────────────────────┘
```

**右侧详情区（卡片式特征列表）**：

```
儿童特征卡片（绿色边框）：
┌─────────────────────────────────────┐
│ [儿童] 流行度: 0.92                  │
│ eye_shape_width                     │
│ wide_almond_innocent                │
│ Wide almond-shaped eyes...          │
│ ────────────────────────────────    │
│ [编辑] [淘汰]                        │
└─────────────────────────────────────┘

成人特征卡片（橙色边框）：
┌─────────────────────────────────────┐
│ [成人] 流行度: 0.85                  │
│ jawline_definition                  │
│ defined_sharp_jawline               │
│ 清晰下颌线条，成年面部轮廓立体感...   │
│ ────────────────────────────────    │
│ [编辑] [淘汰]                        │
└─────────────────────────────────────┘
```

**内联编辑模式（点击"编辑"后展开）**：

```
┌─────────────────────────────────────────────────────┐
│ 内联编辑模式                                         │
├─────────────────────────────────────────────────────┤
│ 特征类别：[eye_shape_width        ]                 │
│ 特征名称：[wide_almond_innocent   ]                 │
│ 特征描述：[Wide almond-shaped eyes...]              │
│ 流行度：  [0.92                   ] (0-1)           │
│ 年龄范围：[child_6-12 ▼           ]                 │
│           [adult_18-30            ]                 │
│ ──────────────────────────────────────────────      │
│ [保存] [取消]                                        │
└─────────────────────────────────────────────────────┘
```

### 4.3 7 个功能模块详细设计

#### 模块 1：数据总览

**功能**：
- 顶部 4 个统计卡片（儿童总数、成人总数、类别数、任务状态）
- 流行度分布图表（柱状图/饼图）
- 按年龄、种族、类别的分布统计

**API 接口**：
```typescript
GET /neirongmiao/api/admin/aesthetic-library/statistics
Response: {
  childCount: number;
  adultCount: number;
  categoryCount: number;
  schedulerStatus: 'running' | 'stopped';
  popularityDistribution: {
    high: number; // >= 0.8
    medium: number; // 0.5-0.8
    low: number; // < 0.5
  };
  categoryDistribution: Record<string, number>;
}
```

#### 模块 2：特征管理

**功能**：
- 卡片式列表展示（儿童绿色、成人橙色）
- 新增特征按钮（弹窗表单）
- 内联编辑（点击"编辑"展开表单）
- 删除/淘汰特征（软删除，设置 `is_active = false`）

**API 接口**：
```typescript
// 列表查询
GET /neirongmiao/api/admin/aesthetic-library/features
Query: {
  ageRange?: 'child_6-12' | 'adult_18-30';
  category?: string;
  ethnicity?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
Response: {
  features: AestheticFeature[];
  total: number;
  page: number;
  limit: number;
}

// 新增特征
POST /neirongmiao/api/admin/aesthetic-library/features
Body: AestheticFeatureInput

// 编辑特征
PUT /neirongmiao/api/admin/aesthetic-library/features/:id
Body: Partial<AestheticFeatureInput>

// 删除特征（软删除）
DELETE /neirongmiao/api/admin/aesthetic-library/features/:id
Response: { success: boolean }
```

#### 模块 3：分类筛选

**功能**：
- 年龄筛选（儿童/成人）
- 种族筛选（Asian/Mixed/Caucasian/African）
- 类别筛选（18 个类别下拉选择）
- 组合筛选（多条件 AND 逻辑）

**UI 组件**：
```tsx
<Select label="年龄范围" options={['child_6-12', 'adult_18-30']} />
<Select label="种族" options={['Asian', 'Mixed', 'Caucasian', 'African']} />
<Select label="特征类别" options={[...18 个类别]} />
<Button>应用筛选</Button>
```

#### 模块 4：流行度调整

**功能**：
- 手动调整流行度评分（输入框，范围 0-1）
- 批量调整（多选特征，统一设置评分）
- 淘汰/激活（设置 `is_active = false/true`）

**API 接口**：
```typescript
// 单个调整
PUT /neirongmiao/api/admin/aesthetic-library/features/:id/popularity
Body: { popularityScore: number }

// 批量调整
PUT /neirongmiao/api/admin/aesthetic-library/features/batch/popularity
Body: {
  featureIds: string[];
  popularityScore: number;
}

// 淘汰/激活
PUT /neirongmiao/api/admin/aesthetic-library/features/:id/status
Body: { isActive: boolean }
```

#### 模块 5：数据来源查看

**功能**：
- 展示特征的数据来源（`source` 字段）
- 小红书/Instagram 原始链接（`source_metadata`）
- 点赞数、粉丝数、发布时间
- 点击跳转原始内容

**UI 组件**：
```tsx
<FeatureSourceCard>
  <Label>来源平台</Label>
  <Value>{feature.source_metadata.platform}</Value>

  <Label>点赞数</Label>
  <Value>{feature.source_metadata.likes_count}</Value>

  <Label>原始链接</Label>
  <Link href={feature.source_metadata.original_url}>查看原始内容</Link>
</FeatureSourceCard>
```

#### 模块 6：定时任务监控

**功能**：
- 显示定时任务状态（运行/停止）
- 最近一次执行结果（成功/失败、耗时、更新数量）
- 执行历史记录（日期、状态、详情）

**API 接口**：
```typescript
GET /neirongmiao/api/admin/aesthetic-library/scheduler/status
Response: {
  status: 'running' | 'stopped';
  lastExecution: {
    date: string;
    success: boolean;
    xiaohongshuCount: number;
    instagramCount: number;
    featuresUpdated: number;
    durationMs: number;
    error?: string;
  };
  executionHistory: ExecutionRecord[];
}
```

#### 模块 7：手动触发更新

**功能**：
- 管理员手动触发 TikHub API 爬取
- 显示执行进度（爬取中 → AI 分析中 → 数据库更新中 → 完成）
- 执行结果反馈（成功/失败，更新数量）

**API 接口**：
```typescript
POST /neirongmiao/api/admin/aesthetic-library/trigger-update
Response: {
  taskId: string;
  status: 'running' | 'completed' | 'failed';
  result?: AestheticUpdateResult;
}

GET /neirongmiao/api/admin/aesthetic-library/trigger-update/:taskId
Response: {
  status: 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  result?: AestheticUpdateResult;
}
```

---

## 5. 技术栈

### 5.1 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.2.0 | UI 组件框架 |
| TypeScript | 5.8 | 类型安全 |
| Tailwind CSS | 3.4.17 | 卡片式样式 |
| TanStack Query | 5.28.4 | 服务端状态管理 |
| Zustand | 4.5.2 | 客户端状态（筛选条件） |
| Chart.js | 待定 | 流行度分布图表 |

### 5.2 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Fastify | 5.6.0 | HTTP 服务器 |
| PostgreSQL | 现有 | 数据存储 |
| Zod | 4.1.1 | API 参数验证 |
| TikHub API | 现有 | 数据爬取 |
| LLM API | 现有 | AI 图像分析 |

---

## 6. 数据流

### 6.1 成人特征提取流程

```
┌─────────────┐
│ TikHub API  │
│ (成人关键词) │
└──────┬──────┘
       │ 爬取成人穿搭数据
       ↓
┌─────────────┐
│ LLM Vision  │
│ (成人提示词) │
└──────┬──────┘
       │ AI 分析图片
       ↓
┌─────────────┐
│ 提取成人特征 │
│ age_range:  │
│ adult_18-30 │
└──────┬──────┘
       │ 写入数据库
       ↓
┌─────────────┐
│ Postgres DB │
│ nrm_aesthetic│
│ _feature_library│
└─────────────┘
```

### 6.2 后台管理数据流

```
┌─────────────┐
│ 管理员登录   │
│ (Admin Role)│
└──────┬──────┘
       │ 验证权限
       ↓
┌─────────────┐
│ 后台管理 UI │
│ /admin/...  │
└──────┬──────┘
       │ CRUD 操作
       ↓
┌─────────────┐
│ Admin API   │
│ RESTful     │
└──────┬──────┘
       │ 数据库操作
       ↓
┌─────────────┐
│ Postgres DB │
│ 特征库表     │
└─────────────┘
```

---

## 7. 错误处理

### 7.1 权限错误

**错误码**：`ADMIN_ACCESS_DENIED`
**触发场景**：非管理员访问后台 API
**处理方式**：返回 403，前端跳转登录页

### 7.2 数据爬取错误

**错误码**：`TIKHUB_API_ERROR`
**触发场景**：TikHub API 调用失败
**处理方式**：记录错误日志，定时任务继续运行（跳过失败关键词）

### 7.3 LLM 分析错误

**错误码**：`LLM_ANALYSIS_ERROR`
**触发场景**：LLM Vision API 调用失败
**处理方式**：记录错误日志，跳过该图片，继续分析下一张

---

## 8. 测试策略

### 8.1 单元测试

- `AestheticLibraryService` 成人特征提取逻辑
- `TikHubClient` 成人关键词爬取
- Admin API CRUD 接口

### 8.2 集成测试

- 定时任务完整流程（爬取 → 分析 → 更新）
- 后台管理 API 权限验证

### 8.3 E2E 测试

- 管理员登录 → 后台管理 → 特征编辑流程
- 数据总览 → 分类筛选 → 流行度调整流程

---

## 9. 部署计划

### 9.1 数据库变更

**无需迁移文件**，直接操作数据库：
```sql
-- 更新 age_range 默认值
ALTER TABLE nrm_aesthetic_feature_library
  ALTER COLUMN age_range SET DEFAULT 'child_6-12';

-- 扩展索引
CREATE INDEX IF NOT EXISTS idx_age_range
  ON nrm_aesthetic_feature_library(age_range);
```

### 9.2 TikHub 配置

**环境变量扩展**：
```bash
# 成人关键词配置
TIKHUB_ADULT_KEYWORDS=成人穿搭,时尚博主,成年发型,妆容教程,面部轮廓
TIKHUB_ADULT_HASHTAGS=#adultfashion,#fashionblogger,#makeuptutorial,#facialcontour
```

### 9.3 前端部署

**新增路由**：`/admin/aesthetic-library`
**菜单集成**：管理员菜单下新增"审美特征库管理"

---

## 10. 风险与应对

### 10.1 成人数据源质量

**风险**：TikHub API 爬取的成人数据可能质量不稳定
**应对**：设置流行度阈值（>= 0.7），低质量特征自动淘汰

### 10.2 LLM 分析成本

**风险**：成人图片分析增加 LLM API 费用
**应对**：每日爬取数量限制（50 条），批量分析优化

### 10.3 后台权限泄露

**风险**：管理员权限验证不严格
**应对**：前后端双重验证，敏感操作记录审计日志

---

## 11. 成功指标

### 11.1 成人特征库

- 1 周内填充 >= 10 条成人特征种子数据
- 流行度评分准确性 >= 80%（与用户反馈匹配）

### 11.2 后台管理

- 管理员操作响应时间 < 500ms
- 特征编辑成功率 >= 95%
- 7 个功能模块全部可用

---

## 12. 未来扩展

### 12.1 短期（1 个月）

- 成人特征库填充至 50 条数据
- 后台管理 UI 优化（响应式、移动端适配）

### 12.2 中期（3 个月）

- 支持更多年龄分段（teenager_13-17、adult_30-50）
- 特征库导出功能（JSON/CSV）

### 12.3 长期（6 个月）

- 用户反馈机制（点赞/收藏统计）
- 特征库趋势分析（季度流行度变化）

---

## 附录 A：成人特征类别详细定义

### A.1 jawline_definition（下颌线清晰度）

| 特征名称 | 中文描述 | 适用种族 |
|---------|---------|---------|
| `defined_sharp` | 清晰锐利，面部轮廓立体 | Caucasian, Asian |
| `soft_natural` | 柔和自然，线条流畅 | Asian, Mixed |
| `round_soft` | 圆润柔和，无明显棱角 | Asian, African |

### A.2 cheekbone_prominence（颧骨立体感）

| 特征名称 | 中文描述 | 适用种族 |
|---------|---------|---------|
| `high_prominent` | 高颧骨，面部立体感强 | Caucasian, Mixed |
| `flat_natural` | 扁平自然，面部柔和 | Asian |
| `moderate_balanced` | 适中平衡，轮廓协调 | Mixed, Asian, Caucasian |

### A.3 lip_fullness（嘴唇丰满度）

| 特征名称 | 中文描述 | 适用种族 |
|---------|---------|---------|
| `full_plump` | 丰满饱满，唇形立体 | African, Mixed |
| `thin_delicate` | 薄唇精致，线条清晰 | Asian, Caucasian |
| `moderate_natural` | 适中自然，唇形协调 | Mixed, Asian |

### A.4 eyebrow_shape（眉形风格）

| 特征名称 | 中文描述 | 适用种族 |
|---------|---------|---------|
| `thick_bold` | 浓密粗眉，眉形鲜明 | Caucasian, African |
| `thin_arched` | 细长拱形，精致优雅 | Asian, Mixed |
| `curved_graceful` | 弧形优美，线条流畅 | Asian, Caucasian |
| `straight_natural` | 平直自然，眉形简约 | Asian, Mixed |

---

## 附录 B：后台管理 API 完整接口列表

### B.1 统计接口

```
GET /neirongmiao/api/admin/aesthetic-library/statistics
```

### B.2 特征 CRUD 接口

```
GET    /neirongmiao/api/admin/aesthetic-library/features
POST   /neirongmiao/api/admin/aesthetic-library/features
PUT    /neirongmiao/api/admin/aesthetic-library/features/:id
DELETE /neirongmiao/api/admin/aesthetic-library/features/:id
```

### B.3 流行度调整接口

```
PUT /neirongmiao/api/admin/aesthetic-library/features/:id/popularity
PUT /neirongmiao/api/admin/aesthetic-library/features/batch/popularity
PUT /neirongmiao/api/admin/aesthetic-library/features/:id/status
```

### B.4 定时任务接口

```
GET  /neirongmiao/api/admin/aesthetic-library/scheduler/status
POST /neirongmiao/api/admin/aesthetic-library/trigger-update
GET  /neirongmiao/api/admin/aesthetic-library/trigger-update/:taskId
```

---

**设计文档完成，待用户审查后创建实现计划。**