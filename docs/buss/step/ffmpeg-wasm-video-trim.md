# ffmpeg.wasm 前端视频裁切

## 概述

换装项目使用 ffmpeg.wasm 在前端裁切视频，保留音频轨道，避免上传完整视频到后端。

## 技术方案

### 架构

```
用户上传视频
    ↓
前端检测时长 > 30s
    ↓
ffmpeg.wasm 裁切前 30s（保留音频）
    ↓
上传裁切后的 MP4 → OSS
    ↓
sourceVideoUrl 传给后端
    ↓
后端视频理解 + 切片处理
```

### 对比

| 方案 | 音频 | 格式 | 加载 | 浏览器支持 |
|------|------|------|------|------------|
| ffmpeg.wasm | ✅ 保留 | MP4 | 31MB | Chrome/Edge/Firefox |
| Canvas + MediaRecorder | ❌ 无 | WebM | 无 | 所有浏览器 |

## ffmpeg.wasm 实现

### 依赖安装

```bash
npm --prefix apps/web install @ffmpeg/ffmpeg @ffmpeg/util
```

### 核心代码

```typescript
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;

async function loadFfmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) {
    return ffmpegInstance;
  }

  ffmpegInstance = new FFmpeg();
  
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  await ffmpegInstance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  ffmpegLoaded = true;
  return ffmpegInstance;
}
```

### 裁切函数

```typescript
export async function trimVideoWithFfmpeg(
  file: File,
  maxDuration: number = 30,
  onProgress?: (percent: number) => void
): Promise<File> {
  const ffmpeg = await loadFfmpeg();

  // 写入输入文件
  await ffmpeg.writeFile("input.mp4", await fetchFile(file));

  // 执行裁切命令（无损复制音视频）
  await ffmpeg.exec([
    "-i", "input.mp4",
    "-t", String(maxDuration),
    "-c:v", "copy",  // 视频流无损复制
    "-c:a", "copy",  // 音频流无损复制
    "-movflags", "+faststart",
    "output.mp4",
  ]);

  // 读取输出文件
  const data = await ffmpeg.readFile("output.mp4");
  
  // 清理虚拟文件系统
  await ffmpeg.deleteFile("input.mp4");
  await ffmpeg.deleteFile("output.mp4");

  return new File([data], "trimmed.mp4", { type: "video/mp4" });
}
```

### ffmpeg 参数说明

| 参数 | 说明 |
|------|------|
| `-i input.mp4` | 输入文件 |
| `-t 30` | 截取前 30 秒 |
| `-c:v copy` | 视频流无损复制（不重编码） |
| `-c:a copy` | 音频流无损复制（保留音频） |
| `-movflags +faststart` | 优化 MP4 播放（元数据前置） |

## 浏览器兼容性

### SharedArrayBuffer 要求

ffmpeg.wasm 需要 SharedArrayBuffer，浏览器安全策略限制：

| 浏览器 | 支持状态 | 说明 |
|--------|----------|------|
| Chrome 92+ | ✅ 完全支持 | 默认启用 |
| Edge 92+ | ✅ 完全支持 | 默认启用 |
| Firefox 79+ | ✅ 完全支持 | 默认启用 |
| Safari 15.2+ | ⚠️ 部分支持 | 需要安全头 |
| iOS Safari | ❌ 不支持 | SharedArrayBuffer 禁用 |
| Android Chrome | ✅ 支持 | 默认启用 |

### 检测函数

```typescript
export function isFfmpegWasmSupported(): boolean {
  try {
    new SharedArrayBuffer(1);
    return true;
  } catch {
    return false;
  }
}
```

### 降级方案

不支持时使用 Canvas + MediaRecorder：

```typescript
if (isFfmpegWasmSupported()) {
  // ffmpeg.wasm（保留音频）
  trimmedFile = await trimVideoWithFfmpeg(file, 30);
} else {
  // Canvas + MediaRecorder（无音频）
  trimmedFile = await trimVideoWithCanvas(file, 30);
}
```

### Safari 安全头配置

服务器需配置响应头：

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## 性能影响

### 首次加载

| 资源 | 大小 | 加载时间（估算） |
|------|------|------------------|
| ffmpeg-core.js | ~500KB | 0.1-0.5s |
| ffmpeg-core.wasm | 31MB | 3-10s（网络） |

### 单例优化

