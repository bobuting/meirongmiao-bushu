import { resolveFlow41CanonicalStepFromPath } from "../../pages/project-flow/flow41RouteNormalization";
import { resolveImageProjectCanonicalStepFromPath } from "../../pages/image-project/imageProjectRouteNormalization";
import { resolveOutfitChangeCanonicalStepFromPath } from "../../pages/outfit-change/outfitChangeRouteNormalization";

export interface LayoutWorkflowStep {
  id: number;
  path: string;
  label: string;
  /** 步骤对应的 Material Icon 名称 */
  icon?: string;
  /** 可选步骤，UI 上以虚线样式区分 */
  optional?: boolean;
}

/** 视频项目工作流步骤图标映射 */
export const layoutWorkflowStepIcons: Record<number, string> = {
  1: "checkroom",
  2: "face",
  3: "image",
  4: "videocam",
  5: "publish",
  6: "auto_awesome",
};

/** 图片项目工作流步骤图标映射 */
export const imageProjectStepIcons: Record<number, string> = {
  1: "checkroom",
  2: "face",
  3: "photo_camera",
  4: "shopping_bag",
};

/** 换装项目工作流步骤图标映射 */
export const outfitChangeStepIcons: Record<number, string> = {
  1: "movie",
  2: "checkroom",
  3: "face",
  4: "auto_fix_high",
};

export interface LayoutSidebarLinkItem {
  to: string;
  icon: string;
  label: string;
}

export const layoutWorkflowSteps: LayoutWorkflowStep[] = [
  { id: 1, path: "/create/", label: "Step1 服装搭配" },
  { id: 2, path: "/create/", label: "Step2 角色定妆" },
  { id: 3, path: "/create/", label: "Step3 脚本与分镜", icon: "article" },
  { id: 4, path: "/create/", label: "Step4 视频工作台" },
  { id: 5, path: "/create/", label: "Step5 交付发布" },
  { id: 6, path: "/create/", label: "裂变", optional: true },
];

/** 图片项目工作流步骤（Step 1-4） */
export const imageProjectWorkflowSteps: LayoutWorkflowStep[] = [
  { id: 1, path: "/image-create/", label: "Step1 服装搭配" },
  { id: 2, path: "/image-create/", label: "Step2 角色定妆" },
  { id: 3, path: "/image-create/", label: "Step3 模特图生成" },
  { id: 4, path: "/image-create/", label: "Step4 电商详情页" },
];

/** 换装项目工作流步骤（Step 1-4） */
export const outfitChangeWorkflowSteps: LayoutWorkflowStep[] = [
  { id: 1, path: "/outfit-create/", label: "Step1 选择视频", icon: "movie" },
  { id: 2, path: "/outfit-create/", label: "Step2 选择服装", icon: "checkroom" },
  { id: 3, path: "/outfit-create/", label: "Step3 选择角色", icon: "face" },
  { id: 4, path: "/outfit-create/", label: "Step4 一键换装", icon: "auto_fix_high" },
];

export const primarySidebarLinks: LayoutSidebarLinkItem[] = [
  { to: "/dashboard", icon: "explore", label: "创作广场" },
  { to: "/projects", icon: "dashboard", label: "我的项目" },
  { to: "/reverse", icon: "psychology", label: "脚本中心" },
  { to: "/music", icon: "library_music", label: "音乐库" },
  { to: "/characters", icon: "face", label: "角色管理" },
  { to: "/asset-library", icon: "video_library", label: "服饰库" },
];

