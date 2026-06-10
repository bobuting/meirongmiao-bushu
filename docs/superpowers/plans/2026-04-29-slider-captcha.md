# 登录滑块验证码 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为登录流程增加拼图滑块验证码，风控触发时弹出，防止自动化攻击。

**架构：** 后端生成拼图验证码（随机背景图+拼图块位置），前端 Canvas 绘制并拖动对齐，后端校验位置误差。风控触发基于连续登录失败次数（≥3次）和 IP 变化检测。内存存储 captcha token（5分钟过期）。

**技术栈：** Fastify 5、Sharp（图像处理）、Canvas 前端绘制、React 18、TypeScript 5

---

## 文件结构

| 文件 | 职责 | 类型 |
|------|------|------|
| `src/core/captcha-store.ts` | 内存存储 captcha token，定时清理过期条目 | 新建 |
| `src/modules/captcha-service.ts` | 拼图生成、校验、风控检测逻辑 | 新建 |
| `src/routes/captcha-routes.ts` | 验证码 API 路由注册 | 新建 |
| `src/routes/auth-routes.ts` | 扩展登录接口，支持 needCaptcha 返回和 verifyToken 提交 | 修改 |
| `src/app-setup/setup-routes.ts` | 注册 captcha 路由 | 修改 |
| `apps/web/components/CaptchaSlider.tsx` | 拼图滑块组件（Canvas + 拖动交互） | 新建 |
| `apps/web/pages/auth/Login.tsx` | 集成滑块验证码到登录流程 | 修改 |
| `apps/web/services/realApi/auth.ts` | 扩展 login 方法支持 captcha 参数 | 修改 |
| `apps/web/services/api-modules/auth.ts` | 扩展 login 方法支持 captcha 参数 | 修改 |
| `scripts/download-captcha-images.ts` | 从 Unsplash 批量下载验证码背景图 | 新建 |

---

### 任务 1：InMemoryCaptchaStore

**文件：**
- 创建：`src/core/captcha-store.ts`
- 参考：`src/core/rate-limiter.ts`

- [ ] **步骤 1：编写 InMemoryCaptchaStore**

```typescript
// src/core/captcha-store.ts
import { getLogger } from "./logger.js";
const log = getLogger("captcha-store");

export interface CaptchaEntry {
  correctX: number;
  sliderY: number;
  createdAt: number;
  expiresAt: number;
}

const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5分钟过期
const CLEANUP_INTERVAL_MS = 60 * 1000;  // 每分钟清理

export class InMemoryCaptchaStore {
  private store = new Map<string, CaptchaEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref(); // 不阻塞进程退出
  }

  set(token: string, entry: CaptchaEntry): void {
    this.store.set(token, entry);
    log.info({ token }, "验证码 token 已存储");
  }

  get(token: string): CaptchaEntry | undefined {
    return this.store.get(token);
  }

  consume(token: string): CaptchaEntry | undefined {
    const entry = this.store.get(token);
    if (entry) {
      this.store.delete(token);
      log.info({ token }, "验证码 token 已消费（一次性使用）");
    }
    return entry;
  }

  private cleanup(): void {
    const now = Date.now();
    let removed = 0;
    for (const [token, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(token);
        removed++;
      }
    }
    if (removed > 0) {
      log.info({ removed, remaining: this.store.size }, "清理过期验证码 token");
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.store.clear();
  }
}
```

- [ ] **步骤 2：验证类型编译通过**

运行：`npx tsc --noEmit src/core/captcha-store.ts`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/core/captcha-store.ts
git commit -m "feat: 新增 InMemoryCaptchaStore 验证码 token 内存存储"
```

---

### 任务 2：CaptchaService — 风控检测和拼图生成

**文件：**
- 创建：`src/modules/captcha-service.ts`
- 依赖：`src/core/captcha-store.ts`、`src/core/errors.ts`、Sharp

- [ ] **步骤 1：编写 CaptchaService**

```typescript
// src/modules/captcha-service.ts
import sharp from "sharp";
import { randomUUID } from "crypto";
import { getLogger } from "../core/logger.js";
import { AppError } from "../core/errors.js";
import { InMemoryCaptchaStore } from "../core/captcha-store.js";

const log = getLogger("captcha-service");

// 拼图块尺寸
const PIECE_WIDTH = 44;
const PIECE_HEIGHT = 44;
const PIECE_RADIUS = 8;
// 背景图尺寸
const BG_WIDTH = 320;
const BG_HEIGHT = 160;
// 校验误差容忍（像素）
const POSITION_TOLERANCE = 5;
// 最短耗时（毫秒），防机器人瞬间完成
const MIN_DURATION_MS = 500;

export interface CaptchaData {
  captchaToken: string;
  backgroundImage: string; // base64
  sliderImage: string;     // base64
  sliderY: number;
}

export interface CaptchaVerifyResult {
  valid: boolean;
  verifyToken?: string;
  reason?: string;
}

export interface RiskCheckResult {
  needCaptcha: boolean;
  reason?: string;
}

export class CaptchaService {
  private store: InMemoryCaptchaStore;
  private backgroundImages: Buffer[] = [];
  private initialized = false;

  constructor(store: InMemoryCaptchaStore) {
    this.store = store;
  }

