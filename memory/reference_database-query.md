# 数据库查询方式

## 连接字符串

使用 `.env` 中的 `DATABASE_URL` 变量：

```bash
source .env && psql "$DATABASE_URL" -c "SQL语句"
```

## 示例

```bash
# 查询表行数
source .env && psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM nrm_shot_breakdown;"

# 查询数据
source .env && psql "$DATABASE_URL" -c "SELECT * FROM nrm_shot_breakdown LIMIT 10;"
```

## 注意事项

- `.env` 中只有 `DATABASE_URL`，没有 `DB_HOST`、`DB_USER` 等独立变量
- 不要使用 `psql -h $DB_HOST -U $DB_USER ...` 这种方式
