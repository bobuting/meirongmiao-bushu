/**
 * Step3 Tab - 图片项目：模特图，视频项目：脚本+分镜
 */

import React from 'react';
import { getOssThumbnailUrl, getOssVideoSnapshotUrl } from '../../../../utils/ossImage';
import { CharacterCard } from '../components/CharacterCard';

interface Step3TabProps {
  detail: any;
  setPreviewImages: (images: { frames: string[]; index: number } | null) => void;
  setPreviewVideoUrl: (url: string | null) => void;
}

const formatTimestamp = (ts: number) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const getStrategyTypeIcon = (type: string) => {
  const icons: Record<string, string> = {
    product_focus: 'inventory_2',
    lifestyle: 'nature_people',
    story_driven: 'auto_stories',
    emotional: 'favorite',
    tutorial: 'school',
  };
  return icons[type] || 'description';
};

const getStrategyTypeShortLabel = (type: string) => {
  const labels: Record<string, string> = {
    product_focus: '产品',
    lifestyle: '生活',
    story_driven: '故事',
    emotional: '情感',
    tutorial: '教程',
  };
  return labels[type] || type;
};

export const Step3Tab: React.FC<Step3TabProps> = ({ detail, setPreviewImages, setPreviewVideoUrl }) => {
  const isOutfitChangeProject = detail?.basicInfo.projectKind === 'outfit_change';

  return (
    <div className="space-y-6">
      {/* 换装项目 Step3: 换装任务信息 */}
      {isOutfitChangeProject && (
        <div className="space-y-6">
          {/* 换装任务基本信息 */}
          {detail.step3Data.outfitChangeTask && (
            <div>
              <div className="text-sm font-medium text-gray-700 mb-3">换装任务信息</div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-medium text-gray-900">任务 ID: {detail.step3Data.outfitChangeTask.taskId}</span>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    detail.step3Data.outfitChangeTask.status === 'succeeded' ? 'bg-green-500 text-white' :
                    detail.step3Data.outfitChangeTask.status === 'failed' ? 'bg-red-500 text-white' :
                    'bg-yellow-500 text-white'
                  }`}>
                    {detail.step3Data.outfitChangeTask.status}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>创建: {formatTimestamp(detail.step3Data.outfitChangeTask.createdAt)}</span>
                  <span>更新: {formatTimestamp(detail.step3Data.outfitChangeTask.updatedAt)}</span>
                </div>
                {detail.step3Data.outfitChangeTask.errorMessage && (
                  <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                    错误: {detail.step3Data.outfitChangeTask.errorMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 角色信息 */}
          {detail.step3Data.outfitChangeTask?.character && (
            <div>
              <div className="text-sm font-medium text-gray-700 mb-3">角色</div>
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-white max-w-[300px]">
                <div className="aspect-square bg-gray-100">
                  {detail.step3Data.outfitChangeTask.character.thumbnailUrl && (
                    <img
                      src={getOssThumbnailUrl(detail.step3Data.outfitChangeTask.character.thumbnailUrl, 200)}
                      alt={detail.step3Data.outfitChangeTask.character.name || '角色'}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setPreviewImages({
                        frames: [detail.step3Data.outfitChangeTask!.character!.thumbnailUrl!],
                        index: 0
                      })}
                    />
                  )}
                </div>
                <div className="p-3">
                  {detail.step3Data.outfitChangeTask.character.name && (
                    <div className="text-sm font-medium text-gray-900">
                      {detail.step3Data.outfitChangeTask.character.name}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 图片项目 Step3: 模特图 */}
      {detail.basicInfo.projectKind === 'image' && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-3">
            模特图 ({detail.step3Data.modelPhotos.length})
          </div>
          {detail.step3Data.modelPhotos.length === 0 ? (
            <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-lg">
              暂无模特图数据
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-3">
              {detail.step3Data.modelPhotos.map((photo: any) => (
                <div
                  key={photo.id}
                  className={`rounded-xl border overflow-hidden bg-white hover:shadow-md transition-all cursor-pointer ${
                    photo.isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200'
                  }`}
                  onClick={() => {
                    const allUrls = detail.step3Data.modelPhotos.map((p: any) => p.imageUrl).filter(Boolean) as string[];
                    const idx = allUrls.indexOf(photo.imageUrl);
                    setPreviewImages({ frames: allUrls, index: idx >= 0 ? idx : 0 });
                  }}
                >
                  <div className="aspect-square bg-gray-100">
                    {photo.imageUrl ? (
                      <img
                        src={getOssThumbnailUrl(photo.imageUrl, 200)}
                        alt={photo.poseLabel || '模特图'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-icons-round text-3xl text-gray-300">person</span>
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    {photo.isSelected && (
                      <div className="text-xs text-primary font-medium mb-1">已选中</div>
                    )}
                    {photo.poseLabel && (
                      <div className="text-xs text-gray-800 font-medium truncate">{photo.poseLabel}</div>
                    )}
                    {photo.bgLabel && (
                      <div className="text-xs text-gray-500 truncate">{photo.bgLabel}</div>
                    )}
                    {photo.status !== 'success' && (
                      <div className="text-xs text-red-500 mt-1">{photo.status}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 视频项目 Step3: 脚本+分镜 */}
      {detail.basicInfo.projectKind !== 'image' && (
        <>
          {/* 锁定的脚本 */}
          <div>
            <div className="text-sm font-medium text-gray-700 mb-3">锁定的脚本</div>
            {detail.step3Data.script ? (
              <div className="rounded-lg border border-primary bg-primary/5 p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">
                    {detail.step3Data.script.title || '脚本'}
                  </span>
                  {detail.step3Data.script.isConfirmed && (
                    <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">
                      已确认
                    </span>
                  )}
                  {detail.step3Data.script.isSelected && (
                    <span className="px-2 py-0.5 bg-primary text-white text-xs rounded-full">
                      已选中
                    </span>
                  )}
                  {detail.step3Data.script.strategyType && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full flex items-center gap-1">
                      <span className="material-icons-round text-xs">{getStrategyTypeIcon(detail.step3Data.script.strategyType)}</span>
                      {getStrategyTypeShortLabel(detail.step3Data.script.strategyType)}
                    </span>
                  )}
                  {detail.step3Data.script.source && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                      {detail.step3Data.script.source}
                    </span>
                  )}
                </div>
                {detail.step3Data.script.summary && (
                  <div className="text-xs text-gray-600 mb-2 line-clamp-2">
                    {detail.step3Data.script.summary}
                  </div>
                )}
                <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
                  {detail.step3Data.script.durationSeconds && (
                    <span>时长: {detail.step3Data.script.durationSeconds}s</span>
                  )}
                  {detail.step3Data.script.primaryEmotion && (
                    <span>情感: {detail.step3Data.script.primaryEmotion}</span>
                  )}
                  {detail.step3Data.script.theme && (
                    <span>主题: {detail.step3Data.script.theme}</span>
                  )}
                  {detail.step3Data.script.videoStyle && (
                    <span>风格: {detail.step3Data.script.videoStyle}</span>
                  )}
                  {detail.step3Data.script.createdAt > 0 && (
                    <span>创建: {formatTimestamp(detail.step3Data.script.createdAt)}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-lg">
                暂无锁定的脚本
              </div>
            )}
          </div>

          {/* 脚本历史记录 */}
          {(detail.step3Data.scriptHistory?.length ?? 0) > 1 && (
            <div>
              <details className="group">
                <summary className="text-sm font-medium text-gray-700 mb-3 cursor-pointer flex items-center gap-1">
                  <span className="material-icons-round text-sm transition-transform group-open:rotate-90">chevron_right</span>
                  脚本历史 ({detail.step3Data.scriptHistory!.length})
                </summary>
                <div className="mt-2 space-y-2 max-h-[400px] overflow-y-auto">
                  {detail.step3Data.scriptHistory!.map((s: any, idx: number) => (
                    <div
                      key={s.id}
                      className={`rounded-lg border p-3 text-xs ${
                        s.isConfirmed || s.isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-gray-900 truncate max-w-[200px]">{s.title || `脚本 #${idx + 1}`}</span>
                        {s.isConfirmed && (
                          <span className="px-1.5 py-0.5 bg-green-500 text-white text-[10px] rounded-full">已确认</span>
                        )}
                        {s.isSelected && (
                          <span className="px-1.5 py-0.5 bg-primary text-white text-[10px] rounded-full">已选中</span>
                        )}
                        {s.strategyType && (
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded-full">
                            {getStrategyTypeShortLabel(s.strategyType)}
                          </span>
                        )}
                        {s.source && (
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full">
                            {s.source}
                          </span>
                        )}
                      </div>
                      {s.summary && (
                        <div className="text-gray-500 line-clamp-1 mb-1">{s.summary}</div>
                      )}
                      <div className="flex gap-3 text-gray-400 flex-wrap">
                        {s.durationSeconds > 0 && <span>{s.durationSeconds}s</span>}
                        {s.primaryEmotion && <span>{s.primaryEmotion}</span>}
                        {s.theme && <span>{s.theme}</span>}
                        {s.createdAt > 0 && <span>{formatTimestamp(s.createdAt)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* 分镜详情（描述+图片合并展示） */}
          <div>
            <div className="text-sm font-medium text-gray-700 mb-3">
              分镜详情 ({detail.step3Data.storyboards.length})
            </div>
            {detail.step3Data.storyboards.length === 0 ? (
              <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-lg">
                暂无分镜数据
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {detail.step3Data.storyboards.map((sb: any) => {
                  // 匹配对应分镜描述
                  const shot = detail.step3Data.shotBreakdowns.find((s: any) => s.shotIndex === sb.frameIndex);
                  // 从 visualJson 中提取视觉提示词
                  const visualPrompt = (shot?.visualJson as any)?.visualPrompt || (shot?.visualJson as any)?.visualCue || '';
                  // 从 textElementsJson 中提取旁白
                  const narration = (shot?.textElementsJson as any)?.narration || '';
                  return (
                    <div
                      key={sb.id}
                      className="rounded-xl border border-gray-200 overflow-hidden bg-white hover:shadow-md transition-all"
                    >
                      <div className="aspect-[9/16] bg-gray-100 relative cursor-pointer"
                        onClick={() => {
                          const allUrls = detail.step3Data.storyboards.map((s: any) => s.selectedImageUrl).filter(Boolean) as string[];
                          const idx = allUrls.indexOf(sb.selectedImageUrl);
                          setPreviewImages({ frames: allUrls, index: idx >= 0 ? idx : 0 });
                        }}
                      >
                        {sb.selectedImageUrl ? (
                          <img
                            src={getOssThumbnailUrl(sb.selectedImageUrl, 400)}
                            alt={`分镜 ${sb.frameIndex + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-icons-round text-3xl text-gray-300">image</span>
                          </div>
                        )}
                        {/* 分镜编号角标 */}
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-xs rounded font-medium">
                          #{sb.frameIndex + 1}
                        </div>
                        {/* 生成状态 */}
                        {sb.status && sb.status !== 'ready' && (
                          <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-amber-500 text-white text-[10px] rounded">
                            {sb.status}
                          </div>
                        )}
                      </div>
                      {/* 分镜描述信息 */}
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-gray-900">
                            镜头 #{sb.frameIndex + 1}
                          </span>
                          {shot?.shotType && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                              {shot.shotType}
                            </span>
                          )}
                          {shot?.durationSeconds && (
                            <span className="text-xs text-gray-500">
                              {shot.durationSeconds}s
                            </span>
                          )}
                        </div>
                        {shot?.shotDescription && (
                          <div className="text-xs text-gray-600 mt-1 line-clamp-2" title={shot.shotDescription}>
                            {shot.shotDescription}
                          </div>
                        )}
                        {narration && (
                          <div className="text-xs text-emerald-700 mt-1 line-clamp-1 bg-emerald-50 px-1.5 py-0.5 rounded" title={narration}>
                            旁白: {narration}
                          </div>
                        )}
                        {visualPrompt && (
                          <div className="text-xs text-indigo-700 mt-1 line-clamp-1 bg-indigo-50 px-1.5 py-0.5 rounded" title={visualPrompt}>
                            画面: {visualPrompt}
                          </div>
                        )}
                        {sb.imagePrompt && (
                          <div className="text-xs text-orange-700 mt-1 line-clamp-1 bg-orange-50 px-1.5 py-0.5 rounded" title={sb.imagePrompt}>
                            图片提示词: {sb.imagePrompt}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
