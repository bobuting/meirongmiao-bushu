/**
 * CreditPricingModal — 积分定价弹窗
 * 按项目类型分组展示定价，同一操作可能出现在多个项目类型中
 */
import React, { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from "zustand/react/shallow";
import { backendApi } from "../../services/backendApi";

interface PricingEntry {
  label: string;
  cost: number;
  unit: string;
  icon: string;
}

interface PricingGroup {
  title: string;
  icon: string;
  entries: PricingEntry[];
  example?: string; // 简短示例文字
}

// 按项目类型硬编码定价展示（与用户确认的分组结构一致）
const PRICING_GROUPS: PricingGroup[] = [
  {
    title: "视频项目",
    icon: "play_circle",
    example: "20秒视频+12裂变约720积分（平铺1×20+五视图3×20+分镜图4×20+分镜视频4×80+裂变图6×10+裂变视频6×30）",
    entries: [
      { label: "服饰平铺图生成", cost: 20, unit: "积分/单图", icon: "checkroom" },
      { label: "五视图生成", cost: 20, unit: "积分/单图", icon: "view_in_ar" },
      { label: "分镜图生成", cost: 20, unit: "积分/单图", icon: "image" },
      { label: "分镜视频生成", cost: 80, unit: "积分/单分镜视频", icon: "videocam" },
      { label: "裂变图片", cost: 10, unit: "积分/单图", icon: "auto_awesome" },
      { label: "裂变视频", cost: 30, unit: "积分/单分镜视频", icon: "movie" },
    ],
  },
  {
    title: "图片项目",
    icon: "photo_library",
    example: "8主图+5详情图约340积分（平铺图1×20 + 五视图3×20 + 模特图8×20 + 详情图5×20）",
    entries: [
      { label: "服饰平铺图生成", cost: 20, unit: "积分/单图", icon: "checkroom" },
      { label: "五视图生成", cost: 20, unit: "积分/单图", icon: "view_in_ar" },
      { label: "模特图生成", cost: 20, unit: "积分/单图", icon: "photo_camera" },
      { label: "电商详情图", cost: 20, unit: "积分/单图", icon: "storefront" },
    ],
  },
  {
    title: "反推项目",
    icon: "youtube_searched_for",
    example: "20秒反推+12裂变约730积分（反推1×10+平铺1×20+五视图3×20+分镜图4×20+分镜视频4×80+裂变图6×10+裂变视频6×30）",
    entries: [
      { label: "反推脚本", cost: 10, unit: "积分/次", icon: "youtube_searched_for" },
      { label: "服饰平铺图生成", cost: 20, unit: "积分/单图", icon: "checkroom" },
      { label: "五视图生成", cost: 20, unit: "积分/单图", icon: "view_in_ar" },
      { label: "分镜图生成", cost: 20, unit: "积分/单图", icon: "image" },
      { label: "分镜视频生成", cost: 80, unit: "积分/单分镜视频", icon: "videocam" },
      { label: "裂变图片", cost: 10, unit: "积分/单图", icon: "auto_awesome" },
      { label: "裂变视频", cost: 30, unit: "积分/单分镜视频", icon: "movie" },
    ],
  },
  {
    title: "换装项目",
    icon: "swap_horiz",
    example: "20秒换装视频约720积分（换装图片4×20 + 换装视频4×160）",
    entries: [
      { label: "换装图片生成", cost: 20, unit: "积分/单图", icon: "swap_horiz" },
      { label: "换装视频编辑", cost: 160, unit: "积分/单分镜视频", icon: "video_call" },
    ],
  },
];

function costBadgeClass(cost: number): string {
  if (cost >= 160) return "bg-gradient-to-r from-orange-500 to-red-500 text-white";
  if (cost >= 80) return "bg-gradient-to-r from-amber-500 to-orange-500 text-white";
  if (cost >= 30) return "bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-900";
  if (cost >= 20) return "bg-gradient-to-r from-amber-400/80 to-yellow-400/80 text-amber-900";
  return "bg-gray-100 text-gray-700";
}

export const CreditPricingModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { token } = useAppStore(useShallow((s) => ({ token: s.token })));
  const [loading, setLoading] = useState(true);

  // 触发 API 加载确保用户已登录（数据静态展示）
  useEffect(() => {
    if (!token) return;
    void (async () => {
      try { await backendApi.creditPricing(token); } catch { /* 验证登录即可 */ }
      setLoading(false);
    })();
  }, [token]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden animate-fade-in flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-xl text-amber-500">local_offer</span>
              <h3 className="text-lg font-bold text-gray-900">积分定价</h3>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
              <span className="material-icons-round text-lg">close</span>
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-1">了解每个操作需要消耗的积分 · 脚本生成等功能免费使用</p>
        </div>

        {/* 定价分组 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <div className="text-sm text-gray-500 text-center py-12">加载中...</div>
          ) : (
            <>
              {/* 免费提示 */}
              <div className="rounded-xl bg-gradient-to-r from-emerald-50/50 to-teal-50/50 border border-emerald-200/40 px-4 py-3 flex items-center justify-center gap-1">
                <span className="material-icons-round text-emerald-500 text-sm">check_circle</span>
                <span className="text-xs text-emerald-700">脚本生成 · 服饰分析 · 人像检测 · 特征提取 · 音乐分析 等功能均 </span>
                <span className="text-xs font-bold text-emerald-600">免费使用</span>
              </div>

              {PRICING_GROUPS.map((group) => (
            <div key={group.title} className="rounded-xl border border-gray-200/80 bg-white shadow-sm overflow-hidden">
              {/* 分组标题 */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
                <span className="material-icons-round text-amber-500 text-lg">{group.icon}</span>
                <span className="text-sm font-bold text-gray-900">{group.title}</span>
              </div>

              {/* 示例 - 突出显示 */}
              {group.example && (
                <div className="px-4 py-3 bg-gradient-to-r from-amber-100 to-orange-50 border-b border-amber-300/40">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="material-icons-round text-amber-600 text-lg">calculate</span>
                    <span className="text-base font-bold text-amber-800">示例估算</span>
                  </div>
                  <div className="text-sm text-amber-700 leading-relaxed">{group.example}</div>
                </div>
              )}

              {/* 定价条目 - 低调明细 */}
              <div className="divide-y divide-gray-100 bg-gray-50/30">
                {group.entries.map((entry) => (
                  <div key={`${entry.label}-${entry.cost}`} className="flex items-center px-4 py-2">
                    <span className="text-xs text-gray-500">{entry.label}</span>
                    <span className="ml-auto text-xs font-medium text-gray-600 tabular-nums">
                      {entry.cost} <span className="text-gray-400">{entry.unit.replace('积分/', '')}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};