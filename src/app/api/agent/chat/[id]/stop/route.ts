import { auth } from '@clerk/nextjs/server';
import type { UIMessage } from 'ai';
import {
  clearConversationActiveStream,
  getConversation,
  saveAssistantSnapshot
} from '@/features/agent/api/service';
import { requestAgentStop } from '@/features/agent/api/stop-signal';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 停止活跃生成（官方 stop 端点模式）：
 * 1) 保存客户端部分快照（只插不覆盖，避免旧快照覆盖服务端更新版本）
 * 2) 写入停止信号，生产者轮询后 abort 生成（部分内容由服务端权威落库）
 * 3) 校验后清理 activeStreamId（若仍指向同一流，避免误清之后启动的新流）
 */
export async function POST(request: Request, context: RouteContext) {
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
    return Response.json({ success: true });
  }

  const body = (await request.json().catch(() => ({}))) as {
    activeStreamId?: string | null;
    assistantMessage?: UIMessage;
  };

  // 客户端携带了流 id 且与当前不一致 → 过期请求，忽略（避免误杀之后启动的新流）
  if (body.activeStreamId != null && body.activeStreamId !== activeStreamId) {
    return Response.json({ success: true });
  }

  if (body.assistantMessage) {
    await saveAssistantSnapshot(id, body.assistantMessage);
  }
  await requestAgentStop(activeStreamId);
  await clearConversationActiveStream(id, activeStreamId);
  return Response.json({ success: true });
}
