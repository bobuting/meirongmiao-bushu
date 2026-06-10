/**
 * 五视图历史版本切换组件
 * 底部横向显示历史版本缩略图，点击切换激活
 */
import React, { useState, useCallback, useEffect } from "react";
import type { CharacterFiveViewDto } from "../../services/backendApi.types";
import { realLibraryApi } from "../../services/realApi/library";
import { useAppStore } from "../../store/useAppStore";
import { getOssThumbnailUrl } from "../../utils/ossImage";

interface FiveViewHistoryBarProps {
  characterId: string;
  currentImageUrl: string | null;
  currentStatus: "pending" | "processing" | "ready" | "failed";
  onActivated: () => void;
}

export function FiveViewHistoryBar({
  characterId,
  currentImageUrl,
  currentStatus,
  onActivated,
}: FiveViewHistoryBarProps) {
  const [views, setViews] = useState<CharacterFiveViewDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useAppStore((state) => state.token);

  // 加载历史五视图列表
  const loadHistory = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await realLibraryApi.listCharacterFiveViews(token, characterId);
      // 按创建时间倒序排列
      const sorted = result.items.sort((a, b) => b.createdAt - a.createdAt);
      setViews(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [token, characterId]);

  // 初始化加载 + 状态变成 ready 时刷新（新生成完成后需要重新加载历史）
  useEffect(() => {
    loadHistory();
  }, [loadHistory, currentStatus]);

  // 切换激活五视图
  const handleActivate = useCallback(async (viewId: string) => {
    if (!token || activating) return;
    setActivating(viewId);
    setError(null);
    try {
      await realLibraryApi.activateCharacterFiveView(token, characterId, viewId);
      // 切换成功后重新加载历史列表，显示最新的激活状态
      await loadHistory();
      onActivated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "切换失败";
      if (msg.includes("CHARACTER_IN_USE")) {
        setError("角色正在被项目使用");
      } else if (msg.includes("尚未生成完成")) {
        setError("该版本尚未生成完成");
      } else {
        setError(msg);
      }
    } finally {
      setActivating(null);
    }
  }, [token, characterId, onActivated, activating, loadHistory]);

  // ready / processing 状态且有已完成版本时显示（生成中只读，不可切换）
  const readyViews = views.filter(v => v.status === "ready");
  const isGenerating = currentStatus === "processing";
  if ((currentStatus !== "ready" && !isGenerating) || readyViews.length === 0) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 py-2 px-1 mt-1 ${isGenerating ? "opacity-60 pointer-events-none" : ""}`}>
      {isGenerating && (
        <span className="text-xs text-gray-400 flex-shrink-0">历史版本</span>
      )}
      {readyViews.map((view) => (
        <button
          key={view.id}
          onClick={() => !view.isActive && handleActivate(view.id)}
          disabled={view.isActive || activating !== null || isGenerating}
          className={`h-10 w-10 rounded-lg overflow-hidden flex-shrink-0 transition-all border ${
            view.isActive
              ? "ring-2 ring-primary ring-offset-1 border-primary/30"
              : "border-gray-200 hover:border-primary/40 hover:ring-1 hover:ring-primary/20"
          } ${activating === view.id ? "opacity-50" : ""}`}
          title={`切换到此版本 (${new Date(view.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "2-digit", hour: "2-digit", minute: "2-digit" })})`}
        >
          {view.imageUrl ? (
            <img
              src={getOssThumbnailUrl(view.imageUrl, 80)}
              alt="历史版本"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gray-100 flex items-center justify-center">
              <span className="material-icons-round text-gray-400 text-lg">image</span>
            </div>
          )}
        </button>
      ))}

      {loading && (
        <span className="material-icons-round animate-spin text-gray-400 text-xs" />
      )}

      {error && (
        <span className="text-xs text-rose-500 truncate max-w-[80px]">{error}</span>
      )}
    </div>
  );
}
