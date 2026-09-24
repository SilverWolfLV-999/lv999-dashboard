import { queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { BalanceResponse, LedgerFilters, LedgerResponse } from './types';

/**
 * Credits 前端只读查询（余额 + 流水）。
 * 无写端点暴露给前端：grant 仅 CLI，扣费在各计费入口内部完成。
 */

export const creditKeys = {
  all: ['credits'] as const,
  balance: () => [...creditKeys.all, 'balance'] as const,
  ledgerRoot: () => [...creditKeys.all, 'ledger'] as const,
  ledger: (filters: LedgerFilters) => [...creditKeys.ledgerRoot(), filters] as const
};

export function buildLedgerQuery(filters: LedgerFilters): string {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.sort) params.set('sort', filters.sort);
  return params.toString();
}

/** 当前用户余额（账号下拉 / 流水页头部）；下拉打开时查询即可，不常驻轮询 */
export const balanceQueryOptions = () =>
  queryOptions({
    queryKey: creditKeys.balance(),
    queryFn: () => apiClient<BalanceResponse>('/agent/credits'),
    staleTime: 30_000
  });

/** 流水分页（/dashboard/profile/credits 表格） */
export const ledgerQueryOptions = (filters: LedgerFilters) =>
  queryOptions({
    queryKey: creditKeys.ledger(filters),
    queryFn: () => apiClient<LedgerResponse>(`/agent/credits/ledger?${buildLedgerQuery(filters)}`)
  });
