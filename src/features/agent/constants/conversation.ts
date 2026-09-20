import { stripAssetReferenceBlock } from '../lib/asset-reference';

export const DEFAULT_CONVERSATION_TITLE = '新会话';

/** 新会话（尚未创建记录）页面的 ChatWindow key */
export const NEW_CHAT_KEY = 'new-chat';

const TITLE_MAX_LENGTH = 30;

/** 用首条用户消息生成会话标题（先剥离机器可读的 [引用资产] 块，再截取前 30 字） */
export function buildConversationTitle(text: string): string {
  const normalized = stripAssetReferenceBlock(text).replace(/\s+/g, ' ').trim();
  if (!normalized) return DEFAULT_CONVERSATION_TITLE;
  return normalized.length > TITLE_MAX_LENGTH
    ? `${normalized.slice(0, TITLE_MAX_LENGTH)}…`
    : normalized;
}
