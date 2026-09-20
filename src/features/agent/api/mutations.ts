import { mutationOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { agentKeys } from './queries';
import type { Conversation, CreateConversationPayload, UpdateConversationPayload } from './types';

/** 会话域失效：仅会话列表（标题/时间戳）变化，不连带资产查询 */
function invalidateConversations(): void {
  void getQueryClient().invalidateQueries({ queryKey: agentKeys.conversations() });
}

/** 资产域失效：列表 + 详情 */
function invalidateAssets(): void {
  void getQueryClient().invalidateQueries({ queryKey: agentKeys.assetsRoot() });
  void getQueryClient().invalidateQueries({ queryKey: agentKeys.assetRoot() });
}

export const createConversationMutation = mutationOptions({
  mutationFn: (data: CreateConversationPayload) =>
    apiClient<Conversation>('/agent/conversations', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  onSuccess: invalidateConversations
});

export const updateConversationMutation = mutationOptions({
  mutationFn: ({ id, values }: { id: string; values: UpdateConversationPayload }) =>
    apiClient<Conversation>(`/agent/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(values)
    }),
  onSuccess: invalidateConversations
});

export const deleteConversationMutation = mutationOptions({
  mutationFn: (id: string) =>
    apiClient<{ success: boolean }>(`/agent/conversations/${id}`, { method: 'DELETE' }),
  onSuccess: invalidateConversations
});

export const deleteAssetMutation = mutationOptions({
  mutationFn: (id: string) =>
    apiClient<{ success: boolean }>(`/agent/assets/${id}`, { method: 'DELETE' }),
  onSuccess: invalidateAssets
});