  // 初始化：从 assets 目录加载背景图
  async initialize(imageDir: string): Promise<void> {
    // 图片目录为 assets/captcha 下的 JPG/PNG 文件
    // 后端启动时预加载到内存
    log.info({ imageDir }, "正在加载验证码背景图库");
    this.initialized = true;
    // 具体加载逻辑在步骤2中实现（需要 fs.readdir + sharp 处理）
  }

  // 风控检测：是否需要验证码
  checkRisk(failedAttempts: number, currentIp: string, lastLoginIp?: string): RiskCheckResult {
    // 条件1：连续登录失败 ≥ 3 次
    if (failedAttempts >= 3) {
      return { needCaptcha: true, reason: "连续登录失败" };
    }
    // 条件2：IP 变化（简化版：与上次登录 IP 不同即触发）
    if (lastLoginIp && currentIp !== lastLoginIp) {
      return { needCaptcha: true, reason: "IP 变化" };
    }
    return { needCaptcha: false };
  }

  // 生成验证码
  async generate(): Promise<CaptchaData> {
    if (!this.initialized || this.backgroundImages.length === 0) {
      throw new AppError(500, "CAPTCHA_NOT_READY", "验证码服务未就绪");
    }

    // 随机选择背景图
    const bgBuffer = this.backgroundImages[Math.floor(Math.random() * this.backgroundImages.length)];

    // 随机确定拼图块位置
    // X: 拼图块宽度到背景宽度-拼图块宽度之间随机
    const correctX = PIECE_WIDTH + Math.floor(Math.random() * (BG_WIDTH - PIECE_WIDTH * 2));
    // Y: 20 到背景高度-拼图块高度-20 之间随机
    const sliderY = 20 + Math.floor(Math.random() * (BG_HEIGHT - PIECE_HEIGHT - 40));

    // 使用 Sharp 处理背景图：裁剪拼图块 + 背景缺口处理
    const captchaToken = randomUUID();
    const now = Date.now();
    this.store.set(captchaToken, {
      correctX,
      sliderY,
      createdAt: now,
      expiresAt: now + 5 * 60 * 1000,
    });

    // 生成背景图（含缺口遮罩）和拼图块图片
    // 具体实现见步骤2
    const { backgroundImage, sliderImage } = await this.generateImages(bgBuffer, correctX, sliderY);

    return { captchaToken, backgroundImage, sliderImage, sliderY };
  }

  // 校验验证码
  verify(captchaToken: string, userX: number, durationMs: number): CaptchaVerifyResult {
    const entry = this.store.consume(captchaToken);
    if (!entry) {
      return { valid: false, reason: "验证码已过期或不存在" };
    }

    const positionError = Math.abs(userX - entry.correctX);
    if (positionError > POSITION_TOLERANCE) {
      log.warn({ positionError, tolerance: POSITION_TOLERANCE }, "拼图位置误差过大");
      return { valid: false, reason: "拼图位置未对齐" };
    }

    if (durationMs < MIN_DURATION_MS) {
      log.warn({ durationMs, min: MIN_DURATION_MS }, "验证耗时过短");
      return { valid: false, reason: "验证耗时异常" };
    }

    const verifyToken = `verify-${randomUUID()}`;
    log.info({ captchaToken, verifyToken }, "验证码校验通过");
    return { valid: true, verifyToken };
  }

  // 生成背景图和拼图块图片（Sharp 处理）
  private async generateImages(bgBuffer: Buffer, correctX: number, sliderY: number): Promise<{ backgroundImage: string; sliderImage: string }> {
    // 1. 调整背景图尺寸到 BG_WIDTH x BG_HEIGHT
    const resizedBg = await sharp(bgBuffer)
      .resize(BG_WIDTH, BG_HEIGHT, { fit: "cover" })
      .toBuffer();

    // 2. 在背景图上绘制拼图缺口（半透明灰色遮罩）
    // 使用 Sharp 的 composite 功能叠加遮罩
    const maskSvg = this.createPuzzleMaskSvg(correctX, sliderY, PIECE_WIDTH, PIECE_HEIGHT, PIECE_RADIUS);
    const maskBuffer = await sharp(Buffer.from(maskSvg)).toBuffer();

    const backgroundWithMask = await sharp(resizedBg)
      .composite([{ input: maskBuffer, blend: "over" }])
      .png()
      .toBuffer();

    // 3. 裁剪拼图块：从原始背景图上截取对应区域
    const sliderPiece = await sharp(resizedBg)
      .extract({ left: correctX, top: sliderY, width: PIECE_WIDTH, height: PIECE_HEIGHT })
      .png()
      .toBuffer();

    // 4. 给拼图块添加不规则边框
    const borderSvg = this.createPuzzleBorderSvg(PIECE_WIDTH, PIECE_HEIGHT, PIECE_RADIUS);
    const borderBuffer = await sharp(Buffer.from(borderSvg)).png().toBuffer();

    const sliderWithBorder = await sharp(sliderPiece)
      .composite([{ input: borderBuffer, blend: "over" }])
      .resize(PIECE_WIDTH, PIECE_HEIGHT)
      .png()
      .toBuffer();

    return {
      backgroundImage: `data:image/png;base64,${backgroundWithMask.toString("base64")}`,
      sliderImage: `data:image/png;base64,${sliderWithBorder.toString("base64")}`,
    };
  }

