import {
  boolean,
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';
import { vector1024 } from './vector';

/**
 * Agent 创作模块数据表
 *
 * - conversations: 会话（含模型选择与会话级技能）
 * - messages: 会话消息（parts 与 AI SDK 的 UIMessage.parts 结构对齐，原样存储）
 * - assets: 用户资产（Agent 生成 source='agent' / 用户上传 source='upload'）；
 *   文本内容存 content 列，二进制走 OSS 只存 storage_key；
 *   会话删除时 conversationId 置空（SET NULL）、资产保留；
 *   图片编辑（I2I）产出的新资产通过 sourceAssetId 指向源资产（源删除时置空）
 *
 * RAG 知识库（语义检索增强）
 * - knowledge_documents: 知识库文档（手动粘贴 source='manual' / 从文本资产导入 source='asset'）；
 *   原始全文存 content 列（供重嵌与展示），摄取状态 status: processing → ready / failed
 * - knowledge_chunks: 文档切分片段 + 向量（pgvector）；文档删除时级联删除（CASCADE）
 */

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  model: text('model').notNull().default('deepseek-flash'),
  /** 会话级技能（专家模式）id：指向代码内技能注册表；null = 通用（无技能） */
  activeSkillId: text('active_skill_id'),
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
    /** 用户收藏标记（任意 kind 可收藏；列表支持「仅看收藏」筛选） */
    favorite: boolean('favorite').notNull().default(false),
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

export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    /** 文档来源：'manual'（手动粘贴文本）/ 'asset'（从文本资产导入） */
    source: text('source').notNull(),
    /** 导入来源资产（source='asset' 时非空）；资产删除后置空（SET NULL），文档保留 */
    sourceAssetId: uuid('source_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    /** 原始全文：供重嵌与展示，不随切分丢失 */
    content: text('content').notNull(),
    /** 摄取状态：'processing' / 'ready' / 'failed' */
    status: text('status').notNull().default('processing'),
    chunkCount: integer('chunk_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('knowledge_documents_user_created_idx').on(table.userId, table.createdAt)]
);

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: 'cascade' }),
    /** 冗余归属列：检索按用户过滤时无需 join 文档表 */
    userId: text('user_id').notNull(),
    /** 文档内序号（从 0 开始） */
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vector1024('embedding').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('knowledge_chunks_user_idx').on(table.userId)]
);
// HNSW 向量索引（drizzle-kit 不生成）由迁移 SQL 手动追加：
// CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
//   ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
