import { mutationOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { knowledgeKeys } from './queries';
import type { CreateDocumentRequest, DocumentIngestResult } from './types';

/** 文档域失效：写操作成功后重查列表（摄取为同步，回来即是终态） */
function invalidateDocuments(): void {
  void getQueryClient().invalidateQueries({ queryKey: knowledgeKeys.documentsRoot() });
}

/** 新增文档：manual 传 content；asset 只传 sourceAssetId（正文由服务端读取） */
export const createKnowledgeDocumentMutation = mutationOptions({
  mutationFn: (data: CreateDocumentRequest) =>
    apiClient<DocumentIngestResult>('/agent/knowledge/documents', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  onSuccess: invalidateDocuments
});

export const deleteKnowledgeDocumentMutation = mutationOptions({
  mutationFn: (id: string) =>
    apiClient<{ success: boolean }>(`/agent/knowledge/documents/${id}`, { method: 'DELETE' }),
  onSuccess: invalidateDocuments
});

/** 重新摄取：failed 文档、或因函数中断卡在 processing 的文档都可重跑（幂等替换片段） */
export const retryKnowledgeDocumentMutation = mutationOptions({
  mutationFn: (id: string) =>
    apiClient<DocumentIngestResult>(`/agent/knowledge/documents/${id}/retry`, { method: 'POST' }),
  onSuccess: invalidateDocuments
});
