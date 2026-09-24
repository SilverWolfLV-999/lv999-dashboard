import { queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { AdminUserFilters, AdminUsersResponse } from './types';

/**
 * 管理员用户列表前端只读查询。
 * 写操作（调 Credits / 删用户）见 `mutations.ts`，均走 `/api/admin/*`（服务端 isAdmin 403 守卫）。
 */

export const adminKeys = {
  all: ['admin'] as const,
  usersRoot: () => [...adminKeys.all, 'users'] as const,
  users: (filters: AdminUserFilters) => [...adminKeys.usersRoot(), filters] as const
};

export function buildAdminUsersQuery(filters: AdminUserFilters): string {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.query) params.set('query', filters.query);
  if (filters.sort) params.set('sort', filters.sort);
  return params.toString();
}

export const adminUsersQueryOptions = (filters: AdminUserFilters) =>
  queryOptions({
    queryKey: adminKeys.users(filters),
    queryFn: () => apiClient<AdminUsersResponse>(`/admin/users?${buildAdminUsersQuery(filters)}`)
  });
