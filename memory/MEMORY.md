# Memory Index

- [server-file-safety](feedback_server-file-safety.md) — 服务器文件删除必须先备份
- [model-management优化讨论](project_model-management-optimization.md) — 大模型管理界面三层整合方案讨论记录
- [database-connection](reference_database-connection.md) — 数据库连接方式，必须使用 dotenv.config() 加载 .env
- [database-query](reference_database-query.md) — 数据库查询命令，使用 psql "$DATABASE_URL"
- [database-comparison-key](reference_database-comparison-key.md) — nrm_provider_policies 比较用 route_key 作为唯一标识
- [中文输出](user_chinese_output.md) — 所有思考展示使用中文
- [deletion-confirmation](feedback_deletion-confirmation.md) — 删除操作必须逐表确认，不能自动判断范围
- [deletion-confirmation-extended](feedback_deletion-confirmation-extended.md) — 数据库 DELETE/UPDATE 前必须让用户确认
- [database-field-verification](feedback_database-field-verification.md) — 查询数据库前必须验证表结构,禁止凭记忆写字段名
- [simple-question-fast-answer](feedback_simple-question-fast-answer.md) — 简单问题快速回答，不要过度搜索
- [production-database-operations](feedback_production-database-operations.md) — 正式库只允许新增，修改需同意，删除绝对禁止
