/**
 * 换装项目 Step 2 - 选择服装
 * 布局风格对齐视频项目 Step1：左侧栏 + 右侧操作区
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from 'react-router';
import { Button } from "../../components/ui/Button";
import { LoadMoreButton } from "../../components/shared/LoadMoreButton";
import { useAppStore } from "../../store/useAppStore";
import { useProjectState } from "../../hooks/useProjectState";
import { usePagedList } from "../../hooks/usePagedList";
import { SidebarPanelHeader } from "../../components/project-flow/SidebarPanelHeader";
import { BlurFillImage } from "../../components/shared/BlurFillImage";
import { AssetModal } from "../../components/shared/AssetModal";
import { realGarmentAssetsApi, type GarmentAsset } from "../../services/realApi/garment-assets";
import { realOutfitChangeApi } from "../../services/realApi/outfit-change";
import { backendApi } from "../../services/backendApi";
import { getOssThumbnailUrl } from "../../utils/ossImage";

/** 步骤进度卡片 */
const StepProgressCard: React.FC<{
  stepNumber: number;
  title: string;
  summary: string;
  status: "completed" | "current" | "locked" | "pending";
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}> = ({ stepNumber, title, summary, status, expanded, onToggle, children }) => {
  const isCompleted = status === "completed";
  const isCurrent = status === "current";
  const isLocked = status === "locked";

  return (
    <div
      data-step={stepNumber}
      className={`
        rounded-xl border
        ${isCompleted ? "border-emerald-200 bg-emerald-50/50" : ""}
        ${isCurrent ? "border-primary/30 bg-primary/5 shadow-sm" : ""}
        ${isLocked ? "border-gray-200 bg-gray-50/50 opacity-60" : ""}
      `}
    >
      {/* 步骤头部 */}
      <div
        className={`
          flex items-center gap-3 px-4 py-3 cursor-pointer
          ${isLocked ? "cursor-not-allowed" : ""}
        `}
        onClick={() => {
          if (isLocked) return;
          onToggle();
        }}
      >
        {/* 步骤徽章 */}
        <div
          className={`
            flex items-center justify-center w-6 h-6 rounded-full text-sm font-semibold
            ${isCompleted ? "bg-emerald-500 text-white" : ""}
            ${isCurrent ? "bg-primary text-white animate-pulse" : ""}
            ${isLocked ? "bg-gray-300 text-gray-500" : ""}
          `}
        >
          {isCompleted ? (
            <span className="material-icons-round text-sm">check</span>
          ) : (
            stepNumber
          )}
        </div>

        {/* 步骤标题 */}
        <div className="flex-1 min-w-0">
          <div
            className={`
              font-medium truncate
              ${isCompleted ? "text-emerald-700" : ""}
              ${isCurrent ? "text-primary" : ""}
              ${isLocked ? "text-gray-500" : ""}
            `}
          >
            {title}
          </div>
          {(isCompleted || isLocked) && summary && (
            <div className="text-xs text-gray-500 truncate mt-0.5">{summary}</div>
          )}
        </div>

        {/* 展开/折叠图标 */}
        {!isLocked && (
          <span
            className={`
              material-icons-round text-lg transition-transform
              ${expanded ? "rotate-180" : ""}
              ${isCompleted ? "text-emerald-500" : "text-primary"}
            `}
          >
            expand_more
          </span>
        )}
      </div>

      {/* 步骤内容 */}
      <div
        className={`
          grid overflow-hidden transition-all duration-500 ease-in-out
          ${expanded && children
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
          }
        `}
      >
        <div className="overflow-hidden">
          {expanded && children && (
            <div className="px-4 pb-4 pt-1">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export const OutfitChangeStep2: React.FC = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const token = useAppStore((state) => state.token);
  const currentUser = useAppStore((state) => state.currentUser);
  const { workflow, updateWorkflow, projectData } = useProjectState(projectId);

  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(
    typeof workflow.outfitChangeSelectedGarmentId === "string"
      ? (workflow.outfitChangeSelectedGarmentId as string)
      : null
  );
  const [stepExpandState, setStepExpandState] = useState<Record<number, boolean>>({ 1: true });

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // 弹窗状态
  const [showAddModal, setShowAddModal] = useState(false);

  // 图片预览状态
  const [previewModal, setPreviewModal] = useState<{
    urls: string[];
    currentIndex: number;
    name: string;
  } | null>(null);

  // 预加载已选服装（解决分页依赖问题）
  const [preloadedSelectedGarment, setPreloadedSelectedGarment] = useState<GarmentAsset | null>(null);
  const [isLoadingPreloaded, setIsLoadingPreloaded] = useState(false);

  // 服饰库分页加载（使用 usePagedList Hook）
  const {
    items: garments,
    total: garmentsTotal,
    hasMore: garmentsHasMore,
    isLoading: isLoadingGarments,
    isLoadingMore: isLoadingMoreGarments,
    loadFirstPage: loadGarmentsFirstPage,
    loadNextPage: loadGarmentsNextPage,
    reset: resetGarments,
  } = usePagedList({
    pageSize: 20,
    autoLoad: true, // 自动加载第一页
    fetcher: async ({ page, pageSize }) => {
      if (!token || !currentUser?.id) {
        return { items: [], total: 0, hasMore: false };
      }
      const result = await realGarmentAssetsApi.listGarmentAssets(token, { page, pageSize });
      // 过滤：仅保留图片类型、有效分类、且有平铺图的服饰资产
      const filtered = (result.items ?? []).filter(
        (item) =>
          item.type === "image" &&
          item.flatLayImageUrl &&  // 必须有平铺图才能用于换装
          (item.category === "top" ||
            item.category === "bottom" ||
            item.category === "shoes" ||
            item.category === "accessory" ||
            item.category === "suit" ||
            item.category === "dress" ||
            item.category === "outer")
      );
      return { items: filtered, total: result.total, hasMore: result.hasMore };
    },
    fetcherParams: { token, currentUser },
  });

  // 初始化时单独查询已选服装
  useEffect(() => {
    const selectedId = workflow.outfitChangeSelectedGarmentId;
    if (typeof selectedId === "string" && selectedId && token) {
      // 先检查右侧数组是否已包含
      const foundInList = garments.find(g => g.id === selectedId);
      if (foundInList) {
        setPreloadedSelectedGarment(foundInList);
        return;
      }
      // 不在数组中，单独查询
      setIsLoadingPreloaded(true);
      realGarmentAssetsApi.getGarmentAsset(token, selectedId)
        .then(asset => {
          setPreloadedSelectedGarment(asset);
        })
        .catch(err => {
          console.error("[OutfitChangeStep2] 查询已选服装失败:", err);
        })
        .finally(() => {
          setIsLoadingPreloaded(false);
        });
    }
  }, [workflow.outfitChangeSelectedGarmentId, token, garments]);

  // 同步：右侧加载后如果包含已选服装，更新预加载状态
  useEffect(() => {
    const selectedId = workflow.outfitChangeSelectedGarmentId;
    if (typeof selectedId === "string" && selectedId) {
      const foundInList = garments.find(g => g.id === selectedId);
      if (foundInList && !preloadedSelectedGarment) {
        setPreloadedSelectedGarment(foundInList);
      }
    }
  }, [garments, workflow.outfitChangeSelectedGarmentId, preloadedSelectedGarment]);

  // 搜索过滤
  const filteredGarments = useMemo(() => {
    if (!searchQuery.trim()) return garments;
    return garments.filter(g => g.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [garments, searchQuery]);

  // 同步持久化的选择
  useEffect(() => {
    if (typeof workflow.outfitChangeSelectedGarmentId === "string" && !selectedGarmentId) {
      setSelectedGarmentId(workflow.outfitChangeSelectedGarmentId as string);
    }
  }, [workflow.outfitChangeSelectedGarmentId, selectedGarmentId]);

  // 切换步骤展开状态
  const toggleStepExpand = useCallback((step: number) => {
    setStepExpandState((prev) => ({ ...prev, [step]: !prev[step] }));
  }, []);

  // 选择服装
  const handleSelect = useCallback((garmentId: string) => {
    const newId = selectedGarmentId === garmentId ? null : garmentId;
    setSelectedGarmentId(newId);
    updateWorkflow({ outfitChangeSelectedGarmentId: newId });
    if (token && projectId) {
      realOutfitChangeApi.saveDraft(token, { projectId, targetOutfitId: newId }).catch((e) => {
        console.error("[OutfitChangeStep2] 保存 draft 失败:", e);
      });
    }
  }, [selectedGarmentId, token, projectId, updateWorkflow]);

  // 合并主图和副图用于预览
  const getAllImageUrls = useCallback((garment: GarmentAsset) => {
    return [
      garment.mainImageUrl,
      garment.subImageUrl1,
      garment.subImageUrl2,
      garment.subImageUrl3,
    ].filter(Boolean) as string[];
  }, []);

  // 选中的服装详情（优先使用预加载的数据）
  const selectedGarment = useMemo(
    () => preloadedSelectedGarment ?? garments.find(g => g.id === selectedGarmentId) ?? null,
    [preloadedSelectedGarment, garments, selectedGarmentId]
  );

  // 选中的服装所有图片
  const selectedGarmentAllUrls = useMemo(
    () => selectedGarment ? getAllImageUrls(selectedGarment) : [],
    [selectedGarment, getAllImageUrls]
  );

  // 步骤状态
  const hasSelection = !!selectedGarmentId;

  // 上一步
  const handleBack = useCallback(() => {
    navigate(`/outfit-create/${projectId}/step1`);
  }, [navigate, projectId]);

  // 下一步
  const handleNext = useCallback(() => {
    if (!selectedGarmentId) return;
    updateWorkflow({ outfitChangeSelectedGarmentId: selectedGarmentId });
    navigate(`/outfit-create/${projectId}/step3`);
  }, [selectedGarmentId, updateWorkflow, navigate, projectId]);

  // 返回项目列表（空项目静默删除）
  const handleExitToProjects = useCallback(async () => {
    if (!workflow.outfitChangeSourceVideoUrl && projectData.projectId && token) {
      try {
        await backendApi.deleteProject(token, projectData.projectId);
      } catch { /* 删除失败不阻塞 */ }
    }
    navigate("/projects");
  }, [navigate, workflow.outfitChangeSourceVideoUrl, projectData.projectId, token]);

  // 服饰创建成功回调
  const handleGarmentCreated = useCallback(async (_asset: GarmentAsset) => {
    // 刷新列表
    await loadGarmentsFirstPage();
    // 弹窗关闭由 AssetModal 的 onClose 处理
  }, [loadGarmentsFirstPage]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto bg-[#fdfbf7] lg:flex-row lg:overflow-hidden">
      {/* 左侧栏 */}
      <div className="w-full lg:w-[400px] bg-white border-b lg:border-r lg:border-b-0 border-gray-100 flex flex-col z-10 shadow-lg shrink-0">
        {/* 面板头部 */}
        <SidebarPanelHeader
          currentStep={2}
          projectStatus={projectData.projectStatus as any}
        />

        <div className="lg:flex-1 lg:overflow-y-auto scrollbar-hide p-6 space-y-6">
          {/* 步骤进度卡片 */}
          <StepProgressCard
            stepNumber={1}
            title="选择服装"
            summary={hasSelection ? "已选择服装" : ""}
            status={hasSelection ? "completed" : "current"}
            expanded={stepExpandState[1]}
            onToggle={() => toggleStepExpand(1)}
          >
            {isLoadingPreloaded ? (
              <div className="flex items-center justify-center p-3 rounded-lg bg-gray-50">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-primary" />
                <span className="ml-2 text-xs text-gray-500">加载已选服装...</span>
              </div>
            ) : selectedGarment ? (
              <button
                type="button"
                onClick={() => {
                  const urls = getAllImageUrls(selectedGarment);
                  if (urls.length > 0) {
                    setPreviewModal({
                      urls,
                      currentIndex: 0,
                      name: selectedGarment.name || "服装预览",
                    });
                  }
                }}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors w-full text-left"
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                  <BlurFillImage
                    src={getOssThumbnailUrl(selectedGarment.mainImageUrl, 96)}
                    alt={selectedGarment.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{selectedGarment.name || "未命名"}</p>
                  <p className="text-xs text-gray-500">{selectedGarment.category || "服装"}</p>
                </div>
                <span className="material-icons-round text-gray-400 text-lg">zoom_in</span>
              </button>
            ) : (
              <div className="text-center text-gray-400 text-sm py-2">
                请在右侧选择服装
              </div>
            )}
          </StepProgressCard>

          {/* 步骤2：确认选择 */}
          <StepProgressCard
            stepNumber={2}
            title="确认选择"
            summary={hasSelection ? "已确认" : ""}
            status={hasSelection ? "completed" : "locked"}
            expanded={stepExpandState[2]}
            onToggle={() => hasSelection && toggleStepExpand(2)}
          >
            {hasSelection && (
              <div className="text-sm text-gray-600">
                点击底部「下一步」继续
              </div>
            )}
          </StepProgressCard>

          {/* 提示信息 */}
          <div className="rounded-xl bg-pink-50 border border-pink-100 p-4">
            <div className="flex items-start gap-3">
              <span className="material-icons-round text-pink-400 text-lg">checkroom</span>
              <div className="text-xs text-pink-600 leading-relaxed">
                <p className="font-medium mb-1">服装选择说明</p>
                <p>选择要换装的服装，AI 将把服装应用到视频中的人物身上。</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧操作区 */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* 右侧 Header */}
        <div className="shrink-0 px-6 py-5 bg-white border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-400 text-white shadow-md">
              <span className="material-icons-round text-xl">checkroom</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">选择服装</h2>
              <p className="text-sm text-gray-500 mt-0.5">从服饰库中选择要换装的服装</p>
            </div>
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 lg:overflow-y-auto p-4 pb-28 md:px-8 md:pt-8">
          <div className="max-w-4xl mx-auto">
            {/* 加载状态 */}
            {isLoadingGarments ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-gray-200 border-t-primary" />
              </div>
            ) : garments.length === 0 ? (
              <div className="text-center py-20">
                <span className="material-icons-round text-5xl text-gray-300 mb-4 block">checkroom</span>
                <p className="text-gray-500">服饰库中暂无服装</p>
                <p className="text-sm text-gray-400 mt-1">请先在服饰库中上传服装</p>
              </div>
            ) : (
              <>
                {/* 搜索栏 + 新增按钮 */}
                <div className="flex items-center gap-3 mb-6">
                  {/* 搜索输入框 */}
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus-within:border-primary focus-within:bg-white transition-colors">
                    <span className="material-icons-round text-gray-400 text-lg">search</span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="搜索名称..."
                      className="flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          setCurrentPage(1);
                        }}
                        className="material-icons-round text-gray-400 hover:text-gray-600 text-lg transition-colors"
                      >
                        close
                      </button>
                    )}
                  </div>

                  {/* 新增服饰按钮 */}
                  <Button
                    variant="ghost"
                    onClick={() => setShowAddModal(true)}
                    className="rounded-xl px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors"
                  >
                    <span className="material-icons-round text-lg">add</span>
                    <span className="hidden md:inline ml-1 font-medium">新增</span>
                  </Button>
                </div>

                {/* 搜索无结果提示 */}
                {filteredGarments.length === 0 && searchQuery ? (
                  <div className="text-center py-16">
                    <span className="material-icons-round text-4xl text-gray-300 mb-3 block">search_off</span>
                    <p className="text-gray-500">无匹配结果</p>
                    <p className="text-sm text-gray-400 mt-1">尝试其他关键词或清空搜索</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {filteredGarments.map((garment) => {
                      const isSelected = selectedGarmentId === garment.id;
                      const allUrls = getAllImageUrls(garment);
                      return (
                        <div
                          key={garment.id}
                          className={`
                            group relative rounded-xl overflow-hidden border-2 transition-all duration-200 cursor-pointer
                            ${isSelected
                              ? "border-primary shadow-lg shadow-primary/20"
                              : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                            }
                          `}
                          onClick={() => handleSelect(garment.id)}
                        >
                          {/* 右上角选择徽章 */}
                          <div
                            className={`
                              absolute top-2 right-2 z-20
                              w-6 h-6 rounded-full flex items-center justify-center
                              transition-all duration-200 shadow-md
                              ${isSelected
                                ? "bg-primary text-white"
                                : "bg-white border-2 border-gray-300 hover:border-primary hover:bg-primary/5"
                              }
                            `}
                          >
                            {isSelected ? (
                              <span className="material-icons-round text-sm">check</span>
                            ) : (
                              <span className="material-icons-round text-sm text-gray-300">radio_button_unchecked</span>
                            )}
                          </div>

                          {/* 图片区域 */}
                          <div className="aspect-[3/4] bg-gray-100 w-full overflow-hidden" onClick={(e) => {
                            e.stopPropagation();
                            if (allUrls.length > 0) {
                              setPreviewModal({
                                urls: allUrls,
                                currentIndex: 0,
                                name: garment.name || "服装预览",
                              });
                            }
                          }}>
                            <BlurFillImage
                              src={getOssThumbnailUrl(garment.mainImageUrl, 256)}
                              alt={garment.name}
                              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                            />
                          </div>

                          {/* 信息区域 */}
                          <div className="p-2 bg-white">
                            <p className="text-xs text-gray-700 truncate mb-1">{garment.name || "未命名"}</p>
                            {/* 视角数量徽章 */}
                            <div className="flex items-center gap-1">
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                {garment.category || "服装"}
                              </span>
                              {allUrls.length > 1 && (
                                <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                  {allUrls.length} 张视角
                                </span>
                              )}
                            </div>
                            {/* 副图缩略图网格 */}
                            {allUrls.length > 1 && (
                              <div className="grid grid-cols-3 gap-1 mt-1">
                                {allUrls.slice(0, 3).map((url, idx) => (
                                  <img
                                    key={`${garment.id}-sub-${idx}`}
                                    src={getOssThumbnailUrl(url, 120)}
                                    alt="视角预览"
                                    className="h-6 w-full rounded border border-gray-100 object-cover"
                                  />
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 选中遮罩 */}
                          {isSelected && (
                            <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 分页控件 */}
                {/* 加载更多按钮 */}
                {!isLoadingGarments && filteredGarments.length > 0 && (
                  <LoadMoreButton
                    isLoading={isLoadingMoreGarments}
                    hasMore={garmentsHasMore}
                    currentCount={filteredGarments.length}
                    totalCount={garmentsTotal}
                    onClick={loadGarmentsNextPage}
                    loadText="加载更多服饰"
                    noMoreText="已加载全部可用服饰"
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 底部浮动操作栏 */}
      <div className="fixed bottom-6 left-0 right-0 z-40 flex justify-center pointer-events-none lg:left-[400px] lg:right-0">
        <div className="bg-white/60 backdrop-blur-md border border-gray-200/50 rounded-2xl sm:rounded-full px-2 sm:px-3 py-2 shadow-xl shadow-gray-200/30 pointer-events-auto flex items-center justify-center gap-2 sm:gap-4 w-[calc(100%-1rem)] sm:w-auto max-w-[960px]">
          <Button variant="ghost" onClick={handleBack} className="rounded-full px-3 sm:px-4 text-gray-500 hover:text-gray-900 whitespace-nowrap shrink-0">
            <span className="material-icons-round text-lg mr-1">arrow_back</span>
            <span className="hidden md:inline">上一步</span>
          </Button>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          <div className="text-[10px] sm:text-xs text-gray-400 font-medium px-1 sm:px-2 min-w-0 max-w-[42vw] sm:max-w-[320px] truncate">
            {!hasSelection ? "请先选择服装" : "已选择服装，可以进入下一步"}
          </div>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          <div className="shrink-0">
            <Button
              onClick={handleNext}
              disabled={!hasSelection}
              className="rounded-full px-4 sm:px-6 bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 whitespace-nowrap transition-transform disabled:opacity-50"
            >
              <span>下一步</span>
              <span className="material-icons-round text-lg ml-1">arrow_forward</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 新增服饰弹窗 - 使用现有 AssetModal */}
      <AssetModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAssetCreated={handleGarmentCreated}
        token={token}
      />

      {/* 图片预览弹窗 */}
      {previewModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in"
          onClick={() => setPreviewModal(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={() => setPreviewModal(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-lg flex items-center justify-center transition-all z-10"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* 左箭头 */}
            {previewModal.urls.length > 1 && (
              <button
                onClick={() => {
                  const newIndex = previewModal.currentIndex > 0
                    ? previewModal.currentIndex - 1
                    : previewModal.urls.length - 1;
                  setPreviewModal({ ...previewModal, currentIndex: newIndex });
                }}
                className="absolute -left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-lg flex items-center justify-center transition-all z-10"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}

            {/* 右箭头 */}
            {previewModal.urls.length > 1 && (
              <button
                onClick={() => {
                  const newIndex = previewModal.currentIndex < previewModal.urls.length - 1
                    ? previewModal.currentIndex + 1
                    : 0;
                  setPreviewModal({ ...previewModal, currentIndex: newIndex });
                }}
                className="absolute -right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-lg flex items-center justify-center transition-all z-10"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}

            <img
              src={previewModal.urls[previewModal.currentIndex]}
              alt={previewModal.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />

            {/* 底部信息栏 */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 rounded-b-lg flex items-center justify-between">
              <p className="text-white/90 text-sm truncate flex-1">{previewModal.name}</p>
              {previewModal.urls.length > 1 && (
                <span className="text-white/70 text-xs ml-3 shrink-0">
                  {previewModal.currentIndex + 1} / {previewModal.urls.length}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