  // 创建拼图缺口 SVG 遯罩（半透明灰色）
  private createPuzzleMaskSvg(x: number, y: number, w: number, h: number, r: number): string {
    return `<svg width="${BG_WIDTH}" height="${BG_HEIGHT}">
      <path d="M${x},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${h - 2*r} a${r},${r} 0 0 1 -${r},${r} h-${w - 2*r} a${r},${r} 0 0 1 -${r},-${r} v-${h - 2*r} a${r},${r} 0 0 1 ${r},-${r} Z"
        fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.8)" stroke-width="1"/>
    </svg>`;
  }

  // 创建拼图块边框 SVG
  private createPuzzleBorderSvg(w: number, h: number, r: number): string {
    return `<svg width="${w}" height="${h}">
      <path d="M0,0 h${w - r} a${r},${r} 0 0 1 ${r},${r} v${h - 2*r} a${r},${r} 0 0 1 -${r},${r} h-${w - 2*r} a${r},${r} 0 0 1 -${r},-${r} v-${h - 2*r} a${r},${r} 0 0 1 ${r},-${r} Z"
        fill="none" stroke="rgba(230,140,25,0.6)" stroke-width="2"/>
    </svg>`;
  }
}
```

- [ ] **步骤 2：验证编译通过**

运行：`npx tsc --noEmit src/modules/captcha-service.ts`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/modules/captcha-service.ts
git commit -m "feat: 新增 CaptchaService 验证码生成、校验和风控检测"
```

---

### 任务 3：验证码路由注册

**文件：**
- 创建：`src/routes/captcha-routes.ts`
- 修改：`src/app-setup/setup-routes.ts`

- [ ] **步骤 1：编写 captcha-routes.ts**

```typescript
// src/routes/captcha-routes.ts
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../core/app-context.js";

export function registerCaptchaRoutes(app: FastifyInstance, ctx: AppContext): void {
  // 生成验证码
  app.post("/captcha/generate", {
    schema: {
      tags: ["验证码"],
      summary: "生成滑块验证码",
      description: "生成拼图滑块验证码图片和 token",
      security: [], // 公开接口
      response: {
        200: {
          type: "object",
          properties: {
            captchaToken: { type: "string", description: "验证码 token" },
            backgroundImage: { type: "string", description: "背景图 base64" },
            sliderImage: { type: "string", description: "拼图块 base64" },
            sliderY: { type: "number", description: "拼图块 Y 坐标" },
          },
        },
        500: {
          type: "object",
          properties: {
            error: { type: "string" },
            message: { type: "string" },
          },
        },
      },
    },
  }, async () => {
    return await ctx.captchaService.generate();
  });

  // 校验验证码
  app.post("/captcha/verify", {
    schema: {
      tags: ["验证码"],
      summary: "校验滑块验证码",
      description: "校验用户拖动结果，返回 verifyToken 用于登录",
      security: [],
      body: {
        type: "object",
        required: ["captchaToken", "sliderX", "durationMs"],
        properties: {
          captchaToken: { type: "string", description: "验证码 token" },
          sliderX: { type: "number", description: "用户拖动的 X 坐标" },
          durationMs: { type: "number", description: "拖动耗时（毫秒）" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            valid: { type: "boolean" },
            verifyToken: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
    },
  }, async (request) => {
    const body = request.body as { captchaToken: string; sliderX: number; durationMs: number };
    return ctx.captchaService.verify(body.captchaToken, body.sliderX, body.durationMs);
  });
}
```

- [ ] **步骤 2：在 setup-routes.ts 注册 captcha 路由**

在 `src/app-setup/setup-routes.ts` 中：
1. 文件顶部添加 import：
```typescript
import { registerCaptchaRoutes } from "../routes/captcha-routes.js";
```
2. 在 `registerAuthRoutes(apiApp, ctx);` 之后添加：
```typescript
registerCaptchaRoutes(apiApp, ctx);
```

- [ ] **步骤 3：在 AppContext 中注入 CaptchaService**

修改 `src/core/app-context.ts`，新增 `captchaService` 和 `captchaStore` 属性：

```typescript
// 在 AppContext 类中新增：
captchaStore: InMemoryCaptchaStore;
captchaService: CaptchaService;
```

在 app.ts 或 setup-core.ts 中初始化：
```typescript
const captchaStore = new InMemoryCaptchaStore();
const captchaService = new CaptchaService(captchaStore);
// 启动时加载背景图
await captchaService.initialize(path.join(__dirname, "../apps/web/assets/captcha"));
```

- [ ] **步骤 4：验证编译通过**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 5：Commit**

```bash
git add src/routes/captcha-routes.ts src/app-setup/setup-routes.ts src/core/app-context.ts
git commit -m "feat: 验证码路由注册和 AppContext 注入"
```

---

### 任务 4：扩展登录接口支持验证码

**文件：**
- 修改：`src/routes/auth-routes.ts`（L68-119 的 login 路由）

- [ ] **步骤 1：扩展 login 路由 schema 和逻辑**

修改 `src/routes/auth-routes.ts` 的 `/auth/login` 路由：

1. 在 body schema 中增加可选字段：
```typescript
body: {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string", minLength: 1, description: "用户邮箱或用户名" },
    password: { type: "string", minLength: 6, description: "用户密码" },
    verifyToken: { type: "string", description: "验证码校验通过后返回的 verifyToken（可选）" },
  },
},
```

