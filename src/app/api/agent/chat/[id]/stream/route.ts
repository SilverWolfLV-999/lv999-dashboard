import { auth } from '@clerk/nextjs/server';
import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from 'resumable-stream';
import { clearConversationActiveStream, getConversation } from '@/features/agent/api/service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 恢复端点：useChat({ resume: true }) 在挂载时（刷新/切回会话）自动 GET 此路由。
 * - 无活跃流：204（客户端直接使用数据库中的消息）
 * - 有活跃流：重连到进行中的流，先回放已缓冲内容再持续推送
 */
export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await context.params;
  const conversation = await getConversation(userId, id);
  if (!conversation) {
    return new Response('Conversation not found', { status: 404 });
  }

  const activeStreamId = conversation.activeStreamId;
  if (!activeStreamId) {
    return new Response(null, { status: 204 });
  }

  const streamContext = createResumableStreamContext({ waitUntil: after });
  const stream = await streamContext.resumeExistingStream(activeStreamId);
  if (!stream) {
    // 流已结束或不存在（生产者实例异常退出等）：清理残留引用，后续以数据库消息为准
    await clearConversationActiveStream(id, activeStreamId);
    return new Response(null, { status: 204 });
  }

  return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS });
}
