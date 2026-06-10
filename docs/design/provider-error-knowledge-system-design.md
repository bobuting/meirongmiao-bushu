# Provider 错误知识库系统设计方案

**文档状态**: 设计阶段（待实现）  
**创建日期**: 2026-05-20  
**最后更新**: 2026-05-20

---

## 一、背景与目标

### 问题现状

在图片生成流程中，经常遇到 Provider 返回各类错误（如阿里云万相 API 的 `DataInspectionFailed` 内容审核错误）。每次遇到错误都需要临时决策：
- 是否切换其他 Provider？
- 是否修改提示词重试？
- 是否直接终止返回错误？

这种临时决策模式存在以下问题：
1. **响应效率低**：每次都需要人工分析错误原因
2. **策略不统一**：不同场景可能采取不同处理方式
3. **无法积累经验**：成功的处理策略没有被系统记录
4. **重复劳动**：相同错误反复出现，每次都要重新决策

### 目标

建立一个 **Provider 错误知识库系统**，实现：

1. **自动识别**：根据错误码 + Provider 类型自动匹配已知错误
2. **预设策略**：每种错误有预设的处理策略（switch_provider/modify_prompt/retry/abort）
3. **自动执行**：系统自动执行策略并重试，无需人工干预
4. **经验积累**：成功率统计指导策略优化，新错误可添加到知识库

---

## 二、核心概念

### 错误识别三元组

```
(Provider类型, 错误码, 错误消息) → 错误知识
```

示例：
```
(wanx-image-bailian, DataInspectionFailed, "Input data may contain inappropriate content")
→ 错误类别: content_audit
→ 处理策略: modify_prompt
→ 配置参数: { keywordsToRemove: ["age: 12", "儿童"] }
```

### 处理策略枚举

| 策略 | 适用场景 | 实现逻辑 |
|------|---------|---------|
| `switch_provider` | Provider固有缺陷 | 切换到备选 Provider |
| `modify_prompt` | 内容审核拦截 | 移除敏感词/添加安全前缀，原 Provider 重试 |
| `retry` | 暂时性错误（过载/网络） | 原 Provider 重试（可配置次数和延迟） |
| `abort` | 无法恢复错误 | 直接返回错误给用户 |
| `fallback_default` | 非关键功能 | 返回预设默认值 |

---

## 三、数据存储方案

### 存储方式选择

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| PostgreSQL 表 | 动态更新、支持统计、管理员可配置 | 需数据库连接 | ✅ 推荐 |
| JSON 配置文件 | 简单、无数据库依赖 | 需重启更新 | ❌ 不适合 |
| Skills 提示词系统 | Git 版本控制 | 不适合配置型数据 | ❌ 不适合 |

**推荐**: PostgreSQL 数据库表（与现有 Provider 策略、审美特征库一致）

### 表结构设计

```sql
CREATE TABLE nrm_provider_error_knowledge (
  id SERIAL PRIMARY KEY,
  
  -- 错误识别
  provider_call_mode VARCHAR(100) NOT NULL,  -- Provider类型（如 wanx-image-bailian）
  error_code VARCHAR(200) NOT NULL,          -- 错误码（如 DataInspectionFailed）
  error_pattern TEXT,                        -- 错误消息正则（可选，精确匹配）
  
  -- 错误分类
  error_category VARCHAR(50) NOT NULL,       -- 类别：content_audit/overload/invalid_input/...
  error_severity VARCHAR(20) NOT NULL,       -- 严重级别：critical/error/warn
  
  -- 处理策略
  handling_strategy VARCHAR(50) NOT NULL,    -- 策略：switch_provider/modify_prompt/...
  strategy_config JSONB DEFAULT '{}',        -- 策略参数（JSON格式）
  
  -- 元数据
  description TEXT,                          -- 错误说明（来源、原因）
  solution_guide TEXT,                       -- 解决方案指导
  success_rate DECIMAL(5,2) DEFAULT 0.00,    -- 成功率统计（动态更新）
  
  -- 管理字段
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(provider_call_mode, error_code)     -- 同 Provider + 错误码唯一
);
```

### 索引设计

```sql
-- 主查询索引：Provider + 错误码
CREATE INDEX idx_error_knowledge_lookup ON nrm_provider_error_knowledge(provider_call_mode, error_code) WHERE enabled = true;

-- 统计分析索引：按类别统计
CREATE INDEX idx_error_knowledge_category ON nrm_provider_error_knowledge(error_category);

-- 成功率排序索引：策略优化参考
CREATE INDEX idx_error_knowledge_success_rate ON nrm_provider_error_knowledge(success_rate DESC);
```

