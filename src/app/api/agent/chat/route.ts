import { auth } from '@clerk/nextjs/server';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateId,
  toUIMessageStream,
  TypeValidationError,
  validateUIMessages,
  type InferAgentUIMessage,
  type UIMessage
} from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from 'resumable-stream';
import {
  agentValidationTools,
  buildAgent,
  type AgentValidationUIMessage
} from '@/features/agent/api/agent';
import {
  applyAutoTitle,
  cleanupSupersededResponses,
  clearConversationActiveStream,
  getConversation,
  saveUserMessage,
  setConversationActiveStream,
  syncConversationMessages,
  touchConversation
} from '@/features/agent/api/service';
import { requestAgentStop, watchAgentStop } from '@/features/agent/api/stop-signal';
import { checkRateLimit } from '@/features/agent/api/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Vercel 函数请求体上限为 4.5MB，这里留出余量 */
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGES = 200;
const MAX_PARTS_PER_MESSAGE = 500;
const CHAT_RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW_SECONDS = 60;

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

  // 速率限制（按用户）：保护 LLM 调用成本（官方部署指南建议）
  if (!(await checkRateLimit('chat', userId, CHAT_RATE_LIMIT, RATE_LIMIT_WINDOW_SECONDS))) {
    return new Response('Too many requests', { status: 429 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
    return new Response('Request body too large', { status: 413 });
  }
  let body: { messages?: unknown; conversationId?: unknown };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const messages = body.messages as UIMessage[] | undefined;
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : undefined;
  if (!Array.isArray(messages) || messages.length === 0 || !conversationId) {
    return new Response('messages and conversationId are required', { status: 400 });
  }
  if (
    messages.length > MAX_MESSAGES ||
    messages.some(
      (message) => Array.isArray(message?.parts) && message.parts.length > MAX_PARTS_PER_MESSAGE
    )
  ) {
    return new Response('Too many messages', { status: 413 });
  }

  // 官方要求：含工具调用的消息在进入模型前必须先校验（畸形历史 → 400 而非 500）
  let validatedMessages: AgentValidationUIMessage[];
  try {
    validatedMessages = await validateUIMessages<AgentValidationUIMessage>({
      messages,
      tools: agentValidationTools
    });
  } catch (error) {
    if (TypeValidationError.isInstance(error)) {
      return new Response('Invalid messages', { status: 400 });
    }
    throw error;
  }

  const conversation = await getConversation(userId, conversationId);
  if (!conversation) {
    return new Response('Conversation not found', { status: 404 });
  }

  // 并发防护：若仍有旧流在运行（如网络中断造成的幽灵生产），先发出停止信号再开新流
  if (conversation.activeStreamId) {
    await requestAgentStop(conversation.activeStreamId);
  }

  // 请求开始先落用户消息（异常场景不丢输入），并使用首条消息生成会话标题
  const lastUserMessage = messages.toReversed().find((message) => message.role === 'user');
  if (lastUserMessage) {
    await saveUserMessage(conversationId, lastUserMessage);
    // 重试/重新生成：清掉被取代的旧回答（守卫：仅当该用户消息仍是会话最后一条用户消息）
    await cleanupSupersededResponses(conversationId, lastUserMessage.id);
    const userText = extractText(lastUserMessage);
    if (userText) {
      await applyAutoTitle(userId, conversation, userText);
    }
  }

  const agent = buildAgent({ userId, conversationId, modelKey: conversation.model });
  type AgentUIMessage = InferAgentUIMessage<typeof agent>;

  // 开新流前先登记活跃流（官方要求开始新流时立即更新，防止窗口期刷新重连到旧流或拿 204）；
  // 停止信号消费端：stop 端点写 Redis 标志 → 这里轮询命中后 abort 底层生成（真取消）。
  const streamId = generateId();
  await setConversationActiveStream(conversationId, streamId);

  const abortController = new AbortController();
  const stopWatching = watchAgentStop(streamId, () => {
    abortController.abort();
  });

  const result = await agent
    .stream({
      messages: await convertToModelMessages(validatedMessages, {
        ignoreIncompleteToolCalls: true
      }),
      abortSignal: abortController.signal
    })
    .catch(async (error: unknown) => {
      // 建流失败：停止轮询并清理活跃流登记，避免轮询泄漏与幽灵引用
      stopWatching();
      await clearConversationActiveStream(conversationId, streamId);
      throw error;
    });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages as AgentUIMessage[],
      // 把本轮流 id 随响应消息的 metadata 下发（客户端停止时据此携带最新流 id）
      messageMetadata: ({ part }) => (part.type === 'start' ? { streamId } : undefined),
      onEnd: async ({ messages: finalMessages }) => {
        stopWatching();
        // 按所有权更新：仅本轮新消息允许冲突更新，旧消息（客户端视图）不覆盖（见 service.ts）
        await syncConversationMessages(conversationId, messages, finalMessages);
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
        // 降级：建立失败时清理活跃流登记并取消该分支，主响应仍继续直接流式返回
        console.error('[agent] resumable stream setup failed:', error);
        await clearConversationActiveStream(conversationId, streamId);
        await stream.cancel().catch(() => {});
      }
    }
  });
}
