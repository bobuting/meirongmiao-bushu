/**
 * Resources Tab - 资源消耗统计
 */

import React from 'react';
import { ProjectCreditList } from '../components/ProjectCreditList';

interface ResourcesTabProps {
  detail: any;
}

export const ResourcesTab: React.FC<ResourcesTabProps> = ({ detail }) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-6">
        <div className="bg-blue-50 rounded-xl p-6 text-center">
          <span className="material-icons-round text-4xl text-blue-500">psychology</span>
          <div className="text-3xl font-bold text-gray-900 mt-2">
            {detail.resourceConsumption.llmCalls}
          </div>
          <div className="text-sm text-gray-500 mt-1">LLM 调用次数</div>
        </div>
        <div className="bg-purple-50 rounded-xl p-6 text-center">
          <span className="material-icons-round text-4xl text-purple-500">image</span>
          <div className="text-3xl font-bold text-gray-900 mt-2">
            {detail.resourceConsumption.imageGenerations}
          </div>
          <div className="text-sm text-gray-500 mt-1">图片生成次数</div>
        </div>
        <div className="bg-pink-50 rounded-xl p-6 text-center">
          <span className="material-icons-round text-4xl text-pink-500">movie</span>
          <div className="text-3xl font-bold text-gray-900 mt-2">
            {detail.resourceConsumption.videoGenerations}
          </div>
          <div className="text-sm text-gray-500 mt-1">视频生成次数</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-6 text-center">
          <span className="material-icons-round text-4xl text-amber-500">payments</span>
          <div className="text-3xl font-bold text-gray-900 mt-2">
            {detail.resourceConsumption.creditConsumption ?? 0}
          </div>
          <div className="text-sm text-gray-500 mt-1">积分消耗</div>
        </div>
      </div>
      {/* 积分消耗明细标题 */}
      <div>
        <div className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <span className="material-icons-round text-amber-500 text-lg">payments</span>
          积分消耗明细
          {detail.resourceConsumption.creditConsumption > 0 && (
            <span className="text-xs text-amber-600 font-normal">
              ({detail.resourceConsumption.creditConsumption} 积分)
            </span>
          )}
        </div>
        <ProjectCreditList projectId={detail.basicInfo.id} />
      </div>
    </div>
  );
};