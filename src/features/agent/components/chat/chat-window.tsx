'use client';

import type { UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createConversationMutation, updateConversationMutation } from '../../api/mutations';
import { agentKeys } from '../../api/queries';
import type { Conversation } from '../../api/types';
import { DEFAULT_MODEL, getModelLabel } from '../../constants/models';
import {
  clearPendingFirstMessage,
  setPendingFirstMessage,
  takePendingFirstMessage
} from '../../lib/pending-first-message';
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
  const router = useRouter();

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
      // 分域失效：会话列表（标题/updatedAt 变化）+ 产物列表（聊天中可能新增产物）
      void queryClient.invalidateQueries({ queryKey: agentKeys.conversations() });
      void queryClient.invalidateQueries({ queryKey: agentKeys.artifactsRoot() });
    }
  });

  // 新会话首页 → 会话页的一次性首条消息交接（真实导航完成后由本页发送）。
  // 回到新会话首页（无 id）时丢弃未消费的交接，避免陈旧消息被误发送。
  useEffect(() => {
    if (!initialConversationId) {
      clearPendingFirstMessage();
      return;
    }
    const pendingText = takePendingFirstMessage(initialConversationId);
    if (pendingText) {
      void sendMessage({ text: pendingText });
    }
  }, [initialConversationId, sendMessage]);

  const isGenerating = status === 'submitted' || status === 'streaming';

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isGenerating || createConversation.isPending) return;

    if (!conversationIdRef.current) {
      try {
        const created = await createConversation.mutateAsync({ model });
        // 必须真实导航（router.replace）进入会话页；不能用 window.history.replaceState——
        // 那会让 URL 与渲染树脱节，之后回到 /dashboard/agent 时组件被复用、状态不重置。
        // 首条消息经一次性交接由目标页消费发送（导航会重挂载本组件）。
        setPendingFirstMessage(created.id, text);
        setInput('');
        router.replace(`/dashboard/agent/${created.id}`);
      } catch {
        toast.error('创建会话失败，请稍后重试');
      }
      return;
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
      }).catch(() => {
        // 失败静默可接受（服务端会继续生产，与可恢复流设计自洽）；仅避免未处理的 rejection
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
            messages.map((message) => (
              <div
                key={message.id}
                className='[content-visibility:auto] [contain-intrinsic-size:auto_120px]'
              >
                <MessageItem message={message} />
              </div>
            ))
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
