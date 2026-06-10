/**
 * PM2 生产环境配置文件
 *
 * 使用方式：
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production
 *   pm2 stop ecosystem.config.js
 */
module.exports = {
  apps: [
    {
      name: 'neirongmiao',
      script: 'dist/server.js',
      cwd: '/home/appuser/apps/prod/neirongmiao',

      // ========== Cluster 模式配置 ==========
      // instances: 'max',           // 自动检测 CPU 核数
      instances: 2,                  // 固定 2 个实例（根据服务器配置调整）
      exec_mode: 'cluster',          // 集群模式

      // ========== 环境变量 ==========
      env_production: {
        NODE_ENV: 'production',
      },

      // ========== 内存限制 ==========
      // Node.js 堆内存限制
      node_args: '--max-old-space-size=4096',
      // 接近限制时自动重启（略小于 node_args 设置值）
      max_memory_restart: '3500M',

      // ========== 日志配置 ==========
      // PM2 日志已禁用，应用使用 Pino 日志系统（logs/app-*.log）
      out_file: '/dev/null',
      error_file: '/dev/null',

      // ========== 自动重启策略 ==========
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.run', 'dist'],

      // 重启退避策略：避免频繁重启
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      restart_delay: 1000,

      // 定时重启（可选，每天凌晨 4 点重启以释放内存）
      // cron_restart: '0 4 * * *',

      // ========== 进程管理 ==========
      kill_timeout: 5000,           // 发送 SIGKILL 前等待时间
      wait_ready: false,            // 不等待 ready 信号
      listen_timeout: 3000,         // 启动超时时间
    },
  ],
};
