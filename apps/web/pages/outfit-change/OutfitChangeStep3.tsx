/**
 * 换装项目 Step 3 - 选择角色
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
import { CreateCharacterModal } from "../characters/characterCreateModalPanel";
import type { Character } from "../../types";
import { backendApi } from "../../services/backendApi";
import { realOutfitChangeApi } from "../../services/realApi/outfit-change";
import { realLibraryApi } from "../../services/realApi/library";
import { getOssThumbnailUrl } from "../../utils/ossImage";

interface LibraryCharacter {
  id: string;
  name: string;
  thumbnailUrl: string;
  fiveViewOssImageUrl?: string | null;
  tags?: string[];
}

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

export const OutfitChangeStep3: React.FC = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const token = useAppStore((state) => state.token);
  const { workflow, updateWorkflow, projectData } = useProjectState(projectId);

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    typeof workflow.outfitChangeSelectedCharacterId === "string"
      ? (workflow.outfitChangeSelectedCharacterId as string)
      : null
  );
  const [stepExpandState, setStepExpandState] = useState<Record<number, boolean>>({ 1: true });

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState("");

  // 弹窗状态
  const [showAddModal, setShowAddModal] = useState(false);

  // 图片预览状态
  const [previewModal, setPreviewModal] = useState<{
    url: string;
    name: string;
  } | null>(null);

  // 预加载已选角色（解决分页依赖问题）
  const [preloadedSelectedCharacter, setPreloadedSelectedCharacter] = useState<LibraryCharacter | null>(null);
  const [isLoadingPreloaded, setIsLoadingPreloaded] = useState(false);

  // 角色库分页加载（使用 usePagedList Hook）
  const {
    items: characters,
    total: charactersTotal,
    hasMore: charactersHasMore,
    isLoading: isLoadingCharacters,
    isLoadingMore: isLoadingMoreCharacters,
    loadFirstPage: loadCharactersFirstPage,
    loadNextPage: loadCharactersNextPage,
    reset: resetCharacters,
  } = usePagedList({
    pageSize: 20,
    autoLoad: true, // 自动加载第一页
    fetcher: async ({ page, pageSize }) => {
      if (!token) {
        return { items: [], total: 0, hasMore: false };
      }
      const result = await backendApi.listLibraryCharacters(token, { page, pageSize });
      return {
        items: result.items ?? [],
        total: result.total,
        hasMore: result.hasMore ?? false,
      };
    },
    fetcherParams: { token },
  });

  // 初始化时单独查询已选角色
  useEffect(() => {
    const selectedId = workflow.outfitChangeSelectedCharacterId;
    if (typeof selectedId === "string" && selectedId && token) {
      // 先检查右侧数组是否已包含
      const foundInList = characters.find(c => c.id === selectedId);
      if (foundInList) {
        setPreloadedSelectedCharacter(foundInList);
        return;
      }
      // 不在数组中，单独查询
      setIsLoadingPreloaded(true);
      realLibraryApi.getLibraryCharacter(token, selectedId)
        .then(character => {
          setPreloadedSelectedCharacter({
            id: character.id,
            name: character.name,
            thumbnailUrl: character.thumbnailUrl,
            fiveViewOssImageUrl: character.fiveViewOssImageUrl,
            tags: character.tags,
          });
        })
        .catch(err => {
          console.error("[OutfitChangeStep3] 查询已选角色失败:", err);
        })
        .finally(() => {
          setIsLoadingPreloaded(false);
        });
    }
  }, [workflow.outfitChangeSelectedCharacterId, token, characters]);

  // 同步：右侧加载后如果包含已选角色，更新预加载状态
  useEffect(() => {
    const selectedId = workflow.outfitChangeSelectedCharacterId;
    if (typeof selectedId === "string" && selectedId) {
      const foundInList = characters.find(c => c.id === selectedId);
      if (foundInList && !preloadedSelectedCharacter) {
        setPreloadedSelectedCharacter(foundInList);
      }
    }
  }, [characters, workflow.outfitChangeSelectedCharacterId, preloadedSelectedCharacter]);

  // 搜索过滤
  const filteredCharacters = useMemo(() => {
    if (!searchQuery.trim()) return characters;
    return characters.filter(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [characters, searchQuery]);

  // 同步持久化的选择
  useEffect(() => {
    if (typeof workflow.outfitChangeSelectedCharacterId === "string" && !selectedCharacterId) {
      setSelectedCharacterId(workflow.outfitChangeSelectedCharacterId as string);
    }
  }, [workflow.outfitChangeSelectedCharacterId, selectedCharacterId]);

  // 切换步骤展开状态
  const toggleStepExpand = useCallback((step: number) => {
    setStepExpandState((prev) => ({ ...prev, [step]: !prev[step] }));
  }, []);

  // 选择角色
  const handleSelect = useCallback((characterId: string) => {
    const newId = selectedCharacterId === characterId ? null : characterId;
    setSelectedCharacterId(newId);
    updateWorkflow({ outfitChangeSelectedCharacterId: newId });
    if (token && projectId) {
      realOutfitChangeApi.saveDraft(token, { projectId, characterId: newId }).catch((e) => {
        console.error("[OutfitChangeStep3] 保存 draft 失败:", e);
      });
    }
  }, [selectedCharacterId, token, projectId, updateWorkflow]);

  // 选中的角色详情（优先使用预加载的数据）
  const selectedCharacter = useMemo(
    () => preloadedSelectedCharacter ?? characters.find(c => c.id === selectedCharacterId) ?? null,
    [preloadedSelectedCharacter, characters, selectedCharacterId]
  );

  // 步骤状态
  const hasSelection = !!selectedCharacterId;

  // 上一步
  const handleBack = useCallback(() => {
    navigate(`/outfit-create/${projectId}/step2`);
  }, [navigate, projectId]);

  // 跳过（不选择角色直接进入下一步）
  const handleSkip = useCallback(() => {
    navigate(`/outfit-create/${projectId}/step4`);
  }, [navigate, projectId]);

  // 下一步
  const handleNext = useCallback(() => {
    if (!selectedCharacterId) return;
    updateWorkflow({ outfitChangeSelectedCharacterId: selectedCharacterId });
    navigate(`/outfit-create/${projectId}/step4`);
  }, [selectedCharacterId, updateWorkflow, navigate, projectId]);

  // 返回项目列表（空项目静默删除）
  const handleExitToProjects = useCallback(async () => {
    if (!workflow.outfitChangeSourceVideoUrl && projectData.projectId && token) {
      try {
        await backendApi.deleteProject(token, projectData.projectId);
      } catch { /* 删除失败不阻塞 */ }
    }
    navigate("/projects");
  }, [navigate, workflow.outfitChangeSourceVideoUrl, projectData.projectId, token]);

  // 角色创建成功回调 - CreateCharacterModal 内部完成上传和创建
  const handleCharacterCreated = useCallback(async (_character: Character, _skipGeneration?: boolean) => {
    // 刷新列表
    await loadCharactersFirstPage();
    // 关闭弹窗
    setShowAddModal(false);
  }, [loadCharactersFirstPage]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto bg-[#fdfbf7] lg:flex-row lg:overflow-hidden">
      {/* 左侧栏 */}
      <div className="w-full lg:w-[400px] bg-white border-b lg:border-r lg:border-b-0 border-gray-100 flex flex-col z-10 shadow-lg shrink-0">
        {/* 面板头部 */}
        <SidebarPanelHeader
          currentStep={3}
          projectStatus={projectData.projectStatus as any}
        />

        <div className="lg:flex-1 lg:overflow-y-auto scrollbar-hide p-6 space-y-6">
          {/* 步骤进度卡片 */}
          <StepProgressCard
            stepNumber={1}
            title="选择角色"
            summary={hasSelection ? "已选择角色" : ""}
            status={hasSelection ? "completed" : "current"}
            expanded={stepExpandState[1]}
            onToggle={() => toggleStepExpand(1)}
          >
            {isLoadingPreloaded ? (
              <div className="flex items-center justify-center p-3 rounded-lg bg-gray-50">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-primary" />
                <span className="ml-2 text-xs text-gray-500">加载已选角色...</span>
              </div>
            ) : selectedCharacter ? (
              <button
                type="button"
                onClick={() => {
                  const imageUrl = selectedCharacter.fiveViewOssImageUrl || selectedCharacter.thumbnailUrl;
                  if (imageUrl) {
                    setPreviewModal({
                      url: imageUrl,
                      name: selectedCharacter.name || "角色预览",
                    });
                  }
                }}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors w-full text-left"
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                  <BlurFillImage
                    src={getOssThumbnailUrl(selectedCharacter.fiveViewOssImageUrl || selectedCharacter.thumbnailUrl, 96)}
                    alt={selectedCharacter.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{selectedCharacter.name || "未命名角色"}</p>
                  {selectedCharacter.tags && selectedCharacter.tags.length > 0 && (
                    <div className="flex gap-1 mt-0.5">
                      {selectedCharacter.tags.slice(0, 2).map((tag, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="material-icons-round text-gray-400 text-lg">zoom_in</span>
              </button>
            ) : (
              <div className="text-center text-gray-400 text-sm py-2">
                请在右侧选择角色
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
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
            <div className="flex items-start gap-3">
              <span className="material-icons-round text-indigo-400 text-lg">face</span>
              <div className="text-xs text-indigo-600 leading-relaxed">
                <p className="font-medium mb-1">角色选择说明</p>
                <p>选择要换装的角色形象，AI 将保持角色的面部特征，仅更换服装。</p>
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
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-400 text-white shadow-md">
              <span className="material-icons-round text-xl">face</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">选择角色</h2>
              <p className="text-sm text-gray-500 mt-0.5">从角色库中选择要换装的角色形象</p>
            </div>
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 lg:overflow-y-auto p-4 pb-28 md:px-8 md:pt-8">
          <div className="max-w-4xl mx-auto">
            {/* 加载状态 */}
            {isLoadingCharacters ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-gray-200 border-t-primary" />
              </div>
            ) : characters.length === 0 ? (
              <div className="text-center py-20">
                <span className="material-icons-round text-5xl text-gray-300 mb-4 block">face</span>
                <p className="text-gray-500">角色库中暂无角色</p>
                <p className="text-sm text-gray-400 mt-1">请先在角色管理中创建角色</p>
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
                      }}
                      placeholder="搜索名称..."
                      className="flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                        }}
                        className="material-icons-round text-gray-400 hover:text-gray-600 text-lg transition-colors"
                      >
                        close
                      </button>
                    )}
                  </div>

                  {/* 新增角色按钮 */}
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
                {filteredCharacters.length === 0 && searchQuery ? (
                  <div className="text-center py-16">
                    <span className="material-icons-round text-4xl text-gray-300 mb-3 block">search_off</span>
                    <p className="text-gray-500">无匹配结果</p>
                    <p className="text-sm text-gray-400 mt-1">尝试其他关键词或清空搜索</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredCharacters.map((character) => {
                      const isSelected = selectedCharacterId === character.id;
                      const isAiGenerated = character.tags?.some(t => t === 'auto-generated' || t.startsWith('step2'));
                      const imageUrl = isAiGenerated ? (character.fiveViewOssImageUrl || character.thumbnailUrl) : character.thumbnailUrl;
                      return (
                        <div
                          key={character.id}
                          className={`
                            group bg-white rounded-xl overflow-hidden transition-all duration-300 relative flex flex-col cursor-pointer
                            ${isSelected
                              ? "border-2 border-primary shadow-lg ring-2 ring-primary/30"
                              : "border border-gray-200 hover:shadow-lg hover:border-gray-300"
                            }
                          `}
                          onClick={() => handleSelect(character.id)}
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
                          <div
                            className="relative cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (imageUrl) {
                                setPreviewModal({
                                  url: imageUrl,
                                  name: character.name || "角色预览",
                                });
                              }
                            }}
                          >
                            <BlurFillImage
                              src={imageUrl}
                              alt={character.name}
                              aspectClass="aspect-[4/3]"
                              hoverClass="group-hover:scale-105"
                            />

                            {/* AI 标签 */}
                            {isAiGenerated && (
                              <span className="absolute top-2.5 left-2.5 z-10 bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-[10px] font-bold px-2 py-1 rounded-md">AI</span>
                            )}

                            {/* 五视图标签 */}
                            {!isAiGenerated && (
                              <span className="absolute top-2.5 left-2.5 z-10 bg-black/50 text-white text-[10px] font-medium px-1.5 py-1 rounded-md flex items-center gap-1">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                                五视图
                              </span>
                            )}

                            {/* 悬浮遮罩 */}
                            <div className={`absolute inset-0 transition-opacity ${isSelected ? "bg-primary/5 opacity-100" : "bg-black/10 opacity-0 group-hover:opacity-100"}`} />
                          </div>

                          {/* 底部信息 */}
                          <div className="p-4 flex-1 flex flex-col">
                            <h3 className="font-bold text-gray-900 line-clamp-1" title={character.name}>{character.name || "未命名"}</h3>

                            {/* 标签 */}
                            {character.tags && character.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {character.tags.slice(0, 3).map((tag, i) => (
                                  <span
                                    key={i}
                                    className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                                      tag === '男性' ? 'bg-blue-50 text-blue-600' :
                                      tag === '女性' ? 'bg-red-50 text-red-500' :
                                      tag.startsWith('step2') || tag === 'auto-generated' ? 'bg-indigo-50 text-indigo-500' :
                                      'bg-gray-100 text-gray-600'
                                    }`}
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {character.tags.length > 3 && (
                                  <span className="text-[10px] text-gray-400 py-0.5">+{character.tags.length - 3}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 分页控件 */}
                {/* 加载更多按钮 */}
                {!isLoadingCharacters && filteredCharacters.length > 0 && (
                  <LoadMoreButton
                    isLoading={isLoadingMoreCharacters}
                    hasMore={charactersHasMore}
                    currentCount={filteredCharacters.length}
                    totalCount={charactersTotal}
                    onClick={loadCharactersNextPage}
                    loadText="加载更多角色"
                    noMoreText="已加载全部角色"
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
          {/* 上一步按钮 */}
          <Button variant="ghost" onClick={handleBack} className="rounded-full px-3 sm:px-4 text-gray-500 hover:text-gray-900 whitespace-nowrap shrink-0">
            <span className="material-icons-round text-lg mr-1">arrow_back</span>
            <span className="hidden md:inline">上一步</span>
          </Button>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          {/* 跳过按钮 */}
          <Button variant="ghost" onClick={handleSkip} className="rounded-full px-3 sm:px-4 text-gray-400 hover:text-gray-600 whitespace-nowrap shrink-0">
            <span className="material-icons-round text-lg mr-1">skip_next</span>
            <span className="hidden md:inline">跳过</span>
          </Button>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          <div className="text-[10px] sm:text-xs text-gray-400 font-medium px-1 sm:px-2 min-w-0 max-w-[42vw] sm:max-w-[320px] truncate">
            {!hasSelection ? "可跳过角色选择" : "已选择角色，可以进入下一步"}
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

      {/* 新增角色弹窗 - 使用角色库完整弹窗 CreateCharacterModal */}
      <CreateCharacterModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleCharacterCreated}
        suggestedTags={[]}
        skipFiveViewGeneration={true}
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

            <img
              src={previewModal.url}
              alt={previewModal.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />

            {/* 底部信息栏 */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 rounded-b-lg flex items-center justify-between">
              <p className="text-white/90 text-sm truncate flex-1">{previewModal.name}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
