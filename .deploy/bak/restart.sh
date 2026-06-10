#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# PM2 生产环境重启脚本（零停机 reload）
# 配置已迁移至 ecosystem.config.js
# ============================================================

# 设置 PATH（必须在最前面，确保 pm2/node 可用）
PATH=/home/appuser/local/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

# 设置工作目录（优先使用软链接指向的目录）
cd "${DEPLOY_DIR:-.}" || exit 1

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

# 检查是否已安装 pm2-logrotate（日志轮转）
if ! pm2 list | grep -q "pm2-logrotate"; then
    echo "Installing pm2-logrotate for log rotation..."
    pm2 install pm2-logrotate
    pm2 set pm2-logrotate:max_size 10M
    pm2 set pm2-logrotate:retain 14
    pm2 set pm2-logrotate:compress true
    pm2 set pm2-logrotate:dateFormat YYYY-MM-DD-HH-mm-ss
    pm2 set pm2-logrotate:rotateServerLogs true
fi

# ============================================================
# 智能重启策略
# ============================================================
if pm2 list | grep -q "$APP_NAME"; then
    echo "Performing zero-downtime reload for: $APP_NAME"
    echo "  策略: reload --update-env（cluster 模式逐个重启，请求不丢失）"
    # reload 在 cluster 模式下逐个启动新进程，旧进程处理完当前请求后退出
    # --update-env 确保环境变量更新生效
    pm2 reload "$APP_NAME" --update-env
else
    echo "Starting new server with PM2..."
    pm2 start ecosystem.config.cjs --env production
fi

# 等待应用启动
sleep 3

# 获取应用状态（|| true 防止 set -e 因 grep 无匹配而退出）
if pm2 show "$APP_NAME" | grep -q "online"; then
    echo "=========================================="
    echo "Server started successfully!"
    echo "=========================================="

    # 显示进程信息
    pm2 show "$APP_NAME" | grep -E "^(status|uptime|restarts|memory|cpu)" || true

    echo ""
    echo "Recent logs:"
    tail -n 10 logs/server.log 2>/dev/null || echo "(No logs yet)"
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
