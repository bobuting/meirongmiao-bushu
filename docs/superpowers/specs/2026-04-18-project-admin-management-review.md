# 项目后台管理系统设计规格 - 审查报告

**审查日期**: 2026-04-18
**审查文档**: `2026-04-18-project-admin-management-design.md`
**审查人**: Claude

---

## 1. 总体评价

这是一份结构清晰、内容详尽的设计文档，UI 原型直观展示设计意图，API 定义较为完整。但存在以下几类问题需要改进：

- **业务逻辑不够明确**：解锁/重置操作的影响范围未定义
- **数据库设计不完整**：缺少任务表设计
- **API 设计过于分散**：维护成本高
- **安全设计不足**：缺少权限分级和防误操作机制
- **验收标准缺失**：无法衡量实现质量

---

## 2. 需要改进的问题

### 2.1 设计目标优先级有误（🔴 高）

**当前排序**：
```
1. 增强数据洞察 - 全局统计、Step 漏斗分析、用户行为、成本追踪
2. 改善用户体验 - 简洁界面、高效操作、直观数据呈现
3. 强化异常监控 - 被动查询 + 规则告警 + 智能检测
```

**问题分析**：
管理后台的核心用户是运营/客服人员，他们的核心痛点是"快速定位问题项目并干预"，而非"看统计数据"。

**建议调整**：
```
1. 快速定位问题
   - 异常项目实时监控
   - Step 关键节点状态追踪
   - 任务执行状态可视化

2. 高效干预能力
   - 一键解锁/重置
   - 批量清理失败任务
   - 操作影响范围预览

3. 数据辅助决策
   - 项目创建/完成趋势
   - Step 流失率分析
   - 成本消耗统计
```

---

### 2.2 业务逻辑未明确定义（🔴 高）

#### 问题 1：解锁操作的影响范围

| 操作 | 需要明确的问题 | 建议定义 |
|------|---------------|---------|
| 解锁脚本选择（Step3） | 解锁后已生成的 Step4 分镜数据是否保留？ | **不保留**，解锁即清除 Step4+ 数据，需要重新生成 |
| 解锁角色选择（Step2） | 解锁后 Step3 脚本是否需要重新生成？ | **需要**，角色变更影响脚本内容 |
| 解锁服装搭配（Step1） | 解锁后 Step2 角色是否需要重新生成？ | **需要**，服装是角色定妆的输入 |

#### 问题 2：重置 Step 的影响范围

| 操作 | 需要明确的问题 | 建议定义 |
|------|---------------|---------|
| 重置到 Step3 | Step4-6 的数据如何清理？ | 软删除 Step4+ 的任务记录和生成文件，保留审计日志 |
| 重置到 Step2 | Step3-6 的数据如何清理？ | 同上 |
| 重置操作是否通知用户？ | 用户可能在编辑中 | **通知用户**，前端显示"项目已被管理员重置"提示 |

#### 问题 3：并发操作处理

**场景**：
- 管理员 A 点击"重置到 Step3"
- 管理员 B 同时点击"解锁脚本选择"

**建议**：
- 项目级操作锁（乐观锁）：每次操作前检查 `updated_at`，如有变化则拒绝操作
- 或者使用 Redis 分布式锁：`LOCK:project:{projectId}`

#### 问题 4：操作失败后的处理

| 失败场景 | 建议处理 |
|---------|---------|
| 数据库写入失败 | 回滚事务，返回错误信息，不记录审计日志 |
| 文件删除失败 | 记录错误日志，标记为"部分成功"，需要人工介入 |
| 第三方服务调用失败 | 标记为"待重试"，后台自动重试 3 次 |

---

### 2.3 API 设计过于分散（🔴 高）

**当前设计**：
```
POST /admin/projects/:id/unlock-script
POST /admin/projects/:id/unlock-character
POST /admin/projects/:id/unlock-outfit
POST /admin/projects/:id/reset-step
POST /admin/projects/:id/retry-step
POST /admin/projects/:id/force-complete-step
```

**问题**：
- 每增加一个操作就要加一个路由，维护成本高
- 操作类型分散，不利于权限控制和审计

