---
name: fission-page-redesign
description: 视频裂变页面重新设计方案
type: project
---

# 视频裂变页面重新设计

## 背景
当前 `/fission` 页面缺少分镜展示，界面风格与项目整体不一致。需要参考 `/create/step1-5` 的设计风格进行重新设计。

## 设计原则
遵循现有项目的设计风格，保持一致性：
- **背景色**：米色背景 `bg-[#fdfbf7]`，温暖柔和
- **卡片样式**：白色背景 `bg-white`，大圆角 `rounded-2xl/rounded-3xl`，阴影 `shadow-sm/shadow-xl`
- **边框**：`border-gray-100` 或 `border-gray-200`
- **图标**：`material-icons-round`
- **颜色主题**：primary（蓝紫色）、gray、emerald（成功）、amber（警告）
- **布局**：左侧历史侧边栏 + 主内容区 + 底部操作栏

---

## 页面布局

采用与 Step5 相同的三区域布局：

```
┌────────────────────────────────────────────────────────────┐
│                        顶部导航                             │
├──────────────┬─────────────────────────────────────────────┤
│              │                                             │
│   左侧边栏    │              主内容区                        │
│   (400px)    │                                             │
│              │   ┌─────────────────────────────────────┐   │
│  Step4 视频   │   │  原始视频预览 (大卡片)                 │   │
│  片段        │   └─────────────────────────────────────┘   │
│              │                                             │
│  Step3 分镜   │   ┌─────────────────────────────────────┐   │
│  图片        │   │  分镜选择器 (网格布局)                  │   │
│              │   └─────────────────────────────────────┘   │
│              │                                             │
│              │   ┌─────────────────────────────────────┐   │
│              │   │  裂变设置面板                          │   │
│              │   └─────────────────────────────────────┘   │
│              │                                             │
│              │   ┌─────────────────────────────────────┐   │
│              │   │  裂变结果展示区                        │   │
│              │   └─────────────────────────────────────┘   │
│              │                                             │
├──────────────┴─────────────────────────────────────────────┤
│                     底部操作栏 (固定)                        │
└────────────────────────────────────────────────────────────┘
```

---

## 组件设计

### 1. 左侧历史侧边栏

复用 `ProjectFlowHistorySidebar` 组件，展示：

**Step4 视频片段面板**：
- 使用 `HistoryStep4Panel`
- 展示所有视频片段缩略图（网格 4 列）
- 支持点击预览（弹窗播放）

**Step3 分镜图片面板**：
- 使用 `HistoryStep3Panel`
- 展示脚本信息（标题、时长、镜头数）
- 展示分镜图片缩略图（网格 4 列）
- 支持点击预览（弹窗查看）

---

### 2. 主内容区

#### 2.1 原始视频预览卡片

**设计要点**：
- 大卡片，白色背景，圆角 `rounded-2xl`，阴影 `shadow-xl`
- 视频预览区域使用 9:16 比例，黑色背景，圆角内部 `rounded-[28px]`
- 视频底部显示时长和分镜数量信息（毛玻璃效果）
- 顶部右上角显示播放进度（小胶囊）

**代码参考**：
```tsx
<div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
  <div className="mx-auto max-w-[320px] p-5">
    <div className="bg-black relative overflow-hidden rounded-[28px]" style={{ aspectRatio: "9/16" }}>
      <video src={videoUrl} controls className="w-full h-full object-contain" />
      
      {/* 底部信息栏 */}
      <div className="absolute bottom-3 left-3 right-3 bg-white/10 backdrop-blur-xl rounded-xl p-3">
        <div className="text-white font-bold text-sm">最终合成视频</div>
        <div className="text-white/60 text-xs">30秒 · 6个分镜</div>
      </div>
      
      {/* 播放进度 */}
      <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-lg rounded-lg px-2 py-1">
        <span className="text-white text-xs">▶ 0:00</span>
      </div>
    </div>
  </div>
</div>
```

---

