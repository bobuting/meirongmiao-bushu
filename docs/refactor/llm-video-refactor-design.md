# llm-video.ts 重构设计文档

## 1. 现状分析

### 1.1 文件规模
- **总行数**: 2496 行（超出规范 1200 行限制的 2 倍）
- **职责**: 8 种视频协议的统一入口

### 1.2 支持的协议

| 协议 | callMode | 提供商 | 特点 |
|------|----------|--------|------|
| VEO tongyi | `VEO_VIDEO_YUNWU_TONGYI` | 云雾统一 | 固定 8 秒，支持多图 |
| VEO openai | `VEO_VIDEO_YUNWU_OPENAI` | 云雾 OpenAI 格式 | 固定 8 秒，最多 3 张参考图 |
| 豆包/火山 | `DOUBAO_SEEDANCE_VIDEO_YUNWU` | 云雾 Seedance | 需 data URL，支持首帧图 |
| 可灵多图 | `KLING_VIDEO_YUNWU` | 云雾可灵 | 支持多图 img2video |
| 可灵官方 | `KLING_VIDEO_OFFICIAL` | 可灵官方 | JWT 认证 |
| 可灵 Omni | `KLING_OMNI_VIDEO_YUNWU` | 云雾 Omni | 视频+图片混合输入 |
| 万相 | `WANX_VIDEO_BAILIAN` | 百炼 DashScope | 异步 Header |
| 快乐马 | `HAPPYHORSE_VIDEO_BAILIAN` | 百炼 DashScope | 参考生视频 |
| 即梦 | 默认 | 即梦 | FormData 格式 |

### 1.3 核心函数

| 函数 | 行数 | 职责 |
|------|------|------|
| `requestVideoUrl` | ~600 行 | 同步模式：创建任务 + 轮询查询 |
| `createVideoTask` | ~550 行 | 异步模式：仅创建任务 |
| `queryVideoTask` | ~200 行 | 异步模式：单次查询 |
| `createVideoEditTask` | ~150 行 | 视频编辑：创建任务 |
| `queryVideoEditTask` | ~100 行 | 视频编辑：查询任务 |
| `createOmniVideoTask` | ~100 行 | Omni-Video：创建任务 |
| `queryOmniVideoTask` | ~80 行 | Omni-Video：查询任务 |

### 1.4 重复代码模式

| 模式 | 出现次数 | 代码位置 |
|------|---------|---------|
| switch (callMode) 构建创建端点 | 6 次 | 行 654-683, 1143-1171, 1387-1415, 1791-1819, 1900-1929 |
| switch (callMode) 构建查询端点 | 5 次 | 行 698-726, 1143-1171, 1791-1819, 1900-1929 |
| 认证头构建逻辑 | 4 次 | 行 603-613, 1346-1353, 1889-1896, 2100-2101 |
| 审计信息构建 | 3 次 | 行 1030-1080, 1696-1743, 2129-2136 |
| VEO 时长补充提示 | 2 次 | 行 629-642, 1363-1375 |

---

## 2. 目标架构

### 2.1 目录结构

```
src/service/llm/video/
├── index.ts                    # 统一导出（保持向后兼容）
├── types.ts                    # 类型定义
├── constants.ts                # 常量配置
├── utils.ts                    # 工具函数
├── auth.ts                     # 认证逻辑
├── endpoints.ts                # 端点构建（消除 switch 重复）
├── protocols/                  # 协议实现
│   ├── index.ts               # 协议注册表
│   ├── base.ts                # 协议基类/接口
│   ├── veo.ts                 # VEO 协议（tongyi + openai）
│   ├── doubao.ts              # 豆包/火山协议
│   ├── kling.ts               # 可灵协议（multi + official + omni）
│   ├── wanx.ts                # 万相协议
│   ├── happyhorse.ts          # 快乐马协议
│   └── jimeng.ts              # 即梦协议
├── request-video.ts           # requestVideoUrl 实现
├── create-task.ts             # createVideoTask 实现
├── query-task.ts              # queryVideoTask 实现
└── video-edit.ts              # 视频编辑相关
```

### 2.2 模块职责