---

## 四、错误分类体系

### 错误类别定义

| 类别 | 说明 | 典型错误码 | Provider 示例 | 默认策略 |
|------|------|-----------|--------------|---------|
| `content_audit` | 内容审核拦截 | DataInspectionFailed | WanX (阿里云) | modify_prompt |
| `overload` | Provider过载 | RateLimitExceeded, TooManyRequests | 所有 Provider | retry |
| `invalid_input` | 输入参数错误 | InvalidParameter, InvalidFormat | 所有 Provider | abort |
| `network` | 网络连接问题 | ConnectionError, Timeout | 所有 Provider | retry |
| `authentication` | 认证失败 | Unauthorized, InvalidApiKey | 所有 Provider | abort |
| `unknown` | 未分类错误 | 其他 | 所有 Provider | abort |

### 已知错误案例

#### 案例 1：万相 DataInspectionFailed（阿里云绿网拦截）

**错误详情**:
- Provider: `wanx-image-bailian`
- 错误码: `DataInspectionFailed`
- 错误消息: `"Input data may contain inappropriate content"`
- 来源: 阿里云 DashScope API 文档（https://help.aliyun.com/zh/model-studio/error-code）

**触发原因**:
- 提示词包含敏感关键词（如 `age: 12`、`儿童`、`child`、`female`）
- 阿里云绿网审核机制严格，儿童相关内容触发拦截

**处理策略**: `modify_prompt`

**策略配置**:
```json
{
  "promptModification": {
    "keywordsToRemove": ["age: 12", "儿童", "child", "female", "gender"],
    "safePrefix": "Generate a photorealistic fashion model with youthful proportions",
    "sensitiveWordReplacements": {
      "age: 12": "youthful model",
      "儿童": "teenager",
      "child": "young model"
    }
  },
  "maxRetries": 1
}
```

**备选策略**: `switch_provider`（切换到 Gemini 或 Seedreak）

---

## 五、策略配置规范

### modify_prompt 策略配置

```typescript
interface ModifyPromptStrategyConfig {
  promptModification: {
    // 移除敏感关键词列表
    keywordsToRemove?: string[];
    
    // 敏感词替换规则（关键词 → 安全词）
    sensitiveWordReplacements?: Record<string, string>;
    
    // 添加安全前缀（放在提示词开头）
    safePrefix?: string;
    
    // 添加安全后缀（放在提示词结尾）
    safeSuffix?: string;
  };
  
  // 最大重试次数（修改后）
  maxRetries?: number;  // 默认 1
}
```

### switch_provider 策略配置

```typescript
interface SwitchProviderStrategyConfig {
  // 目标 Provider ID 列表（优先级排序）
  targetProviderIds?: string[];
  
  // 或按 Provider 类型切换（更灵活）
  targetCallModes?: string[];  // 如 ["gemini-image", "seedreak-image-ark"]
  
  // 是否保存原始 Provider 到 fallback 队列
  keepOriginalAsFallback?: boolean;
}
```

### retry 策略配置

```typescript
interface RetryStrategyConfig {
  retryConfig: {
    // 最大重试次数
    maxRetries?: number;  // 默认 3
    
    // 重试间隔（毫秒）
    retryDelayMs?: number;  // 默认 2000
    
    // 是否指数退避（每次延迟加倍）
    exponentialBackoff?: boolean;  // 默认 true
    
    // 最大延迟上限（毫秒）
    maxDelayMs?: number;  // 默认 10000
  };
}
```

---

## 六、系统架构

### 组件关系图

```
┌─────────────────────────────────────────────────────┐
│         图片生成流程                                  │
│  requestLlmImageGenerationUrls()                     │
└─────────────────────┬───────────────────────────────┘
                      │
                      │ Provider调用失败
                      ▼
┌─────────────────────────────────────────────────────┐
│   错误识别层                                         │
│   ProviderErrorRecognizer                            │
│   - extractErrorCode(response)                       │
│   - extractErrorMessage(response)                    │
└─────────────────────┬───────────────────────────────┘
                      │
                      │ errorCode + providerCallMode
                      ▼
┌─────────────────────────────────────────────────────┐
│   知识库查询层                                       │
│   ProviderErrorKnowledgeService                      │
│   - findByError(errorCode, providerCallMode)        │
│   - 返回 ProviderErrorKnowledge 或 null              │
└─────────────────────┬───────────────────────────────┘
                      │
                      │ 有匹配策略？
                      ▼
          ┌───────────┴───────────┐
          │ YES                   │ NO
          ▼                       ▼
┌─────────────────────┐  ┌─────────────────────┐
│  策略执行层         │  │  默认处理           │
│  ErrorStrategyExecutor│  │  - 记录错误        │
│  - executeModifyPrompt│  │  - 返回原始错误    │
│  - executeSwitchProvider│  │                     │
│  - executeRetry       │  └─────────────────────┘
└──────────┬──────────┘
           │
           │ 处理后重试？
           ▼
┌─────────────────────────────────────────────────────┐
│   重新调用 Provider                                  │
│   - 使用修改后的prompt                               │
│   - 或使用新的Provider                               │
└─────────────────────────────────────────────────────┘
```

