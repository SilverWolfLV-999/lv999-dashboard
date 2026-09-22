const BASE_URL = '/api';

/**
 * API 层错误：携带 HTTP 状态码与服务端错误码。
 * 错误信封约定见 `src/lib/api-error.ts`：`{ error: { code, message } }`。
 */
export class ApiError extends Error {
  readonly status: number;
  /** 服务端错误码（如 'not_found'）；响应非 JSON 信封（网关错误页等）时为 undefined */
  readonly code?: string;

  constructor(status: number, statusText: string, error?: { code?: string; message?: string }) {
    super(error?.message ?? `API error: ${status} ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = error?.code;
  }
}

/** 解析错误信封；非 JSON 响应时回退为空对象，由状态文本兜底 */
async function parseErrorBody(res: Response): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return body.error ?? {};
  } catch {
    return {};
  }
}

export async function apiClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  // FormData 不能手动设 Content-Type：交给浏览器自动带 multipart boundary，
  // 否则服务端 formData() 解析失败；其余请求保持默认 JSON 头并与调用方 headers 合并
  const isFormData = options?.body instanceof FormData;
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers
    }
  });

  if (!res.ok) {
    throw new ApiError(res.status, res.statusText, await parseErrorBody(res));
  }

  return res.json() as Promise<T>;
}
