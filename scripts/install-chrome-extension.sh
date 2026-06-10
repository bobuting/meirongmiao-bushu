#!/bin/bash
# Chrome 扩展安装辅助脚本

set -e

echo "=========================================="
echo "内容喵 · 抖音发布助手 - 安装辅助"
echo "=========================================="
echo ""

EXTENSION_DIR="$(cd "$(dirname "$0")/../apps/douyin-publisher-extension/dist" && pwd)"

if [ ! -d "$EXTENSION_DIR" ]; then
  echo "❌ 扩展未构建，请先运行："
  echo "   cd apps/douyin-publisher-extension && npm run build"
  exit 1
fi

echo "✅ 扩展目录：$EXTENSION_DIR"
echo ""

# macOS: 自动打开 Chrome 扩展管理页面
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "📱 正在打开 Chrome 扩展管理页面..."
  open -a "Google Chrome" "chrome://extensions"

  echo ""
  echo "=========================================="
  echo "请按以下步骤操作："
  echo "=========================================="
  echo "1. ✅ 启用右上角「开发者模式」开关"
  echo "2. ✅ 点击「加载已解压的扩展」按钮"
  echo "3. ✅ 在文件选择器中粘贴以下路径："
  echo ""
  echo "   $EXTENSION_DIR"
  echo ""
  echo "4. ✅ 点击「选择」完成安装"
  echo "5. ✅ 确认扩展列表显示「内容喵 · 抖音发布助手」"
  echo ""
  echo "=========================================="
  echo "安装完成后："
  echo "=========================================="
  echo "- 点击扩展图标 → 管理账号 & 设置"
  echo "- 添加抖音账号（扫码登录）"
  echo "- 在 Step5 页面点击「发布到抖音」测试"
  echo ""

# Linux
elif [[ "$OSTYPE" == "linux"* ]]; then
  echo "请手动打开 Chrome 扩展管理页面："
  echo "   chrome://extensions"
  echo ""
  echo "然后按照上述步骤操作。"

# Windows
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
  echo "请手动打开 Chrome 扩展管理页面："
  echo "   chrome://extensions"
  echo ""
  echo "扩展目录（复制到文件选择器）："
  echo "   $(cygpath -w "$EXTENSION_DIR")"

else
  echo "未知系统，请手动安装扩展。"
fi

echo ""
echo "📚 详细文档：docs/ext-douyin-publisher.md"