#### 2.2 裂变设置面板

**设计要点**：
- 白色卡片，圆角 `rounded-2xl`，边框 `border-gray-200`
- 顶部显示已选择分镜数量（自动使用全部分镜）
- 裂变数量选择：3/6/9 三个按钮，选中的用 primary 背景
- 裂变风格选择：卡片网格，每个选项包含图标、标题、描述
- 生成按钮：primary 背景 `bg-primary`，圆角 `rounded-full`，阴影 `shadow-lg shadow-primary/20`

**代码参考**：
```tsx
<div className="bg-white rounded-2xl border border-gray-200 p-5">
  {/* 顶部提示 */}
  <div className="text-xs text-gray-500 mb-4">
    将使用全部 {frameCount} 个分镜进行裂变
  </div>

  <div className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
    <span className="material-icons-round text-primary">auto_fix_high</span>
    裂变设置
  </div>
  
  {/* 裂变数量 */}
  <div className="mb-5">
    <div className="text-xs text-gray-600 mb-2">裂变数量</div>
    <div className="flex gap-3">
      {[3, 6, 9].map((num) => (
        <button
          key={num}
          className={`flex-1 py-2 rounded-xl font-bold text-sm transition-all
            ${selectedCount === num 
              ? 'bg-primary text-white shadow-lg shadow-primary/20' 
              : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'}`}
          onClick={() => setSelectedCount(num)}
        >
          {num}
        </button>
      ))}
    </div>
  </div>
  
  {/* 裂变风格 */}
  <div className="mb-5">
    <div className="text-xs text-gray-600 mb-2">裂变风格</div>
    <div className="grid grid-cols-2 gap-3">
      {styles.map((style) => (
        <div
          key={style.id}
          className={`p-3 rounded-xl cursor-pointer transition-all
            ${selectedStyle === style.id 
              ? 'bg-primary/10 border-2 border-primary' 
              : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'}`}
          onClick={() => setSelectedStyle(style.id)}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons-round text-primary text-lg">{style.icon}</span>
            <span className="font-bold text-sm">{style.title}</span>
          </div>
          <div className="text-xs text-gray-500">{style.description}</div>
        </div>
      ))}
    </div>
  </div>
  
  {/* 生成按钮 */}
  <button className="w-full py-3 rounded-full bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-primary-hover transition-all flex items-center justify-center gap-2">
    <span className="material-icons-round">auto_fix_high</span>
    开始生成 {selectedCount} 个裂变视频
  </button>
</div>
```

---

#### 2.3 裂变结果展示区

**设计要点**：
- 白色卡片，圆角 `rounded-2xl`，边框 `border-gray-200`
- 顶部标题行：标题 + 生成进度指示器（已生成 X/Y）
- 网格布局，每行 3 个结果卡片
- 结果卡片：9:16 比例，黑色背景，圆角 `rounded-xl`
- 底部显示分镜组合信息（毛玻璃效果）
- 生成中状态：显示进度环动画
- 等待中状态：灰色背景 + 沙漏图标

**代码参考**：
```tsx
<div className="bg-white rounded-2xl border border-gray-200 p-5">
  {/* 标题行 */}
  <div className="flex items-center justify-between mb-4">
    <label className="text-sm font-bold text-gray-800 flex items-center gap-2">
      <span className="material-icons-round text-primary">celebration</span>
      裂变结果
    </label>
    <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full font-semibold">
      已生成 {completed}/{total}
    </span>
  </div>
  
  {/* 结果网格 */}
  <div className="grid grid-cols-3 gap-4">
    {results.map((result, idx) => (
      <div key={idx} className="relative">
        {/* 视频卡片 */}
        <div className="bg-gray-900 rounded-xl overflow-hidden relative" style={{ aspectRatio: "9/16" }}>
          {result.status === 'completed' ? (
            <>
              <video src={result.url} className="w-full h-full object-cover" />
              
              {/* 底部信息 */}
              <div className="absolute bottom-2 left-2 right-2 bg-white/10 backdrop-blur-xl rounded-lg p-2">
                <div className="text-white text-xs font-bold">镜头 {result.combination}</div>
                <div className="text-white/60 text-xs">{result.duration}秒</div>
              </div>
              
              {/* 序号 */}
              <div className="absolute top-2 left-2 bg-white/20 backdrop-blur-lg rounded px-2 py-1">
                <span className="text-white text-xs font-bold">#{idx + 1}</span>
              </div>
            </>
          ) : result.status === 'generating' ? (
            <div className="flex items-center justify-center h-full">
              {/* 进度环 */}
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{result.progress}%</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-200">
              <div className="text-center">
                <span className="material-icons-round text-gray-400 text-2xl">hourglass_empty</span>
                <div className="text-xs text-gray-400 mt-1">等待生成</div>
              </div>
            </div>
          )}
        </div>
        
        {/* 操作按钮（仅完成状态） */}
        {result.status === 'completed' && (
          <div className="flex gap-2 mt-2">
            <button className="flex-1 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20">
              下载
            </button>
            <button className="flex-1 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-semibold hover:bg-emerald-100">
              预览
            </button>
          </div>
        )}
      </div>
    ))}
  </div>
