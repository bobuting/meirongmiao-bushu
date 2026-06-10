/**
 * RouteKey 积分成本配置面板
 * 按 RouteKey 配置各业务功能的积分扣减量，替代旧的固定积分策略
 */

import React, { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { backendApi } from "../../services/backendApi";
import { Button } from "../../components/ui/Button";

// RouteKey 分组定义（与后端 provider-route-keys.ts 对应）
interface RouteKeyGroup {
  id: string;
  title: string;
  keys: string[];
}

const ROUTE_KEY_GROUPS: RouteKeyGroup[] = [
  {
    id: "step1",
    title: "Step1 服饰上传",
    keys: [
      "step1_fashion_analysis",
      "step1_fashion_search",
      "step1_role_preset",
      "image_project_step1_selling_points",
    ],
  },
  {
    id: "step2",
    title: "Step2 定妆",
    keys: [
      "step2_five_view_generation_child",
      "step2_five_view_generation_adult",
    ],
  },
  {
    id: "step3-script",
    title: "Step3 脚本生成",
    keys: [
      "step3_realtime_script_generation",
      "step3_hot_deep_analysis",
      "step3_custom_script_generation",
      "step3_custom_script_concept",
      "step3_fashion_script_generation",
      "step3_fashion_script_concept",
      "step3_emotion_archetype_generation",
      "step3_emotion_archetype_outline",
      "script_effectiveness_generation",
      "step3_aesthetic_script_generation",
      "step3_product_showcase_script_generation",
      "step3_product_showcase_script_concept",
      "step3_story_theme_concept",
      "step3_story_theme_outline",
      "step3_story_theme_generation",
      "step3_resonance_story_concept",
      "step3_resonance_story_generation",
      "step3_video_script_rewrite",
      "step3_library_script_rewrite",
      "step3_product_showcase_script_rewrite",
    ],
  },
  {
    id: "step3-storyboard",
    title: "Step3 分镜生成",
    keys: [
      "step3_storyboard_image",
      "step3_storyboard_image_child",
      "step3_storyboard_image_adult",
      "step3_storyboard_prompt",
    ],
  },
  {
    id: "step3-image-project",
    title: "图片项目 Step3",
    keys: [
      "image_project_step3_model_photo",
      "image_project_step3_model_plan",
      "image_project_step3_model_plan_child",
    ],
  },
  {
    id: "step4",
    title: "Step4 视频生成",
    keys: [
      "step4_clip_video_generation_child",
      "step4_clip_video_generation_adult",
      "step4_video_export",
    ],
  },
  {
    id: "fission",
    title: "裂变",
    keys: [
      "fission_video_generation_child",
      "fission_video_generation_adult",
      "fission_story_generation",
      "fission_storyboard_prompt",
      "fission_storyboard_image_child",
      "fission_storyboard_image_adult",
    ],
  },
  {
    id: "square",
    title: "广场",
    keys: ["square_video_reverse", "square_creator_evaluation"],
  },
  {
    id: "hot-trend",
    title: "热榜",
    keys: ["hot_trend_video_reverse"],
  },
  {
    id: "library",
    title: "库管理",
    keys: [
      "library_portrait_detect",
      "garment_flat_lay_generation",
      "aesthetic_feature_extraction",
      "scene_feature_extraction",
      "emotion_archetype_extraction",
    ],
  },
  {
    id: "outfit-change",
    title: "换装",
    keys: [
      "outfit_change_image_generation",
      "outfit_change_video_edit",
    ],
  },
  {
    id: "music",
    title: "音乐",
    keys: ["music_atmosphere_analysis"],
  },
  {
    id: "quality",
    title: "质量与进化",
    keys: [
      "script_quality_scoring",
      "prompt_evolution_generation",
    ],
  },
  {
    id: "lab",
    title: "能力实验室",
    keys: ["text_generation", "image_generation", "video_generation"],
  },
];

// RouteKey 描述映射
const ROUTE_KEY_DESCRIPTIONS: Record<string, string> = {
  step1_fashion_analysis: "服饰分析",
  step1_fashion_search: "服饰搜索 LLM 增强",
  step1_role_preset: "角色预设生成",
  image_project_step1_selling_points: "卖点提取",
  step2_five_view_generation_child: "五视图生成（儿童≤17岁）",
  step2_five_view_generation_adult: "五视图生成（成人≥18岁）",
  step3_realtime_script_generation: "实时热点脚本生成",
  step3_hot_deep_analysis: "热点深度分析",
  step3_storyboard_image: "分镜图生成",
  step3_storyboard_image_child: "分镜图生成（儿童≤17岁）",
  step3_storyboard_image_adult: "分镜图生成（成人≥18岁）",
  step3_storyboard_prompt: "分镜提示词工程",
  step3_custom_script_generation: "场景化种草脚本生成",
  step3_custom_script_concept: "场景化脚本概念生成",
  step3_fashion_script_generation: "时尚大片脚本生成",
  step3_fashion_script_concept: "时尚大片视觉概念生成",
  step3_emotion_archetype_generation: "情感原型脚本生成",
  step3_emotion_archetype_outline: "情感原型大纲生成",
  script_effectiveness_generation: "种草脚本生成",
  step3_aesthetic_script_generation: "生活美学脚本生成",
  step3_product_showcase_script_generation: "产品展示脚本生成",
  step3_product_showcase_script_concept: "产品展示视觉概念生成",
  step3_story_theme_concept: "主题叙事-主题构思",
  step3_story_theme_outline: "主题叙事-故事大纲",
  step3_story_theme_generation: "主题叙事-分镜展开",
  step3_resonance_story_concept: "共鸣故事-概念生成",
  step3_resonance_story_generation: "共鸣故事-分镜展开",
  step3_video_script_rewrite: "视频热榜脚本改写",
  step3_library_script_rewrite: "库脚本改写",
  step3_product_showcase_script_rewrite: "产品展示脚本改写",
  image_project_step3_model_photo: "模特图生成",
  image_project_step3_model_plan: "模特图规划",
  image_project_step3_model_plan_child: "模特图规划（儿童）",
  image_project_step4_section_plan: "Section 规划",
  image_project_step4_section_image: "Section 图片生成",
  step4_clip_video_generation_child: "分镜视频生成（儿童≤17岁）",
  step4_clip_video_generation_adult: "分镜视频生成（成人≥18岁）",
  step4_video_export: "视频导出（拼接+成片）",
  fission_video_generation_child: "裂变视频生成（儿童≤17岁）",
  fission_video_generation_adult: "裂变视频生成（成人≥18岁）",
  fission_story_generation: "裂变故事生成",
  fission_storyboard_prompt: "裂变分镜提示词工程",
  fission_storyboard_image_child: "裂变分镜图片生成（儿童≤17岁）",
  fission_storyboard_image_adult: "裂变分镜图片生成（成人≥18岁）",
  square_video_reverse: "广场反推",
  square_creator_evaluation: "广场达人评估",
  hot_trend_video_reverse: "热榜反推",
  library_portrait_detect: "人像检测",
  garment_flat_lay_generation: "服饰平铺图生成",
  outfit_change_image_generation: "换装图片生成",
  outfit_change_video_edit: "换装视频编辑",
  music_atmosphere_analysis: "音乐氛围分析",
  aesthetic_feature_extraction: "审美特征提取",
  scene_feature_extraction: "场景特征提取",
  emotion_archetype_extraction: "情感原型提取",
  script_quality_scoring: "脚本质量评分",
  prompt_evolution_generation: "Prompt 进化提案生成",
  text_generation: "文本生成测试",
  image_generation: "图片生成测试",
  video_generation: "视频生成测试",
};

type CostMap = Record<string, number | null>;

export const RouteKeyCreditCostPanel: React.FC = () => {
  const { token } = useAppStore(useShallow((state) => ({ token: state.token })));
  const queryClient = useQueryClient();

  // 本地编辑状态：key → 用户输入值（string，保存时转 number）
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // 加载 RouteKey 积分成本
  const costsQuery = useQuery({
    queryKey: ["admin-route-key-credit-costs", token],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await backendApi.adminRouteKeyCreditCostsGet(token as string);
      return res;
    },
  });

  // 构建 costMap：所有 key 的当前成本
  const costMap: CostMap = useMemo(() => {
    if (!costsQuery.data?.data?.allKeys) return {};
    const map: CostMap = {};
    for (const item of costsQuery.data.data.allKeys) {
      map[item.key] = item.cost;
    }
    return map;
  }, [costsQuery.data]);

  // 统计已配置数量
  const configuredCount = useMemo(() => {
    return Object.values(costMap).filter((v) => v != null).length;
  }, [costMap]);

  // 保存单个 RouteKey 成本
  const handleSave = useCallback(
    async (key: string) => {
      const inputVal = localEdits[key];
      if (inputVal == null) return;
      const cost = parseInt(inputVal, 10);
      if (!Number.isFinite(cost) || cost < 0) {
        setFeedback(`${key}: 积分必须为非负整数`);
        return;
      }
      setSavingKey(key);
      try {
        await backendApi.adminRouteKeyCreditCostUpdate(token as string, key, cost);
        setLocalEdits((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setFeedback(`${ROUTE_KEY_DESCRIPTIONS[key] ?? key} 已设为 ${cost} 积分`);
        await queryClient.invalidateQueries({ queryKey: ["admin-route-key-credit-costs"] });
      } catch (error) {
        setFeedback(
          error instanceof Error ? error.message : "保存失败",
        );
      } finally {
        setSavingKey(null);
      }
    },
    [token, localEdits, queryClient],
  );

  // 删除单个 RouteKey 成本（恢复默认）
  const handleDelete = useCallback(
    async (key: string) => {
      setSavingKey(key);
      try {
        await backendApi.adminRouteKeyCreditCostDelete(token as string, key);
        setLocalEdits((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setFeedback(`${ROUTE_KEY_DESCRIPTIONS[key] ?? key} 已恢复默认`);
        await queryClient.invalidateQueries({ queryKey: ["admin-route-key-credit-costs"] });
      } catch (error) {
        setFeedback(
          error instanceof Error ? error.message : "删除失败",
        );
      } finally {
        setSavingKey(null);
      }
    },
    [token, queryClient],
  );

  // 获取某 key 的显示值
  const getDisplayValue = (key: string): string => {
    if (key in localEdits) return localEdits[key];
    const cost = costMap[key];
    return cost != null ? String(cost) : "";
  };

  const isEditing = (key: string): boolean => key in localEdits;

  return (
    <div className="space-y-6">
      {/* 顶部操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          按 RouteKey 配置各功能的积分扣减量，null 表示未配置（使用默认计算）。
          已配置 <span className="font-semibold text-primary">{configuredCount}</span> 个。
        </div>
        <Button
          variant="secondary"
          onClick={() => void costsQuery.refetch()}
          isLoading={costsQuery.isFetching}
        >
          刷新
        </Button>
      </div>

      {/* 反馈信息 */}
      {feedback ? (
        <div className="border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {feedback}
        </div>
      ) : null}

      {/* 加载/错误状态 */}
      {costsQuery.isError ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {costsQuery.error instanceof Error ? costsQuery.error.message : "加载失败"}
        </div>
      ) : null}

      {/* 分组展示 RouteKey 成本 */}
      {ROUTE_KEY_GROUPS.map((group) => (
        <div key={group.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-l-4 border-primary/40 bg-gray-50 px-5 py-3">
            <h3 className="text-sm font-bold text-gray-900">{group.title}</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {group.keys.map((key) => {
              const currentCost = costMap[key];
              const hasValue = currentCost != null;
              const editing = isEditing(key);
              const saving = savingKey === key;
              const dirty = editing && localEdits[key] !== (hasValue ? String(currentCost) : "");

              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 px-5 py-3 ${editing ? "bg-blue-50/40" : ""}`}
                >
                  {/* 描述 */}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-900">
                      {ROUTE_KEY_DESCRIPTIONS[key] ?? key}
                    </div>
                    <div className="font-mono text-[11px] text-gray-400">{key}</div>
                  </div>

                  {/* 积分输入 */}
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      placeholder={hasValue ? undefined : "未配置"}
                      value={getDisplayValue(key)}
                      onChange={(e) =>
                        setLocalEdits((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className={`w-24 rounded-lg border px-3 py-1.5 text-right text-sm font-mono outline-none transition ${
                        editing
                          ? "border-primary/40 bg-white focus:border-primary focus:ring-2 focus:ring-primary/20"
                          : "border-gray-200 bg-gray-50 focus:border-primary focus:ring-2 focus:ring-primary/20"
                      }`}
                    />
                    <span className="text-xs text-gray-400">积分</span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1.5">
                    {dirty || editing ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSave(key)}
                        className="rounded bg-primary px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
                      >
                        {saving ? "..." : "保存"}
                      </button>
                    ) : null}
                    {hasValue && !editing ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleDelete(key)}
                        className="rounded border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-500 transition hover:bg-gray-100 disabled:opacity-50"
                        title="删除配置，恢复默认计算"
                      >
                        清除
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