**建议统一操作接口**：

```typescript
// 统一的项目操作接口
POST /admin/projects/:id/operations

// 请求体
{
  operationType: 'unlock_script' | 'unlock_character' | 'unlock_outfit' | 'reset_step' | 'retry_step' | 'force_complete';
  reason: string;           // 操作原因（必填）
  targetStep?: number;      // reset_step 时必填
  affectedDataPreview?: boolean; // 是否预览影响范围（默认 false）
}

// 响应体
{
  success: boolean;
  message: string;
  affectedData?: string[];  // 受影响的数据项列表
  newTaskId?: string;       // retry_step 时返回新任务 ID
}
```

**路由精简后**：
```
POST /admin/projects/:id/operations     - 项目操作（解锁/重置/重试/强制完成）
POST /admin/tasks/:taskId/operations    - 任务操作（重试/取消）
POST /admin/tasks/batch                  - 批量任务操作
```

---

### 2.4 数据库设计不完整（🔴 高）

**缺失内容**：

#### 1. 任务表设计

文档强调"任务管理是核心功能"，但没有定义任务表结构。

**建议补充**：

```sql
-- 项目任务表
CREATE TABLE project_tasks (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL,
  task_type VARCHAR(50) NOT NULL,        -- 任务类型：character_generation, script_generation 等
  task_name VARCHAR(100),                -- 任务名称：角色定妆生成、脚本生成等
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, running, success, failed, cancelled, stuck
  progress INTEGER DEFAULT 0,            -- 进度 0-100
  priority INTEGER DEFAULT 0,            -- 优先级（数值越大越优先）
  retry_count INTEGER DEFAULT 0,         -- 重试次数
  max_retry INTEGER DEFAULT 3,           -- 最大重试次数
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  duration_seconds INTEGER,              -- 执行时长（秒）
  error_code VARCHAR(50),                -- 错误码
  error_message TEXT,                    -- 错误信息
  input_params JSONB,                    -- 输入参数
  output_data JSONB,                     -- 输出结果
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE (project_id, task_type, created_at),
  INDEX idx_project_status (project_id, status),
  INDEX idx_status_created (status, created_at DESC),
  INDEX idx_project_type (project_id, task_type)
);

COMMENT ON TABLE project_tasks IS '项目任务表';
COMMENT ON COLUMN project_tasks.task_type IS '任务类型：character_generation, script_generation, storyboard_generation, video_generation 等';
COMMENT ON COLUMN project_tasks.status IS '任务状态：pending-等待, running-执行中, success-成功, failed-失败, cancelled-已取消, stuck-卡住';
COMMENT ON COLUMN project_tasks.priority IS '优先级：数值越大越优先执行';
```

#### 2. 唯一约束缺失

`project_anomaly_marks` 表可能重复插入同一异常。

**建议添加唯一约束**：

```sql
-- 添加唯一约束，防止重复标记
ALTER TABLE project_anomaly_marks
ADD CONSTRAINT uk_project_rule_unresolved UNIQUE (project_id, rule_id)
WHERE resolved_at IS NULL;  -- 仅对未解决的异常生效
```

---

### 2.5 安全设计不足（🟡 中）

**当前设计**：仅有"二次确认 + 操作日志"

**缺失内容**：

#### 1. 管理员权限分级

| 角色 | 权限范围 |
|------|---------|
| 普通管理员 | 查看项目列表、查看详情、解锁操作、清理任务 |
| 高级管理员 | 重置 Step、导出数据、批量操作 |
| 超级管理员 | 删除项目、系统配置 |

**建议在用户表添加字段**：

```sql
ALTER TABLE users ADD COLUMN admin_level INTEGER DEFAULT 0;
-- 0=普通用户, 1=普通管理员, 2=高级管理员, 3=超级管理员
```

#### 2. 敏感操作冷却时间

防止管理员误操作（快速点击两次）。

**建议**：
- 解锁操作：冷却时间 5 秒
- 重置操作：冷却时间 10 秒
- 删除操作：冷却时间 30 秒

