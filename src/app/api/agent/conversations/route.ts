import { auth } from '@clerk/nextjs/server';
import { apiError } from '@/lib/api-error';
import { createConversation, listConversations } from '@/features/agent/api/service';
import { DEFAULT_MODEL, isModelKey } from '@/features/agent/constants/models';
import { isSkillId } from '@/features/agent/constants/skills';

export const runtime = 'nodejs';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return apiError(401, 'unauthorized', 'Unauthorized');
  }
  // 直接返回 ConversationsResponse（conversations + assetCounts），与客户端 queryFn 形状一致
  const result = await listConversations(userId);
  return Response.json(result);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return apiError(401, 'unauthorized', 'Unauthorized');
  }

  let body: { model?: unknown; activeSkillId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError(400, 'invalid_json', 'Invalid JSON body');
  }

  const model = isModelKey(body.model) ? body.model : DEFAULT_MODEL;
  // 技能可缺省（null = 通用）；传了就必须是注册表内的已知 id
  const activeSkillId = body.activeSkillId ?? null;
  if (activeSkillId !== null && !isSkillId(activeSkillId)) {
    return apiError(400, 'invalid_request', 'Unknown skill id');
  }
  const conversation = await createConversation(userId, model, { activeSkillId });
  return Response.json(conversation, { status: 201 });
}
