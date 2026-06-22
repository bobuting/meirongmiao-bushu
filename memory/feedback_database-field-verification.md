---
name: database-field-verification
description: 查询数据库前必须验证表结构,禁止凭记忆或猜测写字段名
type: feedback
originSessionId: 7c9493e1-d7bc-481f-8858-7c42b5b1bde9
---
## 规则

**查询数据库前必须验证表结构,禁止凭记忆或猜测写字段名。**

### Why

已发生多次字段不存在的错误:
- `view_type` - `nrm_character_five_views` 表没有此字段
- `deleted_at` - `nrm_final_videos` 表使用 `is_deleted` 而非 `deleted_at`
- `image_url` - `nrm_step3_frame_images` 表没有此字段,应该是 `reference_image_urls`
- `nrm_fission_storyboard_sub` - 表根本不存在

每次错误都导致:
1. 运行时报错,需要重新排查
2. 浪费时间修复
3. 用户需要等待返工

### How to apply

**第一步：查阅文档确认表结构（必须）**

| 需要什么信息 | 查阅文档 |
|------------|---------|
| 表是否存在、有哪些字段、字段类型 | `docs/buss/table/database-schema-full.md` |
| 表之间关系、业务含义、查询示例 | `docs/buss/table/project-relation.md` |

**第二步：运行时验证（文档没有时才用）**

如果文档中没有你需要的信息，再使用 `information_schema` 查询：

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'your_table_name'
ORDER BY ordinal_position;
```

**验证流程:**
1. 列出所有需要查询的表
2. 逐个查询表结构
3. 确认字段名称、数据类型、是否可空
4. 编写查询语句时只使用确认存在的字段

**禁止:**
- 凭记忆写字段名
- 凭"惯例"猜测字段名(如 `deleted_at` vs `is_deleted`)
- 参考其他项目的字段名
- 直接复制粘贴代码而不验证

**工具:**

快速查询命令:
```bash
DATABASE_URL='your_connection_string' node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'table_name'
  ORDER BY ordinal_position
\`).then(r => { console.log(JSON.stringify(r.rows, null, 2)); pool.end(); });
"
```

**示例查询结果:**
```json
[
  {"column_name": "id", "data_type": "text", "is_nullable": "NO"},
  {"column_name": "project_id", "data_type": "text", "is_nullable": "NO"},
  {"column_name": "is_deleted", "data_type": "boolean", "is_nullable": "NO"}
]
```

**记住:** 数据库是唯一真相来源,代码必须匹配实际结构,而不是期望结构。
