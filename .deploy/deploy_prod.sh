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
# log_info "检查本地文件..."
# REQUIRED_FILES=("package.json" "src" "dist" "apps/web/dist")
# for f in "${REQUIRED_FILES[@]}"; do
#     if [[ ! -e "$f" ]]; then
#         log_error "必要文件/目录不存在: $f"
#         if [[ "$f" == "dist" || "$f" == "apps/web/dist" ]]; then
#             log_info "请先运行: npm run build:all"
#         fi
#         exit 1
#     fi
# done

# 构建（如果需要）
if [[ "$SKIP_BUILD" == false ]]; then
    log_info "构建项目..."
    npm run build:all
    log_info "构建完成"
fi

BACKUP_DIR="${BACKUP_BASE}/prod"
BACKUP_NAME="full-backup-$(date +%Y%m%d%H%M%S)"

# 显示上传内容
log_info "以下内容将被上传到服务器:"
echo "  - package.json"
echo "  - src/"
echo "  - skills/"
echo "  - dist/"
echo "  - apps/web/dist/"

if [[ "$DRY_RUN" == true ]]; then
    log_warn "Dry-run 模式，仅显示命令:"
    echo "# 1. 备份整个服务器目录:"
    echo "ssh ${SERVER_USER}@${SERVER_HOST} \"mkdir -p ${BACKUP_DIR} && cp -r ${SERVER_DIR} ${BACKUP_DIR}/${BACKUP_NAME}\""
    echo "# 2. 删除服务器上的旧文件:"
    echo "ssh ${SERVER_USER}@${SERVER_HOST} \"cd ${SERVER_DIR} && rm -rf package.json src skills dist apps/web/dist && mkdir -p apps/web/dist\""
    echo "# 3. 上传文件:"
    echo "rsync -avz --progress package.json src skills dist ${SERVER_USER}@${SERVER_HOST}:${SERVER_DIR}/"
    echo "rsync -avz --progress apps/web/dist/ ${SERVER_USER}@${SERVER_HOST}:${SERVER_DIR}/apps/web/dist/"
    echo "# 4. 执行重启脚本:"
    echo "ssh ${SERVER_USER}@${SERVER_HOST} \"cd ${SERVER_DIR} && bash .deploy/restart.sh\""
    exit 0
fi

# 1. 备份整个服务器目录
log_info "备份服务器整个目录到 ${BACKUP_DIR}/${BACKUP_NAME}..."
ssh "${SERVER_USER}@${SERVER_HOST}" "mkdir -p ${BACKUP_DIR} && cp -r ${SERVER_DIR} ${BACKUP_DIR}/${BACKUP_NAME}"
log_info "备份完成"

# 2. 删除服务器上的旧文件（只删除要更新的文件）
log_info "删除服务器上的旧文件..."
ssh "${SERVER_USER}@${SERVER_HOST}" "cd ${SERVER_DIR} && rm -rf package.json src skills dist apps/web/dist && mkdir -p apps/web/dist"

# 3. 上传文件
log_info "开始上传到服务器 ${SERVER_HOST}..."
# 分别上传，确保路径正确
rsync -avz --progress package.json src skills dist "${SERVER_USER}@${SERVER_HOST}:${SERVER_DIR}/"
rsync -avz --progress apps/web/dist/ "${SERVER_USER}@${SERVER_HOST}:${SERVER_DIR}/apps/web/dist/"

log_info "上传完成"

# 4. 在服务器上执行重启脚本
log_info "在服务器上执行 restart.sh..."
ssh "${SERVER_USER}@${SERVER_HOST}" "cd ${SERVER_DIR} && bash .deploy/restart.sh"

log_info "重启完成"
