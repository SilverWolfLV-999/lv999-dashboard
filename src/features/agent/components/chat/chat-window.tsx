'use client';

import type { UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createConversationMutation, updateConversationMutation } from '../../api/mutations';
import { agentKeys } from '../../api/queries';
import type { Conversation } from '../../api/types';
import { DEFAULT_MODEL, getModelLabel } from '../../constants/models';
import { ChatComposer } from './chat-composer';
import { ChatEmptyState } from './chat-empty-state';
import { MessageItem } from './message-item';

interface ChatWindowProps {
  conversation?: Conversation;
  initialMessages: UIMessage[];
}

/**
 * 对话窗口：useChat 流式渲染 + 消息/工具卡/产物卡。
 *
 * 新会话流程：首条消息发送前先创建会话（React Query mutation），
 * 拿到 id 后写 ref 并历史 API 更新地址栏（不触发重新渲染/重挂载）。
 */
export function ChatWindow({ conversation, initialMessages }: ChatWindowProps) {
  const [input, setInput] = useState('');
  const [model, setModel] = useState(conversation?.model ?? DEFAULT_MODEL);
  const [chatId] = useState(conversation?.id);
  const [initial] = useState(initialMessages);
  const conversationIdRef = useRef(conversation?.id);
  const queryClient = useQueryClient();

  const createConversation = useMutation(createConversationMutation);
  const updateConversation = useMutation(updateConversationMutation);

  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    id: chatId,
    messages: initial,
    transport: new DefaultChatTransport({
      api: '/api/agent/chat',
      body: () => ({ conversationId: conversationIdRef.current })
    }),
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.all });
    }
  });

  const isGenerating = status === 'submitted' || status === 'streaming';

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isGenerating) return;

    if (!conversationIdRef.current) {
      try {
        const created = await createConversation.mutateAsync({ model });
        conversationIdRef.current = created.id;
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
    if (conversationIdRef.current) {
      updateConversation.mutate({ id: conversationIdRef.current, values: { model: next } });
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
