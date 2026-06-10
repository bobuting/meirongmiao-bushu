# 提示词系统完全迁移方案

## 迁移状态

**状态**: 🎉 迁移完成（阶段 1-5）  
**完成时间**: 2024-04-21  
**待完成**: 阶段 6 测试验证

### 已完成工作

1. ✅ **阶段 1**: 数据导出 - 使用本地 docs/prompts/ 备份（70 个提示词文件）
2. ✅ **阶段 2**: 创建 Skills 文件 - 70 个 Skill 全部创建完成
3. ✅ **阶段 3**: 修改代码调用 - 删除所有旧系统导入和调用
4. ✅ **阶段 4**: 删除旧系统代码 - 删除 6 个核心文件
5. ✅ **阶段 5**: 删除数据库表 - nrm_prompt_templates 和 nrm_prompt_versions 已删除

### 已删除的文件

- `src/modules/prompt/prompt-service.ts`
- `src/modules/prompt/handlebars-renderer.ts`
- `src/modules/prompt/local-prompt-loader.ts`
- `src/routes/prompt-routes.ts`
- `src/persistence/prompt-persistence.ts`
- `src/service/llm/prompt-admin-handlers.ts`

### 已修改的文件

- `src/modules/prompt/prompt-helper.ts` - 重构为 Skills 系统调用入口
- `src/app-setup/setup-core.ts` - 删除 PromptService 导入
- `src/app-setup/setup-routes.ts` - 删除 prompt-routes 和 prompt-evolution-routes
- `src/routes/api-registration.ts` - 删除 registerPromptRoutes 调用

### 已删除的数据库表

- `nrm_prompt_templates` - 旧提示词模板表
- `nrm_prompt_versions` - 旧提示词版本历史表

### 保留的表（其他用途）

- `nrm_prompt_call_logs` - 提示词调用日志
- `nrm_prompt_evolution_proposals` - 提示词演化提案
- `nrm_prompt_version_metrics` - 提示词版本指标
- `nrm_shot_prompts` - 分镜专业提示词
- `nrm_step_prompt` - 步骤提示词

---

## 迁移目标

将旧的提示词系统（数据库 + PromptBuilder）完全迁移到新的 Skills 系统（文件化管理），并删除所有旧系统代码和数据库表。

## 当前情况分析

### 旧系统特征
- **数据库表**: `nrm_prompt_templates`, `nrm_prompt_versions`
- **核心代码**: 
  - `src/modules/prompt/prompt-service.ts` - 数据库 CRUD
  - `src/modules/prompt/prompt-helper.ts` - 统一获取接口
  - `src/modules/prompt/handlebars-renderer.ts` - Handlebars 渲染
- **使用文件**: 42 个文件使用 `buildPrompt`/`PromptBuilder` 模式
- **提示词管理**: 通过数据库存储，支持版本控制

### 新系统特征
- **存储方式**: 文件化管理（`skills/` 目录）
- **核心代码**:
  - `src/services/skills/skill-loader.ts` - 文件加载
  - `src/services/skills/version-manager.ts` - 版本管理
  - `src/routes/admin/skills-crud-routes.ts` - CRUD API
- **管理界面**: `apps/web/pages/admin/SkillsManagementPanel.tsx`
- **优势**: 版本控制、灰度发布、统一管理

## 迁移计划

### 阶段 1：数据导出与分析（1-2小时）

#### 1.1 导出数据库中的所有提示词
```sql
-- 导出所有已发布的提示词模板
SELECT 
  code,
  name,
  type,
  content,
  current_version,
  status,
  variables_schema
FROM nrm_prompt_templates
WHERE status = 'published'
ORDER BY code;

-- 导出版本历史
SELECT 
  template_id,
  version,
  content,
  change_log,
  created_at
FROM nrm_prompt_versions
ORDER BY template_id, version;
```

#### 1.2 分析提示词使用情况
统计每个提示词的调用位置和频率：
```bash
# 统计每个提示词的使用次数
grep -r "getPromptContent\|buildPrompt" --include="*.ts" -h | \
  grep -oP '(?<=["'\''])[a-z0-9_-]+(?=["'\''])' | \
  sort | uniq -c | sort -rn
```

### 阶段 2：创建 Skills 文件（2-3小时）

#### 2.1 批量创建 Skills 目录结构
为每个提示词创建对应的 Skill 文件：
```
skills/
├── step1-outfit-analysis/
│   ├── SKILL.md
│   ├── system.md
│   └── user.md
├── step2-character-makeup/
│   ├── SKILL.md
│   ├── system.md
│   └── user.md
├── step3-script-generation/
│   ├── SKILL.md
│   ├── system.md
│   └── user.md
...
```

#### 2.2 转换提示词格式
- 将数据库中的 `content` 字段拆分为 `system.md` 和 `user.md`
- 将 `variables_schema` 转换为 `inputSchema` 字段
- 保留版本历史信息