### 关键组件清单

#### 1. ProviderErrorKnowledgeService（知识库服务）

**职责**:
- 查询错误处理策略
- 更新成功率统计
- 管理知识库 CRUD

**核心方法**:
```typescript
class ProviderErrorKnowledgeService {
  // 查询错误处理策略（主方法）
  async findByError(
    errorCode: string, 
    providerCallMode: string
  ): Promise<ProviderErrorKnowledge | null>;
  
  // 更新成功率统计（调用后执行）
  async updateSuccessRate(
    knowledgeId: number, 
    success: boolean
  ): Promise<void>;
  
  // 批量查询（管理接口）
  async findAll(options: QueryOptions): Promise<ProviderErrorKnowledge[]>;
  
  // 创建新知识（管理接口）
  async create(knowledge: ProviderErrorKnowledgeInput): Promise<number>;
  
  // 启用/禁用（管理接口）
  async setEnabled(id: number, enabled: boolean): Promise<void>;
}
```

#### 2. ErrorStrategyExecutor（策略执行器）

**职责**:
- 执行具体处理策略
- 返回处理结果和重试参数

**核心方法**:
```typescript
class ErrorStrategyExecutor {
  // 执行处理策略（主方法）
  async execute(
    strategy: ProviderHandlingStrategy,
    config: ProviderStrategyConfig,
    context: ProviderErrorContext
  ): Promise<ProviderHandlingResult>;
  
  // 具体策略实现（私有）
  private async executeModifyPrompt(context): Promise<ModifyPromptResult>;
  private async executeSwitchProvider(context): Promise<SwitchProviderResult>;
  private async executeRetry(context): Promise<RetryResult>;
  private async executeAbort(context): Promise<void>;
  private async executeFallbackDefault(context): Promise<FallbackResult>;
}
```

#### 3. ProviderErrorRecognizer（错误识别器）

**职责**:
- 从 Provider 响应中提取错误码
- 从响应中提取错误消息

**核心方法**:
```typescript
class ProviderErrorRecognizer {
  // 提取错误码（统一接口）
  extractErrorCode(response: unknown): string;
  
  // 提取错误消息（统一接口）
  extractErrorMessage(response: unknown): string;
  
  // 判断是否为 Provider 错误（而非网络/系统错误）
  isProviderError(error: Error): boolean;
}
```

---

## 七、集成流程

### 现有错误处理位置

**文件**: `src/services/media/image-generation-providers.ts`

**当前处理**:
```typescript
// 现有代码（line 1021-1038）
catch (error) {
  const errorCode = error instanceof AppError ? error.code : "IMAGE_PROVIDER_ERROR";
  const errorMessage = error instanceof Error ? error.message : String(error);

  // 记录错误日志
  const log = getLogger("image-generation");
  log.error({
    callMode,
    providerModel: provider.model,
    endpoint: request.endpoint,
    requestBody: request.body,
    errorCode,
    errorMessage,
  }, "[ImageGeneration] 图片生成失败");

  finalizeImageDebugError(options?.debugOptions, debugRecord, provider, errorCode, errorMessage, request.endpoint, request.body);
  throw error;  // 直接抛出错误，无重试
}
```

### 集成方案

