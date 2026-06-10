import { backendApi, type Step1ImageClassificationResultDto } from "./backendApi";

type Step1UploadClassificationPayload = {
  imageUrl: string;
  fileName?: string;
  target?: "main" | "other";
  hasMainImage?: boolean;
  existingOtherViewCount?: number;
  includeFeedback?: boolean;
  // 图片项目专属：分类成功后自动创建服饰资产的参数
  sizeMb?: number;
  source?: string;
};

/** 非服饰图片拦截永远开启 */
export function shouldEnforceStep1UploadNonClothingBlock(): boolean {
  return true;
}

export function shouldBlockStep1UploadByClassification(
  classification: Step1ImageClassificationResultDto | null | undefined,
): boolean {
  return classification?.isClothingImage === false;
}

export function buildStep1NonClothingUploadMessage(
  classification: Step1ImageClassificationResultDto | null | undefined,
): string {
  const reason = classification?.clothingImageReason?.trim();
  if (reason) {
    return `${reason} 当前图片无法保存到服饰库，也不会继续后续流程，请上传正确的服装图片。`;
  }
  return "当前图片未识别为服饰，无法保存到服饰库，也不会继续后续流程，请上传正确的服装图片。";
}

export function classifyProjectFlowUploadImage(
  token: string,
  projectId: string,
  payload: Step1UploadClassificationPayload,
): Promise<Step1ImageClassificationResultDto> {
  return backendApi.step1ClassifyImage(token, projectId, payload);
}

export function classifyLibraryAssetUploadImage(
  token: string,
  payload: Step1UploadClassificationPayload,
): Promise<Step1ImageClassificationResultDto> {
  return backendApi.classifyLibraryAssetImage(token, payload) as unknown as Promise<Step1ImageClassificationResultDto>;
}
