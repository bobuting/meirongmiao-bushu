/**
 * Step1 Tab - 服饰搭配
 */

import React from 'react';
import { getOssThumbnailUrl, getOssVideoSnapshotUrl } from '../../../../utils/ossImage';
import { GARMENT_CATEGORY_LABELS } from '../../../../../../src/contant-config/shared_dict';
import { CharacterCard } from '../components/CharacterCard';

interface Step1TabProps {
  detail: any;
  setPreviewImages: (images: { frames: string[]; index: number } | null) => void;
  setPreviewVideoUrl: (url: string | null) => void;
}

export const Step1Tab: React.FC<Step1TabProps> = ({ detail, setPreviewImages, setPreviewVideoUrl }) => {
  const isOutfitChangeProject = detail?.basicInfo.projectKind === 'outfit_change';

  return (
    <div className="space-y-6">
      {/* 换装项目 Step1: 源视频 */}
      {isOutfitChangeProject && detail.step3Data.outfitChangeTask?.sourceVideoUrl && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-3">源视频</div>
          <div
            className="rounded-xl border border-gray-200 overflow-hidden bg-white hover:shadow-md transition-all cursor-pointer max-w-[400px]"
            onClick={() => setPreviewVideoUrl(detail.step3Data.outfitChangeTask!.sourceVideoUrl)}
          >
            <div className="aspect-[9/16] bg-gray-900 relative group">
              <img
                src={getOssVideoSnapshotUrl(detail.step3Data.outfitChangeTask.sourceVideoUrl, 0, 300)}
                alt="源视频"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-12 h-12 rounded-full bg-white/80 flex items-center justify-center">
                  <span className="material-icons-round text-gray-800 text-2xl">play_arrow</span>
                </div>
              </div>
              <div className="absolute bottom-2 left-2 right-2 bg-black/60 text-white text-xs p-2 rounded">
                <div className="font-medium">源视频（上传用于换装）</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 服饰网格 */}
      <div>
        <div className="text-sm font-medium text-gray-700 mb-3">
          上传服饰 ({detail.step1Data.garments.length})
        </div>
        {detail.step1Data.garments.length === 0 ? (
          <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-lg">
            暂无服饰数据
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-3">
            {detail.step1Data.garments.map((garment: any) => {
              const garmentImages = [garment.imageUrl, ...(garment.subImageUrls || []), garment.flatLayImageUrl].filter(Boolean) as string[];
              // 预览该服饰的所有图片
              const handlePreview = (startIndex: number = 0) => {
                setPreviewImages({ frames: garmentImages, index: startIndex });
              };
              // 点击缩略图时切换到对应图片
              const handleThumbnailClick = (e: React.MouseEvent, url: string) => {
                e.stopPropagation(); // 阻止冒泡到父容器
                const idx = garmentImages.indexOf(url);
                handlePreview(idx >= 0 ? idx : 0);
              };
              return (
                <div
                  key={garment.id}
                  className="rounded-lg border border-gray-200 overflow-hidden bg-white hover:shadow-md transition-all cursor-pointer"
                  onClick={() => handlePreview(0)}
                >
                  <div className="aspect-square bg-gray-100">
                    {garment.imageUrl ? (
                      <img
                        src={getOssThumbnailUrl(garment.imageUrl, 200)}
                        alt={garment.name || '服饰'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-icons-round text-3xl text-gray-300">checkroom</span>
                      </div>
                    )}
                  </div>
                  {/* 其他视角 + 平铺图缩略图 */}
                  {garmentImages.length > 1 && (
                    <div className="flex gap-1 p-1 bg-gray-50">
                      {(garment.subImageUrls || []).slice(0, 3).map((url: string, i: number) => (
                        <img
                          key={`sub-${i}`}
                          src={getOssThumbnailUrl(url, 60)}
                          alt={`视角${i + 1}`}
                          className="w-6 h-6 object-cover rounded border border-gray-200 cursor-pointer hover:border-primary"
                          onClick={(e) => handleThumbnailClick(e, url)}
                        />
                      ))}
                      {garment.flatLayImageUrl && (
                        <div className="relative">
                          <img
                            src={getOssThumbnailUrl(garment.flatLayImageUrl, 60)}
                            alt="平铺图"
                            className="w-6 h-6 object-cover rounded border border-blue-200 cursor-pointer hover:border-blue-500"
                            onClick={(e) => handleThumbnailClick(e, garment.flatLayImageUrl)}
                          />
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-[6px]">平</span>
                          </div>
                        </div>
                      )}
                      {garmentImages.length - 1 > 4 && (
                        <div className="w-6 h-6 flex items-center justify-center text-xs text-gray-400 bg-gray-100 rounded border border-gray-200">
                          +{garmentImages.length - 5}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="p-2">
                    <div className="text-xs font-medium text-gray-800 truncate" title={garment.name || '未知服饰'}>
                      {garment.name || '未命名服饰'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {garment.category ? (GARMENT_CATEGORY_LABELS[garment.category as keyof typeof GARMENT_CATEGORY_LABELS] || garment.category) : '未知类型'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 搭配推荐 */}
      <div>
        <div className="text-sm font-medium text-gray-700 mb-3">
          搭配推荐 ({detail.step1Data.outfitPlans.length})
        </div>
        {detail.step1Data.outfitPlans.length === 0 ? (
          <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-lg">
            暂无搭配推荐
          </div>
        ) : (
          <div className="space-y-3">
            {detail.step1Data.outfitPlans.map((plan: any) => (
              <div
                key={plan.id}
                className={`rounded-lg border p-4 ${plan.selected ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-900">
                    {plan.title || '搭配方案'}
                  </span>
                  {plan.selected && (
                    <span className="px-2 py-0.5 bg-primary text-white text-xs rounded-full">
                      已选中
                    </span>
                  )}
                </div>
                {plan.reason && (
                  <div className="text-xs text-gray-600 mb-2">{plan.reason}</div>
                )}
                {plan.assetIds && plan.assetIds.length > 0 && (
                  <div className="text-xs text-gray-500">
                    服饰: {plan.assetIds.length} 件
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};