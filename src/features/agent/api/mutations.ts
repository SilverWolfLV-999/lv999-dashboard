import { mutationOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { agentKeys } from './queries';
import type { Conversation, CreateConversationPayload, UpdateConversationPayload } from './types';

/** 会话域失效：仅会话列表（标题/时间戳）变化，不连带产物查询 */
function invalidateConversations(): void {
  void getQueryClient().invalidateQueries({ queryKey: agentKeys.conversations() });
}

/** 产物域失效：列表 + 详情 */
function invalidateArtifacts(): void {
  void getQueryClient().invalidateQueries({ queryKey: agentKeys.artifactsRoot() });
  void getQueryClient().invalidateQueries({ queryKey: agentKeys.artifactRoot() });
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

export const deleteArtifactMutation = mutationOptions({
  mutationFn: (id: string) =>
    apiClient<{ success: boolean }>(`/agent/artifacts/${id}`, { method: 'DELETE' }),
  onSuccess: invalidateArtifacts
});
