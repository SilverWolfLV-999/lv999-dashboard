import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Agent 创作模块数据表
 *
 * - conversations: 会话（含模型选择）
 * - messages: 会话消息（parts 与 AI SDK 的 UIMessage.parts 结构对齐，原样存储）
 * - artifacts: 结构化产物（MVP 文本产物内容存 content 列；Phase 2 二进制走 OSS，只存 storage_key）
 */

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  model: text('model').notNull().default('deepseek-flash'),
  /** 正在进行的可恢复流 id（resumable-stream）；无活跃流时为 null */
  activeStreamId: text('active_stream_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    parts: jsonb('parts').$type<unknown[]>().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('messages_conversation_created_idx').on(table.conversationId, table.createdAt)]
);

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull().default('ready'),
    content: text('content'),
    storageKey: text('storage_key'),
    mime: text('mime'),
    sizeBytes: integer('size_bytes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('artifacts_user_created_idx').on(table.userId, table.createdAt),
    index('artifacts_conversation_idx').on(table.conversationId)
  ]
);
