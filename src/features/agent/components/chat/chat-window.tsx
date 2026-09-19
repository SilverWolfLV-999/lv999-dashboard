'use client';

import type { UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createConversationMutation, updateConversationMutation } from '../../api/mutations';
import type { Conversation } from '../../api/types';
import { NEW_CHAT_KEY } from '../../constants/conversation';
import { DEFAULT_MODEL, getModelLabel } from '../../constants/models';
import { adoptChatEntry, getChatEntry } from '../../lib/chat-store';
import { ChatComposer } from './chat-composer';
import { ChatEmptyState } from './chat-empty-state';
import { MessageItem } from './message-item';

interface ChatWindowProps {
  conversation?: Conversation;
  initialMessages: UIMessage[];
}

/**
 * 对话窗口。
 *
 * 消息与流式状态托管在 chat-store 的会话级 Chat 实例中（组件树之外）：
 * - 切换会话时旧实例继续消费流，任务在后台完成，切回可看到实时状态
 * - 组件仅通过 useChat({ chat }) 订阅；输入框/模型等 UI 状态由页面层 key 隔离
 */
export function ChatWindow({ conversation, initialMessages }: ChatWindowProps) {
  const conversationKey = conversation?.id ?? NEW_CHAT_KEY;
  const [entry] = useState(() =>
    getChatEntry(conversationKey, {
      conversationId: conversation?.id,
      initialMessages
    })
  );
  const [input, setInput] = useState('');
  const [model, setModel] = useState(conversation?.model ?? DEFAULT_MODEL);

  const createConversation = useMutation(createConversationMutation);
  const updateConversation = useMutation(updateConversationMutation);

  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    chat: entry.chat
  });

  const isGenerating = status === 'submitted' || status === 'streaming';

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isGenerating || createConversation.isPending) return;

    if (!entry.getConversationId()) {
      try {
        const created = await createConversation.mutateAsync({ model });
        entry.setConversationId(created.id);
        adoptChatEntry(NEW_CHAT_KEY, created.id);
        window.history.replaceState(null, '', `/dashboard/agent/${created.id}`);
      } catch {
        toast.error('创建会话失败，请稍后重试');
        return;
      }
    }

    setInput('');
    void sendMessage({ text });
  };

  const handleModelChange = (next: string) => {
    setModel(next);
    const conversationId = entry.getConversationId();
    if (conversationId) {
      updateConversation.mutate({ id: conversationId, values: { model: next } });
    }
  };

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4'>
        <h1 className='truncate text-sm font-medium'>{conversation?.title ?? '新会话'}</h1>
        <span className='text-muted-foreground hidden text-xs sm:block'>
          当前模型：{getModelLabel(model)}
        </span>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        <div className='mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6'>
          {messages.length === 0 ? (
            <ChatEmptyState onPick={setInput} />
          ) : (
            messages.map((message) => <MessageItem key={message.id} message={message} />)
          )}
          {error && (
            <div className='border-destructive/40 bg-destructive/5 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm'>
              <span className='text-destructive'>生成出错了，请重试。</span>
              <Button
                variant='outline'
                size='sm'
                onClick={() => regenerate()}
                disabled={isGenerating}
              >
                重试
              </Button>
            </div>
          )}
        </div>
      </div>

      <ChatComposer
        value={input}
        onChange={setInput}
        onSubmit={() => {
          void handleSubmit();
        }}
        onStop={stop}
        isGenerating={isGenerating}
        model={model}
        onModelChange={handleModelChange}
      />
    </div>
  );
}
