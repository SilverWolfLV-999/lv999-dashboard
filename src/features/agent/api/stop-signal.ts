import { getConnectedRedis } from '@/lib/redis';

/**
 * Agent 生成停止信号（跨实例）。
 *
 * 机制：stop 端点写入 Redis 标志；生成路由在生成期间每 2 秒轮询一次，
 * 命中后 abort 底层生成（真取消），onEnd 按中断路径落库部分内容。
 * 无 Workflows 等持久执行平台时，这是 serverless 多实例下最简单可靠的控制通道。
 */

function stopSignalKey(streamId: string): string {
  return `agent:stop:${streamId}`;
}

/** 标志 TTL：即便生产者实例已消失，标志也会自动过期，避免残留 */
const STOP_SIGNAL_TTL_SECONDS = 300;

const STOP_WATCH_INTERVAL_MS = 2000;

/** stop 端点调用：写入停止标志 */
export async function requestAgentStop(streamId: string): Promise<void> {
  const redis = await getConnectedRedis();
  await redis.set(stopSignalKey(streamId), '1', { EX: STOP_SIGNAL_TTL_SECONDS });
}

/**
 * 生成路由调用：轮询停止标志，命中后触发 onStop 并清理标志。
 * 返回清理函数（生成结束时调用以停止轮询）。
 */
export function watchAgentStop(streamId: string, onStop: () => void): () => void {
  const timer = setInterval(() => {
    void (async () => {
      try {
        const redis = await getConnectedRedis();
        const stopped = await redis.get(stopSignalKey(streamId));
        if (stopped) {
          await redis.del(stopSignalKey(streamId));
          onStop();
        }
      } catch (error) {
        console.error('[agent] stop-signal watch failed:', error);
      }
    })();
  }, STOP_WATCH_INTERVAL_MS);

  return () => clearInterval(timer);
}
