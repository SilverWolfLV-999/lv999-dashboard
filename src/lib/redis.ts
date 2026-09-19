import { createClient } from 'redis';

/**
 * Redis 客户端（懒连接单例）。
 *
 * 用途：Agent 停止信号（stop 端点写入、生成路由轮询后 abort）。
 * resumable-stream 自身会基于 REDIS_URL 创建独立的 pub/sub 客户端，不共用这里的连接。
 */

export type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | undefined;
let connectPromise: Promise<unknown> | undefined;

export function getRedisClient(): RedisClient {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error(
        'REDIS_URL is not set. Add your Redis connection string (e.g. Upstash rediss://...) to .env.local.'
      );
    }
    client = createClient({ url });
    client.on('error', (error) => {
      console.error('[redis] connection error:', error);
    });
  }
  return client;
}

/** 并发安全的懒连接：返回就绪的 Redis 客户端 */
export async function getConnectedRedis(): Promise<RedisClient> {
  const redis = getRedisClient();
  if (redis.isReady) return redis;
  connectPromise ??= redis.connect().finally(() => {
    connectPromise = undefined;
  });
  await connectPromise;
  return redis;
}
