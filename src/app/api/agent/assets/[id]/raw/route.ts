import { auth } from '@clerk/nextjs/server';
import { apiError } from '@/lib/api-error';
import { isUuid } from '@/lib/utils';
import { getAsset } from '@/features/agent/api/service';
import { getSignedUrl, videoSnapshotUrl } from '@/lib/oss';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 资产字节同源代理（关键：规避 canvas 跨域污染）。
 *
 * 设计画布内引用的图片一律经此端点加载：服务端用短期签名 URL 拉取 OSS 对象后
 * 以「同源」流式回传字节。因响应与页面同源，canvas 不会被 taint，
 * stage.toDataURL 导出正常，无需为 OSS 桶配置 CORS。
 *
 * 图片资产内容不可变（编辑产出新资产、新 id），故可安全地做浏览器私有缓存。
 *
 * 视频封面：带 ?snapshot=1 时，对 video 资产改用 OSS 原生视频截帧（videoSnapshotUrl）签发
 * 封面帧 URL 后同样以同源流式回传（列表/卡片/预览 poster 共用，避免客户端签名与 CORS）。
 */
export async function GET(request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return apiError(401, 'unauthorized', 'Unauthorized');
  }
  const { id } = await context.params;
  if (!isUuid(id)) {
    return apiError(404, 'not_found', 'Asset not found');
  }
  const asset = await getAsset(userId, id);
  // 仅带 storageKey 的二进制资产可代理（图片 / design 预览 PNG / 视频）
  if (!asset || !asset.storageKey) {
    return apiError(404, 'not_found', 'Asset not found');
  }

  // 视频封面（?snapshot=1）走 OSS 视频截帧；其余走完整对象的短期签名 URL（300s 足够一次拉取）
  const wantSnapshot = new URL(request.url).searchParams.get('snapshot') === '1';
  const signedUrl =
    wantSnapshot && asset.kind === 'video'
      ? videoSnapshotUrl(asset.storageKey, { width: 400, expiresInSeconds: 300 })
      : await getSignedUrl(asset.storageKey, 300);
  const upstream = await fetch(signedUrl);
  if (!upstream.ok || !upstream.body) {
    // 行还在但 OSS 对象缺失（历史遗留/被清理），或视频截帧不支持：明确 404，交由客户端占位处理
    return apiError(404, 'not_found', 'Asset object not found');
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
