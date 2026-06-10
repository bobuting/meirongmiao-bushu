#!/usr/bin/env bash
set -euo pipefail

# 设置工作目录
cd /home/appuser/apps/prod/neirongmiao || exit 1

# 设置 PATH（确保包含 PM2 路径，通常 PM2 安装在全局或用户目录）
PATH=/home/appuser/local/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

# 加载环境变量（与原始脚本一致）
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

# 应用名称（可根据需要修改）
APP_NAME="neirongmiao"

# 安装生产依赖（优先使用 cnpm，不存在则用 npm）
echo "Installing production dependencies..."
if command -v cnpm &> /dev/null; then
    cnpm install --production
else
    npm install --production
fi

# 确定 Node 路径
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    NODE_PATH="/home/appuser/local/node/bin/node"
fi

# 检查是否已有 PM2 应用运行
if pm2 list | grep -q "$APP_NAME"; then
    echo "Performing graceful reload for: $APP_NAME"
    pm2 reload "$APP_NAME"
else
    echo "Starting new server with PM2..."
    pm2 start dist/server.js \
        --name "$APP_NAME" \
        --interpreter "$NODE_PATH" \
        --log logs/server.log \
        --merge-logs \
        --time
fi

# 等待几秒，检查启动状态
sleep 2

# 获取应用状态
if pm2 show "$APP_NAME" | grep -q "online"; then
    echo "Started successfully with PM2, PID: $(pm2 show "$APP_NAME" | grep -oP 'pid: \K\d+')"
    # 输出最近几行日志
    tail -n 5 logs/server.log
else
    echo "Failed to start server with PM2!"
    pm2 logs "$APP_NAME" --lines 10 --nostream
    exit 1
fi

# 保存 PM2 进程列表（可选，确保重启后自动恢复）
pm2 save