import React from "react";
import {
  PROJECT_FLOW_MEDIA_CHROME_Z_CLASS,
  PROJECT_FLOW_MEDIA_HOVER_OVERLAY_Z_CLASS,
  PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS,
} from "../projectFlowMediaLayerGuard";

interface Step4CoverCardProps {
  /** 封面图片 URL */
  coverUrl: string;
  /** 点击回调 */
  onClick: () => void;
}

/**
 * Step4 封面卡片组件
 * 仅展示封面图片，点击可选择/修改
 */
export const Step4CoverCard: React.FC<Step4CoverCardProps> = ({ coverUrl, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="group relative aspect-[9/16] w-[208px] shrink-0 overflow-hidden rounded-2xl bg-black transition-all cursor-pointer"
      style={{
        boxShadow: '0 0 18px rgba(249,115,22,0.35), 0 0 40px rgba(249,115,22,0.15), 0 0 0 1px rgba(0,0,0,0.15), 0 0 0 6px rgba(255,255,255,0.22), 0 0 0 7px rgba(0,0,0,0.06)',
      }}
    >
      {/* 标签：封面 */}
      <div
        className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} left-2 top-2 rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-white`}
      >
        封面
      </div>

      {/* 封面图片 */}
      {coverUrl.trim() ? (
        <img
          src={coverUrl}
          alt="封面"
          className={`${PROJECT_FLOW_MEDIA_SURFACE_Z_CLASS} h-full w-full object-cover transition-opacity duration-500`}
        />
      ) : (
        <div className="h-full w-full flex flex-col items-center justify-center bg-gray-100 text-gray-400">
          <span className="material-icons-round text-3xl mb-1">add_photo_alternate</span>
          <span className="text-xs">点击选择封面</span>
        </div>
      )}

      {/* Hover 蒙层 */}
      <div
        className={`${PROJECT_FLOW_MEDIA_HOVER_OVERLAY_Z_CLASS} flex flex-col items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100`}
      >
        <span className="material-icons-round text-3xl text-white">edit</span>
        <span className="text-xs text-white mt-1">点击修改</span>
      </div>

      {/* 底部比例提示 */}
      <div
        className={`${PROJECT_FLOW_MEDIA_CHROME_Z_CLASS} left-2 bottom-2 rounded-full border border-white/70 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-gray-700`}
      >
        9:16
      </div>
    </button>
  );
};
