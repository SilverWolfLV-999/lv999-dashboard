import { auth } from '@clerk/nextjs/server';
import { getArtifact } from '@/features/agent/api/service';
import { getSignedUrl } from '@/lib/oss';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

function buildFileName(title: string, kind: string): string {
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'artifact';
  const extension = kind === 'html' ? 'html' : kind === 'image' ? 'png' : 'md';
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
    // Phase 2：OSS 存储的产物（图片）→ 带 response 覆盖的签名 URL（TTL 300s，附件下载名），302 直连 OSS
    // （只覆盖 content-disposition：OSS 不允许覆盖 content-type，对象上传时已固化 image/png）
    if (artifact.kind === 'image' && artifact.storageKey) {
      const fileName = buildFileName(artifact.title, artifact.kind);
      const url = await getSignedUrl(artifact.storageKey, 300, {
        contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
      });
      return Response.redirect(url, 302);
    }
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