#### 2.3 创建迁移脚本
```typescript
// scripts/migrate-prompts-to-skills.ts
import { Pool } from 'pg';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function migratePromptsToSkills() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  // 1. 查询所有提示词
  const result = await pool.query(`
    SELECT * FROM nrm_prompt_templates 
    WHERE status = 'published'
  `);
  
  // 2. 为每个提示词创建 Skill 文件
  for (const row of result.rows) {
    const skillDir = join('skills', row.code);
    mkdirSync(skillDir, { recursive: true });
    
    // 创建 SKILL.md
    const skillMd = `---
code: ${row.code}
name: ${row.name}
description: ${row.description || ''}
category: ${row.type}
tags: []
version: ${row.current_version}
author: system
defaultVariant: default
---

# ${row.name}

${row.description || ''}
`;
    writeFileSync(join(skillDir, 'SKILL.md'), skillMd);
    
    // 拆分 system 和 user 提示词
    const { systemPrompt, userPrompt } = parsePromptContent(row.content);
    writeFileSync(join(skillDir, 'system.md'), systemPrompt);
    writeFileSync(join(skillDir, 'user.md'), userPrompt);
  }
  
  await pool.end();
}
```

### 阶段 3：修改代码调用方式（3-4小时）

#### 3.1 替换调用方式
将所有 `buildPrompt()` 调用替换为 Skills API：

**旧代码：**
```typescript
import { buildPrompt } from '../modules/prompt/prompt-helper.js';

const { systemPrompt, userPrompt } = await buildPrompt('step3-script-generation', {
  variables: { characterInfo, sceneDescription },
  userPrompt: '生成5条脚本'
});
```

**新代码：**
```typescript
import { getPromptContent } from '../modules/prompt/prompt-helper.js';

const result = await getPromptContent('step3-script-generation', {
  characterInfo,
  sceneDescription,
  userPrompt: '生成5条脚本'
});
const { systemPrompt, userPrompt } = result;
```

#### 3.2 批量替换脚本
```bash
# 查找所有使用 buildPrompt 的文件
grep -rl "buildPrompt" --include="*.ts" src/

# 使用 sed 批量替换（需要人工审查）
find src/ -name "*.ts" -exec sed -i '' 's/buildPrompt/getPromptContent/g' {} \;
```

#### 3.3 需要修改的文件列表（42个）
```
./src/modules/character-view-session.ts
./src/modules/step1-role-direction-task.ts
./src/modules/hot-trend/shared/llm-request.ts
./src/modules/hot-trend/shared/prompt-context.ts
./src/modules/character-five-view-generation-service.ts
./src/modules/single-image-outfit-analysis.ts
./src/modules/step1-optimized-prompt-builder.ts
./src/modules/video-step/step3/shot-prompt-engineer-service.ts
./src/modules/video-step/step3/script-generation-prompt.ts
./src/modules/video-step/step3/character-analysis-prompt.ts
./src/modules/video-step/step3/hotspot-analysis-prompt.ts
./src/modules/video-step/step3-fashion-script/prompt.ts
./src/modules/video-step/step3-fashion-script/concept-generator.ts
./src/modules/video-step/step3-library-script/library-rewriter.ts
./src/modules/video-step/step3-custom-script/prompt.ts
./src/modules/video-step/step3-custom-script/concept-generator.ts
./src/modules/video-step/step3-video-script/script-rewriter.ts
./src/modules/portrait-check.ts
./src/modules/outfit-analysis-helpers.ts
./src/modules/image-garment-analysis.ts
./src/modules/video-hot-trend/prompt.ts
./src/modules/step1-image-classification.ts
./src/modules/section-planning-service.ts
./src/modules/fission-video/fission-story-generator.ts
./src/modules/video-reverse-core/unified-reverse-core.ts
./src/modules/script-effectiveness/generator.ts
./src/modules/video-reverse-analysis-service.ts
./src/routes/image-project/step3-handlers.ts
./src/routes/library-routes.ts
./src/routes/admin/capability-lab-routes.ts
./src/routes/admin/provider-routes.ts
./src/routes/garment-asset-routes.ts
./src/routes/step4-storyboard/index.ts
./src/routes/step2-character/index.ts
./src/services/llm/llm-transport.ts
./src/services/llm-prompt-rewrite.ts
```

### 阶段 4：删除旧系统代码（1小时）

#### 4.1 删除旧提示词系统文件
```bash
# 删除旧系统核心文件
rm -f src/modules/prompt/prompt-service.ts
rm -f src/modules/prompt/handlebars-renderer.ts
rm -f src/modules/prompt/local-prompt-loader.ts
rm -f src/persistence/prompt-persistence.ts

# 删除旧系统路由
rm -f src/routes/admin/prompt-routes.ts

# 删除旧系统前端页面
rm -f apps/web/pages/admin/PromptManagementPanel.tsx
```

#### 4.2 保留的文件（需要重构）
- `src/modules/prompt/prompt-helper.ts` - 保留作为统一入口，内部调用 Skills 系统
- `src/modules/prompt/skills-integration.ts` - 保留灰度逻辑