</div>
```

---

### 3. 顶部导航栏

**设计要点**：
- 白色背景，底部边框 `border-gray-200`
- 左侧：返回按钮 + 页面标题 + 项目名称
- 右侧：分镜数量提示

**代码参考**：
```tsx
<div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
  <div className="flex items-center gap-3">
    <button
      onClick={() => navigate('/projects')}
      className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
    >
      <span className="material-icons-round text-gray-600">arrow_back</span>
    </button>
    <div>
      <div className="font-bold text-sm text-gray-900">视频裂变</div>
      <div className="text-xs text-gray-500">项目：{projectName}</div>
    </div>
  </div>
  <div className="text-xs text-gray-500">
    共 {frameCount} 个分镜
  </div>
</div>
```

---

## 交互设计

### 裂变生成流程
1. 点击"开始裂变"按钮
2. 显示生成进度（每个裂变视频独立进度）
3. 完成后显示下载/预览按钮
4. 失败时显示错误提示

### 视频预览交互
1. 点击左侧边栏的视频片段：弹窗播放
2. 点击裂变结果的预览按钮：弹窗播放
3. 键盘 ← → 切换，ESC 关闭

---

## 数据流

**输入数据**：
- `projectId`: 项目ID
- `exportUrl`: Step4 合成的最终视频 URL
- `clipVideoUrls`: Step4 的视频片段列表
- `script`: Step3 的分镜脚本信息
- `step4Step3HandoffPayload.frames`: 分镜图片列表（全部参与裂变）

**裂变参数**：
- `fissionCount`: 裂变数量（3/6/9）
- `fissionStyle`: 裂变风格（随机组合/镜像翻转/速度变化/风格迁移）

**输出数据**：
- `fissionResults`: 裂变视频列表（URL、组合信息、状态）

---

## 技术实现要点

1. **复用组件**：
   - `ProjectFlowHistorySidebar`：左侧历史侧边栏
   - `HistoryStep4Panel`：视频片段展示
   - `HistoryStep3Panel`：分镜图片展示
   - 图片/视频预览模态框逻辑（参考 Step5）

2. **状态管理**：
   - 使用 `useAppStore` 管理全局状态
   - 分镜选择状态使用本地 `useState`
   - 裂变生成进度使用实时更新（可通过 SSE 或轮询）

3. **样式一致性**：
   - 使用 Tailwind CSS
   - 遵循现有颜色变量（primary、gray、emerald、amber）
   - 图标使用 `material-icons-round`

4. **响应式设计**：
   - 左侧边栏仅在大屏显示（`lg:w-[400px]`）
   - 小屏时主内容区自适应宽度
   - 分镜网格根据屏幕宽度调整列数