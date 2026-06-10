import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/Button';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { Character } from '../../types';
import { ApiError, backendApi } from '../../services/backendApi';
import type { LibraryCharacterDto, ListLibraryCharactersParams, ListLibraryCharactersResult, CharacterFiveViewDto } from '../../services/backendApi.types';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { CreateCharacterModal } from './characterCreateModalPanel';
import { BlurFillImage } from '../../components/shared/BlurFillImage';
import { getOssThumbnailUrl } from '../../utils/ossImage';
import { Pagination } from '../../components/ui/Pagination';
import { SearchInput } from '../../components/ui/SearchInput';

// 推荐标签
const SUGGESTED_TAGS = ['真实感', '3D', '二次元', '亚洲', '欧美', '男性', '女性', '儿童', '老年', '商务', '休闲', '古风'];

// 路由状态类型
type CharacterManagementRouteState = {
    openCharacterId?: string;
    autoStartGeneration?: boolean;
    returnPath?: string;
    returnState?: unknown;
};

// --- 简化的角色详情弹窗 ---
const CharacterDetailModal = ({
    character,
    isOpen,
    onClose,
    onNameUpdated,
}: {
    character: Character | null;
    isOpen: boolean;
    onClose: () => void;
    onNameUpdated?: (characterId: string, newName: string) => void;
}) => {
    const { token } = useAppStore(useShallow((state) => ({ token: state.token })));
    const queryClient = useQueryClient();
    const [popupImage, setPopupImage] = useState<string | null>(null);
    const [editingName, setEditingName] = useState(false);
    const [nameInput, setNameInput] = useState("");
    const [savingName, setSavingName] = useState(false);
    const { confirm } = useConfirm();

    // 获取五视图数据（从新 API）
    const fiveViewsQuery = useQuery({
        queryKey: ['character-five-views', token, character?.id],
        enabled: Boolean(token && character?.id),
        queryFn: async () => {
            if (!token || !character?.id) return { items: [] as CharacterFiveViewDto[] };
            return backendApi.listCharacterFiveViews(token, character.id);
        },
    });

    // 检查角色是否被项目使用
    const usageCheckQuery = useQuery({
        queryKey: ['character-usage-check', token, character?.id],
        enabled: Boolean(token && character?.id),
        queryFn: async () => {
            if (!token || !character?.id) return { inUse: false, projectCount: 0 };
            return backendApi.checkCharacterInUse(token, character.id);
        },
    });

    const isInUse = usageCheckQuery.data?.inUse ?? false;
    const projectCount = usageCheckQuery.data?.projectCount ?? 0;

    // 当前激活的五视图
    const activeFiveView = useMemo(() => {
        const items = fiveViewsQuery.data?.items ?? [];
        return items.find(v => v.isActive) ?? items[0] ?? null;
    }, [fiveViewsQuery.data]);

    // 生成五视图
    const generateFiveViewMutation = useMutation({
        mutationFn: async () => {
            if (!token || !character?.id) return null;
            return backendApi.generateRealPortraitFiveView(token, character.id, { force: true });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['character-five-views', token, character?.id] });
        },
        onError: (error: unknown) => {
            console.error('Failed to generate five-view:', error);
            alert(error instanceof Error ? error.message : '生成五视图失败，请重试');
        },
    });

    // 综合生成状态：本地 mutation 正在执行
    const isGeneratingFiveView = generateFiveViewMutation.isPending;

    // 激活五视图
    const activateFiveViewMutation = useMutation({
        mutationFn: async (viewId: string) => {
            if (!token || !character?.id) return null;
            return backendApi.activateCharacterFiveView(token, character.id, viewId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['character-five-views', token, character?.id] });
        },
    });

    // 当角色变化时同步名字输入
    useEffect(() => {
        if (character) {
            setNameInput(character.name);
            setEditingName(false);
        }
    }, [character]);

    // 保存名字修改
    const handleSaveName = async () => {
        if (!token || !character || nameInput.trim() === character.name) {
            setEditingName(false);
            return;
        }
        if (!nameInput.trim()) {
            alert("角色名称不能为空");
            return;
        }
        setSavingName(true);
        try {
            await backendApi.updateLibraryCharacter(token, character.id, { name: nameInput.trim() });
            setEditingName(false);
            onNameUpdated?.(character.id, nameInput.trim());
        } catch (error) {
            console.error("Failed to update character name:", error);
            alert(error instanceof Error ? error.message : "更新名称失败");
        } finally {
            setSavingName(false);
        }
    };

    if (!isOpen || !character) return null;

    const thumbnail = character.thumbnail?.trim() || null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white shrink-0">
                    <div>
                        {editingName ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={nameInput}
                                    onChange={(e) => setNameInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveName();
                                        if (e.key === "Escape") {
                                            setEditingName(false);
                                            setNameInput(character.name);
                                        }
                                    }}
                                    className="font-bold text-gray-900 font-display text-xl bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-primary"
                                    autoFocus
                                    disabled={savingName}
                                />
                                <button
                                    onClick={handleSaveName}
                                    className="p-1 rounded hover:bg-gray-100 text-primary"
                                    disabled={savingName}
                                >
                                    <span className="material-icons-round text-lg">{savingName ? "refresh" : "check"}</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingName(false);
                                        setNameInput(character.name);
                                    }}
                                    className="p-1 rounded hover:bg-gray-100 text-gray-500"
                                    disabled={savingName}
                                >
                                    <span className="material-icons-round text-lg">close</span>
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setEditingName(true)}>
                                <h3 className="font-bold text-gray-900 font-display text-xl">{character.name}</h3>
                                <span className="material-icons-round text-gray-400 text-lg hover:text-primary transition-colors">edit</span>
                            </div>
                        )}
                        <p className="text-xs text-gray-500 mt-1">角色详情</p>
                    </div>
                    <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100">
                        <span className="material-icons-round text-gray-500">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    <div className="flex gap-6 items-start">
                        {/* Left: Original Image & Info */}
                        <div className="flex-shrink-0 w-60">
                            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">原图</div>
                            <div
                                className="h-80 w-60 rounded-xl overflow-hidden cursor-zoom-in"
                                onClick={() => thumbnail && setPopupImage(thumbnail)}
                            >
                                {thumbnail ? (
                                    <BlurFillImage
                                        src={thumbnail}
                                        alt="原图"
                                        aspectClass="h-80 w-60"
                                        className="rounded-xl"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                                        暂无原图
                                    </div>
                                )}
                            </div>

                            {/* 角色信息 */}
                            <div className="mt-4 space-y-3">
                                <div>
                                    <div className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">状态</div>
                                    {character.status === 'processing' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">
                                            <span className="w-2 h-2 border border-orange-500 border-t-transparent rounded-full animate-spin"></span>
                                            生成中
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                                            <span className="material-icons-round text-sm">check_circle</span> 就绪
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <div className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">创建时间</div>
                                    <span className="text-sm text-gray-700">{character.createdAt}</span>
                                </div>
                            </div>

                            {/* Tags */}
                            <div className="mt-4">
                                <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">标签</div>
                                <div className="flex flex-wrap gap-2">
                                    {character.tags.length > 0 ? (
                                        character.tags.map(tag => (
                                            <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                                                {tag}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-gray-400">暂无标签</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right: Character Image & Views */}
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">角色图</div>
                                <div className="flex items-center gap-2">
                                    {isInUse && (
                                        <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded flex items-center gap-1">
                                            <span className="material-icons-round text-sm">warning</span>
                                            被 {projectCount} 个项目使用
                                        </span>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => generateFiveViewMutation.mutate()}
                                        disabled={isGeneratingFiveView || activeFiveView?.status === 'processing' || isInUse}
                                        title={isInUse ? "角色正在被项目使用，无法重新生成五视图" : ""}
                                    >
                                        {isGeneratingFiveView || activeFiveView?.status === 'processing' ? (
                                            <>
                                                <span className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin"></span>
                                                生成中...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-icons-round text-sm">refresh</span>
                                                重新生成
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                            <div
                                className="h-80 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 cursor-zoom-in"
                                onClick={() => activeFiveView?.imageUrl && !isGeneratingFiveView && activeFiveView?.status !== 'processing' && setPopupImage(activeFiveView.imageUrl)}
                            >
                                {isGeneratingFiveView || activeFiveView?.status === 'processing' ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-primary gap-3 bg-gradient-to-b from-gray-50 to-gray-100">
                                        <span className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin"></span>
                                        <span className="text-sm font-medium">正在生成五视图...</span>
                                        <span className="text-xs text-gray-400">预计需要 30-60 秒</span>
                                    </div>
                                ) : activeFiveView?.imageUrl ? (
                                    <img src={getOssThumbnailUrl(activeFiveView.imageUrl, 400)} alt="角色图" className="w-full h-full object-cover" loading="lazy" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-3">
                                        <span className="material-icons-round text-4xl">image_not_supported</span>
                                        <span className="text-sm">暂无角色图</span>
                                        <span className="text-xs text-gray-300">点击"重新生成"按钮生成五视图</span>
                                    </div>
                                )}
                            </div>

                            {/* 五视图记录列表 */}
                            <div className="mt-4">
                                <div className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">五视图记录</div>

                                {fiveViewsQuery.isLoading ? (
                                    <div className="flex items-center justify-center py-4 text-gray-400">
                                        <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2"></span>
                                        加载中...
                                    </div>
                                ) : ((fiveViewsQuery.data?.items ?? []).filter(v => v.status === 'ready' && v.imageUrl).length === 0 ? (
                                    <div className="text-sm text-gray-400 py-4 border border-dashed border-gray-200 rounded-lg text-center">
                                        暂无五视图记录
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-3">
                                        {(fiveViewsQuery.data?.items ?? []).filter(v => v.status === 'ready' && v.imageUrl).map((view) => (
                                            <div
                                                key={view.id}
                                                className={`relative w-20 h-20 rounded-lg border-2 overflow-hidden transition-all group ${
                                                    view.isActive
                                                        ? 'border-primary ring-2 ring-primary/30 cursor-pointer'
                                                        : isInUse
                                                            ? 'border-gray-200 opacity-50 cursor-not-allowed'
                                                            : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                                                }`}
                                                onClick={async () => {
                                                    if (isInUse && !view.isActive) {
                                                        // 被项目使用时禁止切换
                                                        alert('角色正在被项目使用，无法切换五视图。请先在项目中移除该角色。');
                                                        return;
                                                    }
                                                    if (view.isActive) {
                                                        // 已激活的点击查看大图
                                                        setPopupImage(view.imageUrl!);
                                                    } else {
                                                        // 未激活的点击切换激活
                                                        const confirmed = await confirm('是否切换到此五视图？', '切换确认');
                                                        if (confirmed) {
                                                            activateFiveViewMutation.mutate(view.id);
                                                        }
                                                    }
                                                }}
                                            >
                                                <img src={getOssThumbnailUrl(view.imageUrl ?? "", 200)} alt="五视图" className="w-full h-full object-cover" loading="lazy" />

                                                {/* 悬浮时右上角显示查看图标 */}
                                                <div
                                                    className={`absolute ${view.isActive ? 'top-1 left-1' : 'top-1 right-1'} w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPopupImage(view.imageUrl!);
                                                    }}
                                                >
                                                    <span className="material-icons-round text-white text-xs">visibility</span>
                                                </div>

                                                {/* 激活标记 */}
                                                {view.isActive && (
                                                    <div className="absolute top-0 right-0 bg-primary text-white text-[10px] px-1 rounded-bl">
                                                        激活
                                                    </div>
                                                )}

                                                {/* 禁用标记 */}
                                                {!view.isActive && isInUse && (
                                                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                                        <span className="material-icons-round text-white text-lg">lock</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Image Popup */}
            {popupImage && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
                    onClick={() => setPopupImage(null)}
                >
                    <button
                        className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 p-0 text-white shadow-lg backdrop-blur-sm transition-transform hover:scale-110 hover:bg-black/80"
                        onClick={() => setPopupImage(null)}
                    >
                        <span className="material-icons-round">close</span>
                    </button>
                    <img
                        src={popupImage}
                        className="max-h-full max-w-full rounded-lg object-contain cursor-zoom-out"
                        alt="预览大图"
                        onClick={() => setPopupImage(null)}
                    />
                </div>
            )}
        </div>
    );
};

// --- 主组件 ---
export const CharacterManagement: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { token, characters, setCharacters } = useAppStore(useShallow((state) => ({ token: state.token, characters: state.characters, setCharacters: state.setCharacters })));
    const [feedback, setFeedback] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'all' | 'male' | 'female'>('all');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // 搜索状态
    const [searchKeyword, setSearchKeyword] = useState('');

    // 分页状态
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 20;

    // 删除确认弹窗
    const { confirm } = useConfirm();

    // 角色详情状态
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
    const handledRouteOpenRef = useRef<string | null>(null);
    const returnNavigationRef = useRef<{ path: string; state: unknown } | null>(null);
    // 映射 API 返回的角色数据
    const mapLibraryCharacter = (item: LibraryCharacterDto): Character => ({
        id: item.id,
        name: item.name,
        thumbnail: item.thumbnailUrl,
        type: item.kind,
        tags: (item.tags ?? []).filter((tag) => !tag.trim().startsWith("__")),
        status: item.status,
        fiveViewOssImageUrl: item.fiveViewOssImageUrl ?? null,
        viewSession: item.viewSession ?? null,
        videoPreview: item.videoPreview ?? undefined,
        createdAt: '已同步',
    });

    // 查询参数：由筛选和分页状态驱动
    const queryParams = useMemo<ListLibraryCharactersParams>(() => ({
        page: currentPage,
        pageSize,
        gender: activeTab === 'male' ? '男性' : activeTab === 'female' ? '女性' : undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        keyword: searchKeyword.trim() || undefined,
    }), [currentPage, pageSize, activeTab, selectedTags, searchKeyword]);

    // 角色列表查询（服务端分页+筛选）
    const charactersQuery = useQuery<ListLibraryCharactersResult>({
        queryKey: ['library-characters', token, queryParams],
        enabled: Boolean(token),
        queryFn: async () => {
            if (!token) return { items: [] as LibraryCharacterDto[], total: 0, page: 1, pageSize, totalPages: 0, hasMore: false };
            return backendApi.listLibraryCharacters(token, queryParams);
        }
    });

    // 当前页角色列表
    const pagedCharacters = useMemo(() => {
        return (charactersQuery.data?.items ?? []).map(mapLibraryCharacter);
    }, [charactersQuery.data]);

    // 总页数由后端返回
    const totalPages = charactersQuery.data?.totalPages ?? 1;
    const total = charactersQuery.data?.total ?? 0;

    useEffect(() => {
        setCharacters(pagedCharacters);
        setSelectedCharacter((current) => {
            if (!current) return current;
            const next = pagedCharacters.find((item) => item.id === current.id);
            return next ?? current;
        });
    }, [pagedCharacters, setCharacters]);

    // 标签筛选
    const toggleFilterTag = (tag: string) => {
        setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    };

    // 过滤条件变化时重置页码
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, selectedTags, searchKeyword]);

    // 新建角色处理（五视图生成已在创建弹窗内完成）
    const handleAddNewCharacter = async (_newChar: Character, _skipGeneration?: boolean) => {
        if (!token) return;
        try {
            setFeedback(null);
            await charactersQuery.refetch();
            setFeedback('角色创建成功');
        } catch (error) {
            const message = error instanceof ApiError ? error.message : '创建角色失败';
            setFeedback(message);
        }
    };

    // 删除角色处理
    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();

        // 先检查角色是否被项目使用
        if (!token) return;
        try {
            const usageCheck = await backendApi.checkCharacterInUse(token, id);
            if (usageCheck.inUse) {
                alert(`该角色正在被 ${usageCheck.projectCount} 个项目使用，无法删除。请先在项目中移除该角色。`);
                return;
            }
        } catch (error) {
            console.error('Failed to check character usage:', error);
        }

        const confirmed = await confirm('确定要删除这个角色吗？此操作无法撤销。', '删除确认');
        if (confirmed) {
            try {
                setFeedback(null);
                await backendApi.deleteLibraryCharacter(token, id);
                await charactersQuery.refetch();
            } catch (error) {
                const message = error instanceof ApiError ? error.message : '删除角色失败';
                setFeedback(message);
            }
        }
    };

    // 路由状态处理
    useEffect(() => {
        const routeState = (location.state ?? null) as CharacterManagementRouteState | null;
        const openCharacterId = typeof routeState?.openCharacterId === 'string' ? routeState.openCharacterId.trim() : '';
        if (!openCharacterId) {
            handledRouteOpenRef.current = null;
            return;
        }
        const requestKey = `${openCharacterId}:${routeState?.autoStartGeneration ? '1' : '0'}`;
        if (handledRouteOpenRef.current === requestKey) return;

        const target = pagedCharacters.find((item) => item.id === openCharacterId) ?? null;
        if (!target) {
            // 角色不在当前页，从后端单独查询
            const fetchAndSelect = async () => {
                try {
                if (!token) return;

                    const dto = await backendApi.getLibraryCharacter(token, openCharacterId);
                    setSelectedCharacter(mapLibraryCharacter(dto));
                } catch {
                    // 角色不存在，忽略
                }
            };
            fetchAndSelect();
            handledRouteOpenRef.current = requestKey;
            navigate(location.pathname, { replace: true, state: null });
            return;
        }
        if (target.type === 'video') return;

        handledRouteOpenRef.current = requestKey;

        const returnPath = typeof routeState?.returnPath === 'string' ? routeState.returnPath.trim() : '';
        if (returnPath) {
            returnNavigationRef.current = {
                path: returnPath,
                state: routeState?.returnState ?? null,
            };
        }

        setSelectedCharacter(target);
        if (routeState?.autoStartGeneration) {
            setFeedback('已打开角色详情。可点击"重新生成"开始生成多视角。');
        }
        navigate(location.pathname, { replace: true, state: null });
    }, [pagedCharacters, location.pathname, location.state, navigate, token]);

    // 关闭角色详情
    const handleCloseCharacterDetail = () => {
        const returnNavigation = returnNavigationRef.current;
        setSelectedCharacter(null);
        if (returnNavigation?.path) {
            returnNavigationRef.current = null;
            navigate(returnNavigation.path, { state: returnNavigation.state ?? null });
        }
    };

    // 更新角色名称
    const handleCharacterNameUpdated = (characterId: string, newName: string) => {
        // 更新本地状态
        const updated = pagedCharacters.map((c: Character) => c.id === characterId ? { ...c, name: newName } : c);
        setCharacters(updated);
        // 更新选中角色
        if (selectedCharacter?.id === characterId) {
            setSelectedCharacter({ ...selectedCharacter, name: newName });
        }
        // 刷新列表
        charactersQuery.refetch();
    };

    return (
        <Layout>
            <div className="flex h-full bg-[#f8f9fc] relative">
                <CreateCharacterModal
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    onSave={handleAddNewCharacter}
                    suggestedTags={SUGGESTED_TAGS}
                />

                <CharacterDetailModal
                    isOpen={!!selectedCharacter}
                    character={selectedCharacter}
                    onClose={handleCloseCharacterDetail}
                    onNameUpdated={handleCharacterNameUpdated}
                />

                {/* 侧边栏筛选 */}
                <div className="w-64 bg-white border-r border-gray-100 hidden md:flex flex-col flex-shrink-0 h-full">
                    <div className="p-6 border-b border-gray-100">
                        <Button className="w-full flex items-center justify-center gap-2 py-3" onClick={() => setIsCreateModalOpen(true)}>
                            <span className="material-icons-round text-lg">add</span> 新建角色
                        </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                        {/* 性别筛选 */}
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 text-left">角色类型</h3>
                            <div className="flex flex-col items-start gap-1">
                                {[
                                    { id: 'all', label: '全部', icon: 'groups' },
                                    { id: 'male', label: '男', icon: 'man' },
                                    { id: 'female', label: '女', icon: 'woman' },
                                ].map(type => (
                                    <button
                                        key={type.id}
                                        onClick={() => setActiveTab(type.id as 'all' | 'male' | 'female')}
                                        className={`px-3 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${
                                            activeTab === type.id
                                            ? 'bg-primary/10 text-primary'
                                            : 'text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        <span className="material-icons-round text-base">{type.icon}</span>
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 标签筛选 */}
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">标签筛选</h3>
                                {selectedTags.length > 0 && (
                                    <button onClick={() => setSelectedTags([])} className="text-[10px] text-primary hover:underline">清除</button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {SUGGESTED_TAGS.map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => toggleFilterTag(tag)}
                                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                                            selectedTags.includes(tag)
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 主内容区 */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="px-8 py-5 bg-white border-b border-gray-200">
                        <div className="flex justify-between items-start gap-6">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 font-display">角色管理</h1>
                                <p className="text-gray-500 text-sm mt-1">
                                    管理您的基础角色、多视角图片角色及视频动态角色。
                                </p>
                            </div>
                            <div className="flex items-center gap-4 flex-shrink-0">
                                {/* 搜索框 */}
                                <SearchInput
                                    value={searchKeyword}
                                    onChange={setSearchKeyword}
                                    placeholder="搜索角色名称、标签..."
                                    className="w-64"
                                />
                                <div className="text-sm text-gray-500 whitespace-nowrap">
                                    共 <span className="font-bold text-gray-900">{total}</span> 个角色
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 bg-[#f8f9fc]">
                        {feedback && (
                            <div className="mb-4 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2">{feedback}</div>
                        )}
                        {pagedCharacters.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <span className="material-icons-round text-5xl mb-4 text-gray-300">person_off</span>
                                <p className="text-lg font-medium text-gray-500">未找到符合条件的角色</p>
                                {searchKeyword && (
                                    <p className="text-sm mt-2">
                                        搜索 "<span className="text-gray-700 font-medium">{searchKeyword}</span>" 无结果
                                    </p>
                                )}
                                <p className="text-sm mt-1 text-gray-400">尝试调整筛选条件或新建一个角色</p>
                                {searchKeyword ? (
                                    <Button className="mt-6" variant="secondary" onClick={() => setSearchKeyword('')}>
                                        清除搜索
                                    </Button>
                                ) : (
                                    <Button className="mt-6" onClick={() => setIsCreateModalOpen(true)}>
                                        <span className="material-icons-round text-sm mr-2">add</span> 新建角色
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                {pagedCharacters.map((char) => {
                                    return (
                                        <div
                                            key={char.id}
                                            onClick={() => setSelectedCharacter(char)}
                                            className="group bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 relative flex flex-col cursor-pointer"
                                        >
                                            <div className="relative">
                                                <BlurFillImage
                                                    src={
                                                        char.tags.some(t => t === 'auto-generated' || t.startsWith('step2'))
                                                            ? (char.fiveViewOssImageUrl || char.thumbnail)
                                                            : char.thumbnail
                                                    }
                                                    alt={char.name}
                                                    aspectClass="aspect-[4/3]"
                                                    hoverClass="group-hover:scale-105"
                                                />

                                                {/* AI 标签：AI 自动生成的角色 */}
                                                {char.tags.some(t => t === 'auto-generated' || t.startsWith('step2')) && (
                                                    <span className="absolute top-2.5 left-2.5 z-10 bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-[10px] font-bold px-2 py-1 rounded-md">AI</span>
                                                )}

                                                {/* 五视图标签：用户自定义角色 */}
                                                {!char.tags.some(t => t === 'auto-generated' || t.startsWith('step2')) && (
                                                    <span className="absolute top-2.5 left-2.5 z-10 bg-black/50 text-white text-[10px] font-medium px-1.5 py-1 rounded-md flex items-center gap-1">
                                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                                                        五视图
                                                    </span>
                                                )}

                                                {/* 删除按钮 */}
                                                <button
                                                    onClick={(e) => handleDelete(e, char.id)}
                                                    className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-red-500 text-white w-7 h-7 flex items-center justify-center rounded-full"
                                                    title="删除角色"
                                                >
                                                    <span className="material-icons-round text-base">delete</span>
                                                </button>

                                                {/* 悬浮遮罩：点击卡片即可查看详情，无需额外按钮 */}
                                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />

                                                {/* 状态指示 */}
                                                {char.status === 'processing' && (
                                                    <div className="pointer-events-none absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white">
                                                        <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></span>
                                                        生成多视角中
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-4 flex-1 flex flex-col">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h3 className="font-bold text-gray-900 line-clamp-1" title={char.name}>{char.name}</h3>
                                                </div>

                                                <div className="flex flex-wrap gap-1.5 mt-auto">
                                                    {char.tags.slice(0, 3).map(tag => (
                                                        <span key={tag} className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                                                            tag === '男性' ? 'bg-blue-50 text-blue-600' :
                                                            tag === '女性' ? 'bg-red-50 text-red-500' :
                                                            tag.startsWith('step2') || tag === 'auto-generated' ? 'bg-indigo-50 text-indigo-500' :
                                                            'bg-gray-100 text-gray-600'
                                                        }`}>{tag}</span>
                                                    ))}
                                                    {char.tags.length > 3 && (
                                                        <span className="text-[10px] text-gray-400 py-0.5">+{char.tags.length - 3}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* 分页控件 */}
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={total}
                            onPageChange={setCurrentPage}
                            pageSize={pageSize}
                        />
                    </div>
                </div>
            </div>
        </Layout>
    );
};