#### 4.3 更新 prompt-helper.ts
```typescript
// 删除数据库相关代码，只保留 Skills 调用
export async function getPromptContent(
  code: string,
  variables: Record<string, unknown> = {},
): Promise<PromptResult> {
  // 直接调用 Skills 系统
  return await getPromptFromSkills(code, variables);
}

// 删除 getPromptContentFromDatabase 函数
// 删除 PromptService 相关代码
```

### 阶段 5：删除数据库表（30分钟）

#### 5.1 备份数据
```sql
-- 备份旧表数据（以防万一）
CREATE TABLE nrm_prompt_templates_backup_20260421 AS 
SELECT * FROM nrm_prompt_templates;

CREATE TABLE nrm_prompt_versions_backup_20260421 AS 
SELECT * FROM nrm_prompt_versions;
```

#### 5.2 删除表
```sql
-- 删除提示词版本表
DROP TABLE IF EXISTS nrm_prompt_versions CASCADE;

-- 删除提示词模板表
DROP TABLE IF EXISTS nrm_prompt_templates CASCADE;

-- 删除相关索引（如果有）
DROP INDEX IF EXISTS idx_prompt_templates_code;
DROP INDEX IF EXISTS idx_prompt_templates_status;
DROP INDEX IF EXISTS idx_prompt_versions_template_id;
```

### 阶段 6：测试验证（2-3小时）

#### 6.1 单元测试
- 测试每个 Skill 文件是否能正确加载
- 测试变量替换是否正确
- 测试版本管理功能

#### 6.2 集成测试
- 测试 6 步工作流的每一步
- 测试图片项目 4 步流水线
- 测试热点分析功能

#### 6.3 回归测试
- 运行完整的 E2E 测试套件
- 验证所有 API 接口正常工作
- 检查前端页面无报错

## 风险评估与应对

### 风险 1：提示词格式不兼容
**风险等级**: 高
**应对措施**: 
- 创建格式转换工具
- 逐个验证转换结果
- 保留旧数据备份

### 风险 2：代码调用方式变更导致功能异常
**风险等级**: 中
**应对措施**:
- 分批修改，每批修改后立即测试
- 保留 Git 提交历史，便于回滚
- 使用 TypeScript 类型检查捕获错误

### 风险 3：性能下降
**风险等级**: 低
**应对措施**:
- Skills 系统已有缓存机制
- 监控 API 响应时间
- 必要时优化文件读取逻辑

## 时间估算

| 阶段 | 预计时间 | 说明 |
|------|---------|------|
| 数据导出与分析 | 1-2小时 | 导出数据库，分析使用情况 |
| 创建 Skills 文件 | 2-3小时 | 批量创建文件，转换格式 |
| 修改代码调用 | 3-4小时 | 修改 42 个文件的调用方式 |
| 删除旧系统代码 | 1小时 | 删除文件，清理代码 |
| 删除数据库表 | 30分钟 | 备份并删除表 |
| 测试验证 | 2-3小时 | 单元测试、集成测试、回归测试 |
| **总计** | **10-14小时** | 约 2 个工作日 |

## 执行顺序

1. ✅ **创建迁移计划文档**
2. ✅ **导出数据库提示词** - 使用本地 docs/prompts/ 备份
3. ✅ **创建迁移脚本** - scripts/migrate-prompts-to-skills.ts
4. ✅ **执行迁移脚本** - 批量创建 70 个 Skills 文件
5. ✅ **修改代码调用** - 删除所有旧系统导入和调用
6. ✅ **删除旧系统代码** - 删除 6 个核心文件
7. ✅ **删除数据库表** - 已删除 nrm_prompt_templates 和 nrm_prompt_versions
8. 🔄 **完整测试验证** - 需要启动服务并测试所有功能

## 回滚方案

如果迁移失败，可以快速回滚：

1. **恢复数据库表**
```sql
-- 从备份恢复
CREATE TABLE nrm_prompt_templates AS 
SELECT * FROM nrm_prompt_templates_backup_20260421;

CREATE TABLE nrm_prompt_versions AS 
SELECT * FROM nrm_prompt_versions_backup_20260421;
```

2. **恢复代码**
```bash
# 使用 Git 回滚
git revert <commit-hash>
```

3. **重启服务**
```bash
npm run dev
```

## 成功标准

- ✅ 所有 42 个文件的提示词调用已迁移到 Skills 系统
- ✅ 旧系统代码已完全删除
- ✅ 数据库表已删除
- ✅ 所有单元测试通过
- ✅ 所有集成测试通过
- ✅ 6 步工作流功能正常
- ✅ 图片项目 4 步流水线功能正常
- ✅ 前端管理界面正常工作
- ✅ 无性能下降

## 后续优化

迁移完成后的优化方向：

1. **性能优化**
   - 优化 Skills 文件加载缓存
   - 减少文件 I/O 操作

2. **功能增强**
   - 完善版本管理功能
   - 增加灰度发布策略

3. **开发体验**
   - 提供 CLI 工具快速创建 Skill
   - 增加提示词语法检查

4. **监控告警**
   - 监控提示词调用失败率
   - 记录提示词使用统计
