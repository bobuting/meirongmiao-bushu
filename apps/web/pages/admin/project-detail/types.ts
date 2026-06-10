/**
 * 项目详情弹窗类型定义
 */

export type TabId =
  | 'step1'
  | 'step2'
  | 'step3'
  | 'step4'
  | 'step5'
  | 'step6'
  | 'tasks'
  | 'resources'
  | 'scripts'
  | 'prompts'
  | 'llm-logs';

export interface ProjectDetailModalProps {
  isOpen: boolean;
  projectId: string;
  onClose: () => void;
  onOperationClick: (operationType: string) => void;
}
