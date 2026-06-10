/**
 * 版式模板配置
 * 全屏背景图 + 文字叠加的 12 种预定义模板
 */

import type { LayoutTemplate } from './types';

// ============================================================
// 模板1：底部渐变叠加（经典电商）
// ============================================================
const bottomGradientClassic: LayoutTemplate = {
  id: "bottom-gradient-classic",
  name: "底部渐变叠加",
  category: "minimal",
  position: {
    vertical: "bottom",
    horizontal: "center",
    offset: { bottom: "0" }
  },
  overlay: {
    type: "gradient",
    opacity: 0.8,
    gradientDirection: "to-top",
    color: "#000000"
  },
  typography: {
    title: {
      fontSize: 18,
      fontWeight: 400,
      letterSpacing: -0.02,
      colorMode: "white",
      shadow: false
    },
    copy: {
      fontSize: 14,
      fontWeight: 400,
      letterSpacing: 0,
      colorMode: "white",
      opacity: 0.9
    },
    lineHeight: 1.6,
    textAlign: "center"
  },
  rhythm: {
    titleCopyGap: 8,
    paddingX: 24,
    paddingY: 32,
    maxWidth: 700,
    blocks: "stack"
  }
};

// ============================================================
// 模板2：顶部白底叠加（清新风格）
// ============================================================
const topSolidLight: LayoutTemplate = {
  id: "top-solid-light",
  name: "顶部白底叠加",
  category: "minimal",
  position: {
    vertical: "top",
    horizontal: "center",
    offset: { top: "20px" }
  },
  overlay: {
    type: "block",
    opacity: 0.95,
    color: "#ffffff",
    borderRadius: 8
  },
  typography: {
    title: {
      fontSize: 16,
      fontWeight: 500,
      letterSpacing: -0.01,
      colorMode: "black",
      shadow: false
    },
    copy: {
      fontSize: 13,
      fontWeight: 400,
      letterSpacing: 0,
      colorMode: "black",
      opacity: 0.7
    },
    lineHeight: 1.5,
    textAlign: "center"
  },
  rhythm: {
    titleCopyGap: 6,
    paddingX: 16,
    paddingY: 12,
    maxWidth: 600,
    blocks: "stack"
  }
};

// ============================================================
// 模板3：居中无遮罩（极简风格）
// ============================================================
const centerNoOverlay: LayoutTemplate = {
  id: "center-no-overlay",
  name: "居中无遮罩",
  category: "minimal",
  position: {
    vertical: "center",
    horizontal: "center"
  },
  overlay: {
    type: "none",
    opacity: 0
  },
  typography: {
    title: {
      fontSize: 24,
      fontWeight: 300,
      letterSpacing: -0.03,
      colorMode: "auto",
      shadow: true,
      shadowConfig: {
        color: "rgba(0,0,0,0.5)",
        blur: 8,
        offsetX: 0,
        offsetY: 2
      }
    },
    copy: {
      fontSize: 14,
      fontWeight: 400,
      letterSpacing: 0,
      colorMode: "auto",
      opacity: 0.9
    },
    lineHeight: 1.8,
    textAlign: "center"
  },
  rhythm: {
    titleCopyGap: 12,
    paddingX: 40,
    paddingY: 0,
    maxWidth: 500,
    blocks: "stack"
  }
};

// ============================================================
// 模板4：左侧叠加（杂志风格）
// ============================================================
const leftAlignedMagazine: LayoutTemplate = {
  id: "left-aligned-magazine",
  name: "左侧叠加",
  category: "magazine",
  position: {
    vertical: "top-third",
    horizontal: "left",
    offset: { top: "30%", left: "24px" }
  },
  overlay: {
    type: "none",
    opacity: 0
  },
  typography: {
    title: {
      fontSize: 28,
      fontWeight: 600,
      letterSpacing: -0.02,
      colorMode: "white",
      shadow: true,
      shadowConfig: {
        color: "rgba(0,0,0,0.4)",
        blur: 4,
        offsetX: 0,
        offsetY: 1
      }
    },
    copy: {
      fontSize: 14,
      fontWeight: 400,
      letterSpacing: 0,
      colorMode: "white",
      opacity: 0.85
    },
    lineHeight: 1.5,
    textAlign: "left"
  },
  rhythm: {
    titleCopyGap: 12,
    paddingX: 0,
    paddingY: 0,
    maxWidth: 300,
    blocks: "stack"
  }
};

