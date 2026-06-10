#!/usr/bin/env bash
# 部署脚本 - 全量覆盖上传代码到生产服务器并重启服务
# 开发阶段使用
#
# 使用方式: ./deploy_prod.sh [选项]
#   --skip-build    跳过本地构建（假设已手动构建）
#   --dry-run       仅显示将执行的命令，不实际执行

set -euo pipefail

# 配置
SERVER_HOST="101.37.80.207"
SERVER_USER="appuser"
SERVER_DIR="/home/appuser/apps/prod/neirongmiao"
UPLOAD_DIR="/home/appuser/apps/prod/new_up/"
BACKUP_BASE="/home/appuser/apps/backups"  # 备份目录放在服务器目录外部，避免递归复制

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo "${RED}[ERROR]${NC} $1"; }

# 解析参数
SKIP_BUILD=false
DRY_RUN=false
for arg in "$@"; do
    case $arg in
        --skip-build) SKIP_BUILD=true ;;
        --dry-run) DRY_RUN=true ;;
        *) log_error "未知参数: $arg"; exit 1 ;;
    esac
done

# 检查必要文件是否存在
log_info "检查本地文件..."
REQUIRED_FILES=("package.json" "src" "dist" "apps/web/dist")
for f in "${REQUIRED_FILES[@]}"; do
    if [[ ! -e "$f" ]]; then
        log_error "必要文件/目录不存在: $f"
        if [[ "$f" == "dist" || "$f" == "apps/web/dist" ]]; then
            log_info "请先运行: npm run build:all"
        fi
        exit 1
    fi
done

# 构建（如果需要）
# if [[ "$SKIP_BUILD" == false ]]; then
#     log_info "构建项目..."
#     npm run build:all
#     log_info "构建完成"
# fi

BACKUP_DIR="${BACKUP_BASE}/prod"
BACKUP_NAME="full-backup-$(date +%Y%m%d%H%M%S)"

# 显示上传内容
log_info "以下内容将被上传到服务器:"
echo "  - package.json"
echo "  - src/"
echo "  - dist/"
echo "  - apps/"

if [[ "$DRY_RUN" == true ]]; then
    log_warn "Dry-run 模式，仅显示命令:"
    echo "# 0. 备份数据库:"
    echo "ssh ${SERVER_USER}@${SERVER_HOST} \"bash /home/appuser/bin/pg/bakpg.sh\""
    echo "# 1. 备份整个服务器目录:"
    echo "ssh ${SERVER_USER}@${SERVER_HOST} \"mkdir -p ${BACKUP_DIR} && cp -r ${SERVER_DIR} ${BACKUP_DIR}/${BACKUP_NAME}\""
    echo "# 2. 清空 new_up 目录:"
    echo "ssh ${SERVER_USER}@${SERVER_HOST} \"mkdir -p ${UPLOAD_DIR} && rm -rf ${UPLOAD_DIR}*\""
    echo "# 3. 上传文件到 new_up:"
    echo "rsync -avz --progress package.json src dist ${SERVER_USER}@${SERVER_HOST}:${UPLOAD_DIR}"
    echo "rsync -avz --progress apps/ ${SERVER_USER}@${SERVER_HOST}:${UPLOAD_DIR}apps/"
    echo "# 4. 复制 package.json 并安装依赖:"
    echo "rsync -avz --progress package.json ${SERVER_USER}@${SERVER_HOST}:${SERVER_DIR}/"
    echo "ssh ${SERVER_USER}@${SERVER_HOST} \"cd ${SERVER_DIR} && cnpm install --production\""
    echo "# 5. 删除旧构建产物并从 new_up 全量复制:"
    echo "ssh ${SERVER_USER}@${SERVER_HOST} \"rm -rf ${SERVER_DIR}/dist ${SERVER_DIR}/apps && cp -rf ${UPLOAD_DIR}. ${SERVER_DIR}/\""
    echo "# 6. 执行重启脚本:"
    echo "ssh ${SERVER_USER}@${SERVER_HOST} \"cd ${SERVER_DIR} && bash .deploy/restart.sh\""
    echo "# 7. 清理 10 天前的备份:"
    echo "ssh ${SERVER_USER}@${SERVER_HOST} \"find ${BACKUP_BASE} -maxdepth 2 -type d -mtime +10 -exec rm -rf {} +\""
    exit 0
fi

# 0. 备份数据库
log_info "执行数据库备份..."
ssh "${SERVER_USER}@${SERVER_HOST}" "bash /home/appuser/bin/pg/bakpg.sh"
log_info "数据库备份完成"

# 1. 备份整个服务器目录
log_info "备份服务器整个目录到 ${BACKUP_DIR}/${BACKUP_NAME}..."
ssh "${SERVER_USER}@${SERVER_HOST}" "mkdir -p ${BACKUP_DIR} && cp -r ${SERVER_DIR} ${BACKUP_DIR}/${BACKUP_NAME}"
log_info "备份完成"

# 2. 清空 new_up 目录
log_info "清空 new_up 目录 ${UPLOAD_DIR}..."
ssh "${SERVER_USER}@${SERVER_HOST}" "mkdir -p ${UPLOAD_DIR} && rm -rf ${UPLOAD_DIR}*"

# 3. 上传文件到 new_up（保持目录结构）
log_info "开始上传到服务器 new_up 目录 ${UPLOAD_DIR}..."
rsync -avz --progress package.json src dist "${SERVER_USER}@${SERVER_HOST}:${UPLOAD_DIR}"
rsync -avz --progress apps/ "${SERVER_USER}@${SERVER_HOST}:${UPLOAD_DIR}apps/"
log_info "上传到 new_up 完成"

# 4. 复制 package.json 到 SERVER_DIR 并安装依赖
log_info "同步 package.json 并安装依赖..."
rsync -avz --progress package.json "${SERVER_USER}@${SERVER_HOST}:${SERVER_DIR}/"
ssh "${SERVER_USER}@${SERVER_HOST}" "cd ${SERVER_DIR} && cnpm install --production"
log_info "依赖安装完成"

# 5. 删除旧构建产物，从 new_up 全量复制到 SERVER_DIR
log_info "删除旧构建产物，从 new_up 全量复制..."
ssh "${SERVER_USER}@${SERVER_HOST}" "rm -rf ${SERVER_DIR}/dist ${SERVER_DIR}/apps && cp -rf ${UPLOAD_DIR}. ${SERVER_DIR}/"
log_info "文件复制完成"

# 6. 在服务器上执行重启脚本
log_info "在服务器上执行 restart.sh..."
ssh "${SERVER_USER}@${SERVER_HOST}" "cd ${SERVER_DIR} && bash .deploy/restart.sh"

# 7. 清理 10 天前的备份
log_info "清理 10 天前的备份..."
ssh "${SERVER_USER}@${SERVER_HOST}" "find ${BACKUP_BASE} -maxdepth 2 -type d -mtime +10 -exec rm -rf {} +"
log_info "旧备份清理完成"

log_info "部署完成!"
