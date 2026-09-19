import { auth } from '@clerk/nextjs/server';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateId,
  toUIMessageStream,
  type InferAgentUIMessage,
  type UIMessage
} from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from 'resumable-stream';
import { buildAgent } from '@/features/agent/api/agent';
import {
  applyAutoTitle,
  clearConversationActiveStream,
  getConversation,
  saveUserMessage,
  setConversationActiveStream,
  syncConversationMessages,
  touchConversation
} from '@/features/agent/api/service';
import { watchAgentStop } from '@/features/agent/api/stop-signal';

export const runtime = 'nodejs';
export const maxDuration = 300;

function extractText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: { messages?: unknown; conversationId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const messages = body.messages as UIMessage[] | undefined;
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : undefined;
  if (!Array.isArray(messages) || messages.length === 0 || !conversationId) {
    return new Response('messages and conversationId are required', { status: 400 });
  }

  const conversation = await getConversation(userId, conversationId);
  if (!conversation) {
    return new Response('Conversation not found', { status: 404 });
  }

  // 请求开始先落用户消息（异常场景不丢输入），并使用首条消息生成会话标题
  const lastUserMessage = messages.toReversed().find((message) => message.role === 'user');
  if (lastUserMessage) {
    await saveUserMessage(conversationId, lastUserMessage);
    const userText = extractText(lastUserMessage);
    if (userText) {
      await applyAutoTitle(userId, conversation, userText);
    }
  }

  const agent = buildAgent({ userId, conversationId, modelKey: conversation.model });
  type AgentUIMessage = InferAgentUIMessage<typeof agent>;

  // 可恢复流 id + 停止信号消费端：
  // stop 端点写 Redis 标志 → 这里轮询命中后 abort 底层生成（真取消），
  // onEnd 按中断路径把已生成部分作为权威版本落库。
  const streamId = generateId();
  const abortController = new AbortController();
  const stopWatching = watchAgentStop(streamId, () => {
    abortController.abort();
  });

  const result = await agent.stream({
    messages: await convertToModelMessages(messages, { ignoreIncompleteToolCalls: true }),
    abortSignal: abortController.signal
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages as AgentUIMessage[],
      onEnd: async ({ messages: finalMessages }) => {
        stopWatching();
        await syncConversationMessages(conversationId, finalMessages);
        await clearConversationActiveStream(conversationId, streamId);
        await touchConversation(conversationId);
      }
    }),
    async consumeSseStream({ stream }) {
      // 交给 resumable-stream：生产者会在无人订阅时把流写完整（waitUntil 保活），
      // 客户端可在这条流进行中通过 GET /api/agent/chat/[id]/stream 重新订阅（刷新/切回实时重连）。
      try {
        const streamContext = createResumableStreamContext({ waitUntil: after });
        await streamContext.createNewResumableStream(streamId, () => stream);
        await setConversationActiveStream(conversationId, streamId);
      } catch (error) {
        // 降级：resumable 建立失败时仍继续直接流式返回；断开场景下的后台完成不再受保障
        console.error('[agent] resumable stream setup failed:', error);
        await stream.cancel().catch(() => {});
      }
    }
  });
}
