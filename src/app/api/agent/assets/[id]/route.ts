import { auth } from '@clerk/nextjs/server';
import { apiError } from '@/lib/api-error';
import { isUuid } from '@/lib/utils';
import { deleteAsset, getAsset } from '@/features/agent/api/service';
import { getSignedUrl } from '@/lib/oss';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return apiError(401, 'unauthorized', 'Unauthorized');
  }
  const { id } = await context.params;
  if (!isUuid(id)) {
    return apiError(404, 'not_found', 'Asset not found');
  }
  const asset = await getAsset(userId, id);
  if (!asset) {
    return apiError(404, 'not_found', 'Asset not found');
  }

  // 图片资产：附签发预览 URL（3600s），客户端 <img> 直连 OSS；每次查询重新签发
  const previewUrl =
    asset.kind === 'image' && asset.storageKey ? await getSignedUrl(asset.storageKey, 3600) : null;
  return Response.json({ ...asset, previewUrl });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return apiError(401, 'unauthorized', 'Unauthorized');
  }
  const { id } = await context.params;
  if (!isUuid(id)) {
    return apiError(404, 'not_found', 'Asset not found');
  }
  const deleted = await deleteAsset(userId, id);
  if (!deleted) {
    return apiError(404, 'not_found', 'Asset not found');
  }
  return Response.json({ success: true });
}
