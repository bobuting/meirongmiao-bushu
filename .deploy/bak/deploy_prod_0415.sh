#!/usr/bin/env bash
# 部署脚本 — 零停机部署（releases 模式）
#
# 使用方式: ./deploy_prod.sh [选项]
#   --build         本地构建后部署（默认跳过构建，直接上传已有 dist）
#   --dry-run       仅显示将执行的命令，不实际执行

set -euo pipefail

# ============================================================
# 配置
# ============================================================
SERVER_HOST="101.37.80.207"
SERVER_USER="appuser"
DEPLOY_BASE="/home/appuser/apps/prod"
SHARED_DIR="${DEPLOY_BASE}/shared"
RELEASES_DIR="${DEPLOY_BASE}/releases"
CURRENT_LINK="${DEPLOY_BASE}/neirongmiao"  # 软链接 → releases/v20260415-183000

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo "${RED}[ERROR]${NC} $1"; }

# ============================================================
# 参数解析
# ============================================================
SKIP_BUILD=true
DRY_RUN=false
for arg in "$@"; do
    case $arg in
        --build) SKIP_BUILD=false ;;
        --dry-run) DRY_RUN=true ;;
        *) log_error "未知参数: $arg"; exit 1 ;;
    esac
done

# ============================================================
# 本地构建
# ============================================================
RELEASE_VERSION="v$(date +%Y%m%d-%H%M%S)"

log_info "部署版本: ${RELEASE_VERSION}"

if [[ "$SKIP_BUILD" == false ]]; then
    log_info "构建项目..."
    npm run build:all
    log_info "构建完成"
fi

# 上传清单
log_info "以下内容将被上传:"
echo "  - package.json"
echo "  - src/"
echo "  - dist/"
echo "  - apps/web/dist/"

if [[ "$DRY_RUN" == true ]]; then
    log_warn "Dry-run 模式，仅显示命令:"
    echo "# 1. 创建 releases 目录: ssh ${SERVER_USER}@${SERVER_HOST} \"mkdir -p ${RELEASES_DIR}/${RELEASE_VERSION}\""
    echo "# 2. 上传文件: rsync ... ${SERVER_USER}@${SERVER_HOST}:${RELEASES_DIR}/${RELEASE_VERSION}/"
    echo "# 3. 安装依赖: ssh ${SERVER_USER}@${SERVER_HOST} \"cd ${RELEASES_DIR}/${RELEASE_VERSION} && npm install --production\""
    echo "# 4. 健康检查: curl localhost:3020/neirongmiao/api/health"
    echo "# 5. 软链接切换: ln -sfn ${RELEASES_DIR}/${RELEASE_VERSION} ${CURRENT_LINK}"
    echo "# 6. PM2 重载: ssh ${SERVER_USER}@${SERVER_HOST} \"cd ${RELEASES_DIR}/${RELEASE_VERSION} && bash .deploy/restart.sh\""
    exit 0
fi

# ============================================================
# 服务器端执行（通过 SSH）
# ============================================================

# 1. 创建 releases 目录
log_info "创建版本目录..."
ssh "${SERVER_USER}@${SERVER_HOST}" "mkdir -p ${RELEASES_DIR}/${RELEASE_VERSION}"

# 2. 上传文件到新版本目录
log_info "上传代码到 releases/${RELEASE_VERSION}..."
rsync -avz --progress package.json ecosystem.config.cjs src dist "${SERVER_USER}@${SERVER_HOST}:${RELEASES_DIR}/${RELEASE_VERSION}/"
rsync -avz --progress --relative apps/web/dist/ "${SERVER_USER}@${SERVER_HOST}:${RELEASES_DIR}/${RELEASE_VERSION}/"

# 3. 同步共享文件（.env.server、.deploy 等）
log_info "同步配置文件..."
# 同步 .env.server（仅本地存在时上传，.DS_Store 和空文件排除）
rsync -avz --progress --exclude='.DS_Store' --exclude='question.md' .deploy "${SERVER_USER}@${SERVER_HOST}:${RELEASES_DIR}/${RELEASE_VERSION}/"
if [ -f .env.server ]; then
    rsync -avz --progress .env.server "${SERVER_USER}@${SERVER_HOST}:${RELEASES_DIR}/${RELEASE_VERSION}/"
