# 积分定价展示页设计规格

## 概述

新建独立积分定价页面，面向普通用户，只读展示所有非零定价操作及对应积分消耗。帮助用户在使用功能前了解成本。

## 页面信息

- **路由**: `/credit-pricing`
- **入口**: Profile 页面"额度与积分"区域 → "查看定价"链接按钮
- **定位**: 纯定价展示，不显示余额

## 数据来源

- API: `GET /me/credits/pricing`（用户侧，无需管理员权限）
- 只展示 `credit_cost > 0` 的条目
- `credit_cost = 0` 的条目统一在底部提示为免费功能

## 定价数据（当前生效）

按项目类型分组，非零定价如下：

### 视频项目

| 类别 | 操作 | 定价 | 单位 |
|------|------|------|------|
| 定妆 | 五视图生成 | 20 | 积分/单图 |
| 分镜 | 分镜图生成 | 20 | 积分/单图 |
| 裂变 | 裂变视频 | 100 | 积分/单分镜视频 |
| 裂变 | 裂变分镜图 | 20 | 积分/单图 |

### 图片项目

| 类别 | 操作 | 定价 | 单位 |
|------|------|------|------|
| 模特图 | 模特图生成/规划 | 20 | 积分/单图 |

### 换装项目

| 类别 | 操作 | 定价 | 单位 |
|------|------|------|------|
| 换装图片 | 换装图片生成 | 40 | 积分/单图 |
| 换装视频 | 换装视频编辑 | 200 | 积分/单分镜视频 |

### 其他功能

| 类别 | 操作 | 定价 | 单位 |
|------|------|------|------|
| 反推 | 广场反推/热榜反推 | 10 | 积分/次 |
| 平铺图 | 服饰平铺图生成 | 20 | 积分/单图 |
| 实验室图片 | 图片生成 | 20 | 积分/单图 |
| 实验室视频 | 视频生成 | 100 | 积分/单分镜视频 |

### 免费功能（底部提示）

脚本生成 · 服饰分析 · 人像检测 · 特征提取 · 音乐分析 · 脚本评分 · Prompt进化 等功能均免费使用

## UI 设计

### 布局

简洁列表风格（方案B），按项目类型分组为 4 个卡片：

1. **视频项目** — 五视图、分镜图、裂变
2. **图片项目** — 模特图
3. **换装项目** — 换装图片、换装视频
4. **其他功能** — 反推、平铺图、实验室

### 每个分组卡片结构

- 顶部：分组标题栏，左侧橙色竖线标识
- 主体：三列表格 — 类别(左) | 操作描述(中) | 定价+单位(右)
- 定价右对齐，加粗显示

### 单位标注规则

- 图片类操作：`积分/单图`
- 视频类操作：`积分/单分镜视频`
- 反推类操作：`积分/次`

### 底部提示区

居中显示免费功能列表，关键词"免费使用"加粗突出。

## 分组映射（前端硬编码）

定价数据从 API 动态获取，但分组和描述通过前端配置映射，复用 `ROUTE_KEY_GROUPS` 和 `ROUTE_KEY_DESCRIPTIONS` 的结构，去掉管理员编辑功能：

```typescript
// 用户侧分组（只展示非零项）
const USER_PRICING_GROUPS = [
  { id: "video-project", title: "视频项目", keys: [
    "step2_five_view_generation_child", "step2_five_view_generation_adult",
    "step3_storyboard_image", "step3_storyboard_image_child", "step3_storyboard_image_adult",
    "fission_video_generation_child", "fission_video_generation_adult",
    "fission_storyboard_image_child", "fission_storyboard_image_adult",
  ]},
  { id: "image-project", title: "图片项目", keys: [
    "image_project_step3_model_photo", "image_project_step3_model_plan",
  ]},
  { id: "outfit-change", title: "换装项目", keys: [
    "outfit_change_image_generation", "outfit_change_video_edit",
  ]},
  { id: "other", title: "其他功能", keys: [
    "square_video_reverse", "hot_trend_video_reverse",
    "garment_flat_lay_generation",
    "image_generation", "video_generation",
  ]},
];
```

同类别同价格的条目合并展示（如五视图儿童/成人都是20，合并为"五视图生成 20积分/单图"）。

## 单位推断规则

根据 routeKey 关键词自动推断单位：

- 含 `image` / `photo` / `view` / `flat_lay` / `plan` → `积分/单图`
- 含 `video` / `clip` / `edit` → `积分/单分镜视频`
- 含 `reverse` → `积分/次`

## API 数据处理

1. 调用 `/me/credits/pricing` 获取所有 routeKey 的 credit_cost
2. 过滤 `credit_cost > 0` 的条目
3. 按分组映射归类
4. 同组内同类别同价格的合并展示（简化界面）
5. 未覆盖的零定价条目汇总为底部免费提示

## 页面入口

在 Profile 页面"额度与积分"区域，将当前 disabled 的"充值积分"按钮替换为"查看定价"链接按钮，点击跳转 `/credit-pricing`。

## 文件结构

- 新页面: `apps/web/pages/credit-pricing/CreditPricing.tsx`
- 路由注册: `apps/web/App.tsx` 中新增路由
- Profile 修改: `apps/web/pages/profile/Profile.tsx` — 替换"充值积分"按钮为"查看定价"链接