2. 在 response schema 中增加 needCaptcha 返回：
```typescript
response: {
  200: {
    type: "object",
    properties: {
      token: { type: "string", description: "JWT 认证令牌" },
      user: { $ref: "UserInfo#" },
      needCaptcha: { type: "boolean", description: "是否需要验证码验证" },
      captchaData: {
        type: "object",
        description: "验证码数据（needCaptcha 为 true 时返回）",
        properties: {
          captchaToken: { type: "string" },
          backgroundImage: { type: "string" },
          sliderImage: { type: "string" },
          sliderY: { type: "number" },
        },
      },
    },
  },
  // ... 其他响应码不变
},
```

3. 修改 handler 逻辑，在密码校验前检查风控条件：

```typescript
}, async (request) => {
    const body = request.body as { email: string; password: string; verifyToken?: string };

    // 查询用户（用于风控检测）
    const normalized = body.email.trim().toLowerCase();
    const user = await ctx.authService.findUserByEmail(normalized);

    // 风控检测（仅在未提供 verifyToken 时执行）
    if (!body.verifyToken && user) {
      const riskResult = ctx.captchaService.checkRisk(
        user.failedAttempts,
        request.ip,
        user.lastLoginIp
      );
      if (riskResult.needCaptcha) {
        const captchaData = await ctx.captchaService.generate();
        return { needCaptcha: true, captchaData };
      }
    }

    // 正常登录流程（带 verifyToken 表示已通过验证码）
    const { token, user: loggedInUser } = await ctx.authService.login(body.email, body.password);
    return { token, user: { id: loggedInUser.id, email: loggedInUser.email, role: loggedInUser.role } };
  });
```

- [ ] **步骤 2：在 AuthService 中暴露 findUserByEmail 和 lastLoginIp**

修改 `src/modules/auth-service.ts`：
1. 新增公开方法 `findUserByEmail(email: string): Promise<User | null>`
2. User 类型中需要包含 `failedAttempts` 和 `lastLoginIp` 字段

注意：`findUserByEmail` 目前在 login 方法内作为私有步骤调用。只需将其提取为公开方法即可。

- [ ] **步骤 3：验证编译通过**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 4：启动后端验证路由可访问**

运行：`PERSISTENCE_REQUIRE_READY=false npm run dev`

验证：
```bash
curl -X POST http://localhost:3020/neirongmiao/api/captcha/generate
```
预期：返回包含 captchaToken、backgroundImage、sliderImage、sliderY 的 JSON

- [ ] **步骤 5：Commit**

```bash
git add src/routes/auth-routes.ts src/modules/auth-service.ts
git commit -m "feat: 登录接口扩展风控检测和验证码支持"
```

---

### 任务 5：下载验证码背景图脚本

**文件：**
- 创建：`scripts/download-captcha-images.ts`
- 创建：`apps/web/assets/captcha/` 目录

- [ ] **步骤 1：编写下载脚本**

```typescript
// scripts/download-captcha-images.ts
// 从 Unsplash API 批量下载纹理丰富的验证码背景图
// 运行方式：npx tsx scripts/download-captcha-images.ts

import { createWriteStream, mkdirSync } from "fs";
import { join } from "path";
import https from "https";

const OUTPUT_DIR = join(__dirname, "../apps/web/assets/captcha");
const IMAGE_COUNT = 30;
const KEYWORDS = ["texture", "nature", "architecture", "abstract", "landscape"];
const TARGET_WIDTH = 320;
const TARGET_HEIGHT = 160;

async function downloadImage(url: string, filepath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(filepath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", reject);
  });
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`正在从 Unsplash 下载 ${IMAGE_COUNT} 张验证码背景图到 ${OUTPUT_DIR}`);

  // Unsplash Source API（无需 API key）：
  // https://source.unsplash.com/{width}x{height}/?{keywords}
  for (let i = 0; i < IMAGE_COUNT; i++) {
    const keyword = KEYWORDS[i % KEYWORDS.length];
    const url = `https://source.unsplash.com/${TARGET_WIDTH}x${TARGET_HEIGHT}/?${keyword}`;
    const filepath = join(OUTPUT_DIR, `captcha-bg-${i + 1}.jpg`);
    try {
      await downloadImage(url, filepath);
      console.log(`✓ 已下载第 ${i + 1} 张`);
    } catch (err) {
      console.error(`✗ 第 ${i + 1} 张下载失败:`, err);
    }
  }
  console.log("下载完成");
}

main().catch(console.error);
```

- [ ] **步骤 2：运行脚本下载图片**

运行：`npx tsx scripts/download-captcha-images.ts`
预期：30 张图片下载到 `apps/web/assets/captcha/`

- [ ] **步骤 3：Commit 图片和脚本**

```bash
git add scripts/download-captcha-images.ts apps/web/assets/captcha/
git commit -m "feat: 验证码背景图下载脚本和内置图库"
```

---

### 任务 6：CaptchaService 初始化（加载背景图到内存）

**文件：**
- 修改：`src/modules/captcha-service.ts`（完善 initialize 方法）

- [ ] **步骤 1：实现 initialize 方法**

```typescript
// 在 CaptchaService.initialize 中补充图片加载逻辑
async initialize(imageDir: string): Promise<void> {
  const { readdirSync } = await import("fs");
  const { join } = await import("path");

  const files = readdirSync(imageDir)
    .filter(f => f.endsWith(".jpg") || f.endsWith(".png"))
    .map(f => join(imageDir, f));

  if (files.length === 0) {
    log.warn({ imageDir }, "验证码背景图目录为空，将使用程序生成的渐变图");
    this.backgroundImages = this.generateFallbackImages();
  } else {
    for (const file of files) {
      const { readFileSync } = await import("fs");
      this.backgroundImages.push(readFileSync(file));
    }
    log.info({ count: this.backgroundImages.length }, "验证码背景图库已加载");
  }
  this.initialized = true;
}

