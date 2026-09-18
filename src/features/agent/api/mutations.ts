import { mutationOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { agentKeys } from './queries';
import type { Conversation, CreateConversationPayload, UpdateConversationPayload } from './types';

function invalidateAgent(): void {
  void getQueryClient().invalidateQueries({ queryKey: agentKeys.all });
}

export const createConversationMutation = mutationOptions({
  mutationFn: (data: CreateConversationPayload) =>
    apiClient<Conversation>('/agent/conversations', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  onSuccess: invalidateAgent
});

export const updateConversationMutation = mutationOptions({
  mutationFn: ({ id, values }: { id: string; values: UpdateConversationPayload }) =>
    apiClient<Conversation>(`/agent/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(values)
    }),
  onSuccess: invalidateAgent
});

export const deleteConversationMutation = mutationOptions({
  mutationFn: (id: string) =>
    apiClient<{ success: boolean }>(`/agent/conversations/${id}`, { method: 'DELETE' }),
  onSuccess: invalidateAgent
});

export const deleteArtifactMutation = mutationOptions({
  mutationFn: (id: string) =>
    apiClient<{ success: boolean }>(`/agent/artifacts/${id}`, { method: 'DELETE' }),
  onSuccess: invalidateAgent
});
