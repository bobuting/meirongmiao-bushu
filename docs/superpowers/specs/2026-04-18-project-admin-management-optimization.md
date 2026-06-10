# 项目后台管理系统设计审查与优化建议

**版本**: 1.0
**日期**: 2026-04-18
**审查人**: Claude
**原文档**: `2026-04-18-project-admin-management-design.md`

---

## 1. 总体评价

### ✅ **优点**

1. **结构完整**：从概述到实现优先级，覆盖全面
2. **细节丰富**：UI 设计、API 接口、数据库设计都很详细
3. **实用性强**：考虑了实际管理需求，如 Step 关键节点监控
4. **风险意识**：考虑了安全、性能、业务风险

### ⚠️ **主要问题**

1. 与现有架构的集成度不够
2. 数据聚合的复杂性被低估
3. 管理员预览模式实现细节不清晰
4. 异常监控的实时性不足
5. 图片项目支持不够详细

---

## 2. 需要优化的地方

### 2.1 与现有架构的集成度不够 ⭐ **高优先级**

**问题描述**：
- 没有明确说明如何复用现有的 `LogsManagement` 等管理组件
- 没有提到如何集成到现有的侧边栏菜单
- 没有考虑现有权限系统的扩展

**优化建议**：

#### 复用现有管理组件

现有管理页面（位于 `apps/web/pages/admin/`）：
- `LogsManagement.tsx` - 日志管理（包含 ErrorLogTab、CallAuditTab、AuditLogTab）
- `ThemeManagementPanel.tsx` - 主题管理
- `PromptManagementPanel.tsx` - 提示词管理
- `SystemSettings.tsx` - 系统设置
- `BusinessConfigManagement.tsx` - 业务配置

**复用策略**：
```typescript
// 新增管理页面可以复用以下组件：
// 1. 筛选组件模式
import { LogsFilterBar } from './logs/LogsFilterBar';

// 2. 分页组件模式
import { Pagination } from '../../components/ui/Pagination';

// 3. 确认弹窗
import { useConfirm } from '../../components/ui/ConfirmDialog';

// 4. 导出按钮模式
import { LogsExportButton } from './logs/LogsExportButton';
```

#### 侧边栏菜单集成

现有侧边栏菜单位于 `Layout.tsx` 或相关导航组件。新增菜单项：

```typescript
// 管理员菜单项
const adminMenuItems = [
  { 
    label: '项目管理', 
    path: '/admin/projects', 
    icon: FolderIcon,
    children: [
      { label: '概览仪表盘', path: '/admin/projects/dashboard' },
      { label: '项目列表', path: '/admin/projects/list' },
      { label: '统计分析', path: '/admin/projects/statistics' }
    ]
  },
  { label: '日志管理', path: '/admin/logs', icon: DocumentTextIcon },
  { label: '提示词管理', path: '/admin/prompts', icon: SparklesIcon },
  // ... 其他管理菜单
];
```

#### 权限系统扩展

现有权限基于 `user.role === 'admin'`。扩展建议：

```typescript
// 权限级别定义
type AdminPermission = 
  | 'admin.view'           // 查看管理后台
  | 'admin.project.view'   // 查看项目详情
  | 'admin.project.edit'   // 编辑项目（解锁、重置）
  | 'admin.project.delete' // 删除项目
  | 'admin.task.manage'    // 管理任务
  | 'admin.stats.view';    // 查看统计数据

// 权限检查函数
function hasPermission(user: User, permission: AdminPermission): boolean {
  if (user.role !== 'admin') return false;
  
  // 可以进一步细化权限控制
  const permissionMap = {
    'admin.view': true,
    'admin.project.view': true,
    'admin.project.edit': user.adminLevel >= 2, // 高级管理员
    'admin.project.delete': user.adminLevel >= 3, // 超级管理员
    'admin.task.manage': true,
    'admin.stats.view': true,
  };
  
  return permissionMap[permission] ?? false;
}
```

---

### 2.2 数据聚合的复杂性被低估 ⭐ **高优先级**

**问题描述**：
- Step 漏斗分析、成本追踪等需要跨多个表的数据聚合
- 实时统计可能对数据库造成压力
- 没有提到数据缓存策略

**优化建议**：

#### 数据聚合策略