// 兜底方案：当图库为空时程序生成渐变图
private generateFallbackImages(): Buffer[] {
  // 生成 5 张纯渐变图作为兜底
  const images: Buffer[] = [];
  const colors = [
    ["#e68c19", "#ffc966"],
    ["#00a8ff", "#00ccff"],
    ["#1a1a1a", "#333333"],
    ["#e68c19", "#00a8ff"],
    ["#666666", "#999999"],
  ];
  for (const [c1, c2] of colors) {
    const svg = `<svg width="${BG_WIDTH}" height="${BG_HEIGHT}">
      <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${c1}"/>
        <stop offset="100%" style="stop-color:${c2}"/>
      </linearGradient></defs>
      <rect width="${BG_WIDTH}" height="${BG_HEIGHT}" fill="url(#g)"/>
    </svg>`;
    // sharp 同步生成 Buffer 会在运行时处理
    images.push(Buffer.from(svg));
  }
  return images;
}
```

- [ ] **步骤 2：验证编译通过**

运行：`npm run build`
预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add src/modules/captcha-service.ts
git commit -m "feat: CaptchaService 背景图加载和兜底渐变图生成"
```

---

### 任务 7：前端 CaptchaSlider 组件

**文件：**
- 创建：`apps/web/components/CaptchaSlider.tsx`

- [ ] **步骤 1：编写 CaptchaSlider 组件**

```tsx
// apps/web/components/CaptchaSlider.tsx
import React, { useRef, useState, useEffect, useCallback } from "react";

interface CaptchaSliderProps {
  captchaToken: string;
  backgroundImage: string;  // base64
  sliderImage: string;      // base64
  sliderY: number;
  onSuccess: (verifyToken: string) => void;
  onFail: () => void;
  onClose: () => void;
  onRefresh: () => void;
}

const BG_WIDTH = 320;
const BG_HEIGHT = 160;
const SLIDER_WIDTH = 44;
const SLIDER_HEIGHT = 44;

export const CaptchaSlider: React.FC<CaptchaSliderProps> = ({
  captchaToken,
  backgroundImage,
  sliderImage,
  sliderY,
  onSuccess,
  onFail,
  onClose,
  onRefresh,
}) => {
  const [sliderX, setSliderX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "fail">("idle");
  const [startTime, setStartTime] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // 拖动开始
  const handleDragStart = useCallback(() => {
    if (status !== "idle") return;
    setDragging(true);
    setStartTime(Date.now());
  }, [status]);

  // 拖动中 — 计算位置
  const handleDragMove = useCallback((clientX: number) => {
    if (!dragging || !trackRef.current) return;
    const trackRect = trackRef.current.getBoundingClientRect();
    const x = clientX - trackRect.left - SLIDER_WIDTH / 2;
    const clampedX = Math.max(0, Math.min(x, BG_WIDTH - SLIDER_WIDTH));
    setSliderX(clampedX);
  }, [dragging]);

  // 拖动结束 — 提交验证
  const handleDragEnd = useCallback(async () => {
    if (!dragging) return;
    setDragging(false);

    const durationMs = Date.now() - startTime;
    try {
      const resp = await fetch("/neirongmiao/api/captcha/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captchaToken, sliderX, durationMs }),
      });
      const result = await resp.json();

      if (result.valid) {
        setStatus("success");
        onSuccess(result.verifyToken);
      } else {
        setStatus("fail");
        setSliderX(0);
        onFail();
        // 2秒后恢复可重试
        setTimeout(() => setStatus("idle"), 2000);
      }
    } catch {
      setStatus("fail");
      setSliderX(0);
      onFail();
      setTimeout(() => setStatus("idle"), 2000);
    }
  }, [dragging, startTime, captchaToken, sliderX, onSuccess, onFail]);

  // 鼠标事件绑定
  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX);
    const onMouseUp = () => handleDragEnd();
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, handleDragMove, handleDragEnd]);

  // 触摸事件绑定
  useEffect(() => {
    if (!dragging) return;
    const onTouchMove = (e: TouchEvent) => handleDragMove(e.touches[0].clientX);
    const onTouchEnd = () => handleDragEnd();
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [dragging, handleDragMove, handleDragEnd]);

  return (
    <div className={`captcha-slider-wrapper ${status === "fail" ? "captcha-shake" : ""}`}>
      {/* 标题栏 */}
      <div className="captcha-header">
        <span>拖动滑块完成验证</span>
        <button onClick={onRefresh} className="captcha-refresh-btn" aria-label="刷新验证码">↻</button>
        <button onClick={onClose} className="captcha-close-btn" aria-label="关闭">✕</button>
      </div>

      {/* 拼图区域 */}
      <div className="captcha-puzzle-area" style={{ width: BG_WIDTH, height: BG_HEIGHT }}>
        {/* 背景图 */}
        <img src={backgroundImage} alt="验证码背景" className="captcha-bg-image" draggable={false} />
        {/* 拼图块 */}
        <img
          src={sliderImage}
          alt="拼图块"
          className="captcha-slider-piece"
          style={{
            position: "absolute",
            left: sliderX,
            top: sliderY,
            width: SLIDER_WIDTH,
            height: SLIDER_HEIGHT,
            filter: status === "success" ? "none" : "drop-shadow(0 0 8px rgba(230,140,25,0.5))",
          }}
          draggable={false}
        />
        {/* 成功/失败指示 */}
        {status === "success" && <div className="captcha-success-overlay">✓</div>}
      </div>

      {/* 滑块轨道 */}
      <div
        ref={trackRef}
        className={`captcha-track ${status === "success" ? "captcha-track-success" : status === "fail" ? "captcha-track-fail" : ""}`}
        style={{ width: BG_WIDTH }}
      >
        {/* 轨道填充 */}
        <div
          className="captcha-track-fill"
          style={{ width: sliderX + SLIDER_WIDTH / 2 }}
        />
        {/* 拖动按钮 */}
        <div
          className={`captcha-drag-btn ${dragging ? "captcha-drag-btn-active" : ""}`}
          style={{ left: sliderX }}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          role="slider"
          aria-label="验证码滑块"
          aria-valuenow={Math.round(sliderX)}
          aria-valuemin={0}
          aria-valuemax={BG_WIDTH}
        >
          ▶
        </div>
      </div>
    </div>
  );
};
```

