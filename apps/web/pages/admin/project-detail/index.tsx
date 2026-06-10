/**
 * 项目详情弹窗组件
 *
 * 功能：
 * 1. 展示项目基本信息（ID、标题、状态、用户、公司等）
 * 2. 展示项目封面/服饰图
 * 3. 展示 Step1-Step6 各步骤关键数据
 * 4. 展示任务列表（状态、错误信息）
 * 5. 展示资源消耗统计
 * 6. 提供干预操作入口
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { backendApi } from '../../../services/backendApi';
import { getOssThumbnailUrl, getOssVideoSnapshotUrl } from '../../../utils/ossImage';
import { VideoPreviewModal } from '../../../components/shared/VideoPreviewModal';
import { ImageLightbox } from '../../../components/shared/ImageLightbox';
import { ShareModal } from '../../../components/shared/ShareModal';
import { GARMENT_CATEGORY_LABELS } from '../../../../../src/contant-config/shared_dict';
import { buildStep1RolePresetPanelCompactLines } from '../../../../../src/modules/step1-role-preset-panel-compact-render';
import { ProjectScriptsTab } from '../ProjectScriptsTab';
import { InfoItem } from './components/InfoItem';
import { CharacterCard } from './components/CharacterCard';
import { LlmLogsPanel } from './components/LlmLogsPanel';
import { Step1Tab } from './tabs/Step1Tab';
import { Step3Tab } from './tabs/Step3Tab';
import { Step4Tab } from './tabs/Step4Tab';
import { Step5Tab } from './tabs/Step5Tab';
import { Step6Tab } from './tabs/Step6Tab';
import { TasksTab } from './tabs/TasksTab';
import { ResourcesTab } from './tabs/ResourcesTab';
import type { TabId, ProjectDetailModalProps } from './types';

/** 获取项目类型标签 */
function getProjectKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    video: '视频项目',
    image: '图片项目',
    reverse: '反推项目',
    outfit_change: '换装项目',
  };
  return labels[kind] || kind;
}

