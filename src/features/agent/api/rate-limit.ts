import { getConnectedRedis } from '@/lib/redis';

/**
 * 固定窗口限流（复用 Upstash Redis 计数）。
 *
 * 官方部署指南建议对 LLM 调用做限流；个人项目取「低成本、够用」的固定窗口：
 * 每 windowSeconds 一个窗口键（TTL 兜底清理），incr 计数超过 limit 即拒绝。
 *
 * Redis 异常时 fail-open（放行并记录）：避免基础设施抖动阻断正常使用。
 */
export async function checkRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const redis = await getConnectedRedis();
    const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
    const key = `agent:ratelimit:${scope}:${identifier}:${windowId}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds * 2);
    }
    return count <= limit;
  } catch (error) {
    console.error('[agent] rate limit check failed (fail-open):', error);
    return true;
  }
}