export const adminSidebarLinks: LayoutSidebarLinkItem[] = [
  { to: "/admin", icon: "admin_panel_settings", label: "管理后台" },
  { to: "/admin/model-management", icon: "smart_toy", label: "大模型管理" },
  { to: "/admin/square-templates", icon: "grid_view", label: "创作广场管理" },
  { to: "/admin/capability-lab", icon: "science", label: "能力实验室" },
  { to: "/admin/video-merge", icon: "merge_type", label: "视频合并" },
  { to: "/admin/video-music", icon: "library_music", label: "视频音乐" },
  { to: "/admin/skills-management", icon: "extension", label: "Skills 管理" },
  { to: "/admin/business-config", icon: "settings_applications", label: "业务配置" },
  { to: "/admin/announcements", icon: "campaign", label: "公告管理" },
  { to: "/admin/hot-trend-assets", icon: "trending_up", label: "热榜管理" },
  { to: "/admin/aesthetic-library", icon: "palette", label: "审美特征库" },
  { to: "/admin/scene-library", icon: "landscape", label: "场景库" },
  { to: "/admin/emotion-archetype-library", icon: "favorite", label: "情感原型库" },
  { to: "/admin/files", icon: "folder", label: "文件注册中心" },
  { to: "/admin/logs", icon: "history", label: "日志管理" },
  { to: "/admin/deleted-data", icon: "delete_sweep", label: "数据清理" },
];

export function resolveLayoutToastIcon(category: string | null | undefined): string {
  if (category === "final-video") return "workspace_premium";
  if (category === "clip") return "movie";
  if (category === "reverse-script") return "psychology";
  if (category === "storyboard") return "view_carousel";
  return "image";
}

export function isLayoutRouteActive(pathname: string, path: string): boolean {
  if (path === "/dashboard") return pathname === "/dashboard";
  if (path === "/admin") return pathname === "/admin";
  if (path === "/admin/model-management") return pathname.startsWith("/admin/model-management");
  if (path === "/admin/square-templates") return pathname.startsWith("/admin/square-templates");
  if (path === "/admin/capability-lab") return pathname.startsWith("/admin/capability-lab");
  if (path === "/admin/video-merge") return pathname.startsWith("/admin/video-merge");
  if (path === "/admin/video-music") return pathname.startsWith("/admin/video-music");
  if (path === "/admin/business-config") return pathname.startsWith("/admin/business-config");
  if (path === "/admin/announcements") return pathname.startsWith("/admin/announcements");
  if (path === "/admin/hot-trend-assets") return pathname.startsWith("/admin/hot-trend-assets");
  if (path === "/admin/aesthetic-library") return pathname.startsWith("/admin/aesthetic-library");
  if (path === "/admin/scene-library") return pathname.startsWith("/admin/scene-library");
  if (path === "/admin/emotion-archetype-library") return pathname.startsWith("/admin/emotion-archetype-library");
  if (path === "/admin/files") return pathname.startsWith("/admin/files");
  if (path === "/admin/logs") return pathname.startsWith("/admin/logs");
  if (path === "/admin/deleted-data") return pathname.startsWith("/admin/deleted-data");
  return pathname.startsWith(path);
}

/** 路径 → 标题图标映射（复用侧边栏图标） */
export function resolveLayoutTitleIcon(pathname: string): string {
  if (pathname === "/dashboard") return "explore";
  if (pathname === "/projects") return "dashboard";
  if (pathname === "/profile") return "person";
  if (pathname === "/reverse") return "psychology";
  if (pathname === "/music") return "library_music";
  if (pathname === "/characters") return "face";
  if (pathname === "/asset-library") return "video_library";
  if (pathname === "/admin") return "admin_panel_settings";
  if (pathname.startsWith("/admin/model-management")) return "smart_toy";
  if (pathname.startsWith("/admin/square-templates")) return "grid_view";
  if (pathname.startsWith("/admin/capability-lab")) return "science";
  if (pathname.startsWith("/admin/video-merge")) return "merge_type";
  if (pathname.startsWith("/admin/video-music")) return "library_music";
  if (pathname.startsWith("/admin/business-config")) return "settings_applications";
  if (pathname.startsWith("/admin/announcements")) return "campaign";
  if (pathname.startsWith("/admin/hot-trend-assets")) return "trending_up";
  if (pathname.startsWith("/admin/aesthetic-library")) return "palette";
  if (pathname.startsWith("/admin/scene-library")) return "landscape";
  if (pathname.startsWith("/admin/emotion-archetype-library")) return "favorite";
  if (pathname.startsWith("/admin/files")) return "folder";
  if (pathname.startsWith("/admin/logs")) return "history";
  if (pathname.startsWith("/admin/deleted-data")) return "delete_sweep";
  return "article";
}

