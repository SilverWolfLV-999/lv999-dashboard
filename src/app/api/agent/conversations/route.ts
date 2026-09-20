import { auth } from '@clerk/nextjs/server';
import { apiError } from '@/lib/api-error';
import { createConversation, listConversations } from '@/features/agent/api/service';
import { DEFAULT_MODEL, isModelKey } from '@/features/agent/constants/models';

export const runtime = 'nodejs';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return apiError(401, 'unauthorized', 'Unauthorized');
  }
  const conversations = await listConversations(userId);
  return Response.json({ conversations });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return apiError(401, 'unauthorized', 'Unauthorized');
  }

  let body: { model?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError(400, 'invalid_json', 'Invalid JSON body');
  }

  const model = isModelKey(body.model) ? body.model : DEFAULT_MODEL;
  const conversation = await createConversation(userId, model);
  return Response.json(conversation, { status: 201 });
}
