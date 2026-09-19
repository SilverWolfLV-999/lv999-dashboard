import { auth } from '@clerk/nextjs/server';
import { deleteArtifact, getArtifact } from '@/features/agent/api/service';
import { getSignedUrl } from '@/lib/oss';

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

  // 图片产物：附签发预览 URL（3600s），客户端 <img> 直连 OSS；每次查询重新签发
  const previewUrl =
    artifact.kind === 'image' && artifact.storageKey
      ? await getSignedUrl(artifact.storageKey, 3600)
      : null;
  return Response.json({ ...artifact, previewUrl });
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
