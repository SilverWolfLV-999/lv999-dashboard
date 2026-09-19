import { toast } from 'sonner';

/**
 * 下载产物（客户端）。
 *
 * 先探测产物是否仍存在（详情端点）：产物在产物中心被删除后，
 * 会话内的历史卡片按钮仍可点击——直接导航会把用户带到纯文本 404 页，
 * 因此已删除时给出友好提示、不再跳转；存在则原生导航触发 302（OSS 签名）下载。
 */
export async function downloadArtifact(artifactId: string): Promise<void> {
  try {
    const response = await fetch(`/api/agent/artifacts/${artifactId}`);
    if (response.status === 404) {
      toast.error('该产物已被删除，无法下载');
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
  window.location.href = `/api/agent/artifacts/${artifactId}/download`;
}