export function resolveLayoutTitle(pathname: string): string {
  if (pathname === "/dashboard") return "创作广场";
  if (pathname === "/projects") return "我的项目";
  if (pathname === "/profile") return "账户设置";
  if (pathname === "/reverse") return "脚本中心";
  if (pathname === "/music") return "音乐库";
  if (pathname === "/characters") return "角色管理";
  if (pathname === "/admin") return "管理后台";
  if (pathname.startsWith("/admin/model-management")) return "大模型管理";
  if (pathname.startsWith("/admin/square-templates")) return "创作广场管理";
  if (pathname.startsWith("/admin/capability-lab")) return "能力实验室";
  if (pathname.startsWith("/admin/video-merge")) return "视频合并";
  if (pathname.startsWith("/admin/video-music")) return "视频音乐";
  if (pathname.startsWith("/admin/business-config")) return "业务配置";
  if (pathname.startsWith("/admin/announcements")) return "公告管理";
  if (pathname.startsWith("/admin/hot-trend-assets")) return "热榜管理";
  if (pathname.startsWith("/admin/aesthetic-library")) return "审美特征库";
  if (pathname.startsWith("/admin/scene-library")) return "场景库";
  if (pathname.startsWith("/admin/emotion-archetype-library")) return "情感原型库";
  if (pathname.startsWith("/admin/files")) return "文件注册中心";
  if (pathname.startsWith("/admin/logs")) return "日志管理";
  if (pathname.startsWith("/admin/deleted-data")) return "数据清理";
  if (pathname === "/asset-library") return "服饰库";
  if (pathname.startsWith("/image-create")) return "图片项目";
  if (pathname.startsWith("/outfit-create")) return "换装项目";
  return "";
}

export function resolveLayoutCurrentStep(pathname: string, steps: LayoutWorkflowStep[] = layoutWorkflowSteps): number {
  // 先检查是否为图片项目路由
  const imageStep = resolveImageProjectCanonicalStepFromPath(pathname);
  if (imageStep) {
    return imageStep;
  }
  // 检查是否为换装项目路由
  const outfitStep = resolveOutfitChangeCanonicalStepFromPath(pathname);
  if (outfitStep) {
    return outfitStep;
  }
  // 视频项目路由
  const normalizedStep = resolveFlow41CanonicalStepFromPath(pathname);
  return steps.find((step) => step.id === normalizedStep)?.id ?? 1;
}

export function buildLayoutStepClass(stepId: number, currentStep: number): string {
  const isCurrent = stepId === currentStep;
  const isNeighbor = stepId === currentStep - 1 || stepId === currentStep + 1;
  const isPast = stepId < currentStep;

  let widthClass = "w-1.5";
  if (isCurrent || isNeighbor) {
    widthClass = "w-8";
  } else {
    widthClass = "w-2";
  }

  let colorClass = "bg-gray-200";
  if (isCurrent) colorClass = "bg-primary shadow-sm shadow-primary/30";
  else if (isPast) colorClass = "bg-primary/40";

  return `h-1.5 rounded-full transition-all duration-300 cursor-pointer ${widthClass} ${colorClass}`;
}

/** 视频项目可选步骤的入口条件：项目状态 >= FILMING（Step4 完成后） */
export const FISSION_MIN_REQUIRED_STEP = 4;

export function canNavigateToLayoutStep(stepId: number, currentStep: number): boolean {
  void currentStep;
  return Number.isInteger(stepId) && stepId >= 1 && stepId <= layoutWorkflowSteps.length;
}
