import type { UIMessage } from 'ai';
import { and, asc, count, desc, eq, ilike, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { artifacts, conversations, messages } from '@/lib/db/schema';
import { DEFAULT_CONVERSATION_TITLE, buildConversationTitle } from '../constants/conversation';
import type {
  Artifact,
  ArtifactDetail,
  ArtifactFilters,
  ArtifactsResponse,
  ArtifactKind,
  ChatMessage,
  Conversation
} from './types';

/**
 * Agent 模块数据访问层（server-only）。
 * 客户端查询（queries.ts）走 /api/agent/* Route Handlers，不直接引用本文件。
 */

type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type ArtifactRow = typeof artifacts.$inferSelect;

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as ChatMessage['role'],
    parts: row.parts as UIMessage['parts'],
    metadata: row.metadata ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

function toArtifact(row: ArtifactRow): Artifact {
  return {
    id: row.id,
    conversationId: row.conversationId,
    kind: row.kind as ArtifactKind,
    title: row.title,
    status: row.status,
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export async function listConversations(userId: string): Promise<Conversation[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(50);
  return rows.map(toConversation);
}

export async function getConversation(
  userId: string,
  conversationId: string
): Promise<Conversation | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);
  return rows[0] ? toConversation(rows[0]) : undefined;
}

export async function createConversation(userId: string, model: string): Promise<Conversation> {
  const db = getDb();
  const rows = await db
    .insert(conversations)
    .values({ userId, model, title: DEFAULT_CONVERSATION_TITLE })
    .returning();
  return toConversation(rows[0]);
}

export async function updateConversation(
  userId: string,
  conversationId: string,
  patch: { title?: string; model?: string }
): Promise<Conversation | undefined> {
  const db = getDb();
  const rows = await db
    .update(conversations)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .returning();
  return rows[0] ? toConversation(rows[0]) : undefined;
}

export async function deleteConversation(userId: string, conversationId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .returning({ id: conversations.id });
  return rows.length > 0;
}

export async function touchConversation(conversationId: string): Promise<void> {
  const db = getDb();
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

/** 会话仍是默认标题时，用首条用户消息生成标题 */
export async function applyAutoTitle(
  userId: string,
  conversation: Conversation,
  userText: string
): Promise<void> {
  if (conversation.title !== DEFAULT_CONVERSATION_TITLE) return;
  const title = buildConversationTitle(userText);
  if (title === DEFAULT_CONVERSATION_TITLE) return;
  await updateConversation(userId, conversation.id, { title });
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * 持久化只需要 UIMessage 的结构子集，与 AI SDK 的具体泛型解耦。
 */
export interface PersistedUIMessage {
  id: string;
  role: string;
  parts: unknown[];
  metadata?: unknown;
}

function toMessageRow(conversationId: string, message: PersistedUIMessage) {
  return {
    id: message.id,
    conversationId,
    role: message.role,
    parts: message.parts,
    metadata: (message.metadata as Record<string, unknown> | undefined) ?? null
  };
}

const messageUpsertSet = {
  role: sql`excluded.role`,
  parts: sql`excluded.parts`,
  metadata: sql`excluded.metadata`
};

export async function listMessages(
  userId: string,
  conversationId: string
): Promise<ChatMessage[] | undefined> {
  const conversation = await getConversation(userId, conversationId);
  if (!conversation) return undefined;
  const db = getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
  return rows.map(toChatMessage);
}

/** 请求开始时先落一条用户消息（upsert，保证中断场景不丢输入） */
export async function saveUserMessage(
  conversationId: string,
  message: PersistedUIMessage
): Promise<void> {
  const db = getDb();
  await db
    .insert(messages)
    .values(toMessageRow(conversationId, message))
    .onConflictDoUpdate({ target: messages.id, set: messageUpsertSet });
}

/**
 * 流结束后按客户端完整消息列表做一次同步：
 * 删除已不在列表中的旧消息（如 regenerate 产生的旧回复），并 upsert 全部消息。
 */
export async function syncConversationMessages(
  conversationId: string,
  uiMessages: PersistedUIMessage[]
): Promise<void> {
  const db = getDb();
  const ids = uiMessages.map((message) => message.id);
  if (ids.length > 0) {
    await db
      .delete(messages)
      .where(and(eq(messages.conversationId, conversationId), notInArray(messages.id, ids)));
    await db
      .insert(messages)
      .values(uiMessages.map((message) => toMessageRow(conversationId, message)))
      .onConflictDoUpdate({ target: messages.id, set: messageUpsertSet });
  }
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

export async function createArtifact(params: {
  userId: string;
  conversationId: string;
  title: string;
  kind: ArtifactKind;
  content: string;
}): Promise<{ id: string; sizeBytes: number }> {
  const db = getDb();
  const sizeBytes = Buffer.byteLength(params.content, 'utf8');
  const mime = params.kind === 'html' ? 'text/html; charset=utf-8' : 'text/markdown; charset=utf-8';
  const rows = await db
    .insert(artifacts)
    .values({
      userId: params.userId,
      conversationId: params.conversationId,
      title: params.title,
      kind: params.kind,
      content: params.content,
      mime,
      sizeBytes,
      status: 'ready'
    })
    .returning({ id: artifacts.id });
  return { id: rows[0].id, sizeBytes };
}

function parseArtifactOrderBy(sort?: string): SQL {
  if (!sort) return desc(artifacts.createdAt);
  try {
    const parsed = JSON.parse(sort) as { id?: string; desc?: boolean }[];
    const first = Array.isArray(parsed) ? parsed[0] : undefined;
    const direction = first?.desc ? desc : asc;
    switch (first?.id) {
      case 'title':
        return direction(artifacts.title);
      case 'sizeBytes':
        return direction(artifacts.sizeBytes);
      case 'createdAt':
        return direction(artifacts.createdAt);
      default:
        return desc(artifacts.createdAt);
    }
  } catch {
    return desc(artifacts.createdAt);
  }
}

export async function listArtifacts(
  userId: string,
  filters: ArtifactFilters
): Promise<ArtifactsResponse> {
  const db = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 10));

  const conditions = [eq(artifacts.userId, userId)];
  if (filters.search) {
    conditions.push(ilike(artifacts.title, `%${filters.search}%`));
  }
  const kinds = filters.kind
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (kinds && kinds.length > 0) {
    conditions.push(inArray(artifacts.kind, kinds));
  }
  const where = and(...conditions);

  const [{ total }] = await db.select({ total: count() }).from(artifacts).where(where);
  const rows = await db
    .select()
    .from(artifacts)
    .where(where)
    .orderBy(parseArtifactOrderBy(filters.sort))
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    artifacts: rows.map(toArtifact),
    total: Number(total),
    page,
    limit
  };
}

export async function getArtifact(
  userId: string,
  artifactId: string
): Promise<ArtifactDetail | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return { ...toArtifact(row), content: row.content };
}

export async function deleteArtifact(userId: string, artifactId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.userId, userId)))
    .returning({ id: artifacts.id });
  return rows.length > 0;
}
