import React, { useState } from "react";
import type { Step1RoleDirectionSuggestion } from "./step1RoleDirectionSuggestionRuntime";

interface Step1RoleDirectionSuggestionPanelProps {
  suggestions: Step1RoleDirectionSuggestion[];
  remainingCount: number;
  disabled?: boolean;
  onApply: (suggestion: Step1RoleDirectionSuggestion) => void;
}

/** 性别 Tab 配置 */
const TAB_CONFIG = {
  female: {
    label: "女性",
    icon: "♀",
    activeBg: "bg-gradient-to-r from-rose-500 to-pink-500",
    activeShadow: "shadow-md shadow-rose-200/50",
    inactiveBg: "bg-rose-50/80",
    inactiveText: "text-rose-500",
    cardGradientFrom: "from-rose-50",
    cardGradientTo: "to-pink-50",
    cardHoverFrom: "hover:from-rose-100",
    cardHoverTo: "hover:to-pink-100",
    cardBorder: "hover:border-rose-200",
    cardText: "text-rose-600",
    cardDesc: "text-rose-400",
    cardShadow: "hover:shadow-rose-100/50",
  },
  male: {
    label: "男性",
    icon: "♂",
    activeBg: "bg-gradient-to-r from-sky-500 to-blue-500",
    activeShadow: "shadow-md shadow-sky-200/50",
    inactiveBg: "bg-sky-50/80",
    inactiveText: "text-sky-500",
    cardGradientFrom: "from-sky-50",
    cardGradientTo: "to-blue-50",
    cardHoverFrom: "hover:from-sky-100",
    cardHoverTo: "hover:to-blue-100",
    cardBorder: "hover:border-sky-200",
    cardText: "text-sky-600",
    cardDesc: "text-sky-400",
    cardShadow: "hover:shadow-sky-100/50",
  },
} as const;

type GenderTab = "female" | "male";

/** 年龄段排序权重 */
const AGE_RANGE_ORDER: Record<string, number> = {
  "0-1岁": 0,
  "2-6岁": 1,
  "6-8岁": 2,
  "8-12岁": 3,
  "12-16岁": 4,
  "16-18岁": 5,
  "18-22岁": 6,
  "22-30岁": 7,
};

/** 年龄段对应的 emoji 图标 */
const AGE_ICONS: Record<string, string> = {
  "0-1岁": "👶",
  "2-6岁": "🧒",
  "6-8岁": "👧",
  "8-12岁": "👦",
  "12-16岁": "🧑",
  "16-18岁": "🧑‍🎓",
  "18-22岁": "👩",
  "22-30岁": "👩‍💼",
};

const MALE_AGE_ICONS: Record<string, string> = {
  "0-1岁": "👶",
  "2-6岁": "🧒",
  "6-8岁": "👦",
  "8-12岁": "👦",
  "12-16岁": "🧑",
  "16-18岁": "🧑‍🎓",
  "18-22岁": "👨",
  "22-30岁": "👨‍💼",
};

export const Step1RoleDirectionSuggestionPanel: React.FC<Step1RoleDirectionSuggestionPanelProps> = ({
  suggestions,
  remainingCount,
  disabled = false,
  onApply,
}) => {
  const [activeTab, setActiveTab] = useState<GenderTab>("female");

  if (suggestions.length < 1) return null;

  const femaleGroup = suggestions
    .filter((s) => s.gender === "female")
    .sort((a, b) => (AGE_RANGE_ORDER[a.ageRange] ?? 99) - (AGE_RANGE_ORDER[b.ageRange] ?? 99));
  const maleGroup = suggestions
    .filter((s) => s.gender === "male")
    .sort((a, b) => (AGE_RANGE_ORDER[a.ageRange] ?? 99) - (AGE_RANGE_ORDER[b.ageRange] ?? 99));

  const currentGroup = activeTab === "female" ? femaleGroup : maleGroup;
  const cfg = TAB_CONFIG[activeTab];
  const icons = activeTab === "female" ? AGE_ICONS : MALE_AGE_ICONS;

  return (
    <div className="mb-3">
      {/* 居中分割线标题 */}
      <div className="flex items-center gap-2 my-3">
        <div className="flex-1 h-px bg-gray-200/60" />
        <div className="flex items-center gap-1 text-[11px] text-gray-400 whitespace-nowrap select-none">
          <span className="material-icons-round text-[12px]">tune</span>
          <span>性别和年龄选择</span>
          {remainingCount > 0 && (
            <span className="text-[10px] text-gray-300 ml-0.5">({remainingCount})</span>
          )}
        </div>
        <div className="flex-1 h-px bg-gray-200/60" />
      </div>

      {/* 性别 Tab 药丸 */}
      <div className="flex gap-2 mb-3">
        {(["female", "male"] as const).map((gender) => {
          const tabCfg = TAB_CONFIG[gender];
          const isActive = activeTab === gender;
          const hasItems = gender === "female" ? femaleGroup.length > 0 : maleGroup.length > 0;
          if (!hasItems) return null;
          return (
            <button
              key={gender}
              type="button"
              onClick={() => setActiveTab(gender)}
              className={`
                flex-1 flex items-center justify-center gap-1.5
                py-2.5 rounded-2xl text-[13px] font-semibold
                transition-all duration-300 ease-out
                ${isActive
                  ? `${tabCfg.activeBg} text-white ${tabCfg.activeShadow} scale-[1.02]`
                  : `${tabCfg.inactiveBg} ${tabCfg.inactiveText} border border-gray-100 hover:shadow-sm`
                }
              `}
            >
              <span className="text-[15px]">{tabCfg.icon}</span>
              <span>{tabCfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* 年龄网格 — 左右结构：图标左，文字右 */}
      <div className="grid grid-cols-4 gap-2">
        {currentGroup.map((suggestion) => (
          <button
            key={suggestion.suggestionId}
            type="button"
            data-testid={`step1-role-direction-suggestion-${suggestion.suggestionId}`}
            onClick={() => onApply(suggestion)}
            disabled={disabled}
            className={`
              flex items-center gap-2.5
              rounded-xl py-2.5 px-3 cursor-pointer text-left
              bg-gradient-to-br ${cfg.cardGradientFrom} ${cfg.cardGradientTo}
              ${cfg.cardHoverFrom} ${cfg.cardHoverTo}
              border border-white/60 ${cfg.cardBorder}
              transition-all duration-200 ease-out
              hover:shadow-lg ${cfg.cardShadow}
              hover:scale-[1.02] hover:-translate-y-0.5
              active:scale-[0.98] active:translate-y-0
              disabled:cursor-not-allowed disabled:opacity-40
              disabled:hover:scale-100 disabled:hover:shadow-none disabled:hover:translate-y-0
            `}
          >
            {/* 左侧图标 */}
            <span className="text-[20px] leading-none flex-shrink-0">
              {icons[suggestion.ageRange] ?? "👤"}
            </span>
            {/* 右侧文字 */}
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className={`text-[12px] font-bold leading-tight ${cfg.cardText}`}>
                {suggestion.ageRange}
              </span>
              <span className={`text-[10px] leading-tight ${cfg.cardDesc} truncate`}>
                {suggestion.summary}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