#### types.ts (~80 行)
```typescript
// 类型定义
export interface VideoRequestAuditInfo { ... }
export type JimengImageRatio = "1:1" | "3:4" | "9:16" | "16:9";
export type JimengImageResolution = "1k" | "2k" | "4k";
export type VideoTaskStatus = "pending" | "processing" | "succeeded" | "failed";
export interface VideoTaskResult { ... }
export interface ProtocolHandler { ... }
```

#### constants.ts (~50 行)
```typescript
// VEO 固定时长
export const VEO_FIXED_DURATION = 8;

// 默认配置
export const DEFAULT_ASPECT_RATIO = "9:16";
export const DEFAULT_RESOLUTION = "1080p";

// 动作补充建议库
export const ACTION_EXTENSIONS = [ ... ];
export const CAMERA_EXTENSIONS = [ ... ];
export const EMOTION_EXTENSIONS = [ ... ];
```

#### utils.ts (~200 行)
```typescript
// 错误处理
export function extractProviderErrorMessage(data: unknown): string | null;
export function shouldTreatProviderMessageAsFailure(message: string | null): boolean;
export function shouldTreatVideoProviderFailureAsOverload(message: string): boolean;

// 图片 URL 处理
export function normalizeVideoReferenceImageUrl(value: unknown): string | null;
export function resolveVideoReferenceImageUrlForDoubao(...): Promise<string | null>;

// Prompt 构建
export function buildDoubaoVideoPromptWithFlags(input: {...}): string;
export function buildVeoDurationExtensionHint(scriptDuration: number, fixedDuration?: number): string | null;

// 响应解析
export function parseResponsePayload(rawText: string): unknown;
```

#### auth.ts (~80 行)
```typescript
// JWT 生成
export function generateKlingJWT(accessKey: string, secretKey: string): string;

// 认证头构建
export function buildVideoAuthHeaders(
  provider: ResolvedRouteProvider,
  callMode: string
): { auth: string; apiKey: string };
```

#### endpoints.ts (~150 行)
```typescript
// 统一端点构建（消除 switch 重复）
export function getCreateEndpoints(
  callMode: string,
  baseUrl: string,
  taskId?: string
): string[];

export function getQueryEndpoints(
  callMode: string,
  baseUrl: string,
  taskId: string
): string[];
```

#### protocols/base.ts (~60 行)
```typescript
// 协议处理器接口
export interface ProtocolHandler {
  // 创建任务请求体
  buildCreateRequest(params: CreateRequestParams): {
    headers: Record<string, string>;
    body: BodyInit;
    summary: Record<string, unknown>;
  };

  // 解析创建响应
  parseCreateResponse(data: unknown): {
    taskId: string | null;
    videoUrls: string[];
    status: string;
  };

  // 解析查询响应
  parseQueryResponse(data: unknown): {
    taskId: string | null;
    videoUrls: string[];
    status: string;
    error?: { code: string; message: string };
  };
}
```

#### protocols/veo.ts (~200 行)
```typescript
export class VeoProtocolHandler implements ProtocolHandler {
  // VEO tongyi + openai 协议实现
  // 特点：固定 8 秒，支持多图，需要时长补充提示
}
```

#### protocols/doubao.ts (~150 行)
```typescript
export class DoubaoProtocolHandler implements ProtocolHandler {
  // 豆包/火山协议实现
  // 特点：需要 data URL，支持首帧图
}
```

#### protocols/kling.ts (~300 行)
```typescript
export class KlingProtocolHandler implements ProtocolHandler {
  // 可灵协议实现（multi + official + omni）
  // 特点：JWT 认证（官方），支持多图
}
```

#### protocols/wanx.ts (~120 行)
```typescript
export class WanxProtocolHandler implements ProtocolHandler {
  // 万相 DashScope 协议实现
  // 特点：需要 X-DashScope-Async Header
}
```

#### protocols/happyhorse.ts (~120 行)
```typescript
export class HappyHorseProtocolHandler implements ProtocolHandler {
  // 快乐马 DashScope 协议实现
  // 特点：参考生视频，必须有参考图
}
```