**Step 漏斗分析数据源**：
```sql
-- 需要聚合的数据表
- projects（项目基本信息）
- workflow_states（工作流状态快照）
- assets（资产信息）
- script_versions（脚本版本）
- storyboard_frames（分镜帧）
- video_jobs（视频任务）
- fission_results（裂变结果）
```

**聚合查询示例**：
```sql
-- Step 漏斗统计（使用 CTE 优化）
WITH step_stats AS (
  SELECT 
    last_visited_step,
    COUNT(*) as count
  FROM projects
  WHERE created_at >= $1 AND created_at < $2
  GROUP BY last_visited_step
)
SELECT 
  step,
  count,
  ROUND(count * 100.0 / SUM(count) OVER (), 2) as percentage
FROM step_stats
ORDER BY step;
```

#### 使用物化视图预计算

```sql
-- 创建物化视图：每日统计汇总
CREATE MATERIALIZED VIEW daily_project_stats AS
SELECT 
  DATE(created_at) as stat_date,
  project_kind,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing_count,
  COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_count,
  COUNT(*) FILTER (WHERE last_visited_step = 6) as fission_count
FROM projects
GROUP BY DATE(created_at), project_kind;

-- 创建索引
CREATE INDEX idx_daily_stats_date ON daily_project_stats (stat_date);

-- 刷新策略（每小时刷新一次）
REFRESH MATERIALIZED VIEW daily_project_stats;
```

#### 缓存策略

```typescript
// Redis 缓存策略
interface CacheStrategy {
  key: string;
  ttl: number; // 秒
  refresh: 'auto' | 'manual';
}

const cacheStrategies: CacheStrategy[] = [
  { key: 'dashboard:stats', ttl: 300, refresh: 'auto' },      // 5分钟
  { key: 'project:list:*', ttl: 60, refresh: 'auto' },        // 1分钟
  { key: 'project:detail:*', ttl: 300, refresh: 'manual' },   // 5分钟，手动刷新
  { key: 'statistics:*', ttl: 3600, refresh: 'auto' },        // 1小时
];

// 缓存读取
async function getDashboardStats(timeRange: string) {
  const cacheKey = `dashboard:stats:${timeRange}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const data = await computeDashboardStats(timeRange);
  await redis.setex(cacheKey, 300, JSON.stringify(data));
  
  return data;
}
```

---

### 2.3 管理员预览模式实现细节不清晰 ⭐ **中优先级**

**问题描述**：
- 使用 `sessionStorage` 实现管理员预览模式不够可靠
- 没有考虑并发访问问题
- 只读模式如何实现没有详细说明

**优化建议**：

#### 改用 URL 参数 + 后端验证

```typescript
// 方案 A：URL 参数方案（推荐）
// 管理员访问地址
const adminPreviewUrl = `/create/${projectId}/step4?adminPreview=true`;

// 后端验证
app.get('/create/:projectId/step*', async (req, res) => {
  const { adminPreview } = req.query;
  const user = req.user;
  
  if (adminPreview === 'true' && user.role === 'admin') {
    // 设置响应头，标记为管理员预览模式
    res.locals.isAdminPreview = true;
    // 返回只读视图
  }
});
```

```typescript
// 方案 B：后端会话标记方案
// 管理员预览入口
app.post('/admin/projects/:id/preview', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  // 设置会话标记（Redis，5分钟过期）
  await redis.setex(`admin:preview:${userId}:${id}`, 300, 'true');
  
  // 返回预览 URL
  res.json({ 
    previewUrl: `/create/${id}/step4`,
    expiresIn: 300 
  });
});