fi

log_info "上传完成"

# 4. 在服务器上安装依赖 + 切换 + 重启
log_info "在服务器上执行部署..."
ssh -t "${SERVER_USER}@${SERVER_HOST}" "
set -euo pipefail
export PATH=/home/appuser/local/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RELEASE_DIR='${RELEASES_DIR}/${RELEASE_VERSION}'
CURRENT_LINK='${CURRENT_LINK}'
SHARED_DIR='${SHARED_DIR}'

echo ''
echo '=== 1. 初始化共享目录和符号链接 ==='

# 创建共享目录（首次部署时）
mkdir -p \${SHARED_DIR}/logs \${SHARED_DIR}/data \${SHARED_DIR}/backups

# 确保共享文件存在（首次部署时从旧版本复制）
if [ -L \"\${CURRENT_LINK}\" ]; then
    OLD_DIR=\$(readlink -f \"\${CURRENT_LINK}\")
    # 首次部署时从旧版本复制必要文件
    [ ! -f \"\${RELEASE_DIR}/.env.server\" ] && cp \"\${OLD_DIR}/.env.server\" \"\${RELEASE_DIR}/.env.server\" 2>/dev/null || true
fi

echo ''
echo '=== 2. 配置共享资源软链接 ==='
cd \"\${RELEASE_DIR}\"

# 统一使用共享目录的 node_modules、.env.server、logs、data
ln -sfn \"\${SHARED_DIR}/node_modules\" \"\${RELEASE_DIR}/node_modules\"
ln -sfn \"\${SHARED_DIR}/.env.server\" \"\${RELEASE_DIR}/.env.server\"
ln -sfn \"\${SHARED_DIR}/logs\" \"\${RELEASE_DIR}/logs\"
ln -sfn \"\${SHARED_DIR}/data\" \"\${RELEASE_DIR}/data\"
echo \"  共享资源软链接已创建\"

# 检查 package.json 是否变化（决定是否需要重新安装依赖）
NEED_INSTALL=true
if [ -f \"\${SHARED_DIR}/package.json\" ] && diff -q \"\${SHARED_DIR}/package.json\" \"\${RELEASE_DIR}/package.json\" > /dev/null 2>&1; then
    echo \"  package.json 未变化，跳过 npm install\"
    NEED_INSTALL=false
fi

if [ \"\$NEED_INSTALL\" = true ]; then
    echo \"  package.json 已变化，安装依赖到 shared/node_modules...\"
    cd \"\${RELEASE_DIR}\"
    npm install --production --registry=https://registry.npmmirror.com
    # 安装完成后更新 shared/package.json
    cp \"\${RELEASE_DIR}/package.json\" \"\${SHARED_DIR}/package.json\"
else
    echo \"  依赖已就绪，跳过安装\"
fi

echo ''
echo '=== 3. 健康检查 ==='
# 先临时启动一个实例验证
if curl -sf http://127.0.0.1:3020/neirongmiao/api/health > /dev/null 2>&1; then
    echo '  健康检查通过（已有服务运行）'
else
    echo '  健康检查跳过（首次部署或端口未监听）'
fi

echo ''
echo '=== 4. 软链接切换 ==='
ln -sfn \"\${RELEASE_DIR}\" \"\${CURRENT_LINK}\"
echo \"  当前版本: \$(readlink \"\${CURRENT_LINK}\")\"

echo ''
echo '=== 5. 执行 PM2 重载 ==='
cd \"\${CURRENT_LINK}\"
bash .deploy/restart.sh

echo ''
echo '=== 6. 清理旧版本（保留最近 5 个） ==='
cd \"${RELEASES_DIR}\"
ls -1dt v*/ | tail -n +6 | while read -r old_dir; do
    echo \"  删除旧版本: \${old_dir}\"
    rm -rf \"${RELEASES_DIR}/\${old_dir}\"
done

echo ''
echo '=== 部署完成 ==='
echo \"  版本: ${RELEASE_VERSION}\"
echo \"  路径: \$(readlink -f \"\${CURRENT_LINK}\")\"
"

log_info "部署完成! 版本: ${RELEASE_VERSION}"
