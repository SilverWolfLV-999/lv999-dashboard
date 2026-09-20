import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';

/**
 * Agent 创作模块数据表
 *
 * - conversations: 会话（含模型选择）
 * - messages: 会话消息（parts 与 AI SDK 的 UIMessage.parts 结构对齐，原样存储）
 * - assets: 用户资产（Agent 生成 source='agent' / 用户上传 source='upload'）；
 *   文本内容存 content 列，二进制走 OSS 只存 storage_key；
 *   会话删除时 conversationId 置空（SET NULL）、资产保留；
 *   图片编辑（I2I）产出的新资产通过 sourceAssetId 指向源资产（源删除时置空）
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

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 来源会话（可空）：上传资产无会话；会话删除时置空（SET NULL），资产不随会话删除 */
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null'
    }),
    /** 派生来源资产（可空）：图片编辑（I2I）产出的新资产指向被编辑的源资产；源资产删除时置空（SET NULL） */
    sourceAssetId: uuid('source_asset_id').references((): AnyPgColumn => assets.id, {
      onDelete: 'set null'
    }),
    userId: text('user_id').notNull(),
    /** 资产来源：'agent'（生成）/ 'upload'（导入） */
    source: text('source').notNull().default('agent'),
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
    index('assets_user_created_idx').on(table.userId, table.createdAt),
    index('assets_conversation_idx').on(table.conversationId)
  ]
);