// ============================================================
// 模板5：底部胶囊叠加（小红书风格）
// ============================================================
const bottomPillSocial: LayoutTemplate = {
  id: "bottom-pill-social",
  name: "底部胶囊叠加",
  category: "social",
  position: {
    vertical: "bottom",
    horizontal: "center",
    offset: { bottom: "24px" }
  },
  overlay: {
    type: "shape",
    opacity: 0.9,
    color: "#ffffff",
    borderRadius: 24
  },
  typography: {
    title: {
      fontSize: 16,
      fontWeight: 600,
      letterSpacing: 0,
      colorMode: "black",
      shadow: false
    },
    copy: {
      fontSize: 12,
      fontWeight: 400,
      letterSpacing: 0,
      colorMode: "black",
      opacity: 0.7
    },
    lineHeight: 1.4,
    textAlign: "center"
  },
  rhythm: {
    titleCopyGap: 4,
    paddingX: 24,
    paddingY: 12,
    maxWidth: 500,
    blocks: "stack"
  }
};

// ============================================================
// 模板6：右上角叠加（对角布局）
// ============================================================
const topRightDiagonal: LayoutTemplate = {
  id: "top-right-diagonal",
  name: "右上角叠加",
  category: "creative",
  position: {
    vertical: "top",
    horizontal: "right",
    offset: { top: "40px", right: "24px" }
  },
  overlay: {
    type: "block",
    opacity: 0.85,
    color: "#000000",
    borderRadius: 4
  },
  typography: {
    title: {
      fontSize: 14,
      fontWeight: 500,
      letterSpacing: 0,
      colorMode: "white",
      shadow: false
    },
    copy: {
      fontSize: 11,
      fontWeight: 400,
      letterSpacing: 0,
      colorMode: "white",
      opacity: 0.8
    },
    lineHeight: 1.4,
    textAlign: "right"
  },
  rhythm: {
    titleCopyGap: 4,
    paddingX: 12,
    paddingY: 8,
    maxWidth: 200,
    blocks: "stack"
  }
};

// ============================================================
// 模板7：全屏深色遮罩 + 居中文字（电影海报风格）
// ============================================================
const fullscreenDarkCenter: LayoutTemplate = {
  id: "fullscreen-dark-center",
  name: "全屏遮罩居中",
  category: "creative",
  position: {
    vertical: "center",
    horizontal: "center"
  },
  overlay: {
    type: "solid",
    opacity: 0.5,
    color: "#000000"
  },
  typography: {
    title: {
      fontSize: 32,
      fontWeight: 300,
      letterSpacing: -0.04,
      colorMode: "white",
      shadow: false
    },
    copy: {
      fontSize: 16,
      fontWeight: 400,
      letterSpacing: 0,
      colorMode: "white",
      opacity: 0.8
    },
    lineHeight: 2,
    textAlign: "center"
  },
  rhythm: {
    titleCopyGap: 20,
    paddingX: 60,
    paddingY: 0,
    maxWidth: 600,
    blocks: "stack"
  }
};

// ============================================================
// 模板8：双区块叠加（标题上+文案下）
// ============================================================
const dualBlockSplit: LayoutTemplate = {
  id: "dual-block-split",
  name: "双区块叠加",
  category: "magazine",
  position: {
    vertical: "center",
    horizontal: "center"
  },
  overlay: {
    type: "none",
    opacity: 0
  },
  typography: {
    title: {
      fontSize: 20,
      fontWeight: 600,
      letterSpacing: -0.02,
      colorMode: "white",
      shadow: true,
      shadowConfig: {
        color: "rgba(0,0,0,0.6)",
        blur: 6,
        offsetX: 0,
        offsetY: 2
      }
    },
    copy: {
      fontSize: 14,
      fontWeight: 400,
      letterSpacing: 0,
      colorMode: "white",
      opacity: 0.9
    },
    lineHeight: 1.5,
    textAlign: "center"
  },
  rhythm: {
    titleCopyGap: 100,
    paddingX: 40,
    paddingY: 0,
    maxWidth: 500,
    blocks: "split-vertical"
  }
};

// ============================================================
// 模板9：底部价格标签叠加
// ============================================================
const bottomPriceTag: LayoutTemplate = {
  id: "bottom-price-tag",
  name: "底部价格标签",
  category: "card",
  position: {
    vertical: "bottom",
    horizontal: "left",
    offset: { bottom: "32px", left: "24px" }
  },
  overlay: {
    type: "block",
    opacity: 0.95,
    color: "#ffffff",
    borderRadius: 12
  },
  typography: {
    title: {
      fontSize: 18,
      fontWeight: 600,
      letterSpacing: -0.02,
      colorMode: "black",
      shadow: false
    },
    copy: {
      fontSize: 24,
      fontWeight: 600,
      letterSpacing: 0,
      colorMode: "custom",
      customColor: "#ff4444",
      opacity: 1
    },
    lineHeight: 1.4,
    textAlign: "left"
  },
  rhythm: {
    titleCopyGap: 8,
    paddingX: 16,
    paddingY: 12,
    maxWidth: 300,
    blocks: "split-horizontal"
  }
};

