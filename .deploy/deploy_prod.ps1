# deploy_prod.ps1 - full deploy to production server and restart
# usage: .\deploy_prod.ps1 [-SkipBuild] [-DryRun]
param(
    [switch]$SkipBuild,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# config
$SERVER_HOST = "101.37.80.207"
$SERVER_USER = "appuser"
$SERVER_DIR = "/home/appuser/apps/prod/neirongmiao"
$BACKUP_BASE = "/home/appuser/apps/backups"

# helpers
function Write-Info {
    Write-Host "[INFO] $args" -ForegroundColor Green
}

function Write-Warn {
    Write-Host "[WARN] $args" -ForegroundColor Yellow
}

function Write-Fatal {
    Write-Host "[ERROR] $args" -ForegroundColor Red
}

function Assert-LastSuccess {
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
        Write-Fatal "command failed, exit code: $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

# build
if (-not $SkipBuild) {
    Write-Info "building..."
    npm run build:all
    Assert-LastSuccess
    Write-Info "build done"
}

$BACKUP_DIR = "${BACKUP_BASE}/prod"
$BACKUP_NAME = "full-backup-$(Get-Date -Format 'yyyyMMddHHmmss')"

Write-Info "upload plan:"
Write-Host "  - package.json"
Write-Host "  - src/"
Write-Host "  - skills/"
Write-Host "  - dist/"
Write-Host "  - apps/web/dist/"

if ($DryRun) {
    Write-Warn "dry-run mode:"
    Write-Host "# 1. backup:"
    Write-Host "ssh ${SERVER_USER}@${SERVER_HOST} `"mkdir -p ${BACKUP_DIR} && cp -r ${SERVER_DIR} ${BACKUP_DIR}/${BACKUP_NAME}`""
    Write-Host "# 2. delete old files:"
    Write-Host "ssh ${SERVER_USER}@${SERVER_HOST} `"cd ${SERVER_DIR} && rm -rf package.json src skills dist apps/web/dist && mkdir -p apps/web/dist`""
    Write-Host "# 3. upload:"
    Write-Host "scp -r package.json src skills dist ${SERVER_USER}@${SERVER_HOST}:${SERVER_DIR}/"
    Write-Host "scp -r apps/web/dist/* ${SERVER_USER}@${SERVER_HOST}:${SERVER_DIR}/apps/web/dist/"
    Write-Host "# 4. restart:"
    Write-Host "ssh ${SERVER_USER}@${SERVER_HOST} `"cd ${SERVER_DIR} && nohup bash .deploy/restart.sh > /dev/null 2>&1 &`""
    exit 0
}

# 1. backup server dir
Write-Info "backing up server to ${BACKUP_DIR}/${BACKUP_NAME}..."
ssh "${SERVER_USER}@${SERVER_HOST}" "mkdir -p ${BACKUP_DIR} && cp -r ${SERVER_DIR} ${BACKUP_DIR}/${BACKUP_NAME}"
Assert-LastSuccess
Write-Info "backup done"

# 2. delete old files on server
Write-Info "deleting old files on server..."
ssh "${SERVER_USER}@${SERVER_HOST}" "cd ${SERVER_DIR} && rm -rf package.json src skills dist apps/web/dist && mkdir -p apps/web/dist"
Assert-LastSuccess

# 3. upload
Write-Info "uploading to ${SERVER_HOST}..."
scp -r package.json src skills dist "${SERVER_USER}@${SERVER_HOST}:${SERVER_DIR}/"
scp -r apps/web/dist/* "${SERVER_USER}@${SERVER_HOST}:${SERVER_DIR}/apps/web/dist/"
Assert-LastSuccess
Write-Info "upload done"

# 4. restart on server (后台执行，避免 PM2 reload 导致 SSH 异常退出)
Write-Info "restarting service..."
ssh "${SERVER_USER}@${SERVER_HOST}" "cd ${SERVER_DIR} && nohup bash .deploy/restart.sh > /dev/null 2>&1 &"
# 重启是异步的，不检查退出码；可稍后登录服务器确认状态
Write-Info "restart triggered (async, check server for status)"
