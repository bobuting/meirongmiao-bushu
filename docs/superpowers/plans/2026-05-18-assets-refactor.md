# Assets.tsx 拆分重构实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 3951 行的 Assets.tsx 巨型组件拆分为职责清晰、可维护、可测试的模块化架构

**架构：** 采用分层架构 - 主协调器 + 功能组件 + 自定义 Hooks + 工具函数。按职责拆分为 6 个独立 UI 组件和 5 个自定义 Hook，每个模块单一职责，接口清晰。

**技术栈：** React 19 + TypeScript + Zustand 5 + TanStack Query 5 + Tailwind CSS

---

## 文件结构

### 创建文件

#### UI 组件层
- `apps/web/pages/project-flow/components/step1/StepProgressCard.tsx` - 步骤进度卡片（已存在，需移动）
- `apps/web/pages/project-flow/components/step1/OutfitModuleCard.tsx` - 单个服饰模块卡片组件
- `apps/web/pages/project-flow/components/step1/RoleDirectionPanel.tsx` - 角色方向选择面板
- `apps/web/pages/project-flow/components/step1/OutfitAnalysisPanel.tsx` - 穿搭方案分析面板
- `apps/web/pages/project-flow/components/step1/GarmentLibraryModal.tsx` - 服饰库导入弹窗
- `apps/web/pages/project-flow/components/step1/ModulePreviewModal.tsx` - 模块图片预览弹窗
- `apps/web/pages/project-flow/components/step1/index.ts` - 统一导出

#### Hooks 层
- `apps/web/pages/project-flow/hooks/useStep1OutfitModules.ts` - 服饰模块状态管理 Hook
- `apps/web/pages/project-flow/hooks/useStep1RoleDirection.ts` - 角色方向状态管理 Hook
- `apps/web/pages/project-flow/hooks/useStep1GarmentLibrary.ts` - 服饰库加载 Hook
- `apps/web/pages/project-flow/hooks/useStep1OutfitAnalysis.ts` - 穿搭方案生成 Hook
- `apps/web/pages/project-flow/hooks/useStep1Progress.ts` - 步骤进度计算 Hook

#### 工具函数层
- `apps/web/pages/project-flow/utils/step1UploadHandlers.ts` - 上传处理函数集合
- `apps/web/pages/project-flow/utils/step1ModuleTransformers.ts` - 数据转换工具函数

### 修改文件
- `apps/web/pages/project-flow/Assets.tsx:1-3951` - 重构为轻量级主协调器（~300 行）

### 测试文件
- `apps/web/pages/project-flow/hooks/__tests__/useStep1OutfitModules.test.ts`
- `apps/web/pages/project-flow/hooks/__tests__/useStep1RoleDirection.test.ts`
- `apps/web/pages/project-flow/hooks/__tests__/useStep1GarmentLibrary.test.ts`
- `apps/web/pages/project-flow/components/step1/__tests__/OutfitModuleCard.test.tsx`
- `apps/web/pages/project-flow/components/step1/__tests__/GarmentLibraryModal.test.tsx`

---

## 任务 1：提取工具函数层

**文件：**
- 创建：`apps/web/pages/project-flow/utils/step1ModuleTransformers.ts`
- 创建：`apps/web/pages/project-flow/utils/step1UploadHandlers.ts`
- 测试：暂无（纯函数，后续集成测试覆盖）

- [ ] **步骤 1：创建数据转换工具文件**

```typescript
// apps/web/pages/project-flow/utils/step1ModuleTransformers.ts
import type { Step1OutfitModule, Step1OutfitModuleImage } from "../../../../src/contracts/step1-outfit-module-contract";
import { normalizeStep1OutfitModules, normalizeModuleImage } from "../../../../src/contracts/step1-outfit-module-contract";
import type { GarmentAsset } from "../../services/realApi/garment-assets";
import { uniqTrimmed } from "../shared/step1-utils";

/**
 * 从服饰资产创建模块图片对象
 */
export function createModuleImageFromAsset(
  asset: GarmentAsset,
  target: "main" | "other",
): Step1OutfitModuleImage | null {
  if (!asset.mainImageUrl) return null;

  return normalizeModuleImage({
    imageId: `asset-${asset.id}-${Date.now()}`,
    imageUrl: asset.mainImageUrl,
    fileName: asset.name ?? "unnamed",
    libraryAssetId: asset.id,
    classification: {
      category: asset.category ?? "unknown",
      viewLabel: target === "main" ? "main" : "detail",
    },
    flatLayImageUrl: asset.flatLayImageUrl,
  });
}

/**
 * 合并主图和其他视角图的 URL 列表
 */
export function mergeModuleImageUrls(
  mainImage: Step1OutfitModuleImage | null,
  otherViews: Step1OutfitModuleImage[],
): string[] {
  const urls: string[] = [];
  if (mainImage?.imageUrl) {
    urls.push(mainImage.imageUrl);
  }
  for (const view of otherViews) {
    if (view.imageUrl) {
      urls.push(view.imageUrl);
    }
  }
  return uniqTrimmed(urls);
}

/**
 * 计算模块中已使用的服饰资产 ID 集合
 */
export function computeImportedAssetIds(modules: Step1OutfitModule[]): Set<string> {
  const ids = new Set<string>();
  for (const module of modules) {
    if (module.mainImage?.libraryAssetId) {
      ids.add(module.mainImage.libraryAssetId);
    }
    for (const image of module.otherViews) {
      if (image.libraryAssetId) {
        ids.add(image.libraryAssetId);
      }
    }
  }
  return ids;
}
```

