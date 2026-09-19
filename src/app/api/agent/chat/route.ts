import { auth } from '@clerk/nextjs/server';
import { createAgentUIStreamResponse, type InferAgentUIMessage, type UIMessage } from 'ai';
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

  // 请求开始先落用户消息（中断场景不丢输入），并使用首条消息生成会话标题
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

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    originalMessages: messages as AgentUIMessage[],
    // 点停止/刷新页面 = 客户端断开 = 真正中止生成（onEnd 按 isAborted 尽力落库）；
    // 切换会话不触发 abort（chat-store 中的实例继续消费流，后台生成完并完整落库）
    abortSignal: request.signal,
    onEnd: async ({ messages: finalMessages, isAborted }) => {
      await syncConversationMessages(conversationId, finalMessages);
      await touchConversation(conversationId);
      if (isAborted) {
        console.warn(`[agent] stream aborted for conversation ${conversationId}`);
      }
    }
  });
}
