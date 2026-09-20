import { toast } from 'sonner';

/**
 * 下载资产（客户端）。
 *
 * 先探测资产是否仍存在（详情端点）：资产在「我的资产」中被删除后，
 * 历史卡片/列表的按钮可能仍可点击——直接导航会把用户带到纯文本 404 页，
 * 因此已删除时给出友好提示、不再跳转；存在则原生导航触发 302（OSS 签名）下载。
 */
export async function downloadAsset(assetId: string): Promise<void> {
  try {
    const response = await fetch(`/api/agent/assets/${assetId}`);
    if (response.status === 404) {
      toast.error('该资产已被删除，无法下载');
      return;
    }
    if (!response.ok) {
      toast.error('下载失败，请稍后重试');
      return;
    }
  } catch {
    toast.error('下载失败，请检查网络后重试');
    return;
  }
  window.location.href = `/api/agent/assets/${assetId}/download`;
}
