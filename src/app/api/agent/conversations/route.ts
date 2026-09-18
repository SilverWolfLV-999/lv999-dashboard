import { auth } from '@clerk/nextjs/server';
import { createConversation, listConversations } from '@/features/agent/api/service';
import { DEFAULT_MODEL, isModelKey } from '@/features/agent/constants/models';

export const runtime = 'nodejs';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }
  const conversations = await listConversations(userId);
  return Response.json({ conversations });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: { model?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const model = isModelKey(body.model) ? body.model : DEFAULT_MODEL;
  const conversation = await createConversation(userId, model);
  return Response.json(conversation, { status: 201 });
}
