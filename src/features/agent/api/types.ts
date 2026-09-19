import type { UIMessage } from 'ai';

export interface Conversation {
  id: string;
  title: string;
  model: string;
  /** 正在进行的可恢复流 id（用于刷新后重连与停止）；无活跃流时为 null */
  activeStreamId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: UIMessage['role'];
  parts: UIMessage['parts'];
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ConversationsResponse {
  conversations: Conversation[];
}

export type ArtifactKind = 'markdown' | 'html' | 'image';

export interface Artifact {
  id: string;
  conversationId: string;
  kind: ArtifactKind;
  title: string;
  status: string;
  mime: string | null;
  sizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactDetail extends Artifact {
  content: string | null;
  /** OSS 对象 key（图片等二进制产物非空；详情端点据此签发 previewUrl） */
  storageKey: string | null;
  /** 图片产物签名预览 URL（3600s 有效，刷新会话后重新签发）；非图片或未签发为 null */
  previewUrl: string | null;
}

export interface ArtifactFilters {
  page?: number;
  limit?: number;
  search?: string;
  /** 逗号分隔的 kind 列表，如 "markdown,html" */
  kind?: string;
  sort?: string;
}

export interface ArtifactsResponse {
  artifacts: Artifact[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateConversationPayload {
  model: string;
}

export interface UpdateConversationPayload {
  title?: string;
  model?: string;
}
