import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../../components/Layout';
import { ApiError, backendApi } from '../../services/backendApi';
import { Button } from '../../components/ui/Button';
import { VideoAsset } from '../../types';
import type { GarmentAsset } from '../../services/realApi/garment-assets';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { AssetModal } from '../../components/shared/AssetModal';
import { BlurFillImage } from '../../components/shared/BlurFillImage';
import { ImageLightbox } from '../../components/shared/ImageLightbox';
import { Pagination } from '../../components/ui/Pagination';
import { SearchInput } from '../../components/ui/SearchInput';
import {
  GARMENT_CATEGORY_LABELS,
  GARMENT_CATEGORY_ICON,
  type GarmentCategory,
} from '../../../../src/contant-config/shared_dict';

export const AssetLibrary: React.FC = () => {
  const { token, setAssets } = useAppStore(useShallow((state) => ({ token: state.token, setAssets: state.setAssets })));
  const [feedback, setFeedback] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState('all');

  // 搜索状态
  const [searchKeyword, setSearchKeyword] = useState('');

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<VideoAsset | null>(null);

  // 图片预览状态
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // 删除确认弹窗
  const { confirm } = useConfirm();

  // 查询参数：由筛选和分页状态驱动
  const queryParams = useMemo(() => ({
    page: currentPage,
    pageSize,
    category: activeFilter !== 'all' ? activeFilter : undefined,
    keyword: searchKeyword.trim() || undefined,
  }), [currentPage, pageSize, activeFilter, searchKeyword]);

  // 服饰列表查询（服务端分页+筛选）
  const assetsQuery = useQuery({
    queryKey: ['garment-assets', token, queryParams],
    enabled: Boolean(token),
    queryFn: async () => {
      if (!token) return { items: [], total: 0, page: 1, pageSize, totalPages: 0, hasMore: false };
      return backendApi.listGarmentAssets(token, queryParams);
    },
  });

  // 映射后端数据为前端 VideoAsset 格式
  const mapGarmentAsset = (item: GarmentAsset): VideoAsset => ({
    id: item.id,
    name: item.name,
    mainImageUrl: item.mainImageUrl,
    subImageUrl1: item.subImageUrl1,
    subImageUrl2: item.subImageUrl2,
    subImageUrl3: item.subImageUrl3,
    flatLayImageUrl: item.flatLayImageUrl,
    type: item.type as 'image' | 'video',
    category: item.category as 'top' | 'bottom' | 'shoes' | 'accessory' | 'outfit',
    description: item.description ?? undefined,
    clothingAttrs: {
      mainColor: item.mainColor,
      material: item.material,
      pattern: item.pattern,
      fit: item.fit,
      length: item.length,
      neckline: item.neckline,
      sleeve: item.sleeve,
      style: item.style,
      occasion: item.occasion,
    },
    classification: item.aiCategory ? {
      category: item.aiCategory,
      confidence: item.aiConfidence ?? 0,
      viewLabel: item.aiViewLabel ?? 'unknown',
      reason: item.aiReason ?? '',
    } : undefined,
    variantGroupId: item.variantGroupId,
    variantColor: item.variantColor,
    isPrimaryVariant: item.isPrimaryVariant,
  });

  // 当前页服饰列表
  const pagedAssets = useMemo(() => {
    return (assetsQuery.data?.items ?? []).map(mapGarmentAsset);
  }, [assetsQuery.data]);

  // 变体组映射：variantGroupId → 同组资产列表（用于展示关联圆点）
  const variantGroupMap = useMemo(() => {
    const map = new Map<string, VideoAsset[]>();
    for (const asset of pagedAssets) {
      if (asset.variantGroupId) {
        const list = map.get(asset.variantGroupId) ?? [];
        list.push(asset);
        map.set(asset.variantGroupId, list);
      }
    }
    return map;
  }, [pagedAssets]);

  // 颜色名称 → 近似 hex 映射
  const colorNameToHex = (name: string | null | undefined): string => {
    if (!name) return '#ccc';
    const map: Record<string, string> = {
      '白': '#fff', '白色': '#fff', '米白': '#f5f0e8', '象牙白': '#fffff0',
      '黑': '#222', '黑色': '#222',
      '红': '#e53e3e', '红色': '#e53e3e', '酒红': '#722f37',
      '蓝': '#3b82f6', '蓝色': '#3b82f6', '藏蓝': '#1e3a5f', '天蓝': '#87ceeb',
      '绿': '#22c55e', '绿色': '#22c55e', '墨绿': '#2d5016',
      '黄': '#eab308', '黄色': '#eab308', '姜黄': '#c58b18',
      '粉': '#f472b6', '粉色': '#f472b6', '粉红': '#f472b6',
      '紫': '#a855f7', '紫色': '#a855f7',
      '橙': '#f97316', '橙色': '#f97316',
      '灰': '#9ca3af', '灰色': '#9ca3af',
      '棕': '#92400e', '棕色': '#92400e', '咖啡': '#6f4e37',
      '卡其': '#c3b091', '驼色': '#c3b091',
      '军绿': '#4b5320', '焦糖': '#b5651d',
    };
    for (const [key, hex] of Object.entries(map)) {
      if (name.includes(key)) return hex;
    }
    return '#ccc';
  };

  // 总页数由后端返回
  const totalPages = assetsQuery.data?.totalPages ?? 1;
  const total = assetsQuery.data?.total ?? 0;

  useEffect(() => {
    setAssets(pagedAssets);
  }, [pagedAssets, setAssets]);

  // 分类筛选配置（从统一字典获取 label 和 icon）
  const filters = [
    { id: 'all', label: '全部', icon: 'apps' },
    ...Object.entries(GARMENT_CATEGORY_LABELS).map(([id, label]) => ({
      id,
      label,
      icon: GARMENT_CATEGORY_ICON[id as GarmentCategory],
    })),
  ];

  // 获取分类标签（兼容 outfit → suit）
  const getCategoryLabel = (category: string) =>
    category === 'outfit' ? GARMENT_CATEGORY_LABELS.suit : (GARMENT_CATEGORY_LABELS[category as GarmentCategory] ?? category);

  // 获取分类图标（兼容 outfit → suit）
  const getCategoryIcon = (category: string) =>
    category === 'outfit' ? GARMENT_CATEGORY_ICON.suit : (GARMENT_CATEGORY_ICON[category as GarmentCategory] ?? 'style');

  // 过滤条件变化时重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchKeyword]);

  const createDefaultCategory: 'top' | 'bottom' | 'shoes' | 'accessory' | 'suit' | 'dress' | 'outer' =
    activeFilter === 'top' || activeFilter === 'bottom' || activeFilter === 'shoes' || activeFilter === 'accessory' || activeFilter === 'suit' || activeFilter === 'dress' || activeFilter === 'outer'
      ? activeFilter
      : 'top';

  const handleOpenUpload = () => {
      setEditingAsset(null);
      setIsModalOpen(true);
  };

  const handleOpenEdit = (e: React.MouseEvent, asset: VideoAsset) => {
      e.stopPropagation();
      setEditingAsset(asset);
      setIsModalOpen(true);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const confirmed = await confirm('确定要删除这个素材吗？', '删除确认');
      if (confirmed) {
          if (!token) return;
          try {
              setFeedback(null);
              // 使用新的 garment-assets API 删除服饰资产
              await backendApi.deleteGarmentAsset(token, id);
              await assetsQuery.refetch();
          } catch (error) {
              const message = error instanceof ApiError ? error.message : '删除素材失败';
              setFeedback(message);
          }
      }
  };

  // 获取资产的所有图片（过滤空值）
  const getAssetImages = (asset: VideoAsset): string[] => {
    const images: string[] = [];
    if (asset.mainImageUrl) images.push(asset.mainImageUrl);
    if (asset.subImageUrl1) images.push(asset.subImageUrl1);
    if (asset.subImageUrl2) images.push(asset.subImageUrl2);
    if (asset.subImageUrl3) images.push(asset.subImageUrl3);
    if (asset.flatLayImageUrl) images.push(asset.flatLayImageUrl);
    return images;
  };

  // 打开图片预览
  const handleImagePreview = (e: React.MouseEvent, asset: VideoAsset, imageIndex: number = 0) => {
    e.stopPropagation();
    const images = getAssetImages(asset);
    if (images.length > 0) {
      setLightboxImages(images);
      setLightboxIndex(Math.min(imageIndex, images.length - 1));
      setLightboxOpen(true);
    }
  };

  return (
    <Layout>
      <div className="flex h-full bg-[#f8f9fc] relative">
         <AssetModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onAssetCreated={() => void assetsQuery.refetch()}
            onAssetUpdated={() => void assetsQuery.refetch()}
            initialData={editingAsset}
            defaultCategory={createDefaultCategory}
            token={token}
         />

         {/* 侧边栏筛选 */}
         <div className="w-64 bg-white border-r border-gray-100 hidden md:flex flex-col flex-shrink-0 h-full">
           <div className="p-6 border-b border-gray-100">
             <Button className="w-full flex items-center justify-center gap-2 py-3" onClick={handleOpenUpload}>
               <span className="material-icons-round text-lg">add</span> 上传服饰
             </Button>
           </div>

           <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
             {/* 分类筛选 */}
             <div>
               <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 text-left">服饰分类</h3>
               <div className="flex flex-col items-start gap-1">
                 {filters.map(filter => (
                   <button
                     key={filter.id}
                     onClick={() => setActiveFilter(filter.id)}
                     className={`px-3 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${
                       activeFilter === filter.id
                       ? 'bg-primary/10 text-primary'
                       : 'text-gray-600 hover:bg-gray-50'
                     }`}
                   >
                     <span className="w-6 h-6 flex items-center justify-center shrink-0">
                       <span className="material-icons-round text-lg">
                         {filter.icon}
                       </span>
                     </span>
                     {filter.label}
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
                 <h1 className="text-2xl font-bold text-gray-900 font-display">服饰库</h1>
                 <p className="text-gray-500 text-sm mt-1">管理您的服装单品、配饰及套装搭配。</p>
               </div>
               <div className="flex items-center gap-4 flex-shrink-0">
                 {/* 搜索框 */}
                 <SearchInput
                   value={searchKeyword}
                   onChange={setSearchKeyword}
                   placeholder="搜索服饰名称、颜色、风格..."
                   className="w-64"
                 />
                 <div className="text-sm text-gray-500 whitespace-nowrap">
                   共 <span className="font-bold text-gray-900">{total}</span> 件服饰
                 </div>
               </div>
             </div>
           </div>

           <div className="flex-1 overflow-y-auto p-8 bg-[#f8f9fc]">
             {feedback && (
               <div className="mb-4 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2">{feedback}</div>
             )}

             {assetsQuery.isLoading && pagedAssets.length === 0 ? (
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                 {[1,2,3,4].map(i => <div key={i} className="aspect-[3/4] bg-gray-100 rounded-xl animate-pulse"></div>)}
               </div>
             ) : pagedAssets.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-gray-400">
                 <span className="material-icons-round text-5xl mb-4 text-gray-300">inventory</span>
                 <p className="text-lg font-medium text-gray-500">未找到符合条件的服饰</p>
                 {searchKeyword && (
                   <p className="text-sm mt-2">
                     搜索 "<span className="text-gray-700 font-medium">{searchKeyword}</span>" 无结果
                   </p>
                 )}
                 <p className="text-sm mt-1 text-gray-400">尝试调整筛选条件或上传服饰</p>
                 {searchKeyword ? (
                   <Button className="mt-6" variant="secondary" onClick={() => setSearchKeyword('')}>
                     清除搜索
                   </Button>
                 ) : (
                   <Button className="mt-6" onClick={handleOpenUpload}>
                     <span className="material-icons-round text-sm mr-2">add</span> 上传服饰
                   </Button>
                 )}
               </div>
             ) : (
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                 {pagedAssets.map(asset => (
                   <div key={asset.id} className="group bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 relative flex flex-col cursor-pointer" onClick={(e) => handleOpenEdit(e, asset)}>
                     <div className="relative">
                       {asset.type === 'video' ? (
                         <div className="aspect-[4/3] bg-gray-900 relative overflow-hidden">
                           <video src={asset.mainImageUrl} className="w-full h-full object-cover" muted loop />
                           <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                             <span className="material-icons-round text-white drop-shadow-md text-3xl">play_circle</span>
                           </div>
                         </div>
                       ) : (
                         <BlurFillImage
                           src={asset.mainImageUrl}
                           alt={asset.name}
                           aspectClass="aspect-[4/3]"
                           hoverClass="group-hover:scale-105"
                         />
                       )}

                       {/* 分类标签 */}
                       <span className="absolute top-2.5 left-2.5 z-10 bg-black/50 backdrop-blur-md text-white px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1">
                         <span className="material-icons-round text-xs">
                           {getCategoryIcon(asset.category)}
                         </span>
                         {getCategoryLabel(asset.category)}
                       </span>

                       {/* 删除按钮 */}
                       <button
                         onClick={(e) => handleDelete(e, asset.id)}
                         className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-red-500 text-white w-7 h-7 flex items-center justify-center rounded-full"
                         title="删除素材"
                       >
                         <span className="material-icons-round text-base">delete</span>
                       </button>

                       {/* 悬浮编辑 */}
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                         <button
                           onClick={(e) => handleOpenEdit(e, asset)}
                           className="bg-primary text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-primary-hover transition-colors shadow-lg transform hover:scale-105 flex items-center gap-1"
                         >
                           <span className="material-icons-round text-sm">edit</span> 编辑
                         </button>
                       </div>
                     </div>

                     <div className="p-4 flex-1 flex flex-col">
                       <div className="flex justify-between items-start mb-2 gap-2">
                         <h3 className="font-bold text-gray-900 line-clamp-1 flex-1" title={asset.name}>{asset.name}</h3>
                         {asset.category && (
                           <span className={`text-[10px] font-medium px-2 py-0.5 rounded flex-shrink-0 ${
                             asset.category === 'top' ? 'bg-blue-50 text-blue-600' :
                             asset.category === 'bottom' ? 'bg-amber-50 text-amber-600' :
                             asset.category === 'shoes' ? 'bg-emerald-50 text-emerald-600' :
                             asset.category === 'accessory' ? 'bg-purple-50 text-purple-600' :
                             asset.category === 'suit' || asset.category === 'outfit' ? 'bg-pink-50 text-pink-600' :
                             asset.category === 'dress' ? 'bg-rose-50 text-rose-600' :
                             asset.category === 'outer' ? 'bg-cyan-50 text-cyan-600' :
                             'bg-gray-100 text-gray-600'
                           }`}>{getCategoryLabel(asset.category)}</span>
                         )}
                       </div>

                       {/* 缩略图列表 */}
                       {(() => {
                         const images = getAssetImages(asset);
                         if (images.length > 1) {
                           return (
                             <div className="flex gap-1.5 mb-2">
                               {images.map((img, idx) => (
                                 <button
                                   key={idx}
                                   onClick={(e) => handleImagePreview(e, asset, idx)}
                                   className="w-10 h-10 rounded overflow-hidden border border-gray-200 hover:border-primary transition-colors flex-shrink-0"
                                   title={`查看图片 ${idx + 1}`}
                                 >
                                   <img loading="lazy" src={img} alt={`${asset.name} - ${idx + 1}`} className="w-full h-full object-cover" />
                                 </button>
                               ))}
                             </div>
                           );
                         }
                         return null;
                       })()}

                       <div className="flex flex-wrap gap-1.5 mt-auto">
                         {asset.clothingAttrs?.mainColor && (
                           <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">{asset.clothingAttrs.mainColor}</span>
                         )}
                         {asset.clothingAttrs?.style && (
                           <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">{asset.clothingAttrs.style}</span>
                         )}
                       </div>

                       {/* 变体关联指示 */}
                       {(() => {
                         if (!asset.variantGroupId) return null;
                         const siblings = variantGroupMap.get(asset.variantGroupId) ?? [];
                         if (siblings.length < 2) return null;
                         return (
                           <div className="mt-2 pt-2 border-t border-gray-100">
                             <div className="flex items-center gap-1.5">
                               <span className="material-icons-round text-xs text-primary">link</span>
                               <span className="text-[10px] text-gray-400">同款 {siblings.length} 色</span>
                               <div className="flex gap-1 ml-auto">
                                 {siblings.map(s => (
                                   <button
                                     key={s.id}
                                     title={s.clothingAttrs?.mainColor ?? s.name}
                                     className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                                       s.id === asset.id
                                         ? 'border-primary scale-110'
                                         : colorNameToHex(s.clothingAttrs?.mainColor) === '#fff'
                                           ? 'border-gray-300 hover:border-primary/50'
                                           : 'border-gray-200 hover:border-primary/50'
                                     }`}
                                     style={{ backgroundColor: colorNameToHex(s.clothingAttrs?.mainColor) }}
                                   />
                                 ))}
                               </div>
                             </div>
                           </div>
                         );
                       })()}
                     </div>
                   </div>
                 ))}
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

         {/* 图片预览 Lightbox */}
         <ImageLightbox
           url={lightboxImages[lightboxIndex] || ''}
           alt="服饰图片预览"
           open={lightboxOpen}
           onClose={() => setLightboxOpen(false)}
           frames={lightboxImages}
           currentIndex={lightboxIndex}
           onNavigate={setLightboxIndex}
         />
      </div>
    </Layout>
  );
};