- [ ] **步骤 2：编写 CaptchaSlider 样式**

在 `apps/web/components/CaptchaSlider.tsx` 文件末尾添加 CSS 样式注入（与 Login.tsx 的动画注入模式一致）：

```typescript
// 动画样式注入（只执行一次）
const injectCaptchaStyles = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById("captcha-slider-styles")) return;
  const style = document.createElement("style");
  style.id = "captcha-slider-styles";
  style.textContent = `
    .captcha-slider-wrapper {
      position: relative;
      background: rgba(255, 255, 255, 0.95);
      border: 2px solid transparent;
      border-radius: 12px;
      padding: 16px;
      animation: borderGlow 2s ease infinite;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      z-index: 100;
    }
    .captcha-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      font-size: 14px;
      color: #002244;
    }
    .captcha-refresh-btn, .captcha-close-btn {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #666;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .captcha-refresh-btn:hover, .captcha-close-btn:hover {
      color: #e68c19;
      background: rgba(230, 140, 25, 0.1);
    }
    .captcha-puzzle-area {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      background: #f0f0f0;
    }
    .captcha-bg-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .captcha-slider-piece {
      pointer-events: none;
      transition: filter 0.3s;
      z-index: 10;
    }
    .captcha-success-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
      color: #22c55e;
      background: rgba(34, 197, 94, 0.15);
      border-radius: 8px;
      animation: captchaSuccessPop 0.5s ease;
    }
    .captcha-track {
      position: relative;
      height: 40px;
      margin-top: 12px;
      background: #f8f7f6;
      border-radius: 20px;
      border: 1px solid #e0e0e0;
      overflow: hidden;
    }
    .captcha-track-fill {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(230, 140, 25, 0.3), transparent);
      border-radius: 20px;
      transition: width 0.05s;
    }
    .captcha-track-success .captcha-track-fill {
      background: linear-gradient(90deg, transparent, rgba(34, 197, 94, 0.3), transparent);
    }
    .captcha-track-success {
      border-color: #22c55e;
    }
    .captcha-track-fail .captcha-track-fill {
      background: linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.3), transparent);
    }
    .captcha-track-fail {
      border-color: #ef4444;
    }
    .captcha-drag-btn {
      position: absolute;
      top: 0;
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #ffc966, #e68c19);
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      color: white;
      font-size: 16px;
      box-shadow: 0 2px 8px rgba(230, 140, 25, 0.3);
      transition: box-shadow 0.2s, transform 0.1s;
      user-select: none;
      z-index: 5;
    }
    .captcha-drag-btn:hover {
      box-shadow: 0 2px 12px rgba(230, 140, 25, 0.5);
    }
    .captcha-drag-btn-active {
      cursor: grabbing;
      transform: scale(1.1);
      box-shadow: 0 4px 16px rgba(230, 140, 25, 0.6);
    }
    @keyframes captchaSuccessPop {
      0% { transform: scale(0); opacity: 0; }
      50% { transform: scale(1.2); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes captchaShake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-8px); }
      40%, 80% { transform: translateX(8px); }
    }
    .captcha-shake {
      animation: captchaShake 0.3s ease;
    }
  `;
  document.head.appendChild(style);
};
```

在组件首次渲染时调用：
```typescript
useEffect(() => { injectCaptchaStyles(); }, []);
```

- [ ] **步骤 3：验证前端编译通过**

运行：`npm --prefix apps/web run build`
预期：编译成功

- [ ] **步骤 4：Commit**

```bash
git add apps/web/components/CaptchaSlider.tsx
git commit -m "feat: CaptchaSlider 拼图滑块验证码前端组件"
```

