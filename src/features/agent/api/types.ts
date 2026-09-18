import type { UIMessage } from 'ai';

export interface Conversation {
  id: string;
  title: string;
  model: string;
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

export type ArtifactKind = 'markdown' | 'html';

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
