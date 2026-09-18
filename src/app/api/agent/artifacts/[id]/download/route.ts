import { auth } from '@clerk/nextjs/server';
import { getArtifact } from '@/features/agent/api/service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

function buildFileName(title: string, kind: string): string {
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'artifact';
  const extension = kind === 'html' ? 'html' : 'md';
  return `${safeTitle}.${extension}`;
}

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
  if (artifact.content === null) {
    // Phase 2 起 OSS 存储的产物走签名 URL，不再经此接口
    return new Response('Artifact content is stored externally', { status: 501 });
  }

  const fileName = buildFileName(artifact.title, artifact.kind);
  return new Response(artifact.content, {
    headers: {
      'Content-Type': artifact.mime ?? 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, no-store'
    }
  });
}
