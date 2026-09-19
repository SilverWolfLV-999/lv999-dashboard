import { queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  ArtifactDetail,
  ArtifactFilters,
  ArtifactsResponse,
  ConversationsResponse
} from './types';

export const agentKeys = {
  all: ['agent'] as const,
  conversations: () => [...agentKeys.all, 'conversations'] as const,
  /** 产物列表域根 key：按域失效时使用（避免 agentKeys.all 连带失效无关查询） */
  artifactsRoot: () => [...agentKeys.all, 'artifacts'] as const,
  artifacts: (filters: ArtifactFilters) => [...agentKeys.artifactsRoot(), filters] as const,
  /** 产物详情域根 key */
  artifactRoot: () => [...agentKeys.all, 'artifact'] as const,
  artifact: (id: string) => [...agentKeys.artifactRoot(), id] as const
};

export function buildArtifactQuery(filters: ArtifactFilters): string {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.search) params.set('search', filters.search);
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.sort) params.set('sort', filters.sort);
  return params.toString();
}

export const conversationsQueryOptions = () =>
  queryOptions({
    queryKey: agentKeys.conversations(),
    queryFn: () => apiClient<ConversationsResponse>('/agent/conversations')
  });

export const artifactsQueryOptions = (filters: ArtifactFilters) =>
  queryOptions({
    queryKey: agentKeys.artifacts(filters),
    queryFn: () => apiClient<ArtifactsResponse>(`/agent/artifacts?${buildArtifactQuery(filters)}`)
  });

export const artifactQueryOptions = (id: string) =>
  queryOptions({
    queryKey: agentKeys.artifact(id),
    queryFn: () => apiClient<ArtifactDetail>(`/agent/artifacts/${id}`)
  });
