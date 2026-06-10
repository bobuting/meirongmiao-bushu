---
name: database-connection
description: 项目数据库连接方式，必须使用 dotenv.config() 加载 .env
type: reference
---

# 数据库连接方式

**重要：数据库连接信息在 `.env` 文件中，不是本地数据库。**

## 表结构信息
docs/buss/table/project-relation.md
## 连接配置

- **配置文件**: `.env`
- **连接地址**: 环境变量 `DATABASE_URL`

## 脚本中正确使用方式

```javascript
import pg from 'pg';
import dotenv from 'dotenv';

// 必须加载 .env 文件
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
```

## 常见错误

1. **忘记 `dotenv.config()`** - 导致 `DATABASE_URL` 为 undefined，连接本地 localhost:5432 失败
2. **使用 `require` 语法** - 项目是 ES Module，需要用 `import`

## 命令行查询示例

**必须先加载 .env，再访问 process.env.DATABASE_URL**

```bash
# 正确方式：先加载 .env，再查询
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW()').then(r => { console.log(r.rows); pool.end(); });
"
```

**错误方式（会导致连接到错误的数据库）**：
```bash
# 错误：没有加载 .env，DATABASE_URL 可能被 shell 环境污染
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL }); // 错误！
pool.query('SELECT NOW()')...
"
```
