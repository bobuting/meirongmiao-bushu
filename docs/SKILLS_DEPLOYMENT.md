# Skills 系统部署方案

本文档描述 Skills 提示词管理系统的完整部署策略，采用 6 阶段灰度发布方案，确保平滑过渡。

## 📋 目录

- [部署策略概览](#部署策略概览)
- [阶段 1: 基础部署](#阶段-1-基础部署)
- [阶段 2: 数据迁移](#阶段-2-数据迁移)
- [阶段 3: 灰度发布](#阶段-3-灰度发布)
- [阶段 4: 逐步扩大](#阶段-4-逐步扩大)
- [阶段 5: 全量切换](#阶段-5-全量切换)
- [阶段 6: 清理旧系统](#阶段-6-清理旧系统)
- [监控指标](#监控指标)
- [回滚方案](#回滚方案)
- [常见问题](#常见问题)

---

## 部署策略概览

**总时长：48 天**

| 阶段 | 时长 | 流量比例 | 目标 |
|------|------|---------|------|
| 1. 基础部署 | 1 天 | 0% | 部署新系统但不启用 |
| 2. 数据迁移 | 2 天 | 0% | 迁移现有提示词 |
| 3. 灰度发布 | 7 天 | 1% | 小流量验证 |
| 4. 逐步扩大 | 21 天 | 1%→50%→100% | 逐步切换流量 |
| 5. 全量切换 | 14 天 | 100% | 观察稳定性 |
| 6. 清理旧系统 | 3 天 | 100% | 移除旧代码 |

---

## 阶段 1: 基础部署

**时长：1 天**  
**流量：0%**  
**目标：部署新系统但不启用**

### 1.1 部署清单

- [ ] 部署 Skills 文件系统到生产环境
- [ ] 部署 API 端点（`/skills-test`）
- [ ] 部署 CLI 工具
- [ ] 部署前端管理界面（可选）
- [ ] **不修改现有提示词调用逻辑**

### 1.2 部署步骤

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 安装依赖
npm install

# 3. 编译 TypeScript
npm run build

# 4. 验证编译结果
npm run skills:list

# 5. 运行验证脚本
./scripts/final-validation.sh

# 6. 部署到生产环境
# （具体命令取决于部署方式）
```

### 1.3 验证

```bash
# 验证 Skills 可以加载
curl https://api.example.com/skills-test

# 验证 CLI 工具
npm run skills:list

# 验证 API 端点
curl https://api.example.com/skills-test/script-generation
```

### 1.4 注意事项

- ✅ 新系统已部署但未启用
- ✅ 旧系统继续正常运行
- ✅ 无用户影响
- ⚠️ 不要修改任何现有代码

---

## 阶段 2: 数据迁移

**时长：2 天**  
**流量：0%**  
**目标：将现有提示词迁移到 Skills**

### 2.1 迁移清单

- [ ] 导出现有提示词数据
- [ ] 运行迁移工具
- [ ] 验证迁移结果
- [ ] 修复迁移问题
- [ ] 运行完整测试

### 2.2 迁移步骤

```bash
# 1. 导出现有提示词
npm run migrate:export

# 2. 运行迁移工具
npm run migrate:to-skills

# 3. 验证迁移结果
npm run migrate:compare

# 4. 运行所有 Skills 验证
for skill in skills/*/; do
  npm run skills:validate $(basename $skill)
done

# 5. 运行单元测试
npm test
```

### 2.3 验证标准

- ✅ 所有提示词成功迁移
- ✅ 输出与旧系统一致（相似度 > 95%）
- ✅ 所有 Skills 通过验证
- ✅ 单元测试全部通过

### 2.4 迁移报告

迁移工具会生成 `migration-report.json`：

```json
{
  "timestamp": "2024-01-01T00:00:00Z",
  "total": 68,
  "success": 68,
  "failed": 0,
  "results": [...]
}
```

---

## 阶段 3: 灰度发布

**时长：7 天**  
**流量：1%**  
**目标：小流量验证新系统**

### 3.1 启用特性开关

```typescript
// src/config/feature-flags.ts
export const FEATURE_FLAGS = {
  ENABLE_SKILLS_SYSTEM: true,  // 启用 Skills 系统
  SKILLS_GRAY_RATIO: 0.01      // 1% 流量
};
```

### 3.2 流量分配逻辑

```typescript
// src/services/prompt-service.ts
async function getPrompt(code: string, input: any) {
  // 灰度逻辑：1% 流量使用新系统
  const useSkills = Math.random() < FEATURE_FLAGS.SKILLS_GRAY_RATIO;
  
  if (useSkills && FEATURE_FLAGS.ENABLE_SKILLS_SYSTEM) {
    // 使用新系统
    const loader = new SkillLoader();
    const skill = await loader.load(code);
    return await skill.render(input);
  } else {
    // 使用旧系统
    return await getPromptFromDatabase(code, input);
  }
}
```

### 3.3 监控指标

**每日检查：**

- 错误率 < 0.1%
- 响应时间 < 100ms
- 缓存命中率 > 90%
- 内存占用 < 50MB

**对比指标：**

| 指标 | 旧系统 | 新系统 | 目标 |
|------|--------|--------|------|
| 平均响应时间 | 200ms | < 100ms | ✅ |
| P95 响应时间 | 500ms | < 200ms | ✅ |
| 错误率 | 0.05% | < 0.1% | ✅ |
| 内存占用 | 100MB | < 50MB | ✅ |

### 3.4 每日检查清单

- [ ] 查看错误日志
- [ ] 检查性能指标
- [ ] 对比新旧系统输出
- [ ] 收集用户反馈
- [ ] 更新监控报告

---

## 阶段 4: 逐步扩大

**时长：21 天**  
**流量：1% → 5% → 10% → 25% → 50% → 100%**  
**目标：逐步切换所有流量**

### 4.1 扩大计划

| 天数 | 流量比例 | 观察期 | 决策点 |
|------|---------|--------|--------|
| Day 1-7 | 1% | 7 天 | 继续/回滚 |
| Day 8-10 | 5% | 3 天 | 继续/回滚 |
| Day 11-13 | 10% | 3 天 | 继续/回滚 |
| Day 14-17 | 25% | 4 天 | 继续/回滚 |
| Day 18-21 | 50% | 4 天 | 继续/全量 |

### 4.2 扩大标准

**继续扩大的条件：**

- ✅ 错误率 < 0.1%
- ✅ 响应时间 < 100ms
- ✅ 无严重 Bug
- ✅ 用户反馈正面

**回滚的条件：**

- ❌ 错误率 > 0.5%
- ❌ 响应时间 > 300ms
- ❌ 出现严重 Bug
- ❌ 大量用户投诉

### 4.3 调整流量比例

```typescript
// 修改配置文件
export const FEATURE_FLAGS = {
  ENABLE_SKILLS_SYSTEM: true,
  SKILLS_GRAY_RATIO: 0.05  // 调整为 5%
};

// 重启服务
pm2 restart app
```

### 4.4 A/B 测试

```typescript
// 记录使用的系统
async function getPrompt(code: string, input: any) {
  const useSkills = Math.random() < FEATURE_FLAGS.SKILLS_GRAY_RATIO;
  
  const startTime = Date.now();
  const result = useSkills 
    ? await getPromptFromSkills(code, input)
    : await getPromptFromDatabase(code, input);
  const duration = Date.now() - startTime;
  
  // 记录指标
  metrics.record({
    system: useSkills ? 'skills' : 'database',
    code,
    duration,
    success: true
  });
  
  return result;
}
```

---

## 阶段 5: 全量切换

**时长：14 天**  
**流量：100%**  
**目标：观察全量稳定性**

### 5.1 切换步骤

```typescript
// 1. 设置流量为 100%
export const FEATURE_FLAGS = {
  ENABLE_SKILLS_SYSTEM: true,
  SKILLS_GRAY_RATIO: 1.0  // 100% 流量
};

// 2. 重启所有服务
pm2 restart all

// 3. 验证所有服务正常
curl https://api.example.com/health
```

### 5.2 观察期

**前 3 天：密切监控**

- 每小时检查一次指标
- 实时查看错误日志
- 准备随时回滚

**第 4-7 天：常规监控**

- 每天检查两次
- 收集性能数据
- 优化缓存策略

**第 8-14 天：稳定观察**

- 每天检查一次
- 确认系统稳定
- 准备清理旧系统

### 5.3 成功标准

- ✅ 连续 14 天无严重问题
- ✅ 错误率 < 0.1%
- ✅ 响应时间 < 100ms
- ✅ 缓存命中率 > 90%
- ✅ 用户满意度 > 95%

---

## 阶段 6: 清理旧系统

**时长：3 天**  
**流量：100%**  
**目标：移除旧代码和数据**

### 6.1 清理清单

- [ ] 移除旧的提示词加载代码
- [ ] 移除数据库提示词表（备份后）
- [ ] 移除特性开关代码
- [ ] 更新文档
- [ ] 通知团队

### 6.2 清理步骤

```bash
# 1. 备份数据库提示词表
pg_dump -t nrm_prompt_templates > backup_prompts.sql

# 2. 移除旧代码
git rm src/services/old-prompt-service.ts
git rm src/persistence/prompt-persistence.ts

# 3. 移除特性开关
# 编辑 src/config/feature-flags.ts，移除 SKILLS_GRAY_RATIO

# 4. 提交更改
git commit -m "chore: remove old prompt system"

# 5. 部署
npm run deploy
```

### 6.3 最终验证

```bash
# 验证旧代码已移除
git log --oneline | grep "remove old prompt"

# 验证新系统正常
npm run skills:list
npm test

# 验证生产环境
curl https://api.example.com/skills-test
```

---

## 监控指标

### 关键指标

| 指标 | 目标值 | 告警阈值 |
|------|--------|---------|
| Skill 加载时间 | < 50ms | > 100ms |
| 提示词渲染时间 | < 50ms | > 100ms |
| 缓存命中率 | > 90% | < 80% |
| 错误率 | < 0.1% | > 0.5% |
| 内存占用 | < 50MB | > 100MB |
| CPU 使用率 | < 30% | > 60% |

### 监控工具

```typescript
// src/monitoring/skills-metrics.ts
export class SkillsMetrics {
  // 记录加载时间
  recordLoadTime(code: string, duration: number) {
    metrics.histogram('skills.load.duration', duration, {
      skill: code
    });
  }
  
  // 记录渲染时间
  recordRenderTime(code: string, duration: number) {
    metrics.histogram('skills.render.duration', duration, {
      skill: code
    });
  }
  
  // 记录缓存命中
  recordCacheHit(hit: boolean) {
    metrics.increment('skills.cache.' + (hit ? 'hit' : 'miss'));
  }
  
  // 记录错误
  recordError(code: string, error: Error) {
    metrics.increment('skills.error', {
      skill: code,
      type: error.name
    });
  }
}
```

### 告警规则

```yaml
# Prometheus 告警规则
groups:
  - name: skills_system
    rules:
      - alert: SkillsHighErrorRate
        expr: rate(skills_error_total[5m]) > 0.005
        for: 5m
        annotations:
          summary: "Skills 系统错误率过高"
          
      - alert: SkillsSlowResponse
        expr: histogram_quantile(0.95, skills_load_duration) > 0.1
        for: 5m
        annotations:
          summary: "Skills 加载时间过长"
          
      - alert: SkillsLowCacheHitRate
        expr: rate(skills_cache_hit[5m]) / rate(skills_cache_total[5m]) < 0.8
        for: 10m
        annotations:
          summary: "Skills 缓存命中率过低"
```

---

## 回滚方案

### 快速回滚

**如果出现严重问题，立即回滚：**

```typescript
// 1. 禁用 Skills 系统
export const FEATURE_FLAGS = {
  ENABLE_SKILLS_SYSTEM: false,  // 立即禁用
  SKILLS_GRAY_RATIO: 0
};

// 2. 重启服务
pm2 restart all

// 3. 验证旧系统正常
curl https://api.example.com/health
```

**回滚时间：< 5 分钟**

### 回滚触发条件

**立即回滚：**

- 错误率 > 1%
- 响应时间 > 500ms
- 出现数据丢失
- 系统崩溃

**计划回滚：**

- 错误率持续 > 0.5%
- 响应时间持续 > 300ms
- 大量用户投诉
- 发现严重 Bug

### 回滚后处理

1. **分析问题**：查看日志，定位根本原因
2. **修复问题**：修复代码或配置
3. **测试验证**：在测试环境充分测试
4. **重新部署**：修复后重新开始灰度发布

---

## 常见问题

### Q1: 灰度期间如何确保数据一致性？

A: 新旧系统使用相同的输入参数，输出经过对比验证（相似度 > 95%）。灰度期间不修改提示词内容。

### Q2: 如果部分 Skill 有问题怎么办？

A: 可以针对单个 Skill 回滚：

```typescript
const SKILL_BLACKLIST = ['problematic-skill'];

if (SKILL_BLACKLIST.includes(code)) {
  return await getPromptFromDatabase(code, input);
}
```

### Q3: 如何处理缓存失效？

A: 缓存使用 LRU 策略，自动淘汰。如需手动清理：

```typescript
const loader = new SkillLoader();
loader.clearCache();
```

### Q4: 部署期间服务会中断吗？

A: 不会。使用滚动更新策略，逐个重启服务实例，确保零停机时间。

### Q5: 如何验证迁移的正确性？

A: 使用对比工具：

```bash
npm run migrate:compare
```

对比新旧系统的输出，确保一致性。

---

## 总结

Skills 系统部署采用 6 阶段灰度发布策略，总时长 48 天，确保平滑过渡：

1. ✅ **基础部署**（1 天）：部署但不启用
2. ✅ **数据迁移**（2 天）：迁移现有提示词
3. ✅ **灰度发布**（7 天）：1% 流量验证
4. ✅ **逐步扩大**（21 天）：逐步切换到 100%
5. ✅ **全量切换**（14 天）：观察稳定性
6. ✅ **清理旧系统**（3 天）：移除旧代码

**关键成功因素：**

- 充分的测试和验证
- 实时监控和告警
- 快速回滚能力
- 团队协作和沟通

**预期收益：**

- 加载时间减少 75%（200ms → 50ms）
- 内存占用减少 70%（100MB → 30MB）
- 维护成本降低 67%（3 步 → 1 步）
- Git 原生版本控制
- 更好的协作体验

祝部署顺利！🚀
