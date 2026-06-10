/**
 * AssetModal — 服饰创建/编辑弹窗
 * 从 AssetLibrary.tsx 提取，内部化上传状态和资产创建逻辑
 */
import React, { useState, useEffect, useRef } from 'react';
import { ApiError, backendApi, type Step1ImageClassificationResultDto } from '../../services/backendApi';
import { Button } from '../ui/Button';
import { VideoAsset } from '../../types';
import { uploadFileToOss, deleteFileFromOss } from '../../services/ossUpload';
import { getOssThumbnailUrl } from '../../utils/ossImage';
import { realGarmentAssetsApi, GarmentAsset } from '../../services/realApi/garment-assets';
import { useAppStore } from '../../store/useAppStore';
import { useConfirm } from '../ui/ConfirmDialog';
import {
  shouldBlockStep1UploadByClassification,
  buildStep1NonClothingUploadMessage,
  classifyLibraryAssetUploadImage,
} from '../../services/step1ClothingUploadGuard';
import {
  GARMENT_CATEGORY_LABELS,
  type GarmentCategory,
} from '../../../../src/contant-config/shared_dict';

/** 资产视图项 */
type AssetViewItem = {
  id: string;
  kind: 'existing' | 'new';
  url: string;
  file?: File;
};

/** 资产弹窗 props */
export interface AssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 创建成功回调 — 返回创建好的 GarmentAsset（支持 async） */
  onAssetCreated?: (asset: GarmentAsset) => void | Promise<void>;
  /** 编辑成功回调（支持 async） */
  onAssetUpdated?: (asset: GarmentAsset) => void | Promise<void>;
  /** 编辑模式：传入已有资产 */
  initialData?: VideoAsset | null;
  defaultCategory?: GarmentCategory | '';
  token: string | null;
  /** 项目 ID（从项目流程调用时传递，用于积分审计） */
  projectId?: string;
}

