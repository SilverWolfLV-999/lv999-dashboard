import { auth } from '@clerk/nextjs/server';
import { deleteArtifact, getArtifact } from '@/features/agent/api/service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { id } = await context.params;
  const artifact = await getArtifact(userId, id);
  if (!artifact) {
    return new Response('Artifact not found', { status: 404 });
  }
  return Response.json(artifact);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { id } = await context.params;
  const deleted = await deleteArtifact(userId, id);
  if (!deleted) {
    return new Response('Artifact not found', { status: 404 });
  }
  return Response.json({ success: true });
}