#### protocols/jimeng.ts (~100 行)
```typescript
export class JimengProtocolHandler implements ProtocolHandler {
  // 即梦协议实现
  // 特点：FormData 格式
}
```

#### protocols/index.ts (~50 行)
```typescript
import { ProviderCallMode } from "@/contracts/types";
import { ProtocolHandler } from "./base";

// 协议注册表
const protocolRegistry = new Map<string, ProtocolHandler>([
  [ProviderCallMode.VEO_VIDEO_YUNWU_TONGYI, new VeoProtocolHandler()],
  [ProviderCallMode.VEO_VIDEO_YUNWU_OPENAI, new VeoProtocolHandler()],
  [ProviderCallMode.DOUBAO_SEEDANCE_VIDEO_YUNWU, new DoubaoProtocolHandler()],
  // ...
]);

export function getProtocolHandler(callMode: string): ProtocolHandler;
```

---

## 3. 重构步骤

### 3.1 第一阶段：提取基础模块（低风险）

**目标**: 将纯函数和类型定义提取到独立文件

**步骤**:
1. 创建 `types.ts`，迁移所有类型定义
2. 创建 `constants.ts`，迁移常量
3. 创建 `utils.ts`，迁移工具函数
4. 更新 `llm-video.ts` 的导入

**验证**: 所有测试通过，无功能变更

### 3.2 第二阶段：提取认证逻辑（低风险）

**目标**: 统一认证头构建逻辑

**步骤**:
1. 创建 `auth.ts`
2. 实现 `buildVideoAuthHeaders()`
3. 实现 `generateKlingJWT()`
4. 替换所有认证头构建代码

**验证**: 所有测试通过，无功能变更

### 3.3 第三阶段：提取端点构建（中风险）

**目标**: 消除 switch 重复

**步骤**:
1. 创建 `endpoints.ts`
2. 实现 `getCreateEndpoints()`
3. 实现 `getQueryEndpoints()`
4. 替换所有 switch 语句

**验证**: 所有测试通过，无功能变更

### 3.4 第四阶段：实现协议处理器（高风险）

**目标**: 按协议拆分请求体构建和响应解析逻辑

**步骤**:
1. 创建 `protocols/base.ts`，定义接口
2. 实现 `protocols/veo.ts`
3. 实现 `protocols/doubao.ts`
4. 实现 `protocols/kling.ts`
5. 实现 `protocols/wanx.ts`
6. 实现 `protocols/happyhorse.ts`
7. 实现 `protocols/jimeng.ts`
8. 创建 `protocols/index.ts`，注册协议

**验证**: 每实现一个协议，运行相关测试

### 3.5 第五阶段：重构主函数（高风险）

**目标**: 使用协议处理器简化主函数

**步骤**:
1. 创建 `request-video.ts`，迁移 `requestVideoUrl`
2. 创建 `create-task.ts`，迁移 `createVideoTask`
3. 创建 `query-task.ts`，迁移 `queryVideoTask`
4. 创建 `video-edit.ts`，迁移编辑相关函数
5. 创建 `index.ts`，统一导出

**验证**: 所有测试通过，无功能变更

### 3.6 第六阶段：清理和文档（低风险）

**步骤**:
1. 删除原 `llm-video.ts`
2. 更新所有导入路径
3. 添加 JSDoc 注释
4. 更新 README

---

## 4. 向后兼容策略

### 4.1 导出保持不变

```typescript
// src/service/llm/video/index.ts
export {
  requestVideoUrl,
  createVideoTask,
  queryVideoTask,
  createVideoEditTask,
  queryVideoEditTask,
  createOmniVideoTask,
  queryOmniVideoTask,
  // 别名
  requestJimengVideoUrl,
  // 类型
  VideoRequestAuditInfo,
  JimengImageRatio,
  JimengImageResolution,
} from "./request-video";
```

### 4.2 导入路径保持不变

```typescript
// 原有导入
import { requestVideoUrl } from "@/service/llm/llm-video";

// 重构后（通过 index.ts 重导出）
import { requestVideoUrl } from "@/service/llm/video";
// 或保持原路径（添加 llm-video.ts 作为重导出）
import { requestVideoUrl } from "@/service/llm/llm-video";
```