// ============================================================
// 模板10：渐变遮罩 + 左侧文字
// ============================================================
const gradientLeftText: LayoutTemplate = {
  id: "gradient-left-text",
  name: "渐变遮罩左侧",
  category: "minimal",
  position: {
    vertical: "center",
    horizontal: "left",
    offset: { left: "32px" }
  },
  overlay: {
    type: "gradient",
    opacity: 0.7,
    gradientDirection: "to-right",
    color: "#000000"
  },
  typography: {
    title: {
      fontSize: 22,
      fontWeight: 400,
      letterSpacing: -0.02,
      colorMode: "white",
      shadow: false
    },
    copy: {
      fontSize: 14,
      fontWeight: 400,
      letterSpacing: 0,
      colorMode: "white",
      opacity: 0.85
    },
    lineHeight: 1.6,
    textAlign: "left"
  },
  rhythm: {
    titleCopyGap: 10,
    paddingX: 0,
    paddingY: 0,
    maxWidth: 280,
    blocks: "stack"
  }
};

// ============================================================
// 模板11：模糊遮罩 + 居中
// ============================================================
const blurCenter: LayoutTemplate = {
  id: "blur-center",
  name: "模糊遮罩居中",
  category: "creative",
  position: {
    vertical: "center",
    horizontal: "center"
  },
  overlay: {
    type: "blur",
    opacity: 0.6,
    color: "#000000"
  },
  typography: {
    title: {
      fontSize: 26,
      fontWeight: 500,
      letterSpacing: -0.03,
      colorMode: "white",
      shadow: false
    },
    copy: {
      fontSize: 15,
      fontWeight: 400,
      letterSpacing: 0,
      colorMode: "white",
      opacity: 0.9
    },
    lineHeight: 1.8,
    textAlign: "center"
  },
  rhythm: {
    titleCopyGap: 16,
    paddingX: 50,
    paddingY: 30,
    maxWidth: 400,
    blocks: "stack"
  }
};

// ============================================================
// 模板12：对角渐变叠加
// ============================================================
const diagonalGradient: LayoutTemplate = {
  id: "diagonal-gradient",
  name: "对角渐变叠加",
  category: "creative",
  position: {
    vertical: "bottom",
    horizontal: "left",
    offset: { bottom: "40px", left: "24px" }
  },
  overlay: {
    type: "gradient",
    opacity: 0.75,
    gradientDirection: "to-top-right",
    color: "#000000"
  },
  typography: {
    title: {
      fontSize: 18,
      fontWeight: 500,
      letterSpacing: -0.02,
      colorMode: "white",
      shadow: false
    },
    copy: {
      fontSize: 13,
      fontWeight: 400,
      letterSpacing: 0,
      colorMode: "white",
      opacity: 0.85
    },
    lineHeight: 1.5,
    textAlign: "left"
  },
  rhythm: {
    titleCopyGap: 8,
    paddingX: 16,
    paddingY: 0,
    maxWidth: 350,
    blocks: "stack"
  }
};

// ============================================================
// 模板数组
// ============================================================
export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  bottomGradientClassic,
  topSolidLight,
  centerNoOverlay,
  leftAlignedMagazine,
  bottomPillSocial,
  topRightDiagonal,
  fullscreenDarkCenter,
  dualBlockSplit,
  bottomPriceTag,
  gradientLeftText,
  blurCenter,
  diagonalGradient,
];

// ============================================================
// 模板分类
// ============================================================
export const TEMPLATE_CATEGORIES = {
  minimal: {
    name: "极简",
    templates: ["bottom-gradient-classic", "top-solid-light", "center-no-overlay", "gradient-left-text"]
  },
  magazine: {
    name: "杂志",
    templates: ["left-aligned-magazine", "dual-block-split"]
  },
  social: {
    name: "社交",
    templates: ["bottom-pill-social"]
  },
  creative: {
    name: "创意",
    templates: ["top-right-diagonal", "fullscreen-dark-center", "blur-center", "diagonal-gradient"]
  },
  card: {
    name: "卡片",
    templates: ["bottom-price-tag"]
  }
};

// ============================================================
// 辅助函数
// ============================================================

/** 根据ID获取模板 */
export function getTemplateById(id: string): LayoutTemplate | undefined {
  return LAYOUT_TEMPLATES.find(t => t.id === id);
}

/** 默认模板 */
export const DEFAULT_TEMPLATE = "bottom-gradient-classic";

/** 获取模板缩略图路径 */
export function getTemplateThumbnailPath(id: string): string {
  return `/assets/layout-thumbnails/${id}.png`;
}