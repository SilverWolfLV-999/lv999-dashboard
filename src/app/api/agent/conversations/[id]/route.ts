import { auth } from '@clerk/nextjs/server';
import {
  deleteConversation,
  getConversation,
  updateConversation
} from '@/features/agent/api/service';
import { isModelKey } from '@/features/agent/constants/models';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

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
  return Response.json(conversation);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { id } = await context.params;

  let body: { title?: unknown; model?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const patch: { title?: string; model?: string } = {};
  if (typeof body.title === 'string') {
    const title = body.title.trim();
    if (title.length < 1 || title.length > 100) {
      return new Response('title must be 1-100 characters', { status: 400 });
    }
    patch.title = title;
  }
  if (body.model !== undefined) {
    if (!isModelKey(body.model)) {
      return new Response('Unknown model key', { status: 400 });
    }
    patch.model = body.model;
  }
  if (Object.keys(patch).length === 0) {
    return new Response('Nothing to update', { status: 400 });
  }

  const conversation = await updateConversation(userId, id, patch);
  if (!conversation) {
    return new Response('Conversation not found', { status: 404 });
  }
  return Response.json(conversation);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { id } = await context.params;
  const deleted = await deleteConversation(userId, id);
  if (!deleted) {
    return new Response('Conversation not found', { status: 404 });
  }
  return Response.json({ success: true });
}