---

## 5. 测试策略

### 5.1 单元测试

每个协议处理器独立测试：

```typescript
// protocols/veo.test.ts
describe("VeoProtocolHandler", () => {
  it("should build create request with images", () => { ... });
  it("should parse create response with taskId", () => { ... });
  it("should add duration extension hint for short scripts", () => { ... });
});
```

### 5.2 集成测试

主函数端到端测试：

```typescript
// request-video.test.ts
describe("requestVideoUrl", () => {
  it("should create and poll VEO task", () => { ... });
  it("should create and poll Doubao task", () => { ... });
  it("should handle existing taskId", () => { ... });
});
```

### 5.3 回归测试

重构前后对比测试：

```typescript
// 确保重构后输出与重构前一致
it("should produce same output as before refactor", () => {
  const oldOutput = oldRequestVideoUrl(...);
  const newOutput = newRequestVideoUrl(...);
  expect(newOutput).toEqual(oldOutput);
});
```

---

## 6. 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 功能回归 | 高 | 每阶段运行完整测试套件 |
| 导入路径变更 | 中 | 使用重导出保持兼容 |
| 协议处理器接口设计不当 | 中 | 先实现一个协议验证设计 |
| 重构时间过长 | 低 | 分阶段实施，每阶段独立可发布 |

---

## 7. 预期收益

| 指标 | 重构前 | 重构后 | 改进 |
|------|--------|--------|------|
| 最大文件行数 | 2496 行 | ~300 行 | ↓ 88% |
| 代码重复率 | 高（6 处 switch） | 低（统一函数） | ↓ 80% |
| 新增协议成本 | 修改主文件 | 新增协议文件 | 隔离性 ↑ |
| 测试覆盖率 | 难以单测 | 每协议独立测试 | 可测试性 ↑ |

---

## 8. 时间估算

| 阶段 | 预计时间 | 累计 |
|------|---------|------|
| 第一阶段：基础模块 | 2 小时 | 2 小时 |
| 第二阶段：认证逻辑 | 1 小时 | 3 小时 |
| 第三阶段：端点构建 | 2 小时 | 5 小时 |
| 第四阶段：协议处理器 | 4 小时 | 9 小时 |
| 第五阶段：主函数重构 | 3 小时 | 12 小时 |
| 第六阶段：清理文档 | 1 小时 | 13 小时 |

**总计**: 约 2 个工作日

---

## 9. 附录：协议处理器接口详细设计

```typescript
// protocols/base.ts

/** 创建请求参数 */
export interface CreateRequestParams {
  model: string;
  prompt: string;
  effectivePrompt: string;
  imageUrl: string | null;
  referenceImages: string[];
  duration: number;
  resolution: string;
  aspectRatio: string;
  options?: {
    sound?: string;
    negativePrompt?: string;
  };
}

/** 创建请求结果 */
export interface CreateRequestResult {
  headers: Record<string, string>;
  body: BodyInit;
  summary: Record<string, unknown>;
}

/** 创建响应解析结果 */
export interface CreateResponseResult {
  taskId: string | null;
  videoUrls: string[];
  status: "pending" | "processing" | "succeeded" | "failed";
  error?: { code: string; message: string };
}

/** 查询响应解析结果 */
export interface QueryResponseResult {
  taskId: string | null;
  videoUrls: string[];
  status: "pending" | "processing" | "succeeded" | "failed";
  error?: { code: string; message: string };
}

/** 协议处理器接口 */
export interface ProtocolHandler {
  /** 协议名称 */
  readonly name: string;

  /** 支持的 callMode 列表 */
  readonly callModes: string[];

  /** 是否需要 API Key Headers */
  readonly needsApiKeyHeaders: boolean;

  /** 是否需要 DashScope 异步 Header */
  readonly needsDashScopeAsyncHeader: boolean;

  /** 构建创建请求 */
  buildCreateRequest(params: CreateRequestParams): CreateRequestResult;

  /** 解析创建响应 */
  parseCreateResponse(data: unknown): CreateResponseResult;

  /** 解析查询响应 */
  parseQueryResponse(data: unknown): QueryResponseResult;
}
```