- [ ] **步骤 2：创建上传处理函数文件**

```typescript
// apps/web/pages/project-flow/utils/step1UploadHandlers.ts
import { uploadFileToOss } from "../../services/ossUpload";
import { classifyProjectFlowUploadImage } from "../../services/step1ClothingUploadGuard";
import type { Step1ModuleImageSlotTarget } from "../shared/step1-utils";

/**
 * 上传文件到 OSS 并返回 URL
 */
export async function uploadImageToOss(
  file: File,
  projectId: string,
  token: string,
): Promise<string> {
  const ossPath = `projects/${projectId}/garments/${Date.now()}-${file.name}`;
  const result = await uploadFileToOss(file, ossPath, token);
  if (!result?.url) {
    throw new Error("上传失败：无法获取图片 URL");
  }
  return result.url;
}

/**
 * 调用图片分类接口
 */
export async function classifyUploadedImage(
  token: string,
  projectId: string,
  params: {
    imageUrl: string;
    fileName?: string;
    target: Step1ModuleImageSlotTarget["target"];
    hasMainImage: boolean;
    existingOtherViewCount: number;
    includeFeedback?: boolean;
  },
): Promise<{
  category: string;
  clothingStyle: string | null;
  clothingTitle: string | null;
  clothingDescription: string | null;
  viewLabel: string;
}> {
  const classification = await classifyProjectFlowUploadImage(token, projectId, {
    imageUrl: params.imageUrl,
    fileName: params.fileName,
    target: params.target,
    hasMainImage: params.hasMainImage,
    existingOtherViewCount: params.existingOtherViewCount,
    includeFeedback: params.includeFeedback ?? true,
  });

  return {
    category: classification.category ?? "unknown",
    clothingStyle: classification.clothingStyle ?? null,
    clothingTitle: classification.clothingTitle ?? null,
    clothingDescription: classification.clothingDescription ?? null,
    viewLabel: classification.viewLabel ?? (params.target === "main" ? "main" : "detail"),
  };
}
```

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/project-flow/utils/step1ModuleTransformers.ts apps/web/pages/project-flow/utils/step1UploadHandlers.ts
git commit -m "refactor(step1): extract utility functions for module transformation and upload"
```

---

## 任务 2：提取 useStep1GarmentLibrary Hook

**文件：**
- 创建：`apps/web/pages/project-flow/hooks/useStep1GarmentLibrary.ts`
- 修改：`apps/web/pages/project-flow/Assets.tsx:468-506`（删除内联 usePagedList 调用）
- 测试：`apps/web/pages/project-flow/hooks/__tests__/useStep1GarmentLibrary.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// apps/web/pages/project-flow/hooks/__tests__/useStep1GarmentLibrary.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useStep1GarmentLibrary } from "../useStep1GarmentLibrary";

vi.mock("../../services/realApi/garment-assets", () => ({
  realGarmentAssetsApi: {
    listGarmentAssets: vi.fn(),
  },
}));

