import React from "react";

interface Step4FinalVideoMergeLoadingProps {
  progress?: number;
  status?: string;
}

export const Step4FinalVideoMergeLoading: React.FC<Step4FinalVideoMergeLoadingProps> = ({
  progress = 0,
  status = "",
}) => {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-md animate-fade-in">
      <div className="relative mx-auto mb-8 h-64 w-64">
        {/* 进度圆环 */}
        <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
          {/* 背景圆环 */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#f3f4f6"
            strokeWidth="6"
          />
          {/* 进度圆环 */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            className="text-primary"
            strokeDasharray={`${progress * 2.83} 283`}
            style={{
              transition: "stroke-dasharray 0.3s ease-out",
            }}
          />
        </svg>
        {/* 中心进度数字 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl font-bold text-gray-900">{Math.round(progress)}%</span>
        </div>
      </div>

      <h2 className="mb-2 font-display text-2xl font-bold text-gray-900">
        {progress < 100 ? "正在合成视频..." : "合成完成！"}
      </h2>

      {/* 状态提示 */}
      <p className="text-gray-500 text-center max-w-md px-4">
        {status || "正在应用转场效果并导出最终视频，请稍候..."}
      </p>

      {/* 进度条（备用显示） */}
      <div className="mt-6 w-64 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
