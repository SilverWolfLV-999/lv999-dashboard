import { auth } from '@clerk/nextjs/server';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type InferAgentUIMessage,
  type UIMessage
} from 'ai';
import { buildAgent } from '@/features/agent/api/agent';
import {
  applyAutoTitle,
  getConversation,
  saveUserMessage,
  syncConversationMessages,
  touchConversation
} from '@/features/agent/api/service';

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

  const result = await agent.stream({
    messages: await convertToModelMessages(messages, { ignoreIncompleteToolCalls: true })
  });

  // 关键：不 await。即使用户刷新/关闭页面导致连接断开，服务端也把流消费到生成结束，
  // 保证 onEnd 一定触发、助手消息（含产物工具调用）完整落库。
  // 语义说明：断开 ≠ 中止；真正的"取消生成"需要 run 级取消信令，暂不实现
  // （当前由 maxDuration 300s 与 agent 240s 超时兜底成本）。
  result.consumeStream({
    onError: (error) => {
      console.error(`[agent] background stream error for conversation ${conversationId}:`, error);
    }
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages as AgentUIMessage[],
      onEnd: async ({ messages: finalMessages, isAborted }) => {
        await syncConversationMessages(conversationId, finalMessages);
        await touchConversation(conversationId);
        if (isAborted) {
          console.warn(`[agent] stream aborted for conversation ${conversationId}`);
        }
      }
    })
  });
}