// 项目页面检查
app.get('/create/:projectId/step*', async (req, res) => {
  const userId = req.user.id;
  const projectId = req.params.projectId;
  
  const isPreview = await redis.get(`admin:preview:${userId}:${projectId}`);
  res.locals.isAdminPreview = isPreview === 'true';
});
```

#### 只读模式实现

```typescript
// ProjectLayout.tsx
const ProjectLayout: React.FC = () => {
  const isAdminPreview = useAppStore(state => state.isAdminPreview);
  
  // 只读模式：禁用所有交互
  const readOnlyProps = isAdminPreview ? {
    disabled: true,
    style: { pointerEvents: 'none', opacity: 0.7 }
  } : {};
  
  return (
    <div>
      {/* 管理员预览提示栏 */}
      {isAdminPreview && (
        <div className="bg-yellow-100 border-b border-yellow-200 p-2">
          🔧 管理员预览模式 | [返回管理后台]
        </div>
      )}
      
      {/* 主内容区（可能只读） */}
      <div {...readOnlyProps}>
        <Outlet />
      </div>
      
      {/* 管理操作栏（仅预览模式显示） */}
      {isAdminPreview && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
          <Button onClick={handleUnlockScript}>解锁脚本选择</Button>
          <Button onClick={handleResetStep}>重置到 Step N</Button>
        </div>
      )}
    </div>
  );
};
```

---

### 2.4 异常监控的实时性不足 ⭐ **中优先级**

**问题描述**：
- 规则引擎每 5 分钟执行一次，不够实时
- 没有考虑 WebSocket 实时推送
- 异常告警的推送渠道单一

**优化建议**：

#### 实时监控架构

```typescript
// WebSocket 实时推送
import { Server as WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

// 异常事件推送
async function pushAnomalyAlert(anomaly: Anomaly) {
  const message = {
    type: 'anomaly',
    data: anomaly,
    timestamp: Date.now()
  };
  
  // 广播给所有管理员
  wss.clients.forEach(client => {
    if (client.role === 'admin') {
      client.send(JSON.stringify(message));
    }
  });
}

// 规则引擎优化：改为事件驱动
async function onTaskFailed(task: Task) {
  // 立即检查
  if (task.failureCount >= 3) {
    await markProjectAsAnomaly({
      projectId: task.projectId,
      type: 'failed',
      severity: 'high'
    });
    
    // 实时推送
    await pushAnomalyAlert({
      projectId: task.projectId,
      type: '任务失败',
      message: `任务 ${task.id} 失败次数达到 ${task.failureCount} 次`
    });
  }
}
```

#### 分级告警策略

```typescript
interface AlertConfig {
  level: 'info' | 'warning' | 'critical';
  channels: ('web' | 'email' | 'wechat')[];
  cooldown: number; // 冷却时间（分钟）
}

const alertConfigs: Record<string, AlertConfig> = {
  // 低优先级：仅站内通知
  'slow_step': {
    level: 'info',
    channels: ['web'],
    cooldown: 60
  },
  
  // 中优先级：站内 + 邮件
  'stuck': {
    level: 'warning',
    channels: ['web', 'email'],
    cooldown: 30
  },
  
  // 高优先级：全渠道
  'high_failure_rate': {
    level: 'critical',
    channels: ['web', 'email', 'wechat'],
    cooldown: 10
  }
};

// 告警发送
async function sendAlert(type: string, anomaly: Anomaly) {
  const config = alertConfigs[type];
  
  // 检查冷却时间
  const lastAlert = await redis.get(`alert:${type}:${anomaly.projectId}`);
  if (lastAlert && Date.now() - parseInt(lastAlert) < config.cooldown * 60000) {
    return; // 冷却中
  }
  
  // 发送告警
  for (const channel of config.channels) {
    switch (channel) {
      case 'web':
        await sendWebNotification(anomaly);
        break;
      case 'email':
        await sendEmailNotification(anomaly);
        break;
      case 'wechat':
        await sendWechatNotification(anomaly);
        break;
    }
  }
  
  // 记录发送时间
  await redis.set(`alert:${type}:${anomaly.projectId}`, Date.now().toString());
}
```

---

### 2.5 图片项目支持不够详细 ⭐ **中优先级**

**问题描述**：
- 图片项目的 4 步流程关键数据展示不够详细
- 图片项目与视频项目的差异处理不够明确

**优化建议**：

#### 图片项目各 Step 关键数据

**Step 1 - 服装搭配**：
```
┌────────────────────────┐
│ 📦 Step 1 服装搭配     │
├────────────────────────┤
│ 上传服装: 3件          │
│ ┌──┐ ┌──┐ ┌──┐        │
│ │👕│ │👔│ │👖│        │
│ └──┘ └──┘ └──┘        │
│                        │
│ 搭配方案: 2套          │
│ 方案1: 休闲风格        │
│ 方案2: 商务风格        │
│                        │
│ 商品信息:              │
│ - 商品名称             │
│ - 商品分类             │
│ - 商品卖点             │
└────────────────────────┘
```

**Step 2 - 角色定妆**：
```
┌────────────────────────┐
│ 🎭 Step 2 角色定妆     │
├────────────────────────┤
│ 角色信息:              │
│ - 角色名称             │
│ - 角色风格             │
│ - 角色特征             │
│                        │
│ 定妆图片: 5张          │
│ ┌──┐ ┌──┐ ┌──┐        │
│ │🖼️│ │🖼️│ │🖼️│        │
│ └──┘ └──┘ └──┘        │
│                        │
│ 角色五视图: ✅ 已生成  │
│ - 正面: ✅             │
│ - 左侧: ✅             │
│ - 右侧: ✅             │
│ - 背面: ✅             │
│ - 特写: ✅             │
└────────────────────────┘
```

**Step 3 - 模特图生成**：
```
┌────────────────────────┐
│ 🖼️ Step 3 模特图生成   │
├────────────────────────┤
│ 生成进度: 80%          │
│ ████████░░             │
│                        │
│ 生成数量: 10张         │
│ ├─ 已完成: 8张 ✅      │
│ ├─ 进行中: 1张 🔄      │
│ └─ 失败: 1张 ❌        │
│                        │
│ 模特展示图:            │
│ ┌──┐ ┌──┐ ┌──┐        │
│ │🖼️│ │🖼️│ │🖼️│        │
│ └──┘ └──┘ └──┘        │
│                        │
│ 生成设置:              │
│ - 尺寸: 1080x1350      │
│ - 数量: 10张           │
│ - 风格: 商务简约       │
└────────────────────────┘
```

**Step 4 - 详情页生成**：
```
┌────────────────────────┐
│ 📄 Step 4 详情页生成   │
├────────────────────────┤
│ 详情页数量: 3页        │
│ ├─ 首页: ✅ 已生成     │
│ ├─ 详情页1: ✅ 已生成  │
│ └─ 详情页2: 🔄 生成中  │
│                        │
│ 详情页预览:            │
│ ┌────────────────────┐ │
│ │                    │ │
│ │   📱 手机预览      │ │
│ │                    │ │
│ │   [图片]           │ │
│ │   [商品信息]       │ │
│ │   [购买按钮]       │ │
│ │                    │ │
│ └────────────────────┘ │
│                        │
│ 导出格式:              │
│ - PNG: ✅              │
│ - HTML: ✅             │
│ - PDF: ⏳ 待生成       │
└────────────────────────┘
```

#### 图片项目差异化展示

```typescript
// 项目列表页：根据项目类型显示不同的 Step 进度
function renderStepProgress(project: Project) {
  if (project.projectKind === 'image') {
    // 图片项目：4步
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(step => (
          <StepIndicator 
            key={step}
            step={step}
            status={getStepStatus(project, step)}
          />
        ))}
      </div>
    );
  } else if (project.projectKind === 'video') {
    // 视频项目：6步
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6].map(step => (
          <StepIndicator 
            key={step}
            step={step}
            status={getStepStatus(project, step)}
          />
        ))}
      </div>
    );
  }
}
```

---

### 2.6 批量操作的实现复杂度 ⭐ **低优先级**

**问题描述**：
- 批量重置 Step、批量删除等操作可能很耗时
- 没有考虑异步批量操作和进度跟踪
- 批量操作失败时的回滚策略

**优化建议**：

#### 异步批量操作队列

```typescript
// 批量操作任务表
CREATE TABLE batch_operation_jobs (
  id SERIAL PRIMARY KEY,
  admin_user_id VARCHAR(50) NOT NULL,
  operation_type VARCHAR(50) NOT NULL, -- 'batch_delete', 'batch_reset', 'batch_export'
  target_ids TEXT[] NOT NULL, -- 项目ID列表
  total_count INTEGER NOT NULL,
  processed_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  errors JSONB, -- 失败详情
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);

