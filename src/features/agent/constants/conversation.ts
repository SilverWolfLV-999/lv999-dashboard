export const DEFAULT_CONVERSATION_TITLE = '新会话';

const TITLE_MAX_LENGTH = 30;

/** 用首条用户消息生成会话标题（截取前 30 字） */
export function buildConversationTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return DEFAULT_CONVERSATION_TITLE;
  return normalized.length > TITLE_MAX_LENGTH
    ? `${normalized.slice(0, TITLE_MAX_LENGTH)}…`
    : normalized;
}
