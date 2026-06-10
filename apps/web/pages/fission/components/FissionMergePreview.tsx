import React from 'react';
import { getOssVideoSnapshotUrl } from '../../../utils/ossImage';

interface FissionMergePreviewProps {
  mergedCount: number;
  mergedVideos?: string[];
  onPreview: (url: string) => void;
  onDownloadAll: () => void;
}

export const FissionMergePreview: React.FC<FissionMergePreviewProps> = ({
  mergedCount,
  mergedVideos = [],
  onPreview,
  onDownloadAll,
}) => {
  if (mergedCount === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-icons-round text-emerald-500 text-lg">check_circle</span>
          <h3 className="text-base font-semibold text-gray-900">裂变结果</h3>
          <span className="text-xs text-emerald-500 font-medium">({mergedCount} 条视频)</span>
        </div>
        <button
          onClick={onDownloadAll}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors hover:shadow-md"
          style={{
            background: 'linear-gradient(135deg, #e68c19 0%, #f5a623 100%)',
          }}
        >
          <span className="flex items-center gap-1">
            <span className="material-icons-round text-sm">download</span>
            全部下载
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {mergedVideos.map((url, index) => (
          <div
            key={index}
            className="cursor-pointer group"
            onClick={() => onPreview(url)}
          >
            <div className="aspect-[9/16] rounded-xl overflow-hidden bg-gray-100 border border-gray-200 group-hover:border-orange-300 transition-colors">
              <img src={getOssVideoSnapshotUrl(url, 0, 300)} className="w-full h-full object-cover" alt={`裂变视频 ${index + 1}`}  loading="lazy" />
            </div>
            <div className="text-center mt-1.5">
              <span className="text-xs font-medium text-gray-600">#{index + 1}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
