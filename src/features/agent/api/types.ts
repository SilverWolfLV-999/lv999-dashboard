import type { UIMessage } from 'ai';
import { z } from 'zod';
import { ASPECT_KEYS } from '../constants/image-models';

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

export type AssetKind = 'markdown' | 'html' | 'image' | 'design';

/** 资产来源：agent 生成 / 用户上传 */
export type AssetSource = 'agent' | 'upload';

export interface Asset {
  id: string;
  /** 来源会话（可空）：上传资产无会话；会话删除后置空，资产保留 */
  conversationId: string | null;
  /** 派生来源资产 id（图片编辑 I2I 产物指向被编辑的源资产；源删除后置空） */
  sourceAssetId: string | null;
  source: AssetSource;
  kind: AssetKind;
  title: string;
  status: string;
  /** 用户收藏标记（任意 kind 可收藏） */
  favorite: boolean;
  mime: string | null;
  sizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetDetail extends Asset {
  content: string | null;
  /** OSS 对象 key（图片等二进制资产非空；详情端点据此签发 previewUrl） */
  storageKey: string | null;
  /** 图片资产签名预览 URL（3600s 有效，刷新后重新签发）；非图片或未签发为 null */
  previewUrl: string | null;
  /** 源资产标题（仅当 sourceAssetId 存在且源资产仍可访问时非空，供「基于《xxx》修改」展示） */
  sourceTitle: string | null;
}

export interface AssetFilters {
  page?: number;
  limit?: number;
  search?: string;
  /** 逗号分隔的 kind 列表，如 "markdown,html" */
  kind?: string;
  /** true 时仅看收藏 */
  favorite?: boolean;
  sort?: string;
}

export interface AssetsResponse {
  assets: Asset[];
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

// ---------------------------------------------------------------------------
// 资产写操作请求体（Route Handler 校验用，与设计画布 types.ts 的 schema 同模式）
// ---------------------------------------------------------------------------

/** 图片「继续修改」（直连 I2I）请求体 */
export const editImageRequestSchema = z.object({
  instruction: z.string().min(1).max(2000),
  aspect: z.enum(ASPECT_KEYS).optional()
});

export type EditImageRequest = z.infer<typeof editImageRequestSchema>;

/** 收藏/取消收藏请求体 */
export const favoriteRequestSchema = z.object({
  favorite: z.boolean()
});

export type FavoriteRequest = z.infer<typeof favoriteRequestSchema>;

/** 批量删除请求体（单次上限 100 个） */
export const batchDeleteRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100)
});

export type BatchDeleteRequest = z.infer<typeof batchDeleteRequestSchema>;