**修改后的流程**:
```typescript
catch (error) {
  const errorCode = extractProviderErrorCode(error, data);
  const errorMessage = extractProviderErrorMessage(error, data);

  // 1. 查询知识库
  const knowledge = await errorKnowledgeService.findByError(errorCode, provider.callMode);

  // 2. 如果有预设策略且不是 abort
  if (knowledge && knowledge.handlingStrategy !== 'abort') {
    try {
      // 3. 执行策略
      const result = await strategyExecutor.execute(
        knowledge.handlingStrategy,
        knowledge.strategyConfig,
        { errorCode, errorMessage, provider, requestParams: options }
      );

      // 4. 记录策略执行（用于成功率统计）
      const strategyStartTime = Date.now();

      // 5. 根据策略结果重试
      if (result.shouldRetry) {
        const retryResult = await requestLlmImageGenerationUrls(
          result.targetProvider || provider,
          result.modifiedPrompt || prompt,
          { ...options, images: result.modifiedImages }
        );

        // 6. 更新成功率统计
        await errorKnowledgeService.updateSuccessRate(knowledge.id, true);

        return retryResult;
      }
    } catch (strategyError) {
      // 策略执行失败，更新成功率并返回原始错误
      await errorKnowledgeService.updateSuccessRate(knowledge.id, false);
      // 继续抛出原始错误
    }
  }

  // 7. 无策略或策略失败：返回原始错误
  finalizeImageDebugError(...);
  throw error;
}
```

---

## 八、优缺点分析

### 优点

1. **自动化处理**: 已知错误自动执行预设策略，无需人工干预
2. **经验积累**: 成功率统计指导策略优化，避免重复决策
3. **管理员可控**: 通过数据库表配置，无需改代码
4. **渐进式完善**: 遇到新错误时可添加到知识库，逐步覆盖更多场景
5. **统一策略**: 相同错误始终采取相同处理方式，结果可预测

### 缺点

1. **增加复杂度**: 新增数据库表、服务层、策略执行器
2. **启动依赖**: 需要加载知识库缓存（可优化为懒加载）
3. **策略冲突风险**: modify_prompt 可能改变业务语义
4. **维护成本**: 需要持续更新知识库（但比每次临时决策成本低）

### 风险缓解措施

1. **策略审核机制**: 管理员添加策略需先测试验证
2. **成功率阈值**: 成功率 < 30% 的策略自动禁用（需人工审查）
3. **回退机制**: 策略执行失败时返回原始错误，不影响用户体验
4. **审计日志**: 所有策略执行记录到日志，方便排查问题

---

## 九、实现优先级

### Phase 1: MVP（最小可用版本）

**目标**: 建立基础框架，处理万相 DataInspectionFailed

**任务清单**:
1. 创建数据库表 `nrm_provider_error_knowledge`
2. 实现 `ProviderErrorKnowledgeService`（基础查询 + CRUD）
3. 实现 `ErrorStrategyExecutor`（仅 modify_prompt 策略）
4. 集成到 `image-generation-providers.ts`
5. 添加初始知识：万相 DataInspectionFailed → modify_prompt

**预计工作量**: 2-3 天

### Phase 2: 扩展支持

**目标**: 支持更多策略和错误类型

**任务清单**:
1. 实现 `switch_provider` 策略
2. 实现 `retry` 策略
3. 添加更多已知错误（Gemini、Seedreak 错误码）
4. 实现成功率自动更新机制
5. 管理界面（可选）

**预计工作量**: 1-2 天

### Phase 3: 优化完善

**目标**: 提升系统稳定性和易用性

**任务清单**:
1. 知识库缓存机制（减少数据库查询）
2. 成功率阈值自动禁用
3. 策略执行审计日志
4. 管理员界面（Web UI）
5. 错误统计报表

**预计工作量**: 2-3 天

---

## 十、参考资源

### 相关文档

- 阿里云 DashScope API 错误码文档: https://help.aliyun.com/zh/model-studio/error-code
- 云雾 API 文档: `docs/云雾llms.txt`
- Provider 路由策略: `docs/provider-route-keys-and-call-modes.md`

### 现有代码参考

- Provider 策略配置: `src/contracts/provider-route-policy-contract.ts`
- 错误日志服务: `src/services/error-log/error-log-service.ts`
- Provider 错误提取: `src/services/media/provider-response-extractors.ts`
- 审美特征库服务: `src/services/aesthetic-library-service.ts`（知识库模式参考）

---

## 十一、待讨论事项

1. **策略冲突处理**: 当 modify_prompt 和 switch_provider 都适用时，如何选择？
2. **成功率统计周期**: 多长时间更新一次成功率？
3. **知识库缓存策略**: 启动时全量加载还是按需查询？
4. **管理界面需求**: 是否需要 Web UI 管理知识库？
5. **跨 Provider 策略**: 同一错误码在不同 Provider 是否有不同策略？

---

**文档结束**

> 后期优化方向：
> - 添加更多已知错误案例
> - 实现智能策略选择（基于成功率自动推荐最佳策略）
> - 支持错误趋势分析报表
> - 集成到其他 Provider 调用流程（LLM 文本生成、视频生成等）