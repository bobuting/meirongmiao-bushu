# 全局进度提示层设计文档

**日期**：2026-04-07
**问题**：Step1 生成搭配的进度条会被弹出框（角色方向选择抽屉 `z-[70]`）覆盖
**目标**：创建全局进度提示层，确保进度状态始终可见

---

## 一、问题分析

### 1.1 当前层级架构

| 组件 | z-index | 文件位置 |
|------|---------|----------|
| 进度条（内嵌） | 无明确值 | `Assets.tsx:3256-3264` |
| 媒体表面层 | `z-[1]` | `projectFlowMediaLayerGuard.ts` |
| 媒体覆盖层 | `z-10` | `projectFlowMediaLayerGuard.ts` |
| 媒体装饰层 | `z-20` | `projectFlowMediaLayerGuard.ts` |
| 选择面板（桌面） | `z-20` | `Assets.tsx:3205` |
| 媒体阻塞层 | `z-30` | `projectFlowMediaLayerGuard.ts` |
| 底部浮动 footer | `z-40` | `Assets.tsx:3427` |
| 模块库导入弹窗 | `z-50` | `Assets.tsx:2809` |
| 移动端选择面板 | `z-50` | `Assets.tsx:2884` |
| 角色方向抽屉 | `z-[70]` | `step1RoleDirectionDrawerPanel.tsx:178` |
| 模块预览弹窗 | `z-[80]` | `Assets.tsx:3390` |

### 1.2 问题根因

- 进度条位于主内容区域（无 z-index），属于默认层级
- 角色方向选择抽屉使用 `z-[70]` 全屏覆盖
- 两者发生层级冲突，进度条被完全遮挡

---

## 二、解决方案

### 2.1 设计原则

1. **独立于页面内容层级**：进度提示是系统级状态，不依赖具体页面组件
2. **不遮挡主要交互区域**：位于屏幕边缘，不影响用户与弹出框的交互
3. **可复用性**：设计通用组件，未来可扩展到其他步骤（Step3/Step4）

### 2.2 方案：全局进度提示层

创建独立的全局进度组件，固定定位在屏幕顶部，z-index 设为 `z-[100]`，高于所有现有弹出框。

---

## 三、组件设计

### 3.1 文件位置

```
apps/web/components/shared/GlobalProgressIndicator.tsx
```

### 3.2 Props 接口

```typescript
interface GlobalProgressIndicatorProps {
  /** 是否显示进度指示器 */
  visible: boolean;
  /** 进度标题（如"AI 正在分析搭配方案..."） */
  title: string;
  /** 进度百分比（0-100），默认 60 */
  progress?: number;
  /** 阶段提示文字（如"正在分析服装风格..."） */
  hint?: string;
  /** 取消按钮回调（可选） */
  onCancel?: () => void;
}
```

### 3.3 组件结构

```tsx
<div className="fixed top-0 left-0 right-0 z-[100] ...">
  {/* 左侧：图标 + 标题 */}
  <div className="flex items-center gap-2">
    <span className="material-icons-round animate-pulse">auto_awesome</span>
    <span className="font-medium">{title}</span>
  </div>

  {/* 中间：进度条 */}
  <div className="flex-1 ...">
    <div className="h-1.5 rounded-full bg-white/20">
      <div className="h-full rounded-full bg-primary animate-shimmer" style={{ width: `${progress}%` }} />
    </div>
    {hint && <span className="text-xs">{hint}</span>}
  </div>

  {/* 右侧：取消按钮（可选） */}
  {onCancel && (
    <button onClick={onCancel}>
      <span className="material-icons-round">close</span>
    </button>
  )}
</div>
```

### 3.4 样式规范

| 属性 | 值 | 说明 |
|------|-----|------|
| 定位 | `fixed top-0 left-0 right-0` | 屏幕顶部边缘 |
| z-index | `z-[100]` | 高于所有现有弹出框 |
| 高度 | `h-12` (48px) | 紧凑单行设计 |
| 背景 | `bg-black/80 backdrop-blur-sm` | 半透明 + 模糊效果 |
| 文字颜色 | `text-white` | 白色文字，高对比度 |
| 进度条 | `bg-primary animate-shimmer` | 主题色 + 动画效果 |

---

## 四、与现有代码集成

### 4.1 修改 Assets.tsx

**删除原有进度条**（第 3256-3264 行）：

```tsx
// 删除以下代码块
{isGenerating ? (
  <div className="mt-4 space-y-3">
    {/* 进度条 */}
    <div className="h-2 w-64 overflow-hidden rounded-full bg-gray-200">
      <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-hover animate-shimmer" style={{ width: "60%" }} />
    </div>
    {/* 阶段提示 */}
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span className="material-icons-round text-sm text-primary animate-pulse">auto_awesome</span>
      <span>正在分析服装风格、匹配推荐方案...</span>
    </div>
  </div>
) : (
  <p className="mt-3 text-xs text-gray-400">上传素材并点击"生成推荐方案"后开始分析进度。</p>
)}
```

**新增全局进度指示器调用**：

在 `Assets` 组件的 return 末尾（弹出框区域之后，floating footer 之前）添加：

```tsx
{/* 全局进度指示器 */}
<GlobalProgressIndicator
  visible={isGenerating}
  title="AI 正在分析搭配方案..."
  progress={60}
  hint="正在分析服装风格、匹配推荐方案..."
/>
```

### 4.2 import 语句

```tsx
import { GlobalProgressIndicator } from "../../components/shared/GlobalProgressIndicator";
```

---

## 五、扩展性考虑

### 5.1 未来复用场景

| 步骤 | 进度标题 | 说明 |
|------|----------|------|
| Step1 | "AI 正在分析搭配方案..." | 本次实现 |
| Step3 | "正在生成脚本候选..." | 可复用组件 |
| Step4 | "正在合成视频..." | 可复用组件 |

### 5.2 统一状态管理（可选）

如需在多个步骤共享进度状态，可考虑：
- 使用 Zustand store 管理 `globalProgress` 状态
- 或使用 React Context 提供全局进度上下文

**当前设计原则**：先实现 Step1 需求，组件设计保持通用，按需扩展。

---

## 六、实现步骤

1. 创建 `apps/web/components/shared/GlobalProgressIndicator.tsx` 组件
2. 修改 `apps/web/pages/project-flow/Assets.tsx`：
   - 添加 import 语句
   - 删除原有进度条代码（第 3256-3264 行）
   - 添加全局进度指示器组件调用
3. 测试验证：
   - 启动项目
   - 进入 Step1 页面
   - 点击"生成搭配"，观察进度指示器是否在顶部显示
   - 打开角色方向选择抽屉，确认进度指示器仍可见

---

## 七、视觉效果示意

```
┌─────────────────────────────────────────────────────────────────┐
│ [⚡] AI 正在分析搭配方案... ████████░░░░ 正在分析服装风格... [×] │ ← 全局进度层（z-[100]）
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [角色方向选择抽屉 z-[70]]                                        │ ← 弹出框
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ [底部操作栏 z-40]                                                │ ← 底部 footer
└─────────────────────────────────────────────────────────────────┘
```