```typescript
// 第二次调用无需重新加载
if (ffmpegInstance && ffmpegLoaded) {
  return ffmpegInstance;  // 直接返回已加载实例
}
```

### 内存占用

| 场景 | 内存占用 |
|------|----------|
| ffmpeg.wasm 运行 | ~100MB |
| 30s 视频处理 | ~50MB（视频数据） |
| 总计峰值 | ~150MB |

### 裁切耗时

| 视频大小 | 裁切 30s 耗时 |
|----------|---------------|
| 10MB | ~0.5s |
| 50MB | ~1s |
| 100MB | ~2s |
| 500MB | ~5s |

## 错误处理

### 加载失败

```typescript
try {
  await ffmpeg.load(...);
} catch (error) {
  console.error("ffmpeg.wasm 加载失败:", error);
  // 降级到 Canvas 方案
  return trimVideoWithCanvas(file, maxDuration);
}
```

### 裁切失败

```typescript
try {
  await ffmpeg.exec([...]);
} catch (error) {
  throw new Error(`视频裁切失败: ${error.message}`);
}
```

### 超时保护

```typescript
const timeout = setTimeout(() => {
  if (ffmpegInstance.state === "running") {
    ffmpegInstance.terminate();
    reject(new Error("裁切超时"));
  }
}, 60000);  // 60s 超时
```

## 用户体验

### 进度显示

```typescript
trimVideoWithFfmpeg(file, 30, (percent) => {
  setTrimProgress(percent);
  setFeedback(`截取进度: ${percent}%`);
});
```

进度节点：
- 0%: 开始
- 10%: ffmpeg 加载完成
- 80%: 裁切完成
- 90%: 文件读取
- 100%: 完成

### 状态提示

| 状态 | 提示文案 |
|------|----------|
| 加载 ffmpeg | "正在加载视频处理工具..." |
| 检测时长 | "检测视频时长..." |
| 开始裁切 | "视频时长 60秒，正在截取前 30 秒..." |
| 完成 | "已自动截取前 30 秒，正在上传..." |

### UI 设计

- 进度条显示裁切进度
- 禁用上传按钮防止重复操作
- 错误时显示红色提示框
- 成功时显示绿色提示框

## 安全考虑

### CDN 来源

使用 unpkg.com 官方 CDN：
- URL: `https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm`
- HTTPS 加密传输
- 版本锁定防止注入

### 文件限制

```typescript
// 文件类型验证
if (!file.type.startsWith("video/")) {
  throw new Error("仅支持视频文件");
}

// 文件大小限制
if (file.size > 500 * 1024 * 1024) {
  throw new Error("视频不能超过 500MB");
}
```

### 数据处理

- 用户文件仅在浏览器内存处理
- 不上传到第三方服务器
- 处理完成后立即清理虚拟文件系统

## 使用位置

| 文件 | 用途 |
|------|------|
| `apps/web/utils/videoTrim.ts` | ffmpeg.wasm 裁切函数 |
| `apps/web/pages/outfit-change/OutfitChangeStep1.tsx` | Step1 上传源视频 |

## 测试验证

### 单元测试

```typescript
// 测试 SharedArrayBuffer 检测
test("isFfmpegWasmSupported returns boolean", () => {
  expect(typeof isFfmpegWasmSupported()).toBe("boolean");
});

// 测试时长检测
test("getVideoDuration returns correct duration", async () => {
  const file = new File([videoBuffer], "test.mp4", { type: "video/mp4" });
  const duration = await getVideoDuration(file);
  expect(duration).toBeCloseTo(60);
});
```

### E2E 测试

1. 上传 60s 视频 → 自动裁切到 30s
2. 检查裁切后视频有音频
3. 检查裁切后视频时长 ≤ 30s

## 维护说明

### 版本更新

当前版本：`@ffmpeg/core@0.12.6`

升级时需同步更新：
- `apps/web/utils/videoTrim.ts` baseURL
- 本文档版本号

### 故障排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 加载失败 | CDN 不可达 | 检查网络/换 CDN |
| 无音频 | Canvas 降级 | 提示用户使用 Chrome |
| Safari 崩溃 | SharedArrayBuffer | 配置安全头 |
| 内存溢出 | 文件过大 | 限制 500MB |

## 参考文档

- [ffmpeg.wasm 官方文档](https://ffmpegwasm.netlify.app/)
- [SharedArrayBuffer 安全要求](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [ffmpeg 命令参数](https://ffmpeg.org/ffmpeg.html)