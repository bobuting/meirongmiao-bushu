import React, { useEffect, useState, useCallback } from "react";
import type { ProjectFlowKind } from "../../pages/project-flow/projectFlowKind";
import { realRuntimeConfigApi } from "../../services/realApi/runtime-config";

interface NewProjectTypeDialogProps {
  open: boolean;
  onClose: () => void;
  onCreateProject: (kind: ProjectFlowKind) => void;
}

type ProjectOption = {
  kind: ProjectFlowKind;
  label: string;
  desc: string;
  steps: number;
  icon: string;
  gradient: string;
  bgColor: string;
  borderColor: string;
};

const OPTIONS: ProjectOption[] = [
  {
    kind: "video",
    label: "视频创作",
    desc: "6 步完整流程",
    steps: 6,
    icon: "movie",
    gradient: "from-orange-500 to-amber-500",
    bgColor: "bg-gradient-to-br from-orange-50 to-amber-50",
    borderColor: "border-orange-200",
  },
  {
    kind: "image",
    label: "图片创作",
    desc: "4 步轻量流程",
    steps: 4,
    icon: "photo_library",
    gradient: "from-cyan-500 to-blue-500",
    bgColor: "bg-gradient-to-br from-cyan-50 to-blue-50",
    borderColor: "border-cyan-200",
  },
  {
    kind: "outfit_change",
    label: "一键换装",
    desc: "4 步快速换装",
    steps: 4,
    icon: "checkroom",
    gradient: "from-purple-500 to-pink-500",
    bgColor: "bg-gradient-to-br from-purple-50 to-pink-50",
    borderColor: "border-purple-200",
  },
];

