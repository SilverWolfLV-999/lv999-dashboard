import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Add your Neon connection string to .env.local (see env.example.txt).'
    );
  }
  return drizzle(neon(connectionString), { schema });
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
