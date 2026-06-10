/**
 * Step5 Tab - 发布记录 + 成片历史
 */

import React from 'react';
import { getOssVideoSnapshotUrl } from '../../../../utils/ossImage';

interface Step5TabProps {
  detail: any;
  setPreviewVideoUrl: (url: string | null) => void;
  setShareModalOpen: (open: boolean) => void;
  setShareLinkCopied: (copied: boolean) => void;
}

const formatTimestamp = (ts: number) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const Step5Tab: React.FC<Step5TabProps> = ({
  detail,
  setPreviewVideoUrl,
  setShareModalOpen,
  setShareLinkCopied
}) => {
  return (
    <div className="space-y-3">
      {/* 分享按钮 */}
      <div className="flex justify-end">
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
      {detail.step5Data.publishRecords.length === 0 ? (
        <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-lg">
          <span className="material-icons-round text-3xl mb-2">publish</span>
          <p>暂无发布记录</p>
        </div>
      ) : (
        detail.step5Data.publishRecords.map((record: any) => (
          <div
            key={record.id}
            className="bg-gray-50 rounded-lg p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">
                  {record.publishTitle || '发布记录'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  发布时间: {formatTimestamp(record.createdAt)}
                </div>
              </div>
              {record.publishUrl && (
                <a
                  href={record.publishUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs hover:bg-primary/20 transition-colors"
                >
                  查看发布
                </a>
              )}
            </div>
          </div>
        ))
      )}

      {/* 成片历史 */}
      <div className="mt-6">
        <div className="text-sm font-medium text-gray-700 mb-3">
          成片历史 ({detail.step5Data.finalVideos.length})
        </div>
        {detail.step5Data.finalVideos.length === 0 ? (
          <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-lg">
            暂无成片记录
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {detail.step5Data.finalVideos.map((fv: any) => (
              <div
                key={fv.id}
                className="rounded-lg border border-gray-200 overflow-hidden bg-white hover:shadow-md transition-all cursor-pointer"
                onClick={() => fv.videoUrl && setPreviewVideoUrl(fv.videoUrl)}
              >
                <div className="aspect-video bg-gray-100 relative">
                  {fv.videoUrl ? (
                    <>
                      <img
                        src={fv.coverImageUrl || getOssVideoSnapshotUrl(fv.videoUrl, 0, 300)}
                        alt="成片"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center">
                          <span className="material-icons-round text-gray-800 text-2xl">play_arrow</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-icons-round text-3xl text-gray-300">movie</span>
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                      {fv.durationSec ? `${fv.durationSec}s` : '-'}
                    </span>
                    {fv.videoType && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                        {fv.videoType === 'step4' ? 'Step4' : '裂变'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {formatTimestamp(fv.createdAt)}
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