```typescript
// 前端实现
const [lastOperationTime, setLastOperationTime] = useState(0);

const handleOperation = async (type: string) => {
  const now = Date.now();
  const cooldown = COOLDOWN_MAP[type] || 5000;

  if (now - lastOperationTime < cooldown) {
    toast.error(`操作过快，请 ${Math.ceil((cooldown - (now - lastOperationTime)) / 1000)} 秒后重试`);
    return;
  }

  setLastOperationTime(now);
  // 执行操作...
};
```

#### 3. 敏感数据脱敏

导出项目数据时，需要对敏感字段脱敏：

| 字段 | 脱敏规则 |
|------|---------|
| 用户手机号 | `138****1234` |
| 用户邮箱 | `a***@example.com` |
| API Key | `sk-****...****xyz` |
| 用户真实姓名 | `张*` |

#### 4. IP 白名单（可选）

仅允许公司内网 IP 访问管理后台：

```typescript
// 中间件实现
const ADMIN_IP_WHITELIST = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

app.use('/admin/*', async (req, res, next) => {
  const clientIp = req.ip;
  if (!isIpInWhitelist(clientIp, ADMIN_IP_WHITELIST)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
});
```

---

### 2.6 前端实现要点过于简略（🟡 中）

**缺失内容**：

#### 1. 缓存策略

| 数据类型 | 缓存策略 | 刷新机制 |
|---------|---------|---------|
| 项目列表 | TanStack Query，staleTime: 30s | 手动刷新、筛选变更时刷新 |
| 项目详情 | TanStack Query，staleTime: 60s | 操作后手动 invalidate |
| 仪表盘数据 | TanStack Query，staleTime: 30s | 自动刷新（30s）、手动刷新 |
| 统计数据 | TanStack Query，staleTime: 5min | 手动刷新、时间范围变更时刷新 |

```typescript
// 示例：项目列表查询
const useAdminProjects = (params: ProjectListParams) => {
  return useQuery({
    queryKey: ['admin', 'projects', params],
    queryFn: () => adminApi.getProjects(params),
    staleTime: 30000, // 30s
  });
};
```

#### 2. 实时更新

**方案 A：轮询（推荐，实现简单）**
```typescript
// 进行中项目的状态轮询
const useProjectStatusPolling = (projectId: string, enabled: boolean) => {
  return useQuery({
    queryKey: ['project', 'status', projectId],
    queryFn: () => adminApi.getProjectStatus(projectId),
    enabled,
    refetchInterval: 5000, // 每 5 秒轮询
  });
};
```

**方案 B：WebSocket（高优先级时考虑）**
- 优点：实时性好，服务端主动推送
- 缺点：实现复杂，需要维护连接状态

#### 3. 状态管理

管理后台数据主要来自服务端，使用 **TanStack Query** 即可满足需求。

对于客户端状态（如选中项目、筛选条件），使用 **URL 参数** 管理：

```typescript
// 筛选条件存储在 URL 中
const [searchParams, setSearchParams] = useSearchParams();

const filters = {
  status: searchParams.get('status') || '',
  step: searchParams.get('step') || '',
  search: searchParams.get('search') || '',
};

const updateFilters = (newFilters: Partial<typeof filters>) => {
  setSearchParams({ ...filters, ...newFilters });
};
```

---

### 2.7 缺少验收标准（🟡 中）

**建议补充**：

```markdown
## 验收标准

### 项目列表页
- [ ] 页面加载时间 < 1s（1000 条数据）
- [ ] 筛选响应时间 < 500ms
- [ ] 视频预览加载 < 2s
- [ ] 分页切换无白屏闪烁

### 项目详情页
- [ ] 页面加载时间 < 1.5s
- [ ] Step 时间轴渲染正确
- [ ] 任务列表实时更新（5s 轮询）

### 项目干预操作
- [ ] 解锁操作 < 3s 完成
- [ ] 重置操作有确认弹窗 + 影响范围展示
- [ ] 操作失败有明确的错误提示
- [ ] 操作成功后数据正确刷新

### 异常监控
- [ ] 异常项目检测延迟 < 5 分钟
- [ ] 告警推送到达率 > 99%

### 统计分析
- [ ] 图表渲染 < 1s
- [ ] 数据导出 < 10s（10000 条数据）
```