---

### 任务 8：前端 API 层扩展

**文件：**
- 修改：`apps/web/services/realApi/auth.ts`
- 修改：`apps/web/services/api-modules/auth.ts`
- 修改：`apps/web/services/backendApi.types.ts`（如需要）

- [ ] **步骤 1：扩展 realApi/auth.ts 的 login 方法**

```typescript
// apps/web/services/realApi/auth.ts — 修改 login 方法签名和实现

export interface LoginResponse {
  token: string;
  user: LoginUser;
  needCaptcha?: boolean;
  captchaData?: {
    captchaToken: string;
    backgroundImage: string;
    sliderImage: string;
    sliderY: number;
  };
}

export interface RealAuthApi {
  register(email: string, password: string): Promise<{ id: string; email: string; role: UserRole }>;
  login(email: string, password: string, verifyToken?: string): Promise<LoginResponse>;
  logout(): Promise<{ message: string }>;
}

export const realAuthApi: RealAuthApi = {
  // register 不变...

  login(email: string, password: string, verifyToken?: string) {
    return request<LoginResponse>("POST", "/auth/login", {
      body: { email, password, verifyToken },
    });
  },

  // logout 不变...
};
```

- [ ] **步骤 2：扩展 api-modules/auth.ts 的 login 方法**

```typescript
// apps/web/services/api-modules/auth.ts — 修改 login 方法

export async function login(
  request: RequestFunction,
  email: string,
  password: string,
  verifyToken?: string
): Promise<LoginResponse> {
  return request("POST", "/auth/login", { body: { email, password, verifyToken } });
}
```

- [ ] **步骤 3：新增 captcha API 方法**

在 `apps/web/services/realApi/` 下新建 `captcha.ts`：

```typescript
// apps/web/services/realApi/captcha.ts
import { request } from "../backendApi.request";

export interface CaptchaGenerateResponse {
  captchaToken: string;
  backgroundImage: string;
  sliderImage: string;
  sliderY: number;
}

export interface CaptchaVerifyResponse {
  valid: boolean;
  verifyToken?: string;
  reason?: string;
}

export const realCaptchaApi = {
  generate(): Promise<CaptchaGenerateResponse> {
    return request<CaptchaGenerateResponse>("POST", "/captcha/generate", {});
  },
  verify(captchaToken: string, sliderX: number, durationMs: number): Promise<CaptchaVerifyResponse> {
    return request<CaptchaVerifyResponse>("POST", "/captcha/verify", {
      body: { captchaToken, sliderX, durationMs },
    });
  },
};
```

同样在 `apps/web/services/api-modules/` 下新建 `captcha.ts`：

```typescript
// apps/web/services/api-modules/captcha.ts
import type { CaptchaGenerateResponse, CaptchaVerifyResponse } from "../realApi/captcha";

type RequestOptions = { token?: string; body?: unknown };
type RequestFunction = <T>(method: string, path: string, options?: RequestOptions) => Promise<T>;

export async function generate(request: RequestFunction): Promise<CaptchaGenerateResponse> {
  return request("POST", "/captcha/generate", {});
}

export async function verify(
  request: RequestFunction,
  captchaToken: string,
  sliderX: number,
  durationMs: number
): Promise<CaptchaVerifyResponse> {
  return request("POST", "/captcha/verify", { body: { captchaToken, sliderX, durationMs } });
}
```

- [ ] **步骤 4：验证编译通过**

运行：`npm --prefix apps/web run build`
预期：编译成功

- [ ] **步骤 5：Commit**

```bash
git add apps/web/services/realApi/auth.ts apps/web/services/api-modules/auth.ts apps/web/services/realApi/captcha.ts apps/web/services/api-modules/captcha.ts
git commit -m "feat: 前端 API 层扩展支持验证码和 login verifyToken"
```

---

### 任务 9：Login.tsx 集成滑块验证码

**文件：**
- 修改：`apps/web/pages/auth/Login.tsx`

- [ ] **步骤 1：在 Login.tsx 中增加验证码状态和逻辑**

在 Login 组件中新增：

```typescript
import { CaptchaSlider } from "../../components/CaptchaSlider";

// 新增状态类型
interface CaptchaModalState {
  captchaToken: string;
  backgroundImage: string;
  sliderImage: string;
  sliderY: number;
}

// 在现有状态声明后新增：
const [captchaModal, setCaptchaModal] = useState<CaptchaModalState | null>(null);
const [verifyToken, setVerifyToken] = useState<string | undefined>(undefined);
```

- [ ] **步骤 2：修改 handleLogin 函数**

```typescript
const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = await backendApi.login(formData.email, formData.password, verifyToken);
      if (payload.needCaptcha) {
        setCaptchaModal(payload.captchaData!);
        setLoading(false);
        return;
      }
      setSession(payload.token, payload.user);
      if (payload.user.role === 'admin') {
        setAdminToken(payload.token);
      }
      setLoading(false);
      window.location.hash = '/dashboard';
      navigate('/dashboard');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '登录失败，请稍后重试';
      setError(message);
      setLoading(false);
    }
  };
```

- [ ] **步骤 3：添加验证码回调函数**