// 批量操作 API
POST /admin/projects/batch
{
  "action": "reset_step",
  "projectIds": ["id1", "id2", "id3"],
  "targetStep": 3,
  "reason": "批量重置测试"
}

// 响应：返回任务ID
{
  "jobId": "batch_123",
  "status": "pending",
  "estimatedTime": 120 // 秒
}

// 查询批量操作进度
GET /admin/batch-jobs/:jobId
{
  "jobId": "batch_123",
  "status": "running",
  "progress": {
    "total": 3,
    "processed": 1,
    "success": 1,
    "failed": 0
  },
  "estimatedRemaining": 80
}
```

#### 失败回滚策略

```typescript
// 批量重置操作（支持事务）
async function batchResetSteps(
  projectIds: string[], 
  targetStep: number,
  adminUserId: string
) {
  const job = await createBatchJob(adminUserId, 'reset_step', projectIds);
  
  // 后台执行
  queue.add('batch-reset', { jobId: job.id, targetStep });
  
  return job.id;
}

// 队列处理器
queue.process('batch-reset', async (job) => {
  const { jobId, targetStep } = job.data;
  const batchJob = await getBatchJob(jobId);
  
  for (const projectId of batchJob.target_ids) {
    try {
      // 使用事务确保数据一致性
      await db.transaction(async (trx) => {
        // 1. 备份当前状态
        const backup = await backupProjectState(trx, projectId);
        
        // 2. 执行重置
        await resetProjectStep(trx, projectId, targetStep);
        
        // 3. 记录操作日志
        await logAdminOperation(trx, {
          adminUserId: batchJob.admin_user_id,
          projectId,
          operationType: 'reset_step',
          reason: `批量重置到 Step ${targetStep}`
        });
      });
      
      // 更新进度
      await updateBatchJobProgress(jobId, { success: true });
      
    } catch (error) {
      // 记录失败（不回滚其他项目的操作）
      await updateBatchJobProgress(jobId, { 
        success: false, 
        error: error.message 
      });
    }
  }
  
  // 标记完成
  await completeBatchJob(jobId);
});
```

---

### 2.7 缺少性能优化建议 ⭐ **低优先级**

**优化建议**：

#### 虚拟滚动处理长列表

```typescript
// 使用 react-window 或 react-virtualized
import { FixedSizeList } from 'react-window';

