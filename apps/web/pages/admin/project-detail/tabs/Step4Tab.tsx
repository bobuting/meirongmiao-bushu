/**
 * Step4 Tab - 图片项目：电商详情页，视频项目：视频成片
 */

import React from 'react';
import { getOssThumbnailUrl, getOssVideoSnapshotUrl } from '../../../../utils/ossImage';

interface Step4TabProps {
  detail: any;
  setPreviewImages: (images: { frames: string[]; index: number } | null) => void;
  setPreviewVideoUrl: (url: string | null) => void;
  setShareModalOpen: (open: boolean) => void;
  setShareLinkCopied: (copied: boolean) => void;
}

const formatTimestamp = (ts: number) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const Step4Tab: React.FC<Step4TabProps> = ({
  detail,
  setPreviewImages,
  setPreviewVideoUrl,
  setShareModalOpen,
  setShareLinkCopied
}) => {
  const isOutfitChangeProject = detail?.basicInfo.projectKind === 'outfit_change';

  return (
    <div className="space-y-6">
      {/* 换装项目 Step4: 换装结果 */}
      {isOutfitChangeProject && (
        <div className="space-y-6">
          {/* 各阶段结果 */}
          {detail.step4Data.outfitChangeStages && (
            <>
              {/* Stage 0: 参考图采集 */}
              {detail.step4Data.outfitChangeStages.stage0 && (
                <details className="group">
                  <summary className="text-sm font-medium text-gray-700 mb-3 cursor-pointer flex items-center gap-1">
                    <span className="material-icons-round text-sm transition-transform group-open:rotate-90">chevron_right</span>
                    Stage 0: 参考图采集
                  </summary>
                  <div className="mt-2 grid grid-cols-4 gap-3">
                    {detail.step4Data.outfitChangeStages.stage0.backgroundFrames?.slice(0, 4).map((url: string, idx: number) => (
                      <img loading="lazy" key={idx} src={getOssThumbnailUrl(url, 100)} className="w-full aspect-square object-cover rounded cursor-pointer hover:opacity-80" />
                    ))}
                  </div>
                </details>
              )}

              {/* Stage 1: 视频理解 */}
              {detail.step4Data.outfitChangeStages.stage1 && (
                <details className="group">
                  <summary className="text-sm font-medium text-gray-700 mb-3 cursor-pointer flex items-center gap-1">
                    <span className="material-icons-round text-sm transition-transform group-open:rotate-90">chevron_right</span>
                    Stage 1: 视频理解 ({detail.step4Data.outfitChangeStages.stage1.duration}s, {detail.step4Data.outfitChangeStages.stage1.fps} FPS)
                  </summary>
                </details>
              )}

              {/* Stage 2: 角色服装适配 */}
              {detail.step4Data.outfitChangeStages.stage2?.adaptedCharacterImage && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-3">Stage 2: 角色服装适配</div>
                  <img loading="lazy"                     src={getOssThumbnailUrl(detail.step4Data.outfitChangeStages.stage2.adaptedCharacterImage, 200)}
                    className="rounded-lg max-w-[300px] cursor-pointer hover:opacity-80"
                    onClick={() => setPreviewImages({ frames: [detail.step4Data.outfitChangeStages!.stage2!.adaptedCharacterImage!], index: 0 })}
                  />
                </div>
              )}

              {/* Stage 3: 视频生成 */}
              {detail.step4Data.outfitChangeStages.stage3?.generatedVideoUrl && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-3">Stage 3: 视频生成结果</div>
                  <div
                    className="rounded-xl border-2 border-primary/30 overflow-hidden bg-white cursor-pointer max-w-[300px] hover:shadow-lg transition-all"
                    onClick={() => setPreviewVideoUrl(detail.step4Data.outfitChangeStages!.stage3!.generatedVideoUrl)}
                  >
                    <div className="aspect-[9/16] bg-gray-900 relative group">
                      <img loading="lazy"                         src={getOssVideoSnapshotUrl(detail.step4Data.outfitChangeStages.stage3.generatedVideoUrl, 0, 200)}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-12 h-12 rounded-full bg-white/80 flex items-center justify-center">
                          <span className="material-icons-round text-gray-800 text-2xl">play_arrow</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 最终合并视频 */}
          {detail.step4Data.finalVideo?.videoUrl && (
            <div>
              <div className="text-sm font-medium text-gray-700 mb-3">最终合并视频</div>
              <div
                className="rounded-xl border-2 border-primary overflow-hidden bg-white cursor-pointer max-w-[300px] hover:shadow-lg transition-all"
                onClick={() => setPreviewVideoUrl(detail.step4Data.finalVideo!.videoUrl)}
              >
                <div className="aspect-[9/16] bg-gray-900 relative group">
                  <img loading="lazy" src={getOssVideoSnapshotUrl(detail.step4Data.finalVideo.videoUrl, 0, 200)} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-white/80 flex items-center justify-center">
                      <span className="material-icons-round text-gray-800 text-2xl">play_arrow</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 无数据提示 */}
          {!detail.step4Data.outfitChangeStages && !detail.step4Data.finalVideo?.videoUrl && (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <span className="material-icons-round text-4xl text-gray-300 mb-2">video_library</span>
              <p className="text-sm text-gray-400">暂无换装结果数据</p>
            </div>
          )}
        </div>
      )}

      {/* 图片项目 Step4: 电商详情页 */}
      {detail.basicInfo.projectKind === 'image' && (
        <div>
          {/* 分享按钮 */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => {
                setShareModalOpen(true);
                setShareLinkCopied(false);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl text-sm font-semibold shadow-md shadow-blue-500/20 transition-all"
            >
              <span className="material-icons-round text-lg">share</span>
              分享作品
            </button>
          </div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800">详情页板块</h3>
            <span className="text-xs text-gray-500">{detail.step4Data.pageSections.length} 个板块</span>
          </div>
          {detail.step4Data.pageSections.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <span className="material-icons-round text-4xl text-gray-300 mb-2">description</span>
              <p className="text-sm text-gray-400">暂无详情页数据</p>
            </div>
          ) : (
            <div className="space-y-3">
              {detail.step4Data.pageSections.map((section: any) => {
                // 状态圆点颜色
                const statusColor = section.status === 'ready' ? 'bg-emerald-500' :
                                   section.status === 'failed' ? 'bg-red-500' :
                                   'bg-amber-500';
                // 类型中文映射
                const typeLabels: Record<string, string> = {
                  outfit_overview: '搭配总览',
                  detail_showcase: '细节展示',
                  scene_application: '场景应用',
                  material_texture: '材质纹理',
                  size_comparison: '尺码对比',
                  call_to_action: '行动号召',
                  brand_story: '品牌故事',
                  styling_guide: '穿搭指南',
                  detail_closeup: '细节特写',
                  outfit_recommendation: '搭配推荐',
                  user_review: '用户评价',
                };
                const typeLabel = typeLabels[section.sectionType] || section.sectionType;

                return (
                  <div
                    key={section.id}
                    className="flex gap-4 p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all duration-200"
                  >
                    {/* 缩略图 */}
                    {section.imageUrl && (
                      <div className="flex-shrink-0">
                        <img loading="lazy"                           src={getOssThumbnailUrl(section.imageUrl, 120)}
                          alt={section.title || '板块图片'}
                          className="w-[120px] h-[120px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => {
                            const allUrls = detail.step4Data.pageSections.map((s: any) => s.imageUrl).filter(Boolean) as string[];
                            const idx = allUrls.indexOf(section.imageUrl);
                            setPreviewImages({ frames: allUrls, index: idx >= 0 ? idx : 0 });
                          }}
                        />
                      </div>
                    )}

                    {/* 信息区域 */}
                    <div className="flex-1 min-w-0 py-1">
                      {/* 顶部：序号 + 类型 + 状态 */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-gray-400 font-mono">#{section.sortOrder + 1}</span>
                        <span className="text-xs text-gray-400">{typeLabel}</span>
                        <span className={`w-2 h-2 rounded-full ${statusColor}`} title={section.status} />
                      </div>

                      {/* 标题 */}
                      {section.title && (
                        <h4 className="text-sm font-medium text-gray-900 mb-1.5 line-clamp-1">
                          {section.title}
                        </h4>
                      )}

                      {/* 目标 */}
                      {section.goal && (
                        <p className="text-xs text-gray-500 mb-1.5 line-clamp-1">
                          {section.goal}
                        </p>
                      )}

                      {/* 文案预览 */}
                      {section.copy && (
                        <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                          {section.copy}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 视频项目 Step4: 分镜视频 + 最终成片 */}
      {detail.basicInfo.projectKind !== 'image' && (
        <>
          {/* 分镜视频网格 */}
          <div>
            <div className="text-sm font-medium text-gray-700 mb-3">
              分镜视频 ({detail.step4Data.clipVideos.length})
            </div>
            {detail.step4Data.clipVideos.length === 0 ? (
              <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-lg">
                暂无分镜视频
              </div>
            ) : (
              <div className="space-y-4">
                {detail.step4Data.clipVideos.map((clip: any) => {
                  // 解析变体视频列表
                  const variantList: string[] = Array.isArray(clip.variantUrls) ? clip.variantUrls : [];
                  // 主视频 + 变体视频合并展示（去重）
                  const seen = new Set<string>();
                  const allVideos = [clip.clipUrl, ...variantList].filter((v): v is string => {
                    if (!v || seen.has(v)) return false;
                    seen.add(v);
                    return true;
                  });
                  return (
                    <div key={clip.id} className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                      {/* 场景头部 */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                        <span className="text-sm font-bold text-gray-900">场景 #{clip.sceneIndex + 1}</span>
                        <span className={`w-2 h-2 rounded-full ${
                          clip.clipStatus === 'completed' ? 'bg-green-500' :
                          clip.clipStatus === 'failed' ? 'bg-red-500' :
                          'bg-yellow-500'
                        }`} />
                        <span className="text-xs text-gray-600">{clip.clipStatus || '处理中'}</span>
                        {clip.clipGeneration > 0 && (
                          <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] rounded">
                            第{clip.clipGeneration}轮
                          </span>
                        )}
                        {clip.errorMessage && (
                          <span className="text-xs text-red-500 truncate" title={clip.errorMessage}>{clip.errorMessage}</span>
                        )}
                      </div>
                      {/* 视频列表 */}
                      <div className="p-3">
                        <div className="flex gap-3 overflow-x-auto pb-2">
                          {allVideos.map((videoUrl, vIdx) => {
                            const isSelectedVariant = vIdx === clip.selectedIndex;
                            return (
                              <div
                                key={vIdx}
                                className={`flex-shrink-0 w-[80px] rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                                  isSelectedVariant ? 'border-primary shadow-md' : 'border-gray-200 hover:border-gray-300'
                                }`}
                                onClick={() => setPreviewVideoUrl(videoUrl)}
                              >
                                <div className="aspect-[9/16] bg-gray-900 relative group">
                                  <img loading="lazy"                                     src={getOssVideoSnapshotUrl(videoUrl, 0, 100)}
                                    alt={`场景${clip.sceneIndex + 1}-变体${vIdx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="w-6 h-6 rounded-full bg-white/80 flex items-center justify-center">
                                      <span className="material-icons-round text-gray-800 text-sm">play_arrow</span>
                                    </div>
                                  </div>
                                  {/* 变体编号 */}
                                  <div className="absolute top-0.5 left-0.5 px-1 py-0.5 bg-black/60 text-white text-[9px] rounded">
                                    V{vIdx + 1}
                                  </div>
                                  {/* 选中标记 */}
                                  {isSelectedVariant && (
                                    <div className="absolute bottom-0.5 right-0.5">
                                      <span className="material-icons-round text-primary text-sm">check_circle</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {allVideos.length === 0 && (
                            <div className="text-xs text-gray-400 py-4">暂无视频</div>
                          )}
                        </div>
                        {/* 视频数量统计 */}
                        <div className="text-[10px] text-gray-400 mt-1">
                          {allVideos.length} 个视频 · 选中 V{(clip.selectedIndex ?? 0) + 1}
                        </div>
                        {/* 生成提示词 */}
                        {clip.clipPrompt && (
                          <div className="text-xs text-gray-500 mt-1 line-clamp-1 bg-gray-50 px-2 py-1 rounded" title={clip.clipPrompt}>
                            {clip.clipPrompt}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 最终合成视频 */}
          {detail.step4Data.finalVideo && (
            <div>
              <div className="text-sm font-medium text-gray-700 mb-3">最终合成视频</div>
              <div
                className="rounded-xl border-2 border-primary/30 overflow-hidden bg-white cursor-pointer max-w-[200px] hover:shadow-lg transition-all"
                onClick={() => setPreviewVideoUrl(detail.step4Data.finalVideo!.videoUrl)}
              >
                <div className="aspect-[9/16] bg-gray-900 relative group">
                  <img loading="lazy"                     src={getOssVideoSnapshotUrl(detail.step4Data.finalVideo.videoUrl, 0, 200)}
                    alt="最终视频"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-white/80 flex items-center justify-center">
                      <span className="material-icons-round text-gray-800 text-2xl">play_arrow</span>
                    </div>
                  </div>
                  <div className="absolute bottom-2 left-2 right-2 bg-black/60 text-white text-xs p-2 rounded">
                    <div className="font-medium">最终合成视频</div>
                    {detail.step4Data.finalVideo.durationSec && (
                      <div className="text-gray-300">{detail.step4Data.finalVideo.durationSec}s</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step4 成片历史 */}
          {(detail.step4Data.finalVideoHistory?.length ?? 0) > 1 && (
            <div>
              <details className="group">
                <summary className="text-sm font-medium text-gray-700 mb-3 cursor-pointer flex items-center gap-1">
                  <span className="material-icons-round text-sm transition-transform group-open:rotate-90">chevron_right</span>
                  成片历史 ({detail.step4Data.finalVideoHistory!.length})
                </summary>
                <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
                  {detail.step4Data.finalVideoHistory!.map((fv: any) => (
                    <div
                      key={fv.id}
                      className={`flex-shrink-0 w-[100px] rounded-xl overflow-hidden cursor-pointer transition-all ${
                        detail.step4Data.finalVideo?.id === fv.id
                          ? 'border-2 border-primary shadow-md'
                          : 'border border-gray-200 hover:shadow-sm'
                      }`}
                      onClick={() => setPreviewVideoUrl(fv.videoUrl)}
                    >
                      <div className="aspect-[9/16] bg-gray-900 relative group/img">
                        <img loading="lazy"                           src={fv.coverImageUrl || getOssVideoSnapshotUrl(fv.videoUrl, 0, 120)}
                          alt="成片历史"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                          <div className="w-6 h-6 rounded-full bg-white/80 flex items-center justify-center">
                            <span className="material-icons-round text-gray-800 text-sm">play_arrow</span>
                          </div>
                        </div>
                        <div className="absolute bottom-1 left-1 right-1 bg-black/60 text-white text-[9px] px-1 py-0.5 rounded truncate">
                          {fv.durationSec ? `${fv.durationSec}s` : ''} {formatTimestamp(fv.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </>
      )}
    </div>
  );
};
