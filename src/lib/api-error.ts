/**
 * API 错误响应统一信封（Server 侧）。
 *
 * 约定：所有 Route Handler 的可预期错误一律通过 `apiError()` 返回
 * `{ error: { code, message } }` JSON —— `code` 供客户端程序化判断
 * （客户端封装为 `ApiError.code`），`message` 为简短英文描述，
 * 面向用户的中文文案由客户端决定。
 */

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_json'
  | 'invalid_request'
  | 'not_found'
  | 'payload_too_large'
  | 'too_many_requests'
  | 'insufficient_credits'
  | 'not_implemented';

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  headers?: HeadersInit
): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}