const ProjectList: React.FC = () => {
  const { projects } = useQuery(...);
  
  const Row = ({ index, style }) => (
    <div style={style}>
      <ProjectCard project={projects[index]} />
    </div>
  );
  
  return (
    <FixedSizeList
      height={600}
      itemCount={projects.length}
      itemSize={80}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
};
```

#### 图表数据聚合查询

```sql
-- 使用物化视图预计算统计数据
CREATE MATERIALIZED VIEW hourly_stats AS
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  project_kind,
  COUNT(*) as project_count,
  COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60) as avg_duration_minutes
FROM projects
GROUP BY DATE_TRUNC('hour', created_at), project_kind;

-- 定时刷新（每小时）
CREATE OR REPLACE FUNCTION refresh_hourly_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_stats;
END;
$$ LANGUAGE plpgsql;

-- 使用 pg_cron 定时执行
SELECT cron.schedule('0 * * * *', 'SELECT refresh_hourly_stats()');
```

---

### 2.8 测试策略缺失 ⭐ **低优先级**

**优化建议**：

#### 测试用例设计

```typescript
// 单元测试：异常检测规则
describe('AnomalyDetectionService', () => {
  it('should detect stuck task', async () => {
    const task = { 
      id: 'task_001', 
      startTime: Date.now() - 2 * 60 * 60 * 1000, // 2小时前
      expectedDuration: 30 * 60 * 1000 // 预期30分钟
    };
    
    const isStuck = await service.detectStuckTask(task);
    expect(isStuck).toBe(true);
  });
  
  it('should detect high failure rate', async () => {
    // Mock 数据：最近1小时失败率 > 20%
    mockDb.query.mockResolvedValue({ 
      total: 100, 
      failed: 25 
    });
    
    const alert = await service.checkFailureRate();
    expect(alert.level).toBe('high');
  });
});

// E2E 测试：管理操作流程
describe('Admin Project Management', () => {
  it('should unlock script successfully', async () => {
    // 1. 登录管理员
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    
    // 2. 进入项目详情
    await page.goto('/admin/projects/123/detail');
    
    // 3. 点击解锁脚本
    await page.click('button:has-text("解锁脚本选择")');
    
    // 4. 确认操作
    await page.fill('[name="reason"]', '测试解锁');
    await page.click('button:has-text("确认")');
    
    // 5. 验证成功
    await expect(page.locator('.toast-success')).toBeVisible();
  });
});
```

---

### 2.9 部署和运维考虑不足 ⭐ **低优先级**

**优化建议**：

#### 数据库迁移脚本

```sql
-- 迁移脚本：001_create_admin_tables.sql
BEGIN;

