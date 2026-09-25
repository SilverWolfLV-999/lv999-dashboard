import { ApiError } from '@/lib/api-client';
import { INSUFFICIENT_CREDITS_MESSAGE } from '@/features/credits/constants/credits';

/**
 * 画布内 AI 生图 / 改图的失败中文文案（单一来源，AiGenerateDialog 与 AiEditDialog 共用）。
 *
 * - 402：余额不足（复用 Credits 统一文案，两端点均在发起上游调用前拦截）；
 * - `code='generation_failed'`：服务端透传的 GenerationError 中文（审核拒绝 / 上游限流 / 鉴权 /
 *   参数 / 超时），原样展示，不做二次映射（见 lib/api-error.ts 约定）；
 * - 其余 ApiError：按状态码给中文提示（信封 message 为简短英文，不直接展示）；
 * - 非 ApiError：fetch 网络异常 / 连接被中断——生图耗时 10-60s，此路径多为超时。
 */
export function resolveAiImageError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 402) return INSUFFICIENT_CREDITS_MESSAGE;
    if (error.status === 429) return '操作过于频繁，请稍后再试';
    if (error.status === 404) return '源图片不存在或已被删除';
    if (error.status === 413) return '图片体积超过上限，请换一张图再试';
    if (error.status === 400) return '请求参数有误，请调整后重试';
    if (error.code === 'generation_failed' && error.message) return error.message;
    return '图片生成失败，请稍后重试';
  }
  return '生成超时或网络异常，请稍后重试';
}
