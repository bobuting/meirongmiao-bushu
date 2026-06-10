# 登录滑块验证码设计规格

## 概述

为登录流程增加拼图滑块验证码，在风控触发时展示，防止自动化攻击和爆破登录。

## 触发策略

综合风控检测，满足**任一**条件即触发：

| 条件 | 阈值 | 检测方式 |
|------|------|---------|
| 连续登录失败 | ≥ 3 次 | 同一邮箱 10 分钟内失败次数 |
| 新设备登录 | 设备指纹未记录 | User-Agent + Canvas 指纹 |
| 异地登录 | IP 跨省/跨国 | IP 地理位置数据库 |

登录失败次数记录在内存中，10 分钟过期。设备指纹白名单存 `nrm_user_devices` 表。

## 架构

```
登录请求 → 风控检测 → 需要验证？
  ├─ 否 → 正常登录
  └─ 是 → 后端生成拼图 → 前端展示滑块 → 用户拖动 → 提交验证 → 后端校验 → 登录
```

### 图片资源

内置图库方案：从 Unsplash/Pexels 免费图库下载 20-30 张纹理丰富的图片（自然风光、城市建筑、抽象纹理），放 `apps/web/assets/captcha/` 目录。后端随机选一张作为背景底图，对拼图缺口区域做模糊+亮度降低处理以形成视觉对比。实现时提供下载脚本，从 Unsplash 按 "texture""nature""architecture" 关键词批量拉取。

## 后端设计

### API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/auth/login` | POST | 扩展返回值，增加 needCaptcha 字段 |
| `/captcha/generate` | POST | 生成拼图验证码 |
| `/captcha/verify` | POST | 校验验证结果 |

### 生成验证码

1. 从图片库随机选背景图（320×160）
2. 随机确定拼图块位置（X 坐标）
3. 从背景图裁剪拼图块（不规则多边形轮廓）
4. 生成 captcha_token，存入内存（5 分钟过期）
5. 返回：captcha_token、background_image(base64)、slider_image(base64)、slider_y

### 校验验证码

1. 从内存获取 token 对应的正确位置
2. 计算误差 |slider_x - correct_x|
3. 误差 ≤ 5px 且耗时 ≥ 500ms → 通过
4. 一次性使用，验证后删除 token
5. 返回 verify_token（用于登录）

### 存储方案

使用内存存储（`InMemoryCaptchaStore`），模式同现有 `InMemoryRateLimiter`，不引入 Redis。Map + 定时清理过期条目。

```typescript
interface CaptchaEntry {
  correctX: number;
  sliderY: number;
  expiresAt: number;
}
```

## 前端设计

### 组件结构

```
CaptchaSlider 组件
├── 背景图 Canvas（含缺口遮罩）
├── 拼图块 Canvas（跟随滑块移动）
├── 滑块轨道 + 拖动按钮
└── 操作按钮（刷新、关闭）
```

### 交互流程

1. 用户提交邮箱密码，后端返回 `{ needCaptcha: true, captchaData }`
2. 滑块组件从上方展开（300ms 动画）
3. 用户拖动滑块，拼图块实时跟随
4. 释放时自动提交验证
5. 成功：轨道变绿 + 粒子动画 → 500ms 后消失，带 verify_token 重新登录
6. 失败：轨道变红 + 抖动动画 → 滑块复位，可重试

### 文件

- `apps/web/components/CaptchaSlider.tsx` — 滑块组件
- `apps/web/pages/auth/Login.tsx` — 集成调用（代码量约增 30 行）
- `apps/web/services/backendApi.ts` — API 扩展

### 视觉规范

复用项目主题风格：
- 边框发光：金黄色（#e68c19），复用 `borderGlow` 动画
- 成功粒子：复用 `particleRise` 动画
- 拼图块阴影：`box-shadow: 0 0 20px rgba(230, 140, 25, 0.4)`
- 轨道轨迹：渐变 `linear-gradient(90deg, transparent, #e68c19, transparent)`

## 后端文件

- `src/routes/captcha-routes.ts` — 验证码路由
- `src/core/captcha-store.ts` — 内存存储
- `src/modules/captcha-service.ts` — 拼图生成与校验逻辑

## 测试要点

- 拼图位置随机性（连续 100 次无重复位置）
- 误差边界：4px 通过，6px 不通过
- 耗时边界：400ms 不通过，600ms 通过
- token 一次性使用
- token 5 分钟过期
- 内存清理定时器正常工作
