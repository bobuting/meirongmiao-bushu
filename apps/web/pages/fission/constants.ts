/**
 * 裂变视频相关常量定义
 */

/**
 * 裂变上限 - 每个项目最多裂变 12 个视频
 */
export const FISSION_MAX_COUNT = 12;

/**
 * 裂变成本映射 - 每条视频消耗的积分
 * 之前是 6条/10积分、12条/15积分 两档
 * 现改为每条视频消耗固定积分，由 routeKey 配置
 */
// 注意：积分消耗从 projectFlowCredit.fissionPerVideoCreditCost 读取，不再使用固定映射

/**
 * 播放速度选项 - 下拉选择
 */
export const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5x' },
  { value: 0.8, label: '0.8x' },
  { value: 1.0, label: '1.0x' },
  { value: 1.2, label: '1.2x' },
  { value: 1.5, label: '1.5x' },
  { value: 2.0, label: '2.0x' },
] as const;

/**
 * 故事状态映射
 */
export const STORY_STATUS_MAP: Record<string, string> = {
  'pending': '等待处理',
  'generating_story': '生成故事中',
  'generating_images': '生成分镜图片中',
  'generating_videos': '生成分镜视频中',
  'completed': '已完成',
  'failed': '失败',
};

/**
 * 转场相关常量
 */
export const DEFAULT_TRANSITION_DURATION = 500000; // 微秒 (500ms)
export const DEFAULT_TRANSITION_TYPE = 'fade';
export const CLIPS_PER_FISSION = 3;