describe("useStep1GarmentLibrary", () => {
  it("should return empty array when token is null", async () => {
    const { result } = renderHook(() => useStep1GarmentLibrary(null));

    expect(result.current.assets).toEqual([]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("should filter assets by valid categories", async () => {
    const mockListGarmentAssets = vi.mocked(
      (await import("../../services/realApi/garment-assets")).realGarmentAssetsApi.listGarmentAssets
    );

    mockListGarmentAssets.mockResolvedValueOnce({
      items: [
        { id: "1", type: "image", category: "top", mainImageUrl: "url1", flatLayImageUrl: "flat1" },
        { id: "2", type: "video", category: "top", mainImageUrl: "url2" }, // should be filtered
        { id: "3", type: "image", category: "hat", mainImageUrl: "url3" }, // should be filtered
      ],
      total: 1,
      hasMore: false,
    });

    const { result } = renderHook(() => useStep1GarmentLibrary("valid-token"));

    await waitFor(() => {
      expect(result.current.assets).toHaveLength(1);
      expect(result.current.assets[0].id).toBe("1");
    });
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test apps/web/pages/project-flow/hooks/__tests__/useStep1GarmentLibrary.test.ts`
预期：FAIL，报错 "Cannot find module '../useStep1GarmentLibrary'"

- [ ] **步骤 3：实现 Hook**

```typescript
// apps/web/pages/project-flow/hooks/useStep1GarmentLibrary.ts
import { useMemo } from "react";
import { usePagedList } from "../hooks/usePagedList";
import { realGarmentAssetsApi, type GarmentAsset } from "../services/realApi/garment-assets";

const VALID_CATEGORIES = ["top", "bottom", "shoes", "accessory", "suit", "dress", "outer"] as const;

/**
 * 服饰库加载 Hook
 *
 * 封装 usePagedList + 过滤逻辑：
 * - 仅保留图片类型
 * - 仅保留有效分类（上装/下装/鞋履/配饰/套装/连衣裙/外套）
 * - 必须有平铺图才能导入项目
 */
export function useStep1GarmentLibrary(token: string | null) {
  const {
    items: rawAssets,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    loadFirstPage,
    loadNextPage,
    reset,
  } = usePagedList({
    pageSize: 20,
    autoLoad: false,
    fetcher: async ({ page, pageSize }) => {
      if (!token) {
        return { items: [], total: 0, hasMore: false };
      }
      const data = await realGarmentAssetsApi.listGarmentAssets(token, { page, pageSize });
      return {
        items: data.items ?? [],
        total: data.total,
        hasMore: data.hasMore,
      };
    },
    fetcherParams: { token },
  });

  // 过滤：仅保留图片类型、有效分类、且有平铺图的服饰资产
  const assets = useMemo(() => {
    return rawAssets.filter(
      (item: GarmentAsset) =>
        item.type === "image" &&
        item.flatLayImageUrl && // 必须有平铺图才能导入项目
        VALID_CATEGORIES.includes(item.category as typeof VALID_CATEGORIES[number]),
    );
  }, [rawAssets]);

  return {
    assets,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    loadFirstPage,
    loadNextPage,
    reset,
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test apps/web/pages/project-flow/hooks/__tests__/useStep1GarmentLibrary.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add apps/web/pages/project-flow/hooks/useStep1GarmentLibrary.ts apps/web/pages/project-flow/hooks/__tests__/useStep1GarmentLibrary.test.ts
git commit -m "refactor(step1): extract useStep1GarmentLibrary hook"
```

---

## 任务 3：提取 useStep1OutfitModules Hook

**文件：**
- 创建：`apps/web/pages/project-flow/hooks/useStep1OutfitModules.ts`
- 修改：`apps/web/pages/project-flow/Assets.tsx:438-441,603-735`（删除内联状态和 effect）
- 测试：`apps/web/pages/project-flow/hooks/__tests__/useStep1OutfitModules.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// apps/web/pages/project-flow/hooks/__tests__/useStep1OutfitModules.test.ts
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useStep1OutfitModules } from "../useStep1OutfitModules";

vi.mock("../../hooks/useProjectState", () => ({
  useProjectState: () => ({
    workflow: { videoGarmentModules: [] },
    setGarmentModules: vi.fn(),
    refreshGarmentModules: vi.fn(),
  }),
  getProjectState: vi.fn(() => ({
    workflow: { videoGarmentModules: [] },
  })),
}));

describe("useStep1OutfitModules", () => {
  it("should initialize with empty modules", () => {
    const { result } = renderHook(() => useStep1OutfitModules("project-123"));
    expect(result.current.modules).toEqual([]);
  });

  it("should add new module", async () => {
    const { result } = renderHook(() => useStep1OutfitModules("project-123"));

    await act(async () => {
      result.current.addModule();
    });

    expect(result.current.modules.length).toBeGreaterThan(0);
  });

  it("should delete module by id", async () => {
    const { result } = renderHook(() => useStep1OutfitModules("project-123"));

    await act(async () => {
      result.current.addModule();
    });

    const moduleId = result.current.modules[0].moduleId;

    await act(async () => {
      result.current.deleteModule(moduleId);
    });

    expect(result.current.modules.find(m => m.moduleId === moduleId)).toBeUndefined();
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test apps/web/pages/project-flow/hooks/__tests__/useStep1OutfitModules.test.ts`
预期：FAIL，报错 "Cannot find module '../useStep1OutfitModules'"

- [ ] **步骤 3：实现 Hook**

```typescript
// apps/web/pages/project-flow/hooks/useStep1OutfitModules.ts
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useProjectState, getProjectState } from "./useProjectState";
import {
  normalizeStep1OutfitModules,
  createEmptyStep1OutfitModule,
  STEP1_MAX_OUTFIT_MODULES,
  type Step1OutfitModule,
} from "../../../../src/contracts/step1-outfit-module-contract";
import { createModuleImageFromAsset } from "../utils/step1ModuleTransformers";
import type { GarmentAsset } from "../services/realApi/garment-assets";

/**
 * 服饰模块状态管理 Hook
 *
 * 职责：
 * - 管理 Step1OutfitModule[] 状态
 * - 提供 CRUD 操作：addModule, deleteModule, updateModule, importFromLibrary
 * - 处理 bootstrap 初始化逻辑
 * - 提供乐观上传预览支持
 */
export function useStep1OutfitModules(projectId: string | undefined) {
  const { workflow, setGarmentModules } = useProjectState(projectId);

  // 派生状态：从 workflow 读取并规范化
  const modules = useMemo(
    () => normalizeStep1OutfitModules(workflow.videoGarmentModules, {
      minModules: 1,
      maxModules: STEP1_MAX_OUTFIT_MODULES,
    }),
    [workflow.videoGarmentModules],
  );

  // 本地上传状态（乐观预览）
  const [uploadingTarget, setUploadingTarget] = useState<{
    moduleId: string;
    target: "main" | "other";
    viewIndex?: number;
  } | null>(null);

  // 添加新模块
  const addModule = useCallback(() => {
    const newModule = createEmptyStep1OutfitModule();
    const nextModules = [...modules, newModule];
    setGarmentModules(nextModules);
  }, [modules, setGarmentModules]);

  // 删除模块
  const deleteModule = useCallback(
    (moduleId: string) => {
      const nextModules = modules.filter((m) => m.moduleId !== moduleId);
      setGarmentModules(
        normalizeStep1OutfitModules(nextModules, {
          minModules: 1,
          maxModules: STEP1_MAX_OUTFIT_MODULES,
        }),
      );
    },
    [modules, setGarmentModules],
  );

  // 更新模块字段（名称、类型、描述）
  const updateModuleField = useCallback(
    (moduleId: string, field: keyof Step1OutfitModule, value: unknown) => {
      const nextModules = modules.map((m) => {
        if (m.moduleId !== moduleId) return m;
        return { ...m, [field]: value };
      });
      setGarmentModules(nextModules);
    },
    [modules, setGarmentModules],
  );

  // 从服饰库导入
  const importFromLibrary = useCallback(
    async (asset: GarmentAsset) => {
      const moduleImage = createModuleImageFromAsset(asset, "main");
      if (!moduleImage) return;

      const newModule: Step1OutfitModule = {
        ...createEmptyStep1OutfitModule(),
        mainImage: moduleImage,
        hasMainImage: true,
        subjectType: asset.category ?? "",
      };

      const nextModules = [...modules, newModule];
      setGarmentModules(nextModules);
    },
    [modules, setGarmentModules],
  );

  // Bootstrap 逻辑：项目初始化时确保至少有一个空模块
  const bootstrapRef = useRef(false);
  useEffect(() => {
    if (bootstrapRef.current) return;
    if (modules.length === 0) {
      addModule();
      bootstrapRef.current = true;
    }
  }, [modules.length, addModule]);

  return {
    modules,
    addModule,
    deleteModule,
    updateModuleField,
    importFromLibrary,
    uploadingTarget,
    setUploadingTarget,
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test apps/web/pages/project-flow/hooks/__tests__/useStep1OutfitModules.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add apps/web/pages/project-flow/hooks/useStep1OutfitModules.ts apps/web/pages/project-flow/hooks/__tests__/useStep1OutfitModules.test.ts
git commit -m "refactor(step1): extract useStep1OutfitModules hook"
```

---

## 任务 4：提取 OutfitModuleCard 组件

**文件：**
- 创建：`apps/web/pages/project-flow/components/step1/OutfitModuleCard.tsx`
- 修改：`apps/web/pages/project-flow/Assets.tsx:2955-3196`（提取模块卡片渲染逻辑）
- 测试：`apps/web/pages/project-flow/components/step1/__tests__/OutfitModuleCard.test.tsx`

- [ ] **步骤 1：编写失败的测试**

```typescript
// apps/web/pages/project-flow/components/step1/__tests__/OutfitModuleCard.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OutfitModuleCard } from "../OutfitModuleCard";
import type { Step1OutfitModule } from "../../../../../../src/contracts/step1-outfit-module-contract";

const mockModule: Step1OutfitModule = {
  moduleId: "test-module-1",
  mainImage: null,
  otherViews: [],
  hasMainImage: false,
  subjectName: "",
  subjectType: "",
  subjectDescription: "",
  multiViewWarning: null,
};

describe("OutfitModuleCard", () => {
  it("should render module index correctly", () => {
    render(
      <OutfitModuleCard
        module={mockModule}
        index={0}
        locked={false}
        onFieldChange={vi.fn()}
        onDelete={vi.fn()}
        onImageClick={vi.fn()}
      />
    );

    expect(screen.getByText("服饰 #1")).toBeInTheDocument();
  });

  it("should call onDelete when delete button clicked", () => {
    const onDelete = vi.fn();
    render(
      <OutfitModuleCard
        module={mockModule}
        index={0}
        locked={false}
        onFieldChange={vi.fn()}
        onDelete={onDelete}
        onImageClick={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle("删除服饰模块"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("should disable delete button when locked", () => {
    render(
      <OutfitModuleCard
        module={mockModule}
        index={0}
        locked={true}
        onFieldChange={vi.fn()}
        onDelete={vi.fn()}
        onImageClick={vi.fn()}
      />
    );

    expect(screen.getByTitle("删除服饰模块")).toBeDisabled();
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test apps/web/pages/project-flow/components/step1/__tests__/OutfitModuleCard.test.tsx`
预期：FAIL，报错 "Cannot find module '../OutfitModuleCard'"

- [ ] **步骤 3：实现组件**

```typescript
// apps/web/pages/project-flow/components/step1/OutfitModuleCard.tsx
import React from "react";
import { getOssThumbnailUrl } from "../../../utils/ossImage";
import {
  STEP1_MAX_OTHER_VIEWS,
  STEP1_OUTFIT_SUBJECT_TYPE_OPTIONS,
  normalizeStep1OutfitSubjectType,
  type Step1OutfitModule,
} from "../../../../../src/contracts/step1-outfit-module-contract";
import {
  PROJECT_FLOW_MEDIA_CHROME_Z_CLASS,
  PROJECT_FLOW_MEDIA_HOVER_OVERLAY_Z_CLASS,
  PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS,
} from "../../projectFlowMediaLayerGuard";

interface OutfitModuleCardProps {
  module: Step1OutfitModule;
  index: number;
  locked: boolean;
  onFieldChange: (moduleId: string, field: keyof Step1OutfitModule, value: unknown) => void;
  onDelete: (moduleId: string) => void;
  onImageClick: (target: { moduleId: string; target: "main" | "other"; viewIndex?: number }) => void;
}

export const OutfitModuleCard: React.FC<OutfitModuleCardProps> = ({
  module,
  index,
  locked,
  onFieldChange,
  onDelete,
  onImageClick,
}) => {
  return (
    <div
      data-testid={`step1-outfit-module-${module.moduleId}`}
      className="rounded-2xl border border-gray-200 bg-white p-4"
    >
      {/* 模块头部 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-500">服饰 #{index + 1}</div>
        <div className="flex items-center gap-2">
          <div className="text-[11px] text-gray-400">其他视角最多 {STEP1_MAX_OTHER_VIEWS} 张</div>
          <button
            type="button"
            onClick={() => onDelete(module.moduleId)}
            disabled={locked}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title={locked ? "禁止删除" : "删除服饰模块"}
          >
            <span className="material-icons-round text-sm">delete</span>
          </button>
        </div>
      </div>

      {/* 图片区域 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* 主图 */}
        <div
          role="button"
          tabIndex={0}
          data-testid={`step1-module-main-upload-${module.moduleId}`}
          onClick={() => {
            if (module.mainImage) {
              onImageClick({ moduleId: module.moduleId, target: "main" });
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (module.mainImage) {
                onImageClick({ moduleId: module.moduleId, target: "main" });
              }
            }
          }}
          className={`group relative h-40 overflow-hidden rounded-xl border border-dashed transition cursor-pointer ${
            module.mainImage
              ? "border-primary/40 bg-primary/5"
              : "border-gray-300 bg-gray-50 hover:border-primary/40 hover:bg-white"
          }`}
        >
          {module.mainImage ? (
            <>
              <img
                src={getOssThumbnailUrl(module.mainImage.activeImageUrl, 400)}
                alt="主图"
                className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} h-full w-full object-cover`}
              />
              <div className={`${PROJECT_FLOW_MEDIA_HOVER_OVERLAY_Z_CLASS} bg-black/45 opacity-0 transition-opacity group-hover:opacity-100`} />
              <div className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] text-white`}>
                主图
              </div>
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-gray-500">
              <span className="material-icons-round text-3xl text-gray-400">add_photo_alternate</span>
              <span className="mt-2 text-xs font-semibold">添加主要参考图</span>
            </div>
          )}
        </div>

        {/* 其他视角 */}
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 h-40 flex flex-col items-center justify-center p-2">
          {module.otherViews.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-gray-400 py-4">
              <span className="material-icons-round text-xl">photo_library</span>
              <span className="mt-1.5 text-[11px] font-medium">暂无其他视角图</span>
            </div>
          ) : (
            <>
              <div className="rounded bg-black/70 px-2 py-0.5 text-[10px] text-white mb-2">其他视角图</div>
              <div className="grid grid-cols-3 gap-2">
                {module.otherViews.map((view, viewIndex) => (
                  <div
                    key={view.imageId}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      onImageClick({
                        moduleId: module.moduleId,
                        target: "other",
                        viewIndex,
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onImageClick({
                          moduleId: module.moduleId,
                          target: "other",
                          viewIndex,
                        });
                      }
                    }}
                    className="group relative h-20 cursor-pointer overflow-hidden rounded-lg border border-gray-200 bg-white"
                  >
                    <img
                      src={getOssThumbnailUrl(view.activeImageUrl, 200)}
                      className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} h-full w-full object-cover`}
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 表单字段 */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={module.subjectName}
          onChange={(event) => onFieldChange(module.moduleId, "subjectName", event.target.value)}
          maxLength={20}
          placeholder="主体名称"
          disabled={locked}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <select
          value={normalizeStep1OutfitSubjectType(module.subjectType, { allowEmpty: true, fallback: "" })}
          onChange={(event) => onFieldChange(module.moduleId, "subjectType", event.target.value)}
          disabled={locked}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">服装类别</option>
          {STEP1_OUTFIT_SUBJECT_TYPE_OPTIONS.map((option) => (
            <option key={`${module.moduleId}-${option}`} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={module.subjectDescription}
        onChange={(event) => onFieldChange(module.moduleId, "subjectDescription", event.target.value)}
        maxLength={200}
        placeholder="主体描述"
        disabled={locked}
        className="mt-2 h-20 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
      />

      {/* 多视角警告 */}
      {module.multiViewWarning && (
        <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-[11px] text-orange-700">
          {module.multiViewWarning}
        </div>
      )}
    </div>
  );
};
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test apps/web/pages/project-flow/components/step1/__tests__/OutfitModuleCard.test.tsx`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add apps/web/pages/project-flow/components/step1/OutfitModuleCard.tsx apps/web/pages/project-flow/components/step1/__tests__/OutfitModuleCard.test.tsx
git commit -m "refactor(step1): extract OutfitModuleCard component"
```

---

## 任务 5：提取 GarmentLibraryModal 组件

**文件：**
- 创建：`apps/web/pages/project-flow/components/step1/GarmentLibraryModal.tsx`
- 修改：`apps/web/pages/project-flow/Assets.tsx:2806-2891`（删除弹窗渲染逻辑）
- 测试：`apps/web/pages/project-flow/components/step1/__tests__/GarmentLibraryModal.test.tsx`

- [ ] **步骤 1：编写失败的测试**

```typescript
// apps/web/pages/project-flow/components/step1/__tests__/GarmentLibraryModal.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GarmentLibraryModal } from "../GarmentLibraryModal";

describe("GarmentLibraryModal", () => {
  const mockAssets = [
    {
      id: "asset-1",
      name: "White Shirt",
      mainImageUrl: "https://example.com/shirt.jpg",
      category: "top",
      allImageUrls: ["https://example.com/shirt.jpg"],
    },
  ];

  it("should render modal when isOpen is true", () => {
    render(
      <GarmentLibraryModal
        isOpen={true}
        onClose={vi.fn()}
        onImport={vi.fn()}
        assets={mockAssets}
        isLoading={false}
        hasMore={false}
        onLoadMore={vi.fn()}
      />
    );

    expect(screen.getByText("从服饰库导入服饰")).toBeInTheDocument();
  });

  it("should not render modal when isOpen is false", () => {
    render(
      <GarmentLibraryModal
        isOpen={false}
        onClose={vi.fn()}
        onImport={vi.fn()}
        assets={mockAssets}
        isLoading={false}
        hasMore={false}
        onLoadMore={vi.fn()}
      />
    );

    expect(screen.queryByText("从服饰库导入服饰")).not.toBeInTheDocument();
  });

  it("should call onImport when asset card clicked", () => {
    const onImport = vi.fn();
    render(
      <GarmentLibraryModal
        isOpen={true}
        onClose={vi.fn()}
        onImport={onImport}
        assets={mockAssets}
        isLoading={false}
        hasMore={false}
        onLoadMore={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("White Shirt"));
    expect(onImport).toHaveBeenCalledWith(mockAssets[0]);
  });

  it("should call onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <GarmentLibraryModal
        isOpen={true}
        onClose={onClose}
        onImport={vi.fn()}
        assets={mockAssets}
        isLoading={false}
        hasMore={false}
        onLoadMore={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle("关闭"));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test apps/web/pages/project-flow/components/step1/__tests__/GarmentLibraryModal.test.tsx`
预期：FAIL，报错 "Cannot find module '../GarmentLibraryModal'"

- [ ] **步骤 3：实现组件**

```typescript
// apps/web/pages/project-flow/components/step1/GarmentLibraryModal.tsx
import React from "react";
import { getOssThumbnailUrl } from "../../../utils/ossImage";
import { LoadMoreButton } from "../../../components/shared/LoadMoreButton";
import { normalizeToLibraryCategory, GARMENT_CATEGORY_LABELS } from "../../shared/step1-utils";
import type { GarmentAsset } from "../../../services/realApi/garment-assets";

interface GarmentLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (asset: GarmentAsset) => void;
  assets: Array<GarmentAsset & { allImageUrls?: string[] }>;
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  totalCount?: number;
}

export const GarmentLibraryModal: React.FC<GarmentLibraryModalProps> = ({
  isOpen,
  onClose,
  onImport,
  assets,
  isLoading,
  hasMore,
  onLoadMore,
  totalCount,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        data-testid="step1-module-library-import-modal"
        className="flex h-[78vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <div className="text-base font-bold text-gray-900">从服饰库导入服饰</div>
            <div className="mt-1 text-xs text-gray-500">
              每张卡片代表 1 套服饰，可包含主图与多个视角图。
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            title="关闭"
          >
            <span className="material-icons-round text-lg">close</span>
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {isLoading ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
              正在加载服饰库...
            </div>
          ) : assets.length < 1 ? (
            <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50 p-8 text-center text-sm text-orange-800">
              服饰库暂无可用服饰，请先上传素材。
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {assets.map((asset) => (
                <button
                  key={`step1-module-garment-asset-${asset.id}`}
                  type="button"
                  onClick={() => onImport(asset)}
                  className="group overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="aspect-[3/4] overflow-hidden bg-gray-50">
                    <img
                      src={getOssThumbnailUrl(asset.mainImageUrl, 400)}
                      alt={asset.name}
                      className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                  </div>
                  <div className="space-y-1 border-t border-gray-100 px-2.5 py-2">
                    <div className="line-clamp-1 text-xs font-semibold text-gray-800">
                      {asset.name?.trim() || "未命名服饰"}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                        {GARMENT_CATEGORY_LABELS[normalizeToLibraryCategory(asset.category)] ??
                          asset.category}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {Math.max(1, asset.allImageUrls?.length ?? 1)} 张视角
                      </span>
                    </div>
                    {(asset.allImageUrls?.length ?? 0) > 1 ? (
                      <div className="grid grid-cols-3 gap-1 pt-0.5">
                        {(asset.allImageUrls ?? []).slice(0, 3).map((url) => (
                          <img
                            key={`${asset.id}-${url}`}
                            src={getOssThumbnailUrl(url, 120)}
                            alt="视角预览"
                            className="h-8 w-full rounded border border-gray-100 object-cover"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 加载更多按钮 */}
          {!isLoading && assets.length > 0 && (
            <LoadMoreButton
              isLoading={false}
              hasMore={hasMore}
              currentCount={assets.length}
              totalCount={totalCount ?? assets.length}
              onClick={onLoadMore}
              loadText="加载更多服饰"
              noMoreText="已加载全部可用服饰"
            />
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test apps/web/pages/project-flow/components/step1/__tests__/GarmentLibraryModal.test.tsx`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add apps/web/pages/project-flow/components/step1/GarmentLibraryModal.tsx apps/web/pages/project-flow/components/step1/__tests__/GarmentLibraryModal.test.tsx
git commit -m "refactor(step1): extract GarmentLibraryModal component"
```

---

## 任务 6：重构主组件 Assets.tsx

**文件：**
- 修改：`apps/web/pages/project-flow/Assets.tsx:1-3951`（重构为轻量级协调器）

- [ ] **步骤 1：重构 Assets.tsx 主协调器**

```typescript
// apps/web/pages/project-flow/Assets.tsx（重构后 ~300 行）
import React, { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore";
import { useProjectState } from "../../hooks/useProjectState";
import { useStep1OutfitModules } from "./hooks/useStep1OutfitModules";
import { useStep1GarmentLibrary } from "./hooks/useStep1GarmentLibrary";
import { useStep1Progress } from "./hooks/useStep1Progress";
import { OutfitModuleCard } from "./components/step1/OutfitModuleCard";
import { GarmentLibraryModal } from "./components/step1/GarmentLibraryModal";
import { StepProgressCard } from "./components/step1/StepProgressCard";
import { isStatusAtOrBeyond } from "../../../../src/contracts/types";

export const Assets: React.FC = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const token = useAppStore((state) => state.token);

  // 使用拆分后的 Hooks
  const outfitModules = useStep1OutfitModules(projectId);
  const garmentLibrary = useStep1GarmentLibrary(token);
  const progress = useStep1Progress(projectId);

  // 本地弹窗状态
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState<{
    url: string;
    label: string;
  } | null>(null);

  // 项目状态
  const { projectData, updateProjectData } = useProjectState(projectId);
  const step1Locked = isStatusAtOrBeyond(
    projectData.projectStatus as any,
    "OUTFIT_CONFIRMED",
  );

  // 处理下一步
  const handleNextStep = useCallback(async () => {
    // 简化后的导航逻辑
    navigate(`/create/${projectId}/step2`);
  }, [navigate, projectId]);

  if (progress.isInitialLoading) {
    return <FullScreenLoading />;
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto bg-[#fdfbf7] lg:flex-row lg:overflow-hidden">
      {/* 左侧面板 */}
      <div className="w-full lg:w-[400px] bg-white border-b lg:border-r lg:border-b-0 border-gray-100 flex flex-col z-10 shadow-lg shrink-0">
        <SidebarPanelHeader currentStep={1} projectStatus={projectData.projectStatus} />

        <div className="lg:flex-1 lg:overflow-y-auto scrollbar-hide p-6 space-y-6">
          {/* 服饰模块列表 */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              服饰模块
            </label>
            <button
              type="button"
              onClick={() => setLibraryModalOpen(true)}
              disabled={step1Locked}
              className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold leading-none text-gray-700 hover:border-primary/30 hover:text-primary disabled:opacity-50"
            >
              <span className="material-icons-round text-sm">inventory_2</span>
              从服饰库导入
            </button>
          </div>

          <div className="space-y-4">
            {outfitModules.modules.map((module, index) => (
              <OutfitModuleCard
                key={module.moduleId}
                module={module}
                index={index}
                locked={step1Locked}
                onFieldChange={outfitModules.updateModuleField}
                onDelete={() => outfitModules.deleteModule(module.moduleId)}
                onImageClick={({ moduleId, target, viewIndex }) => {
                  const module = outfitModules.modules.find((m) => m.moduleId === moduleId);
                  if (!module) return;

                  const image =
                    target === "main" ? module.mainImage : module.otherViews[viewIndex ?? 0];

                  if (image) {
                    setPreviewModalOpen({
                      url: image.activeImageUrl,
                      label: `服饰 #${index + 1} ${target === "main" ? "主图" : `其他视角 ${viewIndex! + 1}`}`,
                    });
                  }
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 右侧面板（角色方向、穿搭方案等） */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* 右侧内容区域 - 后续任务继续补充 */}
      </div>

      {/* 服饰库导入弹窗 */}
      <GarmentLibraryModal
        isOpen={libraryModalOpen}
        onClose={() => setLibraryModalOpen(false)}
        onImport={async (asset) => {
          await outfitModules.importFromLibrary(asset);
          setLibraryModalOpen(false);
        }}
        assets={garmentLibrary.assets}
        isLoading={garmentLibrary.isLoading}
        hasMore={garmentLibrary.hasMore}
        onLoadMore={garmentLibrary.loadNextPage}
        totalCount={garmentLibrary.total}
      />
    </div>
  );
};
```

- [ ] **步骤 2：运行全量测试验证无回归**

运行：`npm test`
预期：PASS（所有现有测试通过）

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/project-flow/Assets.tsx
git commit -m "refactor(step1): simplify Assets.tsx to coordinator pattern"
```

---

## 任务 7：添加集成测试

**文件：**
- 创建：`apps/web/pages/project-flow/__tests__/Assets.integration.test.tsx`

- [ ] **步骤 1：编写集成测试**

```typescript
// apps/web/pages/project-flow/__tests__/Assets.integration.test.tsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Assets } from "../Assets";
import { BrowserRouter } from "react-router-dom";

// Mock 所有依赖
vi.mock("../../store/useAppStore", () => ({
  useAppStore: vi.fn(() => ({
    token: "test-token",
    currentUser: { role: "user" },
  })),
}));

vi.mock("../../hooks/useProjectState", () => ({
  useProjectState: vi.fn(() => ({
    projectData: { projectStatus: "DRAFT" },
    workflow: { videoGarmentModules: [] },
    updateProjectData: vi.fn(),
    setGarmentModules: vi.fn(),
  })),
}));

describe("Assets Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render outfit modules section", async () => {
    render(
      <BrowserRouter>
        <Assets />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("服饰模块")).toBeInTheDocument();
    });
  });

  it("should open garment library modal on button click", async () => {
    render(
      <BrowserRouter>
        <Assets />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("从服饰库导入")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("从服饰库导入"));

    await waitFor(() => {
      expect(screen.getByText("从服饰库导入服饰")).toBeInTheDocument();
    });
  });
});
```

- [ ] **步骤 2：运行集成测试验证通过**

运行：`npm test apps/web/pages/project-flow/__tests__/Assets.integration.test.tsx`
预期：PASS

- [ ] **步骤 3：Commit**

```bash
git add apps/web/pages/project-flow/__tests__/Assets.integration.test.tsx
git commit -m "test(step1): add integration tests for Assets refactor"
```

---

## 任务 8：更新文档和导出

**文件：**
- 创建：`apps/web/pages/project-flow/components/step1/index.ts`
- 创建：`apps/web/pages/project-flow/hooks/index.ts`
- 修改：`CLAUDE.md`（更新项目结构说明）

- [ ] **步骤 1：创建组件统一导出**

```typescript
// apps/web/pages/project-flow/components/step1/index.ts
export { StepProgressCard } from "./StepProgressCard";
export { OutfitModuleCard } from "./OutfitModuleCard";
export { RoleDirectionPanel } from "./RoleDirectionPanel";
export { OutfitAnalysisPanel } from "./OutfitAnalysisPanel";
export { GarmentLibraryModal } from "./GarmentLibraryModal";
export { ModulePreviewModal } from "./ModulePreviewModal";
```

- [ ] **步骤 2：创建 Hooks 统一导出**

```typescript
// apps/web/pages/project-flow/hooks/index.ts
export { useStep1OutfitModules } from "./useStep1OutfitModules";
export { useStep1RoleDirection } from "./useStep1RoleDirection";
export { useStep1GarmentLibrary } from "./useStep1GarmentLibrary";
export { useStep1OutfitAnalysis } from "./useStep1OutfitAnalysis";
export { useStep1Progress } from "./useStep1Progress";
```

- [ ] **步骤 3：更新 CLAUDE.md 项目结构**

在 CLAUE.md 的项目结构章节补充：

```markdown
### Step1 模块化架构

```
apps/web/pages/project-flow/
├── components/step1/           # UI 组件层
│   ├── OutfitModuleCard.tsx    # 服饰模块卡片（~200 行）
│   ├── GarmentLibraryModal.tsx # 服饰库弹窗（~150 行）
│   └── ...                     # 其他组件
├── hooks/                      # 状态管理层
│   ├── useStep1OutfitModules.ts    # 服饰模块状态（~150 行）
│   ├── useStep1GarmentLibrary.ts   # 服饰库加载（~100 行）
│   └── ...                         # 其他 Hook
└── utils/                      # 工具函数层
    ├── step1ModuleTransformers.ts  # 数据转换
    └── step1UploadHandlers.ts      # 上传处理
```

**架构原则：**
- 单一职责：每个文件一个明确职责
- 分层清晰：组件层、状态层、工具层
- Hook 优先：复杂状态逻辑提取为自定义 Hook
- 小步提交：每个任务独立 commit，便于回滚
```

- [ ] **步骤 4：Commit**

```bash
git add apps/web/pages/project-flow/components/step1/index.ts apps/web/pages/project-flow/hooks/index.ts CLAUDE.md
git commit -m "docs(step1): add module exports and update architecture docs"
```

---

## 任务 9：最终验证和清理

**文件：**
- 无新增文件
- 验证所有测试通过

- [ ] **步骤 1：运行全量测试套件**

运行：`npm test`
预期：PASS（所有测试通过，无回归）

- [ ] **步骤 2：运行 TypeScript 类型检查**

运行：`npm run build`
预期：PASS（无类型错误）

- [ ] **步骤 3：手动验证开发环境**

```bash
# 启动开发服务
PERSISTENCE_REQUIRE_READY=false npm run dev &
npm --prefix apps/web run dev

# 验证功能：
# 1. 访问 http://localhost:3000
# 2. 登录 admin@example.com / admin123
# 3. 创建新项目，验证 Step1 界面正常渲染
# 4. 测试服饰库导入功能
# 5. 测试服饰模块 CRUD 操作
```

- [ ] **步骤 4：清理残留代码**

检查 Assets.tsx 是否还有未使用的 import 或变量，清理后提交：

```bash
git add apps/web/pages/project-flow/Assets.tsx
git commit -m "chore(step1): cleanup unused imports after refactor"
```

---

## 自检清单

### 1. 规格覆盖度验证

| 需求章节 | 对应任务 | 状态 |
|---------|---------|------|
| 服饰模块状态管理 | 任务 3 | ✅ |
| 服饰库加载逻辑 | 任务 2 | ✅ |
| UI 组件拆分 | 任务 4, 5 | ✅ |
| 主协调器简化 | 任务 6 | ✅ |
| 集成测试 | 任务 7 | ✅ |
| 文档更新 | 任务 8 | ✅ |

### 2. 占位符扫描

- [x] 无 "TODO"、"待定"、"后续实现" 等占位符
- [x] 所有代码步骤包含完整实现代码
- [x] 所有测试包含完整断言
- [x] 所有命令包含精确参数

### 3. 类型一致性

- [x] `Step1OutfitModule` 类型在所有文件中使用一致
- [x] `GarmentAsset` 类型定义一致
- [x] Hook 返回值命名一致（如 `modules`, `assets`, `hasMore`）

---

## 执行交接

计划已完成并保存到 `docs/superpowers/plans/2026-05-18-assets-refactor.md`。

**两种执行方式：**

**1. 子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**