/** 大尺寸优雅毛玻璃卡片 */
const GlassCard: React.FC<{
  option: ProjectOption;
  onClick: () => void;
  disabled?: boolean;
}> = ({ option, onClick, disabled }) => {
  // 根据主题色提取发光颜色
  const glowColorMap = {
    video: "rgba(251,146,60,0.3)",
    image: "rgba(34,211,238,0.3)",
    outfit_change: "rgba(192,132,252,0.3)",
  };
  const glowColor = glowColorMap[option.kind as keyof typeof glowColorMap] || "rgba(255,255,255,0.2)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group relative w-[280px] h-[340px] rounded-3xl overflow-visible
        transition-all duration-500 ease-out
        ${disabled
          ? "opacity-40 cursor-not-allowed"
          : "hover:-translate-y-3 active:translate-y-0"
        }`}
      style={{
        boxShadow: `0 0 60px 20px ${glowColor}, 0 0 100px 40px ${glowColor.replace("0.3", "0.15")}`,
      }}
    >
      {/* 毛玻璃层 - 高透明度强模糊带阴影 */}
      <div
        className={`absolute inset-0 rounded-3xl overflow-hidden
          bg-white/40 backdrop-blur-[40px]
          border border-white/30
          shadow-[8px_8px_32px_rgba(0,0,0,0.12),-4px_-4px_20px_rgba(255,255,255,0.7),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_0_0_1px_rgba(255,255,255,0.2)]
          transition-all duration-500
          ${disabled ? "" : "group-hover:bg-white/50 group-hover:border-white/40 group-hover:shadow-[10px_10px_40px_rgba(0,0,0,0.15),-5px_-5px_25px_rgba(255,255,255,0.8),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_0_0_1px_rgba(255,255,255,0.3)]"}
        `}
      >
        {/* 底部渐变装饰条 - 放在毛玻璃层内部以被圆角裁切 */}
        <div
          className={`absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r ${option.gradient}
            opacity-50 transition-opacity duration-500
            ${disabled ? "" : "group-hover:opacity-80"}
          `}
        />
      </div>

      {/* 内容层 */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center p-8">
        {/* 渐变光晕背景 */}
        <div
          className={`absolute top-8 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full
            bg-gradient-to-br ${option.gradient} opacity-15 blur-2xl
            transition-all duration-500
            ${disabled ? "" : "group-hover:opacity-25 group-hover:w-32 group-hover:h-32"}
          `}
        />

        {/* 图标 */}
        <div
          className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${option.gradient}
            flex items-center justify-center mb-6
            shadow-[0_8px_24px_-4px_rgba(0,0,0,0.2)]
            transition-all duration-500
            ${disabled ? "" : "group-hover:scale-112 group-hover:shadow-[0_12px_32px_-6px_rgba(0,0,0,0.25)]"}
          `}
        >
          <span className="material-icons-round text-white text-4xl">{option.icon}</span>
        </div>

        {/* 标题 */}
        <h3 className="text-xl font-semibold text-gray-900 mb-2 tracking-tight">
          {option.label}
        </h3>

        {/* 描述 */}
        <p className="text-base text-gray-500 mb-6">{option.desc}</p>

        {/* 步骤指示 */}
        <div className="flex items-center gap-2">
          {Array.from({ length: option.steps }, (_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${option.gradient}`}
            />
          ))}
        </div>
      </div>
    </button>
  );
};

export const NewProjectTypeDialog: React.FC<NewProjectTypeDialogProps> = ({
  open,
  onClose,
  onCreateProject,
}) => {
  const [outfitChangeEnabled, setOutfitChangeEnabled] = useState(true);
  const [showBetaDialog, setShowBetaDialog] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  // 进出动画控制 - 只保留缩放和位移，去掉透明度变化
  useEffect(() => {
    if (open) {
      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // 运行时配置：判断是否允许换装项目
  useEffect(() => {
    if (!open) return;
    realRuntimeConfigApi.getConfig()
      .then((resp) => {
        setOutfitChangeEnabled(resp.data.outfitChangeEnabled);
      })
      .catch(() => {
        setOutfitChangeEnabled(true);
      });
  }, [open]);

  const handleClick = useCallback((kind: ProjectFlowKind) => {
    if (kind === "outfit_change" && !outfitChangeEnabled) {
      setShowBetaDialog(true);
      return;
    }
    onCreateProject(kind);
  }, [onCreateProject, outfitChangeEnabled]);

  if (!visible) return null;

  return (
    <>
      {/* 阻断提示弹窗 */}
      {showBetaDialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
          onClick={() => setShowBetaDialog(false)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="material-icons-round text-orange-500 text-2xl">science</span>
              <h3 className="text-lg font-bold text-gray-900">功能测试中</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              「一键换装」功能正在测试中，暂未对外开放。
              <br />
              如需体验，请联系管理员获取测试权限。
            </p>
            <button
              type="button"
              onClick={() => setShowBetaDialog(false)}
              className="w-full py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors"
            >
              我知道了
            </button>
          </div>
        </div>
      )}

      {/* 主弹窗 - 淡白色遮罩背景 */}
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-white/70 backdrop-blur-sm"
        onClick={onClose}
      >
        {/* 三卡片横排 - 只用缩放和位移动画，无透明度变化 */}
        <div
          className={`flex gap-8 justify-center items-stretch transition-all duration-300 ease-out ${
            animating ? "scale-100 translate-y-0" : "scale-90 translate-y-8"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {OPTIONS.map((option) => (
            <GlassCard
              key={option.kind}
              option={option}
              onClick={() => handleClick(option.kind)}
              disabled={option.kind === "outfit_change" && !outfitChangeEnabled}
            />
          ))}
        </div>

        {/* 关闭按钮 - 下方居中，同样毛玻璃效果 */}
        <button
          type="button"
          onClick={onClose}
          className={`fixed bottom-12 left-1/2 -translate-x-1/2
            px-6 py-3 rounded-full
            bg-white/40 backdrop-blur-[40px] border border-white/30
            flex items-center justify-center gap-2
            text-gray-700 hover:text-gray-900 hover:bg-white/50
            shadow-[4px_4px_16px_rgba(0,0,0,0.08),-2px_-2px_10px_rgba(255,255,255,0.6),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_0_0_1px_rgba(255,255,255,0.2)]
            transition-all duration-300
            z-[95]
            ${animating ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
          `}
          aria-label="关闭"
        >
          <span className="material-icons-round text-lg">close</span>
          <span className="text-sm font-medium">关闭</span>
        </button>
      </div>
    </>
  );
};