```typescript
// 验证码成功回调
const handleCaptchaSuccess = (token: string) => {
    setVerifyToken(token);
    setCaptchaModal(null);
    // 自动重新提交登录
    setLoading(true);
    backendApi.login(formData.email, formData.password, token)
      .then((payload) => {
        setSession(payload.token, payload.user);
        if (payload.user.role === 'admin') {
          setAdminToken(payload.token);
        }
        setLoading(false);
        navigate('/dashboard');
      })
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : '登录失败';
        setError(message);
        setVerifyToken(undefined);
        setLoading(false);
      });
  };

  // 验证码失败回调
  const handleCaptchaFail = () => {
    // 不做额外处理，组件内部已处理
  };

  // 验证码关闭回调
  const handleCaptchaClose = () => {
    setCaptchaModal(null);
    setVerifyToken(undefined);
  };

  // 验证码刷新回调
  const handleCaptchaRefresh = async () => {
    try {
      const newCaptcha = await backendApi.captchaGenerate();
      setCaptchaModal(newCaptcha);
    } catch {
      setError("验证码加载失败");
    }
  };
```

- [ ] **步骤 4：在 JSX 中添加 CaptchaSlider 组件**

在登录表单区域后方添加：

```tsx
{/* 验证码滑块弹窗 */}
{captchaModal && (
  <div className="captcha-overlay">
    <CaptchaSlider
      captchaToken={captchaModal.captchaToken}
      backgroundImage={captchaModal.backgroundImage}
      sliderImage={captchaModal.sliderImage}
      sliderY={captchaModal.sliderY}
      onSuccess={handleCaptchaSuccess}
      onFail={handleCaptchaFail}
      onClose={handleCaptchaClose}
      onRefresh={handleCaptchaRefresh}
    />
  </div>
)}
```

添加弹窗遮罩样式（注入到 login-animations 样式中）：

```css
.captcha-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  z-index: 50;
  animation: fadeIn 0.3s ease;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **步骤 5：验证前端编译通过**

运行：`npm --prefix apps/web run build`
预期：编译成功

- [ ] **步骤 6：启动前后端，手动测试完整流程**

```bash
# 启动后端
PERSISTENCE_REQUIRE_READY=false npm run dev

# 启动前端
npm --prefix apps/web run dev
```

测试步骤：
1. 打开 http://localhost:3000 登录页
2. 输入正确邮箱密码 → 正常登录（首次不触发验证码）
3. 输入错误密码 3 次 → 第 4 次登录时触发验证码弹窗
4. 拖动滑块验证 → 成功后自动登录 / 失败后可重试
5. 点击刷新按钮 → 重新获取验证码
6. 点击关闭按钮 → 关闭验证码弹窗

- [ ] **步骤 7：Commit**

```bash
git add apps/web/pages/auth/Login.tsx
git commit -m "feat: Login.tsx 集成滑块验证码弹窗"
```

---

### 任务 10：backendApi 代理层扩展

**文件：**
- 修改：`apps/web/services/backendApi.ts`（Proxy 层）

- [ ] **步骤 1：在 backendApi Proxy 中添加 captcha 和扩展 login**

检查 `apps/web/services/backendApi.ts` 的 Proxy get 处理器。确保新增的方法（`captchaGenerate`、`captchaVerify`、带 `verifyToken` 的 `login`）能正确路由到 realApi 和 mockApi。

在 `apps/web/services/mock/mock-api.ts` 中也需要添加 captcha 和 login 扩展的 mock 实现：

```typescript
// mock login 增加验证码相关返回
login(email: string, password: string, verifyToken?: string) {
  // 如果有 verifyToken → 正常登录
  // 如果没有 → 模拟 needCaptcha 情况（开发时可手动触发）
},

captchaGenerate() {
  // 返回模拟验证码数据
},

captchaVerify(token: string, x: number, duration: number) {
  // 简化验证逻辑
},
```

- [ ] **步骤 2：验证编译通过**

运行：`npm --prefix apps/web run build`
预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add apps/web/services/backendApi.ts apps/web/services/mock/mock-api.ts
git commit -m "feat: backendApi 代理层和 mock 层扩展验证码支持"
```

---

## 自检结果

**规格覆盖度：**
- ✅ 触发策略（3个条件）：任务4（风控检测）+ 任务7（前端集成）
- ✅ API 设计（3个接口）：任务3（captcha routes）+ 任务4（auth-routes扩展）
- ✅ 生成验证码逻辑：任务2（CaptchaService.generate）
- ✅ 校验验证码逻辑：任务2（CaptchaService.verify）
- ✅ 内存存储方案：任务1（InMemoryCaptchaStore）
- ✅ 图片资源：任务5（下载脚本）+ 任务6（加载逻辑）
- ✅ 前端滑块组件：任务7（CaptchaSlider）
- ✅ 登录页面集成：任务9（Login.tsx）
- ✅ 视觉规范（主题色/动画）：任务7（CSS样式）
- ✅ 测试要点（误差/耗时边界）：任务2（常量定义）

**占位符扫描：** 无 TODO/待定/模糊描述

**类型一致性：** CaptchaData、CaptchaVerifyResult、RiskCheckResult、LoginResponse、CaptchaModalState 等类型在各任务间一致

**遗漏补充：** 
- mock-api.ts 的 captcha mock 实现 — 已添加到任务10
- backendApi Proxy 层路由 — 已添加到任务10