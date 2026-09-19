import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Add your PostgreSQL connection string to .env.local (see env.example.txt).'
    );
  }
  // 阿里云 RDS PostgreSQL Serverless 不支持 SSL（实测 SSLRequest 应答 N）：
  // ssl: 'prefer' 在服务端不支持时自动回退明文连接，支持时自动启用 TLS。
  const client = postgres(connectionString, {
    ssl: 'prefer',
    max: 3, // 每个 Serverless 函数实例内维持小连接池
    idle_timeout: 20 // 空闲连接及时释放，避免长时间占用阻碍实例自动暂停
  });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

let db: Database | undefined;

/**
 * 懒加载数据库客户端：仅在真正访问数据库时校验 env，
 * 保证无 DATABASE_URL 时构建与无关页面不受影响。
 */
export function getDb(): Database {
  if (!db) {
    db = createDb();
  }
  return db;
}
