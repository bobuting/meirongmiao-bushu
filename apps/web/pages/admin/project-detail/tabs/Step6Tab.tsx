/**
 * Step6 Tab - 裂变任务项 + 裂变视频
 */

import React from 'react';
import { getOssThumbnailUrl, getOssVideoSnapshotUrl } from '../../../../utils/ossImage';

interface Step6TabProps {
  detail: any;
  setPreviewImages: (images: { frames: string[]; index: number } | null) => void;
  setPreviewVideoUrl: (url: string | null) => void;
}

export const Step6Tab: React.FC<Step6TabProps> = ({ detail, setPreviewImages, setPreviewVideoUrl }) => {
  const isImageProject = detail?.basicInfo.projectKind === 'image';

  if (isImageProject) {
    return (
      <div className="text-center text-gray-500 py-12">
        <span className="material-icons-round text-4xl">block</span>
        <p className="mt-2">图片项目无此步骤</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 分镜任务项（图片+视频） */}
      <div>
        <div className="text-sm font-medium text-gray-700 mb-3">
          分镜任务项 ({detail.step6Data.taskItems.length})
        </div>
        {detail.step6Data.taskItems.length === 0 ? (
          <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-lg">
            暂无分镜任务
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {detail.step6Data.taskItems.map((item: any) => (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 overflow-hidden bg-white hover:shadow-md transition-all"
              >
                {/* 分镜图片 */}
                <div className="aspect-[9/16] bg-gray-100 relative">
                  {item.imageUrl ? (
                    <img
                      src={getOssThumbnailUrl(item.imageUrl, 300)}
                      alt={`分镜 ${item.itemIndex}`}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => {
                        const allUrls = detail.step6Data.taskItems.map((i: any) => i.imageUrl).filter(Boolean) as string[];
                        const idx = allUrls.indexOf(item.imageUrl);
                        setPreviewImages({ frames: allUrls, index: idx >= 0 ? idx : 0 });
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-icons-round text-3xl text-gray-300">image</span>
                    </div>
                  )}
                  {/* 图片状态标识 */}
                  <div className="absolute top-1 right-1">
                    <span className={`w-2 h-2 rounded-full ${
                      item.imageStatus === 'completed' ? 'bg-green-500' :
                      item.imageStatus === 'failed' ? 'bg-red-500' :
                      'bg-yellow-500 animate-pulse'
                    }`} />
                  </div>
                  {/* 图片标签 */}
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-xs rounded">
                    分镜图
                  </div>
                </div>
                {/* 分镜视频 */}
                <div className="aspect-[9/16] bg-gray-900 relative">
                  {item.videoUrl ? (
                    <div
                      className="w-full h-full cursor-pointer group"
                      onClick={() => setPreviewVideoUrl(item.videoUrl)}
                    >
                      <img
                        src={getOssVideoSnapshotUrl(item.videoUrl, 0, 200)}
                        alt={`分镜视频 ${item.itemIndex}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center">
                          <span className="material-icons-round text-gray-800 text-lg">play_arrow</span>
                        </div>
                      </div>
                      {/* 视频状态角标 */}
                      <div className="absolute top-1 right-1">
                        <span className={`w-2 h-2 rounded-full ${
                          item.videoStatus === 'completed' ? 'bg-green-500' :
                          item.videoStatus === 'failed' ? 'bg-red-500' :
                          'bg-yellow-500 animate-pulse'
                        }`} />
                      </div>
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-xs rounded">
                        分镜视频
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {item.videoStatus ? (
                        <div className="text-center">
                          <span className={`material-icons-round text-2xl ${
                            item.videoStatus === 'failed' ? 'text-red-400' :
                            'text-yellow-400 animate-pulse'
                          }`}>
                            {item.videoStatus === 'failed' ? 'error_outline' : 'hourglass_empty'}
                          </span>
                          <div className="text-xs text-gray-400 mt-1">
                            {item.videoStatus === 'failed' ? '视频生成失败' : '视频生成中'}
                          </div>
                        </div>
                      ) : (
                        <span className="material-icons-round text-3xl text-gray-600">movie</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-xs font-medium text-gray-800">#{item.itemIndex}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {item.taskType === 'image_video' ? '图片+视频' : '新故事'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 裂变视频 */}
      <div>
        <div className="text-sm font-medium text-gray-700 mb-3">
          裂变生成的视频 ({detail.step6Data.fissionVideos.length})
        </div>
        {detail.step6Data.fissionVideos.length === 0 ? (
          <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-lg">
            暂无裂变视频
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {detail.step6Data.fissionVideos.map((fv: any, idx: number) => (
              <div
                key={fv.id}
                className="rounded-xl border border-gray-200 overflow-hidden bg-white hover:shadow-md transition-all"
              >
                <div
                  className="aspect-[9/16] bg-gray-900 relative cursor-pointer group"
                  onClick={() => fv.videoPath && setPreviewVideoUrl(fv.videoPath)}
                >
                  {fv.videoPath ? (
                    <>
                      <img
                        src={fv.thumbnailUrl || getOssVideoSnapshotUrl(fv.videoPath, 0, 200)}
                        alt={`裂变视频 ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center">
                          <span className="material-icons-round text-gray-800 text-lg">play_arrow</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-icons-round text-3xl text-gray-600">movie</span>
                    </div>
                  )}
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-xs rounded">
                    #{idx + 1}
                  </div>
                  <div className="absolute top-1 right-1">
                    <span className={`w-2 h-2 rounded-full ${
                      fv.status === 'completed' ? 'bg-green-500' :
                      fv.status === 'failed' ? 'bg-red-500' :
                      'bg-yellow-500 animate-pulse'
                    }`} />
                  </div>
                  {/* 裂变类型角标 */}
                  <div className="absolute bottom-1 left-1 right-1">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                      fv.fissionType === 'ai_new_story' ? 'bg-purple-500/80 text-white' :
                      fv.fissionType === 'homogenize_optimize' ? 'bg-blue-500/80 text-white' :
                      'bg-orange-500/80 text-white'
                    }`}>
                      {fv.fissionType === 'ai_new_story' ? '新故事' :
                       fv.fissionType === 'homogenize_optimize' ? '同质优化' :
                       '重组'}
                    </span>
                  </div>
                </div>
                <div className="p-2">
                  <div className="text-xs text-gray-800 font-medium">
                    {fv.fissionType === 'ai_new_story' ? 'AI 新故事' :
                     fv.fissionType === 'homogenize_optimize' ? '同质优化' :
                     '重组裂变'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {fv.status === 'completed' ? '已完成' :
                     fv.status === 'failed' ? '失败' :
                     '处理中'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};