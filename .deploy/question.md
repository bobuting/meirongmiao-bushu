服务器部署现状分析与改进建议
一、安全问题（优先级最高）
问题	现状	风险	建议
.env.server 权限	777 (rwxrwxrwx)	严重——任何人可读/写敏感信息（DB密码、API Key等）	改为 400 或 600，仅 owner 可读写
SSL 私钥权限	777 (rwxrwxrwx)	严重——私钥泄露可被中间人攻击	改为 400，owner root
目录权限	大量 777 权限	高——任何人可修改代码和配置	目录 755，文件 644
SSH Root 登录	PermitRootLogin yes	高——root 被爆破	改为 no，用普通用户 + sudo
SSH 密码认证	PasswordAuthentication yes	中——暴力破解风险	改为 no，仅密钥登录
无防火墙	无 ufw/firewalld	中——所有端口暴露	至少开 22/80/443，其他关闭
二、部署流程问题
问题	说明	建议
部署有停机时间	rm -rf dist 再上传，期间 nginx 代理到不存在的文件会导致请求失败	改用零停机部署：新目录部署 → 软链接切换 → PM2 reload
备份清理策略	只删 5 天前的，但不删备份目录本身，且 cp -r 会复制 node_modules 很慢	用 rsync --backup 或 tar 打包备份，只保留最近 3 份
没有版本标记	无法知道当前部署的是哪个 commit	部署时记录 commit hash 到文件，便于回滚定位
没有回滚机制	deploy_prod.sh 只往前部署，出问题只能手动恢复备份	加 rollback.sh，一键切换到上一个版本
三、性能与资源问题
问题	现状	建议
PM2 实例数	instances: 2，但服务器有 14GB 内存，只用了 1.6GB	可改为 instances: 'max' 自动利用所有 CPU 核，或至少 4 个
无 PM2 定时重启	注释掉了 cron_restart: '0 4 * * *'	建议保留，每天凌晨重启释放内存泄漏
四、Nginx 问题
问题	说明	建议
超时不一致	bobuting.com 的 proxy_read_timeout=300s，neirongmiao.com 是 3000s	统一或根据实际业务需要设置
无安全响应头	缺少 HSTS、X-Content-Type-Options、X-Frame-Options	添加安全头部
SSL 证书手动管理	没有自动续期机制	考虑配置 Let's Encrypt + certbot 自动续期，或设证书过期提醒
五、其他改进
问题	建议
无健康检查	加一个 /neirongmiao/api/health 端点，部署后自动检测服务是否正常
无 CI/CD	目前手动 SSH + rsync，可以考虑 GitHub Actions 自动部署
.env.server 被 git 忽略但明文传输	rsync 不传 .env.server 是对的，但传输过程安全，建议保持不变
node_modules 全量传输	deploy_prod.sh 不传 node_modules，服务器上 npm install --production 是对的




停机时间分析（仅分析，不改）
当前流程

deploy_prod.sh 执行时，从本地视角看：
1. 备份服务器目录（cp -r）
2. rm -rf dist
3. rsync 上传新文件
4. 执行 restart.sh → pm2 delete + pm2 start
停机发生在哪个阶段
步骤	操作	持续时间	前端（nginx /）	API
1. cp -r 备份	复制整个目录	~10-30s	✅ 正常	✅ 正常（PM2 还在跑）
2. rm -rf dist	删除前端文件	~1-3s	❌ 403 Forbidden	✅ 正常
3. rsync 上传	上传新文件	~10-60s	❌ 部分 403，逐步恢复	✅ 正常
4. restart.sh	pm2 delete	~1s	✅ 正常	❌ 502 Bad Gateway
5. pm2 start	启动新进程	~3-5s	✅ 正常	❌ 502，启动中
合计		~25-100s	停机 ~15-65s	停机 ~4-6s
核心问题
rm -rf dist 这一步导致前端停机时间最长。因为：

nginx 的 root /home/appuser/apps/prod/neirongmiao/apps/web/dist/ 直接指向这个目录
目录被删后，nginx 找不到文件 → 403
在 rsync 上传完成前，前端都是不可用的
pm2 delete 导致 API 短暂停机：

PM2 进程被杀后，nginx 反向代理到 3020 端口 → 连接拒绝 → 502
新进程启动到监听端口需要 2-3 秒
零停机方案
目录结构改为 releases 模式：


/home/appuser/apps/prod/
├── current → releases/v20260415-183000  ← 软链接，指向当前版本
├── shared/                               ← 共享目录（不变的）
│   ├── .env.server
│   ├── logs/
│   ├── data/
│   ├── node_modules/                     ← 共享依赖
│   └── backups/
└── releases/
    ├── v20260415-183000/  ← 新版本
    │   ├── dist/
    │   ├── src/
    │   ├── apps/web/dist/
    │   └── package.json
    └── v20260415-170000/  ← 旧版本（保留，用于回滚）
新部署流程：


1. 创建新版本目录 releases/v20260415-183000/
2. rsync 上传到 releases/v20260415-183000/（不影响 current 指向的旧版本）
3. 安装依赖 npm install --production（在 releases 目录中）
4. curl localhost:3020/neirongmiao/api/health 验证新版本正常
5. ln -sfn releases/v20260415-183000 current  ← 原子切换，0ms 停机
6. pm2 gracefulReload（旧进程处理完当前请求后才 kill，新进程接管）
7. 清理旧版本（保留最近 3 个）
为什么零停机：

ln -sfn 是原子操作，nginx 和 PM2 的 cwd 在切换瞬间无缝过渡
PM2 gracefulReload 保证请求不丢失
前端文件在新目录中，切换后 nginx 立刻指向新版本
需要改的文件
文件	改动内容
deploy_prod.sh	重写上传逻辑：上传到 releases 目录 → 软链接切换 → gracefulReload
restart.sh	改为 gracefulReload 模式，不先 delete
新增 rollback.sh	软链接指向上一个版本 → PM2 gracefulReload
不改的文件：nginx 配置（root 指向 current/apps/web/dist/ 即可，不需要每次改）。
