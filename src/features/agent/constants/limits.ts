/**
 * Agent 模块请求体上限（chat 与 stop 端点共用）。
 * Vercel 函数请求体上限为 4.5MB，这里留出余量。
 */
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
