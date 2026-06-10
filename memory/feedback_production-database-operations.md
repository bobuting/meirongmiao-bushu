---
name: production-database-operations
description: 正式库操作严格规则：只允许新增，修改需同意，删除绝对禁止
type: feedback
originSessionId: 0f0ce1bb-5547-45a3-b3fd-371713234298
---
正式库操作规则：
- 只允许查询和分析，不主动修改
- INSERT（新增）可以执行
- UPDATE（修改）必须经用户明确同意
- DELETE（删除）绝对不允许

**Why:** 正式库数据不可逆，删除操作无法恢复，修改可能影响线上服务
**How to apply:** 涉及正式库的所有操作，先展示要执行的 SQL，等用户确认后再执行；DELETE 类操作直接拒绝