---

### 2.8 UI 原型占篇幅过大（🟢 低）

**问题**：约 40% 的篇幅是 ASCII 图，影响阅读效率。

**建议**：
- 保留关键页面布局（仪表盘、列表页、详情页）
- 精简次要页面的 UI 原型
- 复杂交互用"交互说明"文字替代

**示例**：

```markdown
### 项目列表页交互说明

#### 视频预览交互
- 点击缩略图上的 ▶️ 按钮 → 弹出视频预览模态框
- 模态框显示：视频播放器、时长、分辨率
- 操作按钮：下载视频、查看项目详情

#### Step 进度可视化
- [1] = ✅ 已完成（绿色）
- [2] = 🔄 进行中（蓝色动画）
- [3] = ⚠️ 异常（黄色）
- [4] = ❌ 失败（红色）
- [5] = ⏳ 待处理（灰色）

#### 行操作菜单
- 点击 ⋮ 打开操作菜单
- 高风险操作（重置、删除）用红色文字标识
- 操作前显示确认弹窗
```

---

## 3. 改进清单

| 优先级 | 改进项 | 预估工作量 | 责任人 |
|--------|--------|-----------|--------|
| 🔴 高 | 补充业务逻辑明确说明（解锁/重置的影响范围） | 1h | 产品 |
| 🔴 高 | 补充任务表设计 | 30min | 后端 |
| 🔴 高 | 统一 API 设计（操作接口合并） | 30min | 后端 |
| 🔴 高 | 补充并发操作处理机制 | 1h | 后端 |
| 🟡 中 | 补充安全设计（权限分级、冷却时间、脱敏） | 2h | 后端 |
| 🟡 中 | 补充前端缓存策略和状态管理 | 30min | 前端 |
| 🟡 中 | 补充验收标准 | 30min | 测试 |
| 🟢 低 | 精简 UI 原型篇幅 | 1h | 产品 |

---

## 4. 补充建议

### 4.1 补充任务状态机定义

```typescript
// 任务状态流转
type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'stuck';

// 状态转换规则
const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['running', 'cancelled'],
  running: ['success', 'failed', 'stuck', 'cancelled'],
  success: [], // 终态
  failed: ['retrying'],
  cancelled: ['pending'], // 可重新触发
  stuck: ['cancelled', 'running'], // 可强制取消或重试
};
```

### 4.2 补充异常检测规则执行时机

```typescript
// 后端定时任务配置
const ANOMALY_CHECK_CONFIG = {
  // 每 5 分钟执行一次卡住检测
  stuckCheck: {
    interval: '*/5 * * * *',
    rules: ['RULE_001', 'RULE_004'],
  },
  // 每 1 小时执行一次失败率检测
  failureRateCheck: {
    interval: '0 * * * *',
    rules: ['RULE_002', 'RULE_005'],
  },
  // 每天凌晨 2 点执行一次历史数据分析
  patternAnalysis: {
    interval: '0 2 * * *',
    rules: ['RULE_006'],
  },
};
```

### 4.3 补充监控告警配置

```typescript
// 告警通知配置
interface AlertConfig {
  channel: 'email' | 'slack' | 'webhook';
  severity: 'high' | 'medium' | 'low';
  recipients: string[];
}

const ALERT_CONFIGS: AlertConfig[] = [
  {
    channel: 'slack',
    severity: 'high',
    recipients: ['#ops-alerts'],
  },
  {
    channel: 'email',
    severity: 'high',
    recipients: ['ops@example.com'],
  },
];
```

---

## 5. 总结

这份设计文档在结构和内容上都比较完整，但需要在以下几个方面进行改进：

1. **业务逻辑定义**：明确解锁/重置操作的影响范围
2. **数据库设计**：补充任务表和唯一约束
3. **API 设计**：统一操作接口，降低维护成本
4. **安全设计**：添加权限分级、冷却时间、数据脱敏
5. **前端实现**：明确缓存策略和状态管理方案
6. **验收标准**：添加可量化的验收指标

建议按照优先级顺序进行改进，高优先级的问题应该在开发前解决。