export const AssetModal: React.FC<AssetModalProps> = ({
  isOpen,
  onClose,
  onAssetCreated,
  onAssetUpdated,
  initialData,
  defaultCategory = '',
  token,
  projectId,
}) => {
  // 内部化上传状态（从 AssetLibrary 提升状态移入）
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'analyzing' | 'creating' | 'failed'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mainUploadResult, setMainUploadResult] = useState<{ fileUrl: string; storageKey: string } | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<GarmentCategory | ''>(defaultCategory);
  const [description, setDescription] = useState('');
  const [clothingAttrs, setClothingAttrs] = useState<{
    mainColor?: string;
    material?: string;
    pattern?: string;
    fit?: string;
    length?: string;
    neckline?: string;
    sleeve?: string;
    style?: string;
    occasion?: string;
  } | null>(null);
  const [mainView, setMainView] = useState<AssetViewItem | null>(null);
  const [otherViews, setOtherViews] = useState<AssetViewItem[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // 平铺图生成状态
  const [flatLayImageUrl, setFlatLayImageUrl] = useState<string | null>(null);
  const [isGeneratingFlatLay, setIsGeneratingFlatLay] = useState(false);
  const [flatLayError, setFlatLayError] = useState<string | null>(null);
  /** 平铺图生成进度（0-95%，完成后置 100%） */
  const [flatLayProgress, setFlatLayProgress] = useState(0);
  /** 删除确认弹窗状态 */
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'main' | 'other';
    targetId?: string;
  } | null>(null);
  /** 资产是否被项目引用（编辑模式时检查） */
  const [isReferenced, setIsReferenced] = useState(false);
  const [referenceCount, setReferenceCount] = useState(0);
  const { confirm } = useConfirm();

  const isUploading = uploadPhase !== 'idle' && uploadPhase !== 'failed';
  /** 头部进度覆盖层是否显示：上传/分析/平铺图生成中 */
  const showHeaderProgress = isUploading || isGeneratingFlatLay;
  const mainUploadInputRef = useRef<HTMLInputElement | null>(null);
  const otherUploadInputRef = useRef<HTMLInputElement | null>(null);
  const generatedObjectUrlsRef = useRef<string[]>([]);
  // 存储分类结果（含 garmentRegions）用于创建资产时传递
  const classificationResultRef = useRef<Step1ImageClassificationResultDto | null>(null);
  // 存储上传分类时自动创建的资产 ID（用于生成平铺图时触发蒙版预处理）
  const createdAssetIdRef = useRef<string | null>(null);

  const registerObjectUrl = (file: File): string => {
    const objectUrl = URL.createObjectURL(file);
    generatedObjectUrlsRef.current.push(objectUrl);
    return objectUrl;
  };

  const clearObjectUrls = () => {
    for (const objectUrl of generatedObjectUrlsRef.current) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ignore
      }
    }
    generatedObjectUrlsRef.current = [];
  };

  // 处理上传阶段变化
  const handlePhaseChange = (phase: 'idle' | 'uploading' | 'analyzing' | 'creating' | 'failed') => {
    setUploadPhase(phase);
  };

  // 弹窗 loading（上传 + 平铺图生成）同步到全局计时器
  const hasShownRef = useRef(false);

  useEffect(() => {
    const state = useAppStore.getState();
    if (isUploading || isGeneratingFlatLay) {
      hasShownRef.current = true;
      state.showGlobalLoading();
    } else if (hasShownRef.current) {
      hasShownRef.current = false;
      useAppStore.getState().hideGlobalLoading();
    }
  }, [isUploading, isGeneratingFlatLay]);

  // 处理主图上传完成
  const handleUploadReady = (
    result: { fileUrl: string; storageKey: string } | null,
    classification: Step1ImageClassificationResultDto | null,
    error: string | null,
  ) => {
    if (error) {
      setMainUploadResult(null);
      setUploadError(error);
      classificationResultRef.current = null;
      return;
    }
    setMainUploadResult(result);
    setUploadError(null);
    classificationResultRef.current = classification;
  };

  // Reset or Populate form when modal opens
  useEffect(() => {
    if (!isOpen) {
      setLightboxUrl(null);
      setFlatLayImageUrl(null);
      setIsGeneratingFlatLay(false);
      setFlatLayError(null);
      // 延迟释放 ObjectURL
      const urlsToRevoke = [...generatedObjectUrlsRef.current];
      generatedObjectUrlsRef.current = [];
      if (urlsToRevoke.length > 0) {
        setTimeout(() => {
          for (const url of urlsToRevoke) {
            try { URL.revokeObjectURL(url); } catch { /* ignore */ }
          }
        }, 500);
      }
      return;
    }
    if (isOpen) {
      // 重置内部上传状态
      setUploadPhase('idle');
      setUploadError(null);
      setMainUploadResult(null);

      if (initialData) {
        setName(initialData.name);
        // 直接使用系统统一分类，不做映射
        const rawCategory = initialData.category as string;
        if (rawCategory && Object.keys(GARMENT_CATEGORY_LABELS).includes(rawCategory)) {
          setCategory(rawCategory as GarmentCategory);
        } else {
          setCategory('');
        }
        setDescription(initialData.description || '');
        if (initialData.clothingAttrs) {
          const attrs = initialData.clothingAttrs;
          setClothingAttrs({
            mainColor: attrs.mainColor ?? undefined,
            material: attrs.material ?? undefined,
            pattern: attrs.pattern ?? undefined,
            fit: attrs.fit ?? undefined,
            length: attrs.length ?? undefined,
            neckline: attrs.neckline ?? undefined,
            sleeve: attrs.sleeve ?? undefined,
            style: attrs.style ?? undefined,
            occasion: attrs.occasion ?? undefined,
          });
        } else {
          setClothingAttrs(null);
        }
        const mainUrl = initialData.mainImageUrl?.trim() || '';
        setMainView(
          mainUrl
            ? {
                id: `asset-main-existing-${Date.now()}`,
                kind: 'existing',
                url: mainUrl,
              }
            : null,
        );
        const subUrls = [initialData.subImageUrl1, initialData.subImageUrl2, initialData.subImageUrl3]
          .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
          .map((url) => url.trim());
        setOtherViews(
          subUrls
            .slice(0, 3)
            .map((url, index) => ({
              id: `asset-other-existing-${Date.now()}-${index}`,
              kind: 'existing' as const,
              url,
            })),
        );
        const existingFlatLay = initialData.flatLayImageUrl?.trim();
        setFlatLayImageUrl(existingFlatLay || null);
        setFlatLayError(null);
        setIsGeneratingFlatLay(false);
      } else {
        setName('');
        setCategory(defaultCategory);
        setDescription('');
        setClothingAttrs(null);
        setMainView(null);
        setOtherViews([]);
        setFlatLayImageUrl(null);
        setIsGeneratingFlatLay(false);
        setFlatLayError(null);
        setIsReferenced(false);
        setReferenceCount(0);
      }

      // 编辑模式：检查资产是否被项目引用
      if (initialData && token) {
        setIsReferenced(false);
        setReferenceCount(0);
        realGarmentAssetsApi.checkGarmentAssetReferenced(token, initialData.id)
          .then((res) => {
            setIsReferenced(res.referenced);
            setReferenceCount(res.count);
          })
          .catch(() => {
            // 查询失败不影响正常使用，默认认为未被引用
            setIsReferenced(false);
            setReferenceCount(0);
          });
      }
    }
  }, [isOpen, initialData, defaultCategory]);

  useEffect(() => {
    return () => {
      clearObjectUrls();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 进度条：上传/识别/生成平铺图期间从 0 缓慢增长到 95%
  useEffect(() => {
    if (!showHeaderProgress) {
      setFlatLayProgress(0);
      return;
    }
    setFlatLayProgress(0);
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(95, Math.round((1 - Math.exp(-elapsed / 25_000)) * 100));
      setFlatLayProgress(progress);
    }, 500);
    return () => clearInterval(interval);
  }, [showHeaderProgress]);

  if (!isOpen) return null;

  const isVideoAsset = initialData?.type === 'video';
  const maxOtherViews = 3;

  const handleMainFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const previewUrl = registerObjectUrl(selectedFile);
      // 更换主图时重置平铺图状态
      setFlatLayImageUrl(null);
      setFlatLayError(null);
      setMainView({
        id: `asset-main-new-${Date.now()}`,
        kind: 'new',
        url: previewUrl,
        file: selectedFile,
      });
      if (!name && !initialData) {
        setName(selectedFile.name);
      }
      e.target.value = '';

      // 先上传 OSS，再传 OSS URL 给后端做 LLM 分类；失败则删除 OSS 文件
      if (!token) return;
      let uploadResult: { fileUrl: string; storageKey: string } | null = null;
      try {
        // 1. 先上传到 OSS
        handlePhaseChange('uploading');
        uploadResult = await uploadFileToOss(token, 'library', selectedFile, true);

        // 2. 用 OSS URL 调用分类 API（传递 sizeMb 自动创建资产）
        handlePhaseChange('analyzing');
        const classification = await classifyLibraryAssetUploadImage(token, {
          imageUrl: uploadResult.fileUrl,
          fileName: selectedFile.name,
          target: 'main',
          hasMainImage: false,
          existingOtherViewCount: 0,
          includeFeedback: true,
          sizeMb: selectedFile.size / 1024 / 1024, // 传递文件大小，触发自动创建资产
        });

        // 检查是否为服饰图片
        if (shouldBlockStep1UploadByClassification(classification)) {
          // 非服饰图片，删除已上传的 OSS 文件
          await deleteFileFromOss(token, 'library', uploadResult!.storageKey, true).catch((e) => {
            console.warn('[AssetModal] 清理无效分类文件失败:', uploadResult!.storageKey, e);
          });
          handlePhaseChange('failed');
          handleUploadReady(null, null, buildStep1NonClothingUploadMessage(classification));
          setMainView(null);
          return;
        }

        // 分类通过，回填信息
        handlePhaseChange('idle');
        handleUploadReady(uploadResult, classification, null);

        // 保存自动创建的资产 ID（用于生成平铺图时触发蒙版预处理）
        if ('assetId' in classification && classification.assetId) {
          createdAssetIdRef.current = classification.assetId;
        }

        // 自动回填分析结果到表单
        const classifiedCategory = classification.classification?.category;
        if (classifiedCategory && classifiedCategory !== 'unknown' && Object.keys(GARMENT_CATEGORY_LABELS).includes(classifiedCategory)) {
          setCategory(classifiedCategory as GarmentCategory);
        }
        if (classification.clothingDescription) {
          setDescription(classification.clothingDescription);
        }
        if (classification.clothingAttributes) {
          const ca = classification.clothingAttributes;
          setClothingAttrs({
            mainColor: ca.mainColor ?? undefined,
            material: ca.material ?? undefined,
            pattern: ca.pattern ?? undefined,
            fit: ca.fit ?? undefined,
            length: ca.length ?? undefined,
            neckline: ca.neckline ?? undefined,
            sleeve: ca.sleeve ?? undefined,
            style: ca.style ?? undefined,
            occasion: ca.occasion ?? undefined,
          });
        }
        if (classification.clothingTitle) {
          setName(classification.clothingTitle);
        }
      } catch (error) {
        // 上传或识别失败，清理已上传的 OSS 文件
        if (uploadResult) {
          await deleteFileFromOss(token, 'library', uploadResult!.storageKey, true).catch((e) => {
            console.warn('[AssetModal] 清理上传失败文件失败:', uploadResult!.storageKey, e);
          });
        }
        handlePhaseChange('failed');
        const message = error instanceof Error ? error.message : '处理失败';
        handleUploadReady(null, null, message);
      }
    }
  };

  /** 上传副图并同步更新 DB（立即持久化，确保生成平铺图时 DB 已有副图） */
  const handleOtherFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isVideoAsset) {
      return;
    }
    const assetId = initialData?.id || createdAssetIdRef.current;
    if (!assetId) {
      setUploadError('请先上传主图并等待分类完成后再上传其他视角图');
      e.target.value = '';
      return;
    }
    if (!token) return;
    if (otherViews.length >= maxOtherViews) {
      e.target.value = '';
      return;
    }
    if (!e.target.files?.[0]) return;
    const selectedFile = e.target.files[0];
    e.target.value = '';

    // 先显示本地预览
    const previewUrl = registerObjectUrl(selectedFile);
    const tempId = `asset-other-new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setOtherViews((current) => [...current, { id: tempId, kind: 'new' as const, url: previewUrl, file: selectedFile }].slice(0, maxOtherViews));

    try {
      // 立即上传到 OSS
      const uploadResult = await uploadFileToOss(token, 'library', selectedFile, true);
      const ossUrl = uploadResult.fileUrl;

      // 将前端状态从本地预览更新为 OSS URL
      setOtherViews((current) =>
        current.map((item) => item.id === tempId ? { ...item, url: ossUrl, kind: 'existing' } : item)
      );

      // 同步更新 DB（收集已上传完成的副图 URL + 本次新上传的 URL）
      const currentUrls = otherViews
        .filter((item) => item.kind === 'existing')
        .map((item) => item.url);
      currentUrls.push(ossUrl);

      await backendApi.updateGarmentAsset(token, assetId, {
        subImageUrl1: currentUrls[0] || null,
        subImageUrl2: currentUrls[1] || null,
        subImageUrl3: currentUrls[2] || null,
      });
    } catch (error) {
      // 上传失败：移除该副图项，不降级
      setOtherViews((current) => current.filter((item) => item.id !== tempId));
      const msg = error instanceof ApiError ? error.message : '上传副图失败';
      setUploadError(msg);
    }
  };

  /** 执行删除主图（内部函数） */
  const doDeleteMainView = () => {
    setFlatLayImageUrl(null);
    setFlatLayError(null);
    if (otherViews.length > 0) {
      const [promotedMain, ...rest] = otherViews;
      setMainView(promotedMain);
      setOtherViews(rest);
      return;
    }
    setMainView(null);
  };

  /** 执行删除副图（内部函数） — 同时同步 DB */
  const doDeleteOtherView = async (targetId: string) => {
    const assetId = initialData?.id || createdAssetIdRef.current;
    // 只收集已上传完成的 OSS URL（排除正在上传中的本地预览）
    const remainingUrls = otherViews
      .filter((item) => item.id !== targetId && item.kind === 'existing')
      .map((item) => item.url);
    setOtherViews((current) => current.filter((item) => item.id !== targetId));

    // 同步更新 DB 副图字段
    if (assetId && token) {
      try {
        await backendApi.updateGarmentAsset(token, assetId, {
          subImageUrl1: remainingUrls[0] || null,
          subImageUrl2: remainingUrls[1] || null,
          subImageUrl3: remainingUrls[2] || null,
        });
      } catch (error) {
        const msg = error instanceof ApiError ? error.message : '更新副图失败';
        setUploadError(msg);
      }
    }
  };

  /** 点击删除主图 - 显示确认弹窗 */
  const handleDeleteMainView = () => {
    if (!mainView) return;
    if (isReferenced) {
      setUploadError(`该服饰已被 ${referenceCount} 个项目引用，不允许删除`);
      return;
    }
    setDeleteConfirm({ type: 'main' });
  };

  /** 点击删除副图 - 显示确认弹窗 */
  const handleDeleteOtherView = (targetId: string) => {
    if (isReferenced) {
      setUploadError(`该服饰已被 ${referenceCount} 个项目引用，不允许删除`);
      return;
    }
    setDeleteConfirm({ type: 'other', targetId });
  };

  /** 确认删除 */
  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'main') {
      doDeleteMainView();
    } else if (deleteConfirm.targetId) {
      await doDeleteOtherView(deleteConfirm.targetId);
    }
    setDeleteConfirm(null);
  };

  /** 取消删除 */
  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  // 生成平铺图：使用 assetId 方式调用（触发蒙版预处理）
  // - 编辑模式：使用 initialData.id
  // - 新建模式：使用分类时自动创建的 assetId（createdAssetIdRef.current）
  const handleGenerateFlatLay = async () => {
    if (!token || !mainView?.url || isGeneratingFlatLay) return;
    if (isReferenced) {
      setUploadError(`该服饰已被 ${referenceCount} 个项目引用，不允许重新生成平铺图`);
      return;
    }
    const mainImageUrl = mainUploadResult?.fileUrl || mainView.url;
    if (!mainImageUrl.startsWith('http')) {
      setFlatLayError('主图尚未上传完成，请稍候重试');
      return;
    }
    setIsGeneratingFlatLay(true);
    setFlatLayError(null);
    try {
      // 确定使用的 assetId（编辑模式或新建模式）
      const assetId = initialData?.id || createdAssetIdRef.current;

      if (!assetId) {
        // 没有 assetId 时直接报错，不使用兜底逻辑
        setFlatLayError('服饰资产未创建，请先上传并等待分类完成后再生成平铺图');
        return;
      }

      // 使用 assetId 方式调用（触发蒙版预处理）
      const result = await realGarmentAssetsApi.generateGarmentFlatLay(token, { assetId, projectId });
      setFlatLayImageUrl(result.generatedImageUrl);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '生成平铺图失败，请重试';
      setFlatLayError(msg);
    } finally {
      setIsGeneratingFlatLay(false);
    }
  };

  /** 触发保存确认弹窗 */
  const handleSaveConfirm = async () => {
    const confirmed = await confirm(
      '请确保已上传衣服细节，且平铺图展示了正确的 logo 和细节。\n\n保存后将不可修改，确定保存？',
      '确认保存服饰素材',
    );
    if (confirmed) {
      await handleSubmit();
    }
  };

  // 内部化资产创建/更新逻辑（原 handleSaveAsset）
  const handleSubmit = async () => {
    if (isUploading) return;
    if (!token) return;

    // 编辑模式：更新元数据
    if (initialData) {
      try {
        const otherUrls = otherViews.map((item) => item.url);
        const nextMainImageUrl = typeof mainView?.url === 'string' && mainView?.kind === 'existing'
          ? mainView.url.trim()
          : initialData.mainImageUrl;

        const updated = await backendApi.updateGarmentAsset(token, initialData.id, {
          name: name || initialData.name,
          category: category as GarmentCategory,
          mainImageUrl: nextMainImageUrl,
          subImageUrl1: otherUrls[0] || null,
          subImageUrl2: otherUrls[1] || null,
          subImageUrl3: otherUrls[2] || null,
          flatLayImageUrl: flatLayImageUrl || null,
          description: description || null,
          mainColor: clothingAttrs?.mainColor || null,
          material: clothingAttrs?.material || null,
          pattern: clothingAttrs?.pattern || null,
          fit: clothingAttrs?.fit || null,
          length: clothingAttrs?.length || null,
          neckline: clothingAttrs?.neckline || null,
          sleeve: clothingAttrs?.sleeve || null,
          style: clothingAttrs?.style || null,
          occasion: clothingAttrs?.occasion || null,
        });
        // 等待 onAssetUpdated 完成，确保状态更新后再关闭弹窗
        if (onAssetUpdated) {
          await onAssetUpdated(updated);
        }
        onClose();
      } catch (error) {
        const message = error instanceof ApiError ? error.message : '更新素材失败';
        setUploadError(message);
      }
      return;
    }

    // 创建模式：只更新已有资产（分类 API 已创建），不创建新资产
    if (!mainUploadResult) {
      setUploadError('请先上传主图');
      return;
    }
    if (!category) {
      setUploadError('请选择分类');
      return;
    }

    // 检查是否已有资产（分类 API 已创建）
    const existingAssetId = createdAssetIdRef.current;
    if (!existingAssetId) {
      setUploadError('服饰资产未创建，请先上传主图并等待分类完成');
      return;
    }

    try {
      handlePhaseChange('creating');

      // 副图已在选择时即时上传，直接收集所有 URL
      const subImageUrls = otherViews.map((item) => item.url);

      // 更新已有资产（分类 API 已创建，追加其他视角图和用户编辑的属性）
      const updated = await backendApi.updateGarmentAsset(token, existingAssetId, {
        name: name || '未命名素材',
        category: category as GarmentCategory,
        subImageUrl1: subImageUrls[0] || null,
        subImageUrl2: subImageUrls[1] || null,
        subImageUrl3: subImageUrls[2] || null,
        flatLayImageUrl: flatLayImageUrl || null,
        description: description || null,
        mainColor: clothingAttrs?.mainColor || null,
        material: clothingAttrs?.material || null,
        pattern: clothingAttrs?.pattern || null,
        fit: clothingAttrs?.fit || null,
        length: clothingAttrs?.length || null,
        neckline: clothingAttrs?.neckline || null,
        sleeve: clothingAttrs?.sleeve || null,
        style: clothingAttrs?.style || null,
        occasion: clothingAttrs?.occasion || null,
      });

      handlePhaseChange('idle');
      if (onAssetCreated) {
        await onAssetCreated(updated);
      }
      onClose();
    } catch (error) {
      handlePhaseChange('failed');
      const message = error instanceof ApiError ? error.message : '保存素材失败';
      setUploadError(message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        {/* 头部 — 处理中隐藏，由进度覆盖层替代 */}
        {!showHeaderProgress && (
        <div className="shrink-0 px-6 py-4 flex justify-between items-center bg-gradient-to-r from-primary/5 via-transparent to-purple-500/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-icons-round text-primary text-lg">
                {initialData ? 'edit' : 'add_photo_alternate'}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">
                {initialData ? '编辑素材' : '上传服饰和生成平铺图'}
              </h3>
              {!initialData && <p className="text-[13px] text-gray-400 mt-0.5">请上传细节清晰的高品质服饰图片，优质素材是好作品的第一步!</p>}
              {isReferenced && initialData && (
                <p className="text-[12px] text-amber-600 mt-1 flex items-center gap-1 font-semibold">
                  <span className="material-icons-round text-sm">lock</span>
                  已被 {referenceCount} 个项目引用，不允许修改任何内容
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <span className="material-icons-round text-xl">close</span>
          </button>
        </div>
        )}

        {/* 处理进度 — 替代头部区域，与 header 等高，阻止关闭操作 */}
        {showHeaderProgress && (
          <div className="shrink-0 px-6 py-4 flex items-center gap-3 rounded-t-2xl bg-gradient-to-r from-primary/[0.03] via-purple-500/[0.02] to-primary/[0.03] border-b border-primary/10">
            <div className="relative w-8 h-8 shrink-0">
              <div className="absolute inset-0 w-8 h-8 rounded-full border-[2.5px] border-primary/70 border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
            </div>
            <div className="text-sm font-semibold text-gray-700 whitespace-nowrap">
              {uploadPhase === 'uploading' && '正在上传图片...'}
              {uploadPhase === 'analyzing' && 'AI 正在识别服饰...'}
              {uploadPhase === 'creating' && '正在创建素材...'}
              {isGeneratingFlatLay && 'AI 正在生成平铺图...'}
            </div>
            <div className="flex-1 relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-400 via-primary to-purple-400"
                style={{
                  width: `${flatLayProgress}%`,
                  backgroundSize: "200% 100%",
                  animation: "flow-gradient 2.5s ease-in-out infinite",
                }}
              />
              <div
                className="absolute inset-y-0 w-12 rounded-full bg-gradient-to-r from-transparent via-white/60 to-transparent"
                style={{ animation: "progress-shimmer 2s ease-in-out infinite" }}
              />
            </div>
          </div>
        )}

        {/* 主体 */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <input ref={mainUploadInputRef} type="file" className="hidden" onChange={handleMainFileChange} accept={isVideoAsset ? 'video/*' : 'image/*'} />
          <input ref={otherUploadInputRef} type="file" className="hidden" onChange={handleOtherFileChange} accept="image/*" />

          <div className="flex flex-col">
            <div className="px-8 pt-6 pb-4">
              {/* 两步进度条 */}
              {!initialData && (
                <div className="flex items-center gap-3 mb-4">
                  {/* Step 1: 服饰分析 */}
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all duration-300 ${
                      uploadPhase === 'analyzing'
                        ? 'bg-primary text-white shadow-md shadow-primary/30 ring-2 ring-primary/20'
                        : uploadPhase === 'failed'
                          ? 'bg-red-500 text-white'
                          : mainView?.url
                            ? 'bg-primary text-white'
                            : 'bg-gray-200 text-gray-400'
                    }`}>
                      {uploadPhase === 'analyzing' ? (
                        <span className="material-icons-round text-xs animate-spin">refresh</span>
                      ) : uploadPhase === 'failed' ? (
                        <span className="material-icons-round text-xs">close</span>
                      ) : mainView?.url ? (
                        <span className="material-icons-round text-xs">check</span>
                      ) : (
                        '1'
                      )}
                    </div>
                    <span className={`text-xs font-semibold transition-colors duration-300 ${
                      uploadPhase === 'analyzing' ? 'text-primary'
                        : uploadPhase === 'failed' ? 'text-red-500'
                          : mainView?.url ? 'text-gray-700' : 'text-gray-400'
                    }`}>服饰分析</span>
                  </div>
                  {/* 连接线 */}
                  <div className={`h-[2px] flex-1 rounded-full transition-colors duration-500 ${mainView?.url ? 'bg-primary/40' : 'bg-gray-200'}`} />
                  {/* Step 2: 生成平铺图 */}
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all duration-300 ${
                      isGeneratingFlatLay
                        ? 'bg-primary text-white shadow-md shadow-primary/30 ring-2 ring-primary/20'
                        : flatLayImageUrl
                          ? 'bg-primary text-white'
                          : mainView?.url
                            ? 'bg-gray-200 text-gray-400'
                            : 'bg-gray-100 text-gray-300'
                    }`}>
                      {isGeneratingFlatLay ? (
                        <span className="material-icons-round text-xs animate-spin">refresh</span>
                      ) : flatLayImageUrl ? (
                        <span className="material-icons-round text-xs">check</span>
                      ) : (
                        '2'
                      )}
                    </div>
                    <span className={`text-xs font-semibold transition-colors duration-300 ${
                      isGeneratingFlatLay ? 'text-primary'
                        : flatLayImageUrl ? 'text-gray-700'
                          : mainView?.url ? 'text-gray-400' : 'text-gray-300'
                    }`}>{isGeneratingFlatLay ? '生成中...' : '生成平铺图'}</span>
                  </div>
                </div>
              )}

              {/* 示例区域 - 独立放在上面 */}
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 mb-1 inline-block">示例</span>
                  <div className="flex gap-2">
                    {/* 正确示例 */}
                    <div
                      className="rounded bg-emerald-50/80 border border-emerald-100 p-0.5 relative cursor-pointer hover:ring-2 hover:ring-emerald-200 transition-all w-14"
                      onClick={() => setLightboxUrl("/images/correct-example.jpg")}
                    >
                      <div className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center">
                        <span className="material-icons-round text-white text-[8px]">check</span>
                      </div>
                      <img
                        src="/images/correct-example.jpg"
                        alt="正确示例"
                        className="w-full aspect-square rounded-sm object-cover"
                      />
                    </div>
                    {/* 错误示例 */}
                    <div
                      className="rounded bg-red-50/80 border border-red-100 p-0.5 relative cursor-pointer hover:ring-2 hover:ring-red-200 transition-all w-14"
                      onClick={() => setLightboxUrl("/images/error-example.jpg")}
                    >
                      <div className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-red-500 flex items-center justify-center">
                        <span className="material-icons-round text-white text-[8px]">close</span>
                      </div>
                      <img
                        src="/images/error-example.jpg"
                        alt="错误示例"
                        className="w-full aspect-square rounded-sm object-cover"
                      />
                    </div>
                  </div>
                </div>

                {/* 操作指南按钮 */}
                <a
                  href="/user-guide/video-project-guide.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                >
                  <span className="material-icons-round text-sm">menu_book</span>
                  操作指南
                </a>
              </div>

              {/* 图片区域 - 居中 */}
              <div className="flex items-center gap-4 justify-center">
                {/* 用户原图 */}
                <div className="flex flex-col items-center gap-2 w-40">
                  {mainView?.url ? (
                    <div
                      className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-white shadow-md ring-1 ring-gray-200/80 cursor-pointer group relative"
                      onClick={() => !isUploading && setLightboxUrl(mainView.url)}
                    >
                      <img src={getOssThumbnailUrl(mainView.url, 600)} className="w-full h-full object-cover" alt="用户原图" loading="lazy" />
                      {/* 上传中遮罩 */}
                      {isUploading && (
                        <div className="absolute inset-0 bg-white/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                          <span className="text-xs text-gray-600 font-medium">
                            {uploadPhase === 'analyzing' && '正在识别图片...'}
                            {uploadPhase === 'uploading' && '正在上传图片...'}
                            {uploadPhase === 'creating' && '正在创建素材...'}
                          </span>
                        </div>
                      )}
                      {/* 识别失败提示 */}
                      {uploadPhase === 'failed' && uploadError && (
                        <div className="absolute left-0 bottom-0 right-0 bg-gradient-to-t from-red-500 via-red-500/90 to-transparent text-white text-xs p-3 pt-8">
                          <div className="flex items-start gap-1.5">
                            <span className="material-icons-round text-sm mt-0.5 shrink-0">warning</span>
                            <span className="line-clamp-2">{uploadError}</span>
                          </div>
                        </div>
                      )}
                      {/* AI 识别属性 - 主图底部边缘 */}
                      {clothingAttrs && uploadPhase !== 'failed' && !isUploading && (
                        <div className="absolute left-0 bottom-0 right-0 bg-gradient-to-t from-black/70 via-black/50 to-transparent px-2.5 pt-6 pb-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="material-icons-round text-white/90 text-xs shrink-0">auto_awesome</span>
                            {clothingAttrs.mainColor && <span className="px-1.5 py-0.5 rounded bg-white/20 text-white text-[10px] font-medium">{clothingAttrs.mainColor}</span>}
                            {clothingAttrs.material && <span className="px-1.5 py-0.5 rounded bg-white/20 text-white text-[10px] font-medium">{clothingAttrs.material}</span>}
                            {clothingAttrs.pattern && <span className="px-1.5 py-0.5 rounded bg-white/20 text-white text-[10px] font-medium">{clothingAttrs.pattern}</span>}
                            {clothingAttrs.fit && <span className="px-1.5 py-0.5 rounded bg-white/20 text-white text-[10px] font-medium">{clothingAttrs.fit}</span>}
                            {clothingAttrs.style && <span className="px-1.5 py-0.5 rounded bg-white/20 text-white text-[10px] font-medium">{clothingAttrs.style}</span>}
                            {clothingAttrs.occasion && <span className="px-1.5 py-0.5 rounded bg-white/20 text-white text-[10px] font-medium">{clothingAttrs.occasion}</span>}
                          </div>
                        </div>
                      )}
                      {/* 悬停操作 */}
                      {!isUploading && uploadPhase !== 'failed' && !isGeneratingFlatLay && (
                        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="material-icons-round text-white text-2xl">zoom_in</span>
                        </div>
                      )}
                      {/* 更换/删除按钮 — 生成中时禁用 */}
                      {!isUploading && uploadPhase !== 'failed' && (
                        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isReferenced || isGeneratingFlatLay ? (
                            <button type="button" className="w-7 h-7 rounded-lg bg-black/20 backdrop-blur-sm text-white/40 cursor-not-allowed flex items-center justify-center" title={isGeneratingFlatLay ? '正在生成平铺图，请稍后操作' : '已被项目引用，不允许更换'} disabled>
                              <span className="material-icons-round text-sm">image</span>
                            </button>
                          ) : (
                            <button type="button" className="w-7 h-7 rounded-lg bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/60 transition-colors" title="更换主图" onClick={(e) => { e.stopPropagation(); mainUploadInputRef.current?.click(); }}>
                              <span className="material-icons-round text-sm">image</span>
                            </button>
                          )}
                          {isReferenced || isGeneratingFlatLay ? (
                            <button type="button" className="w-7 h-7 rounded-lg bg-black/20 backdrop-blur-sm text-white/40 cursor-not-allowed flex items-center justify-center" title={isGeneratingFlatLay ? '正在生成平铺图，请稍后操作' : `已被 ${referenceCount} 个项目引用，不允许删除`} disabled>
                              <span className="material-icons-round text-sm">delete</span>
                            </button>
                          ) : (
                            <button type="button" className="w-7 h-7 rounded-lg bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-red-500 transition-colors" title="删除主图" onClick={(e) => { e.stopPropagation(); handleDeleteMainView(); }}>
                              <span className="material-icons-round text-sm">delete</span>
                            </button>
                          )}
                        </div>
                      )}
                      {/* 失败时重新上传 */}
                      {uploadPhase === 'failed' && (
                        <button type="button" className="absolute left-2 top-2 w-7 h-7 rounded-lg bg-white/90 text-primary flex items-center justify-center shadow-sm hover:bg-white transition-colors" title="重新上传" onClick={(e) => { e.stopPropagation(); handlePhaseChange('idle'); mainUploadInputRef.current?.click(); }}>
                          <span className="material-icons-round text-sm">refresh</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    /* 无图上传区 */
                    <div
                      className={`w-full aspect-[3/4] rounded-xl flex flex-col items-center justify-center transition-all ${
                        uploadPhase === 'failed' && uploadError
                          ? 'bg-red-50 ring-1 ring-red-200'
                          : 'border-2 border-dashed border-gray-200 bg-gray-50/50 hover:border-primary/40 hover:bg-primary/[0.02]'
                      } ${!isUploading ? 'cursor-pointer' : ''}`}
                      onClick={() => { if (!isUploading) mainUploadInputRef.current?.click(); }}
                    >
                      {uploadPhase === 'failed' && uploadError ? (
                        <div className="text-center p-4">
                          <span className="material-icons-round text-red-400 text-4xl mb-2">error</span>
                          <div className="text-red-500 text-sm font-medium mb-1">识别失败</div>
                          <div className="text-gray-400 text-xs mb-3 line-clamp-2">{uploadError}</div>
                          <button type="button" onClick={(e) => { e.stopPropagation(); handlePhaseChange('idle'); mainUploadInputRef.current?.click(); }} className="text-primary text-xs font-medium hover:underline">重新上传</button>
                        </div>
                      ) : (
                        <div className="text-gray-300 flex flex-col items-center gap-2 py-4">
                          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                            <span className="material-icons-round text-2xl text-gray-300">cloud_upload</span>
                          </div>
                          <div className="text-center">
                            <span className="text-sm text-gray-400 font-medium">点击上传服饰图片</span>
                            <p className="text-[11px] text-gray-300 mt-1">支持 JPG / PNG 格式</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <span className="text-[11px] text-gray-400 font-medium">{mainView?.url ? '用户上传原图' : ''}</span>
                  {/* 副图缩略图 */}
                  {!isVideoAsset && (
                    <div className="w-full">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="material-icons-round text-[10px] text-gray-400">tips_and_updates</span>
                        <span className="text-[10px] text-gray-400">补充背面/细节视角可提升生成质量</span>
                      </div>
                      <div className="flex gap-1.5 w-full">
                        {Array.from({ length: maxOtherViews }).map((_, index) => {
                          const view = otherViews[index] ?? null;
                          // 检查是否允许上传（编辑模式或新建模式主图分类完成）
                          const canUploadOther = Boolean(initialData?.id || createdAssetIdRef.current) && !isReferenced && !isGeneratingFlatLay;
                          if (!view) {
                            return (
                              <button key={`thumb-empty-${index}`} type="button" onClick={() => canUploadOther && otherUploadInputRef.current?.click()} className={`flex-1 aspect-square rounded-lg border border-dashed transition-colors flex items-center justify-center ${canUploadOther ? 'border-gray-200 bg-gray-50/50 text-gray-300 hover:border-primary/30 hover:text-primary/50' : 'border-gray-100 bg-gray-50/30 text-gray-200 cursor-not-allowed'}`} title={canUploadOther ? '上传副图' : '请先上传主图并等待分类完成'}>
                                <span className="material-icons-round text-xs">add</span>
                              </button>
                            );
                          }
                          return (
                            <div key={view.id} onClick={() => setLightboxUrl(view.url)} className="flex-1 aspect-square overflow-hidden rounded-lg ring-1 ring-gray-200/60 cursor-pointer relative group/thumb" title="点击放大">
                                <img src={getOssThumbnailUrl(view.url, 200)} className="h-full w-full object-cover" alt={`副图-${index + 1}`} loading="lazy" />
                                {isReferenced || isGeneratingFlatLay ? (
                                  <button type="button" className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/20 text-white/40 cursor-not-allowed flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity" disabled title={isGeneratingFlatLay ? '正在生成平铺图，请稍后操作' : `已被 ${referenceCount} 个项目引用，不允许删除`}>
                                    <span className="material-icons-round text-[10px]">close</span>
                                  </button>
                                ) : (
                                  <button type="button" className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/50 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity" onClick={(event) => { event.stopPropagation(); handleDeleteOtherView(view.id); }}>
                                    <span className="material-icons-round text-[10px]">close</span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 箭头过渡 */}
                <div className="flex flex-col items-center shrink-0 gap-3">
                  <div className="relative flex items-center">
                    <div className={`w-10 h-[2px] rounded-full transition-colors duration-300 ${flatLayImageUrl || isGeneratingFlatLay ? 'bg-gradient-to-r from-transparent via-primary/60 to-primary' : 'bg-gradient-to-r from-transparent via-gray-200 to-gray-300'}`} />
                    <div className={`absolute -inset-2 w-14 h-6 rounded-full blur-sm transition-all duration-500 ${isGeneratingFlatLay ? 'bg-primary/15' : flatLayImageUrl ? 'bg-primary/8' : 'bg-gray-200/50'}`} style={isGeneratingFlatLay ? { animation: 'flow-glow-pulse 2s ease-in-out infinite' } : undefined} />
                    <span className={`material-icons-round text-3xl drop-shadow-sm transition-colors duration-300 ${flatLayImageUrl || isGeneratingFlatLay ? 'text-primary' : 'text-gray-300'}`} style={isGeneratingFlatLay ? { animation: 'flow-arrow-bounce 1s ease-in-out infinite' } : undefined}>arrow_forward</span>
                    <div className={`w-10 h-[2px] rounded-full transition-colors duration-300 ${flatLayImageUrl || isGeneratingFlatLay ? 'bg-gradient-to-r from-primary via-primary/60 to-transparent' : 'bg-gradient-to-r from-gray-300 via-gray-200 to-transparent'}`} />
                  </div>
                  <span className={`text-[10px] tracking-widest font-medium uppercase transition-colors duration-300 ${flatLayImageUrl || isGeneratingFlatLay ? 'text-primary/60' : 'text-gray-300'}`}>AI</span>
                </div>
                {/* AI 平铺图 */}
                <div className="flex flex-col items-center gap-2 w-48">
                  {flatLayImageUrl ? (
                    <div className="w-full aspect-[9/16] rounded-xl overflow-hidden bg-white shadow-lg ring-2 ring-primary/20 cursor-pointer group relative" onClick={() => setLightboxUrl(flatLayImageUrl)}>
                      <img src={getOssThumbnailUrl(flatLayImageUrl, 400)} className="w-full h-full object-contain bg-[repeating-conic-gradient(#f9fafb_0%_25%,#fff_0%_50%)] bg-[length:12px_12px]" alt="AI 平铺图" loading="lazy" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-end justify-center pb-3 pointer-events-none">
                        <span className="bg-white/25 backdrop-blur-md text-white text-[11px] font-medium px-3 py-1 rounded-full flex items-center gap-1">
                          <span className="material-icons-round text-sm">zoom_in</span>
                          查看大图
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full aspect-[9/16] rounded-xl overflow-hidden bg-gray-50 ring-1 ring-gray-200/80 flex flex-col items-center justify-center gap-2 relative">
                      {isGeneratingFlatLay ? (
                        <>
                          <div className="relative">
                            <div className="w-10 h-10 rounded-full border-[2.5px] border-primary/60 border-t-transparent animate-spin" />
                            <div className="absolute inset-0 w-10 h-10 rounded-full border-2 border-primary/30 animate-ping" />
                          </div>
                          <span className="text-[11px] text-gray-600 font-medium">正在生成平铺图...</span>
                          {/* 优雅进度条 */}
                          <div className="w-32 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-primary/40 via-primary to-purple-400"
                              style={{
                                width: `${flatLayProgress}%`,
                                backgroundSize: "200% 100%",
                                animation: "flow-gradient 2s ease-in-out infinite",
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-300">预计需要 20-40 秒</span>
                        </>
                      ) : (
                        <>
                          <span className="material-icons-round text-3xl text-gray-200">auto_fix_high</span>
                          <span className="text-[11px] text-gray-300 font-medium">AI 平铺图</span>
                          <span className="text-[10px] text-gray-300">上传服饰后自动生成</span>
                        </>
                      )}
                    </div>
                  )}
                  <span className={`text-[11px] font-semibold transition-colors duration-300 ${flatLayImageUrl ? 'text-primary' : isGeneratingFlatLay ? 'text-primary/60' : 'text-gray-300'}`}>{flatLayImageUrl ? 'AI 平铺图 · 正面/背面' : isGeneratingFlatLay ? '生成中...' : 'AI 平铺图 · 正面/背面'}</span>
                </div>
              </div>
            </div>

            {/* ===== 底部表单区 ===== */}
            <div className="px-8 pb-6 pt-2 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">素材名称</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} disabled={isReferenced} className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none text-sm transition-all ${isReferenced ? 'bg-gray-100 cursor-not-allowed text-gray-500' : 'focus:border-primary focus:ring-2 focus:ring-primary/10'}`} placeholder="例如：白色T恤" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">分类</label>
                  <select value={category} onChange={e => setCategory(e.target.value as GarmentCategory | '')} disabled={isReferenced} className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none text-sm bg-white transition-all appearance-none ${isReferenced ? 'bg-gray-100 cursor-not-allowed text-gray-500' : 'focus:border-primary focus:ring-2 focus:ring-primary/10'}`}>
                    <option value="">请选择分类</option>
                    {(Object.entries(GARMENT_CATEGORY_LABELS) as [string, string][]).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">描述</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} disabled={isReferenced} className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 outline-none text-sm transition-all ${isReferenced ? 'bg-gray-100 cursor-not-allowed text-gray-500 resize-none' : 'resize-none focus:border-primary focus:ring-2 focus:ring-primary/10'}`} placeholder="描述衣服的风格、材质、颜色等特点" rows={2} />
                </div>
              </div>
            </div>
            {/* 平铺图生成错误提示 */}
            {flatLayError && (
              <div className="mx-8 mb-4 bg-red-50 rounded-xl p-3 border border-red-100">
                <div className="flex items-start gap-2">
                  <span className="material-icons-round text-red-400 text-base shrink-0 mt-0.5">error</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-red-600 text-xs font-medium mb-0.5">平铺图生成失败</div>
                    <div className="text-gray-500 text-[11px] line-clamp-2">{flatLayError}</div>
                  </div>
                  <button type="button" onClick={() => void handleGenerateFlatLay()} disabled={isReferenced} className="text-primary text-[11px] font-semibold hover:underline whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed" title={isReferenced ? `已被 ${referenceCount} 个项目引用，不允许重新生成` : '重试'}>重试</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== 底部操作栏（固定在底部） ===== */}
        <div className="shrink-0 px-8 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
          {isReferenced ? (
            <div className="flex items-center gap-1.5 text-sm text-amber-600">
              <span className="material-icons-round text-sm">lock</span>
              已被 {referenceCount} 个项目引用，不允许修改
            </div>
          ) : flatLayImageUrl ? (
            <button type="button" onClick={() => void handleGenerateFlatLay()} disabled={isGeneratingFlatLay || isUploading} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <span className={`material-icons-round text-sm ${isGeneratingFlatLay ? 'animate-spin' : ''}`}>{isGeneratingFlatLay ? 'refresh' : 'autorenew'}</span>
              {isGeneratingFlatLay ? '正在重新生成...' : '重新生成平铺图'}
            </button>
          ) : initialData ? (
            // 编辑模式：没有平铺图时显示生成按钮
            <button type="button" onClick={() => void handleGenerateFlatLay()} disabled={isGeneratingFlatLay || isUploading || !mainView?.url} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <span className={`material-icons-round text-sm ${isGeneratingFlatLay ? 'animate-spin' : ''}`}>{isGeneratingFlatLay ? 'refresh' : 'auto_fix_high'}</span>
              {isGeneratingFlatLay ? '正在生成...' : '生成平铺图'}
            </button>
          ) : <div />}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={isUploading} className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50">取消</button>
            {initialData ? (
              <Button onClick={handleSaveConfirm} disabled={isReferenced || !name || !mainView?.url || isUploading || uploadPhase === 'failed'} className={isReferenced || isUploading || uploadPhase === 'failed' ? 'opacity-70 cursor-not-allowed' : ''}>保存修改</Button>
            ) : flatLayImageUrl ? (
              <Button onClick={handleSaveConfirm} disabled={isGeneratingFlatLay} className="px-8">保存到服饰库</Button>
            ) : (
              <Button onClick={() => void handleGenerateFlatLay()} disabled={!name || !mainView?.url || isUploading || uploadPhase === 'failed' || isGeneratingFlatLay} className={isUploading || uploadPhase === 'failed' || isGeneratingFlatLay ? 'opacity-70 cursor-not-allowed' : ''}>
                {isGeneratingFlatLay ? (
                  <span className="flex items-center gap-2"><span className="material-icons-round text-sm animate-spin">refresh</span>正在生成平铺图...</span>
                ) : isUploading ? (
                  <span className="flex items-center gap-2"><span className="material-icons-round text-sm animate-spin">refresh</span>{uploadPhase === 'analyzing' && '识别中...'}{uploadPhase === 'uploading' && '上传中...'}{uploadPhase === 'creating' && '创建中...'}</span>
                ) : uploadPhase === 'failed' ? (
                  <span className="flex items-center gap-2 text-red-500"><span className="material-icons-round text-sm">error</span>识别失败，请重新上传</span>
                ) : (
                  <span className="flex items-center gap-2"><span className="material-icons-round text-sm">auto_fix_high</span>生成平铺图</span>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
      {/* 大图预览 Lightbox */}
      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-6 backdrop-blur-md"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-5 top-5 w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/20 transition-colors"
            onClick={() => setLightboxUrl(null)}
          >
            <span className="material-icons-round">close</span>
          </button>
          <img
            src={lightboxUrl}
            alt="预览大图"
            className="max-h-full max-w-full rounded-2xl shadow-2xl object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={cancelDelete}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                <span className="material-icons-round text-red-500 text-2xl">delete</span>
              </div>
              <h4 className="text-base font-bold text-gray-900 mb-1">确认删除图片？</h4>
              <p className="text-sm text-gray-500">
                {deleteConfirm.type === 'main' ? '删除主图后，将无法恢复。' : '删除该副图后，将无法恢复。'}
              </p>
            </div>
            <div className="flex border-t border-gray-100">
              <button
                type="button"
                onClick={cancelDelete}
                className="flex-1 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 py-3 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors border-l border-gray-100"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
