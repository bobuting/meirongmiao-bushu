#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# PM2 生产环境重启脚本
# 配置已迁移至 ecosystem.config.js
# ============================================================

# 设置工作目录
cd /home/appuser/apps/prod/neirongmiao || exit 1

# 设置 PATH（确保包含 PM2 和 Node 路径）
PATH=/home/appuser/local/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

# 加载环境变量
if [ -f .env.server ]; then
  set -a
  source ./.env.server
  set +a
fi

# 创建必要的目录
mkdir -p .run logs

# 检查 PM2 是否可用
if ! command -v pm2 &> /dev/null; then
    echo "PM2 not found. Please install PM2 globally: npm install -g pm2"
    exit 1
fi

# 检查编译产物是否存在
if [ ! -d "dist" ]; then
    echo "Error: dist/ directory not found. Please run 'npm run build' first."
    exit 1
fi

# 应用名称
APP_NAME="neirongmiao"

# 安装生产依赖（优先使用 cnpm，不存在则用 npm）
echo "Installing production dependencies..."
if command -v cnpm &> /dev/null; then
    cnpm install --production
else
    npm install --production
fi

# 检查是否已有 PM2 应用运行
if pm2 list | grep -q "$APP_NAME"; then
    echo "Performing graceful reload for: $APP_NAME"
    pm2 reload ecosystem.config.cjs --env production
else
    echo "Starting new server with PM2..."
    pm2 start ecosystem.config.cjs --env production
fi

# 等待应用启动
sleep 3

# 获取应用状态
if pm2 show "$APP_NAME" | grep -q "online"; then
    echo "=========================================="
    echo "Server started successfully!"
    echo "=========================================="

    # 显示进程信息
    pm2 show "$APP_NAME" | grep -E "^(status|uptime|restarts|memory|cpu)"

    echo ""
    echo "Recent logs:"
    tail -n 10 logs/app-info-$(date +%Y-%m-%d).log 2>/dev/null || echo "(No logs yet)"
else
    echo "=========================================="
    echo "Failed to start server!"
    echo "=========================================="
    pm2 logs "$APP_NAME" --lines 20 --nostream
    exit 1
fi

# 保存 PM2 进程列表（确保重启后自动恢复）
pm2 save

echo ""
echo "PM2 process list saved. Use 'pm2 resurrect' to restore after system reboot."
