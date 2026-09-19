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
 * 对话窗口（官方可恢复流模式）。
 *
 * 每个会话挂载时创建独立 Chat 实例；`resume: true` 会在挂载时自动 GET
 * /api/agent/chat/[id]/stream 重连进行中的流（刷新/切回会话均实时恢复）。
 * 断开只是断开，不会取消生成；停止按钮走专用 stop 端点（真取消）。
 */
export function ChatWindow({ conversation, initialMessages }: ChatWindowProps) {
  const [initialConversationId] = useState(conversation?.id);
  const conversationIdRef = useRef(conversation?.id);
  const [input, setInput] = useState('');
  const [model, setModel] = useState(conversation?.model ?? DEFAULT_MODEL);
  const queryClient = useQueryClient();

  const createConversation = useMutation(createConversationMutation);
  const updateConversation = useMutation(updateConversationMutation);

  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    id: initialConversationId,
    messages: initialMessages,
    resume: Boolean(initialConversationId),
    transport: new DefaultChatTransport({
      api: '/api/agent/chat',
      body: () => ({ conversationId: conversationIdRef.current }),
      prepareReconnectToStreamRequest: ({ id }) => ({
        api: `/api/agent/chat/${id}/stream`
      })
    }),
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.all });
    }
  });

  const isGenerating = status === 'submitted' || status === 'streaming';

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isGenerating || createConversation.isPending) return;

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

  // 停止：先通知服务端取消生产（并保存部分快照），再关闭本地读取。
  // 流 id 取当前 assistant 消息 metadata 中的值（随流下发、始终为最新）；
  // SSR 冻结的 conversation prop 在本页生命周期内不会更新，不能用于停止请求——
  // 否则会与 stop 端点的防误杀守卫冲突导致停止静默失效。
  // 注意：不要在任何"离开页面/卸载"场景调用 stop 端点——离开属于断开，应保持可恢复。
  const handleStop = () => {
    const conversationId = conversationIdRef.current;
    if (conversationId) {
      const last = messages.at(-1);
      const assistantMessage = last?.role === 'assistant' ? last : undefined;
      const activeStreamId =
        (assistantMessage?.metadata as { streamId?: string } | undefined)?.streamId ?? null;
      void fetch(`/api/agent/chat/${conversationId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantMessage, activeStreamId })
      });
    }
    stop();
  };

  const handleModelChange = (next: string) => {
    setModel(next);
    const conversationId = conversationIdRef.current;
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
        onStop={handleStop}
        isGenerating={isGenerating}
        model={model}
        onModelChange={handleModelChange}
      />
    </div>
  );
}
