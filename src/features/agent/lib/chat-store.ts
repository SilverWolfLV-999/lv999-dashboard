import { Chat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { getQueryClient } from '@/lib/query-client';
import { agentKeys } from '../api/queries';

/**
 * 会话级 Chat 实例缓存（client-only）。
 *
 * 原理：AI SDK 的 Chat 是框架无关的状态机，流的消费与 React 生命周期解耦。
 * 把实例缓存在组件树之外后：
 * - 切换会话时旧实例继续消费流，任务在后台完成（不会中断生成）
 * - 切回会话时 useChat({ chat }) 重新订阅同一实例，获得实时状态
 * - 新会话在首次发送前创建，通过 adoptChatEntry 把实例从临时键迁移到会话 id
 *
 * SSR 期间不缓存：模块级 Map 属于浏览器会话状态，服务端渲染返回一次性实例即可。
 */

interface ChatEntry {
  chat: Chat<UIMessage>;
  /** 新会话创建后，更新实例内 transport 使用的 conversationId */
  setConversationId: (id: string) => void;
  getConversationId: () => string | undefined;
}

const cache = new Map<string, ChatEntry>();
const MAX_CACHED_CHATS = 20;

function createChatEntry(options: {
  conversationId?: string;
  initialMessages: UIMessage[];
}): ChatEntry {
  let conversationId = options.conversationId;

  const chat = new Chat<UIMessage>({
    id: conversationId,
    messages: options.initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/agent/chat',
      body: () => ({ conversationId })
    }),
    onFinish: () => {
      // 生成结束后落库已完成，刷新会话列表（标题/时间）与产物数据
      void getQueryClient().invalidateQueries({ queryKey: agentKeys.all });
    }
  });

  return {
    chat,
    setConversationId: (id: string) => {
      conversationId = id;
    },
    getConversationId: () => conversationId
  };
}

/** 超出上限时优先清理空闲的旧实例（生成中的实例永不清理） */
function pruneCache(keepKey: string): void {
  if (cache.size <= MAX_CACHED_CHATS) return;
  for (const [key, entry] of cache) {
    if (cache.size <= MAX_CACHED_CHATS) break;
    if (key === keepKey) continue;
    const { status } = entry.chat;
    if (status === 'streaming' || status === 'submitted') continue;
    cache.delete(key);
  }
}

export function getChatEntry(
  key: string,
  options: { conversationId?: string; initialMessages: UIMessage[] }
): ChatEntry {
  if (typeof window === 'undefined') {
    return createChatEntry(options);
  }
  let entry = cache.get(key);
  if (!entry) {
    entry = createChatEntry(options);
    cache.set(key, entry);
    pruneCache(key);
  }
  return entry;
}

/** 新会话创建成功后：把缓存从临时键迁移到会话 id 键 */
export function adoptChatEntry(fromKey: string, toKey: string): ChatEntry | undefined {
  const entry = cache.get(fromKey);
  if (!entry) return undefined;
  cache.delete(fromKey);
  cache.set(toKey, entry);
  return entry;
}
