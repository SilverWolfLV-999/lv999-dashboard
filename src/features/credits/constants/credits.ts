/**
 * Credits 系统共享常量（server + client 均可安全引用，不含 server-only 依赖）。
 */

/**
 * Credits 余额不足的统一用户文案。
 * - 服务端：计费入口工具（图片/视频）以此中文消息抛出，由对话内工具输出展示；
 * - 客户端：Route Handler 返回 402 + code='insufficient_credits'，前端映射为此文案。
 */
export const INSUFFICIENT_CREDITS_MESSAGE = 'Credits 余额不足，请联系管理员发放。';

/** Route Handler 错误信封的英文 message（约定：message 简短英文，中文文案由客户端决定） */
export const INSUFFICIENT_CREDITS_API_MESSAGE = 'Insufficient credits';