export const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({
  isOpen,
  projectId,
  onClose,
  onOperationClick,
}) => {
  const { token } = useAppStore(useShallow((state) => ({ token: state.token })));
  const [activeTab, setActiveTab] = useState<TabId>('step1');

  // 图片预览状态（多图导航）
  const [previewImages, setPreviewImages] = useState<{ frames: string[]; index: number } | null>(null);
  // 视频预览状态
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  // 分享弹窗状态
  const [shareModalOpen, setShareModalOpen] = useState(false);
  // LLM日志 Tab 状态
  const [llmLogPage, setLlmLogPage] = useState(1);
  const [selectedLlmLogId, setSelectedLlmLogId] = useState<string | null>(null);

  // 获取项目详情
  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['admin', 'project', projectId],
    queryFn: () => backendApi.getAdminProjectDetail(token!, projectId),
    enabled: !!token && isOpen,
  });

  if (!isOpen) return null;

  const formatTimestamp = (ts: number) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('zh-CN');
  };

  const isVideoProject = detail?.basicInfo.projectKind === 'video';
  const isImageProject = detail?.basicInfo.projectKind === 'image';
  const isOutfitChangeProject = detail?.basicInfo.projectKind === 'outfit_change';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">项目详情</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <span className="material-icons-round text-gray-500">close</span>
          </button>
        </div>

        {/* 加载状态 */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <span className="material-icons-round text-4xl animate-spin text-primary">refresh</span>
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="flex-1 flex flex-col items-center justify-center text-red-500">
            <span className="material-icons-round text-4xl">error</span>
            <p className="mt-2">加载失败：{(error as Error).message}</p>
          </div>
        )}

        {/* 内容 */}
        {detail && !isLoading && (
          <>
            {/* 基本信息（顶部固定） */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex gap-6">
                {/* 图片预览 */}
                <div className="flex gap-3">
                  {detail.basicInfo.coverImageUrl && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1">项目封面</div>
                      <img loading="lazy"                         src={getOssThumbnailUrl(detail.basicInfo.coverImageUrl, 200)}
                        alt="封面"
                        className="w-full h-24 rounded-lg object-cover bg-gray-200 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                        onClick={() => setPreviewImages({ frames: [detail.basicInfo.coverImageUrl!], index: 0 })}
                      />
                    </div>
                  )}
                  {detail.basicInfo.garmentImageUrl && (
                    <div>
                      <div className="text-xs text-gray-500 mb-1">服饰主图</div>
                      <img loading="lazy"                         src={getOssThumbnailUrl(detail.basicInfo.garmentImageUrl, 200)}
                        alt="服饰"
                        className="w-full h-24 rounded-lg object-cover bg-gray-200 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                        onClick={() => setPreviewImages({ frames: [detail.basicInfo.garmentImageUrl!], index: 0 })}
                      />
                    </div>
                  )}
                </div>

                {/* 基本信息网格 */}
                <div className="flex-1 grid grid-cols-4 gap-x-6 gap-y-2 text-sm">
                  <InfoItem label="项目ID" value={detail.basicInfo.id} copyable />
                  <InfoItem label="项目标题" value={detail.basicInfo.title || '-'} />
                  <InfoItem label="项目类型" value={getProjectKindLabel(detail.basicInfo.projectKind)} />
                  <InfoItem label="状态" value={detail.basicInfo.status} />
                  <InfoItem label="当前Step" value={`Step ${detail.basicInfo.currentStep}`} />
                  <InfoItem label="公司" value={detail.basicInfo.companyName || '-'} />
                  <InfoItem label="用户邮箱" value={detail.basicInfo.userEmail || '-'} />
                  <InfoItem label="创建时间" value={formatTimestamp(detail.basicInfo.createdAt)} />
                </div>
              </div>
            </div>

            {/* 标签页导航 */}
            <div className="flex border-b border-gray-200 px-6 bg-white">
              {([
                  { id: 'step1', label: 'Step1' },
                  { id: 'step2', label: 'Step2' },
                  { id: 'step3', label: 'Step3' },
                  { id: 'step4', label: 'Step4' },
                  { id: 'step5', label: 'Step5', visibleFor: ['video', 'reverse'] as const },
                  { id: 'step6', label: 'Step6', visibleFor: ['video', 'reverse'] as const },
                  { id: 'tasks', label: '任务列表' },
                  { id: 'resources', label: '资源消耗' },
                  { id: 'scripts', label: '脚本JSON', visibleFor: ['video', 'reverse'] as const },
                  { id: 'prompts', label: '专业提示词', visibleFor: ['video', 'reverse'] as const },
                  { id: 'llm-logs', label: 'LLM日志' },
                ] as const).filter((tab): tab is typeof tab => {
                  if ('visibleFor' in tab) {
                    if (detail.basicInfo.projectKind === 'outfit_change') {
                      return false;
                    }
                    return tab.visibleFor.includes(detail.basicInfo.projectKind as 'video' | 'reverse');
                  }
                  return true;
                }).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 标签页内容区 */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Step1 */}
              {activeTab === 'step1' && (
                <Step1Tab detail={detail} setPreviewImages={setPreviewImages} setPreviewVideoUrl={setPreviewVideoUrl} />
              )}

              {/* Step2 */}
              {activeTab === 'step2' && (
                <Step2Content detail={detail} setPreviewImages={setPreviewImages} />
              )}

              {/* Step3 */}
              {activeTab === 'step3' && (
                <Step3Tab detail={detail} setPreviewImages={setPreviewImages} setPreviewVideoUrl={setPreviewVideoUrl} />
              )}

              {/* Step4 */}
              {activeTab === 'step4' && (
                <Step4Tab
                  detail={detail}
                  setPreviewImages={setPreviewImages}
                  setPreviewVideoUrl={setPreviewVideoUrl}
                  setShareModalOpen={setShareModalOpen}
                  setShareLinkCopied={() => {}}
                />
              )}

              {/* Step5 */}
              {activeTab === 'step5' && (
                <Step5Tab
                  detail={detail}
                  setPreviewVideoUrl={setPreviewVideoUrl}
                  setShareModalOpen={setShareModalOpen}
                  setShareLinkCopied={() => {}}
                />
              )}

              {/* Step6 */}
              {activeTab === 'step6' && (
                <Step6Tab detail={detail} setPreviewImages={setPreviewImages} setPreviewVideoUrl={setPreviewVideoUrl} />
              )}

              {/* 任务列表 */}
              {activeTab === 'tasks' && (
                <TasksTab detail={detail} />
              )}

              {/* 资源消耗 */}
              {activeTab === 'resources' && (
                <ResourcesTab detail={detail} />
              )}

              {/* 脚本JSON Tab */}
              {activeTab === 'scripts' && (
                <ProjectScriptsTab
                  token={token!}
                  projectId={projectId}
                  mode="scripts"
                  reverseScriptId={detail.basicInfo.reverseScriptId}
                  projectKind={detail.basicInfo.projectKind}
                />
              )}

              {/* 专业提示词 Tab */}
              {activeTab === 'prompts' && (
                <ProjectScriptsTab
                  token={token!}
                  projectId={projectId}
                  mode="prompts"
                  reverseScriptId={detail.basicInfo.reverseScriptId}
                  projectKind={detail.basicInfo.projectKind}
                />
              )}

              {/* LLM日志 Tab */}
              {activeTab === 'llm-logs' && (
                <LlmLogsPanel
                  token={token!}
                  projectId={projectId}
                  selectedLogId={selectedLlmLogId}
                  page={llmLogPage}
                  onLogSelect={setSelectedLlmLogId}
                  onPageChange={setLlmLogPage}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* 图片预览弹窗 */}
      {previewImages && (
        <ImageLightbox
          url={previewImages.frames[previewImages.index]}
          frames={previewImages.frames}
          currentIndex={previewImages.index}
          onNavigate={(i) => setPreviewImages({ ...previewImages, index: i })}
          open={true}
          onClose={() => setPreviewImages(null)}
        />
      )}

      {/* 视频预览弹窗 */}
      {previewVideoUrl && (
        <VideoPreviewModal
          isOpen={true}
          videos={[{ url: previewVideoUrl, title: '视频预览' }]}
          currentIndex={0}
          onIndexChange={() => {}}
          onClose={() => setPreviewVideoUrl(null)}
        />
      )}

      {/* 分享弹窗 */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareUrl={
          detail?.basicInfo.projectKind === 'image'
            ? `${window.location.origin}/share-image/${projectId}`
            : `${window.location.origin}/share/${projectId}`
        }
        description={detail?.basicInfo.projectKind === 'image' ? '将电商详情页分享给好友查看' : '将成片视频分享给好友观看'}
        tipText={detail?.basicInfo.projectKind === 'image' ? '无需登录即可查看电商详情页' : '无需登录即可观看，包含成片视频和裂变作品'}
      />
    </div>,
    document.body
  );
};

// ========== Tab 内容组件（内联定义，保持原有逻辑） ==========

const Step1Content: React.FC<{ detail: any; setPreviewImages: any; setPreviewVideoUrl: any }> = ({ detail, setPreviewImages, setPreviewVideoUrl }) => {
  const isOutfitChangeProject = detail?.basicInfo.projectKind === 'outfit_change';

  return (
    <div className="space-y-6">
      {/* 换装项目源视频 */}
      {isOutfitChangeProject && detail.step3Data.outfitChangeTask?.sourceVideoUrl && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-3">源视频</div>
          <div
            className="rounded-xl border border-gray-200 overflow-hidden bg-white hover:shadow-md transition-all cursor-pointer max-w-[400px]"
            onClick={() => setPreviewVideoUrl(detail.step3Data.outfitChangeTask!.sourceVideoUrl)}
          >
            <div className="aspect-[9/16] bg-gray-900 relative group">
              <img loading="lazy" src={getOssVideoSnapshotUrl(detail.step3Data.outfitChangeTask.sourceVideoUrl, 0, 300)} alt="源视频" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      )}

      {/* 服饰网格 */}
      <div>
        <div className="text-sm font-medium text-gray-700 mb-3">上传服饰 ({detail.step1Data.garments.length})</div>
        {detail.step1Data.garments.length === 0 ? (
          <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-lg">暂无服饰数据</div>
        ) : (
          <div className="grid grid-cols-6 gap-3">
            {detail.step1Data.garments.map((garment: any) => (
              <div key={garment.id} className="rounded-lg border border-gray-200 overflow-hidden bg-white hover:shadow-md transition-all cursor-pointer"
                onClick={() => {
                  const allUrls = detail.step1Data.garments.flatMap((g: any) => [g.imageUrl, ...(g.subImageUrls || [])].filter(Boolean)) as string[];
                  const idx = allUrls.indexOf(garment.imageUrl);
                  setPreviewImages({ frames: allUrls, index: idx >= 0 ? idx : 0 });
                }}>
                <div className="aspect-square bg-gray-100">
                  {garment.imageUrl ? (
                    <img loading="lazy" src={getOssThumbnailUrl(garment.imageUrl, 200)} alt={garment.name || '服饰'} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-icons-round text-3xl text-gray-300">checkroom</span>
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-xs font-medium text-gray-800 truncate">{garment.name || '未命名服饰'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {garment.category ? (GARMENT_CATEGORY_LABELS[garment.category as keyof typeof GARMENT_CATEGORY_LABELS] || garment.category) : '未知类型'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 搭配推荐 */}
      <div>
        <div className="text-sm font-medium text-gray-700 mb-3">搭配推荐 ({detail.step1Data.outfitPlans.length})</div>
        {detail.step1Data.outfitPlans.length === 0 ? (
          <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-lg">暂无搭配推荐</div>
        ) : (
          <div className="space-y-3">
            {detail.step1Data.outfitPlans.map((plan: any) => (
              <div key={plan.id} className={`rounded-lg border p-4 ${plan.selected ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-900">{plan.title || '搭配方案'}</span>
                  {plan.selected && <span className="px-2 py-0.5 bg-primary text-white text-xs rounded-full">已选中</span>}
                </div>
                {plan.reason && <div className="text-xs text-gray-600 mb-2">{plan.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Step2Content: React.FC<{ detail: any; setPreviewImages: any }> = ({ detail, setPreviewImages }) => {
  const isOutfitChangeProject = detail?.basicInfo.projectKind === 'outfit_change';

  return (
    <div className="space-y-6">
      {/* 换装项目目标服装 */}
      {isOutfitChangeProject && detail.step3Data.outfitChangeTask?.targetOutfit && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-3">目标服装</div>
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white max-w-[400px]">
            <div className="aspect-square bg-gray-100">
              {detail.step3Data.outfitChangeTask.targetOutfit.imageUrl && (
                <img loading="lazy"                   src={getOssThumbnailUrl(detail.step3Data.outfitChangeTask.targetOutfit.imageUrl, 300)}
                  alt={detail.step3Data.outfitChangeTask.targetOutfit.name || '服装'}
                  className="w-full h-full object-cover cursor-pointer hover:opacity-90"
                  onClick={() => setPreviewImages({ frames: [detail.step3Data.outfitChangeTask!.targetOutfit!.imageUrl], index: 0 })}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* 角色预设 */}
      {detail.step2Data.rolePreset && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-3">角色预设</div>
          <div className="rounded-lg border border-orange-100 bg-orange-50/50 px-2.5 py-2 max-w-md">
            <div className="flex gap-2.5">
              {detail.step2Data.rolePreset.imageUrl ? (
                <div
                  className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-orange-100 bg-white cursor-pointer group"
                  onClick={() => setPreviewImages({ frames: [detail.step2Data.rolePreset!.imageUrl], index: 0 })}
                >
                  <img loading="lazy" src={getOssThumbnailUrl(detail.step2Data.rolePreset.imageUrl, 200)} alt="角色预设" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <span className="material-icons-round text-white opacity-0 group-hover:opacity-100 transition-opacity text-lg drop-shadow-lg">zoom_in</span>
                  </div>
                </div>
              ) : (
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-orange-100 bg-gray-50 flex items-center justify-center">
                  <span className="material-icons-round text-gray-300 text-2xl">person</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold tracking-wide text-primary">
                  {detail.step2Data.rolePreset.title}
                </div>
                <div className="mt-1 space-y-0.5 text-[11px] leading-4 text-gray-600">
                  {buildStep1RolePresetPanelCompactLines({
                    ethnicityOrRegion: detail.step2Data.rolePreset.ethnicityOrRegion ?? null,
                    gender: (detail.step2Data.rolePreset.gender as "male" | "female" | "unknown") ?? null,
                    age: detail.step2Data.rolePreset.age ?? null,
                    styleWords: detail.step2Data.rolePreset.styleWords ?? null,
                  }).map((line) => (
                    <div key={line.lineId} className={line.emphasis ? "font-semibold text-gray-800" : ""}>
                      {line.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 角色列表 */}
      <div>
        {(() => {
          const generatedChars = detail.characters.filter((c: any) => c.sourceType === 'generated');
          if (generatedChars.length === 0) return null;
          return (
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-3">AI 生成角色 ({generatedChars.length})</div>
              <div className="grid grid-cols-6 gap-3">
                {generatedChars.map((char: any) => (
                  <CharacterCard key={char.id} char={char} onClick={() => {
                    const allUrls = generatedChars.map((c: any) => c.thumbnailUrl).filter(Boolean) as string[];
                    const idx = allUrls.indexOf(char.thumbnailUrl ?? '');
                    setPreviewImages({ frames: allUrls, index: idx >= 0 ? idx : 0 });
                  }} />
                ))}
              </div>
            </div>
          );
        })()}

        {(() => {
          const libraryChars = detail.characters.filter((c: any) => c.sourceType === 'library');
          if (libraryChars.length === 0) return null;
          return (
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-3">角色库角色 ({libraryChars.length})</div>
              <div className="grid grid-cols-6 gap-3">
                {libraryChars.map((char: any) => (
                  <CharacterCard key={char.id} char={char} onClick={() => {
                    const frames = char.fiveViewUrls && char.fiveViewUrls.length > 0 ? char.fiveViewUrls : [char.thumbnailUrl].filter(Boolean) as string[];
                    setPreviewImages({ frames, index: 0 });
                  }} />
                ))}
              </div>
            </div>
          );
        })()}

        {detail.characters.length === 0 && (
          <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-lg">暂无角色数据</div>
        )}
      </div>
    </div>
  );
};

export default ProjectDetailModal;
