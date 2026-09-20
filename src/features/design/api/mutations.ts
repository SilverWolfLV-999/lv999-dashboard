import { mutationOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { agentKeys } from '@/features/agent/api/queries';
import type { CreateDesignRequest, UpdateDesignRequest } from './types';

/** 资产域失效：列表 + 详情（保存后刷新「我的资产」缩略/标题与预览） */
function invalidateAssets(): void {
  void getQueryClient().invalidateQueries({ queryKey: agentKeys.assetsRoot() });
  void getQueryClient().invalidateQueries({ queryKey: agentKeys.assetRoot() });
}

export const createDesignMutation = mutationOptions({
  mutationFn: (data: CreateDesignRequest) =>
    apiClient<{ id: string }>('/agent/assets', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  onSuccess: invalidateAssets
});

export const updateDesignMutation = mutationOptions({
  mutationFn: ({ id, values }: { id: string; values: UpdateDesignRequest }) =>
    apiClient<{ success: boolean }>(`/agent/assets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(values)
    }),
  onSuccess: invalidateAssets
});