-- 创建管理操作日志表
CREATE TABLE IF NOT EXISTS admin_operation_logs (
  id SERIAL PRIMARY KEY,
  admin_user_id VARCHAR(50) NOT NULL,
  project_id VARCHAR(50),
  operation_type VARCHAR(50) NOT NULL,
  operation_detail TEXT,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 创建异常标记表
CREATE TABLE IF NOT EXISTS project_anomaly_marks (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL,
  rule_id VARCHAR(50) NOT NULL,
  anomaly_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by VARCHAR(50)
);

-- 创建批量操作任务表
CREATE TABLE IF NOT EXISTS batch_operation_jobs (
  id SERIAL PRIMARY KEY,
  admin_user_id VARCHAR(50) NOT NULL,
  operation_type VARCHAR(50) NOT NULL,
  target_ids TEXT[] NOT NULL,
  total_count INTEGER NOT NULL,
  processed_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  errors JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_admin_logs_user ON admin_operation_logs (admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_project ON admin_operation_logs (project_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_marks_project ON project_anomaly_marks (project_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_operation_jobs (status);

COMMIT;
```

#### 功能开关配置

```typescript
// 运行时配置
interface AdminFeatureFlags {
  enableProjectManagement: boolean;
  enableRealTimeMonitor: boolean;
  enableBatchOperations: boolean;
  enableSmartDetection: boolean;
}

// 默认配置
const defaultFlags: AdminFeatureFlags = {
  enableProjectManagement: true,
  enableRealTimeMonitor: false, // 灰度开启
  enableBatchOperations: false,
  enableSmartDetection: false
};

// 运行时获取
async function getFeatureFlags(): Promise<AdminFeatureFlags> {
  const config = await getConfigFromDB('admin_feature_flags');
  return { ...defaultFlags, ...config };
}

// 前端检查
const ProjectManagement: React.FC = () => {
  const flags = useFeatureFlags();
  
  if (!flags.enableProjectManagement) {
    return <FeatureNotAvailable />;
  }
  
  return <ProjectManagementContent />;
};
```

---

## 3. 优化建议优先级

| 优先级 | 优化项 | 理由 | 预计工作量 |
|--------|--------|------|-----------|
| **高** | 与现有架构集成 | 确保项目可实施性 | 2-3 天 |
| **高** | 数据聚合策略 | 影响系统性能和稳定性 | 3-5 天 |
| **中** | 管理员预览模式实现 | 影响用户体验 | 1-2 天 |
| **中** | 图片项目支持 | 确保功能完整性 | 1-2 天 |
| **中** | 异常监控实时性 | 提升管理效率 | 2-3 天 |
| **低** | 批量操作优化 | 长期可维护性 | 2-3 天 |
| **低** | 性能优化 | 大数据量场景 | 1-2 天 |
| **低** | 测试策略 | 长期质量保障 | 2-3 天 |
| **低** | 部署运维 | 上线准备 | 1 天 |

---

## 4. 新增章节建议

建议在原文档中新增以下章节：

### 第 4 章：与现有系统集成
- 4.1 复用现有管理组件
- 4.2 侧边栏菜单集成
- 4.3 权限系统扩展

### 第 5 章：数据聚合与性能优化
- 5.1 数据聚合策略
- 5.2 缓存设计
- 5.3 查询优化
- 5.4 前端性能优化

### 第 11 章：测试策略
- 11.1 单元测试
- 11.2 集成测试
- 11.3 E2E 测试
- 11.4 异常场景测试

### 第 12 章：部署与运维
- 12.1 数据库迁移
- 12.2 灰度发布
- 12.3 监控告警
- 12.4 回滚策略

---

## 5. 总结

原设计文档整体质量较高，但在以下方面需要加强：

1. **实施可行性**：需要明确与现有架构的集成方式
2. **性能保障**：需要详细的数据聚合和缓存策略
3. **用户体验**：管理员预览模式需要更可靠的实现
4. **功能完整性**：图片项目支持需要补充
5. **运维支持**：需要部署和测试策略

建议按优先级逐步优化，先完成高优先级的架构集成和性能优化，再完善中低优先级的功能细节。
