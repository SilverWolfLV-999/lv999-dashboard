const BASE_URL = '/api';

/** API 层错误：携带 HTTP 状态码，供调用方区分 404 等场景（如已被删除的产物） */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    super(`API error: ${status} ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  if (!res.ok) {
    throw new ApiError(res.status, res.statusText);
  }

  return res.json() as Promise<T>;
}
