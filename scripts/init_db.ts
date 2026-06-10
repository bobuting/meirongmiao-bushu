/**
 * 数据库初始化脚本
 * 1. 创建数据库（如果不存在）
 * 2. 运行建表脚本
 * 3. 初始化基础数据
 *
 * 使用方式：npx tsx scripts/init_db.ts
 */

import { Pool } from "pg";
import { execSync } from "child_process";
import "dotenv/config";

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("错误: DATABASE_URL 未设置");
    process.exit(1);
  }

  // 解析连接字符串
  const url = new URL(connectionString);
  const host = url.hostname;
  const port = url.port || "5432";
  const user = url.username;
  const password = url.password;
  const dbName = url.pathname.slice(1); // 移除开头的 '/'

  console.log("=== 数据库初始化 ===");
  console.log(`主机: ${host}:${port}`);
  console.log(`用户: ${user}`);
  console.log(`目标数据库: ${dbName}\n`);

  // 1. 连接到默认数据库，检查目标数据库是否存在
  const adminPool = new Pool({
    host,
    port: parseInt(port),
    user,
    password,
    database: "postgres",
  });

  try {
    const checkResult = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (checkResult.rows.length > 0) {
      console.log(`✓ 数据库 '${dbName}' 已存在`);
    } else {
      console.log(`正在创建数据库 '${dbName}'...`);
      await adminPool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✓ 数据库 '${dbName}' 创建成功`);
    }

    await adminPool.end();

    // 2. 运行建表脚本
    console.log("\n正在创建数据库表...");
    execSync("npx tsx scripts/create_all_tables.ts", { stdio: "inherit" });

    // 3. 初始化基础数据
    console.log("\n正在初始化基础数据...");
    execSync("npx tsx scripts/init_data.ts", { stdio: "inherit" });

    // 4. 初始化主题
    console.log("\n正在初始化主题...");
    execSync("npx tsx scripts/init_themes.ts", { stdio: "inherit" });

    console.log("\n=== 数据库初始化完成 ===");
    console.log("运行 'npm run dev' 启动应用");

  } catch (error) {
    console.error("\n✗ 初始化失败:");
    console.error(error);
    process.exit(1);
  }
}

main();