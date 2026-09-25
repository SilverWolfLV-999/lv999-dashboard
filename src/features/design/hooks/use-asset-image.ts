'use client';

import { useEffect, useState } from 'react';

/**
 * 加载图片资产字节用于画布渲染。
 *
 * 一律经同源代理 /api/agent/assets/[id]/raw（服务端签名拉取 OSS 后同源回传），
 * 因此 canvas 不会被跨域污染，stage.toDataURL 导出正常，无需为 OSS 桶配置 CORS。
 * crossOrigin='anonymous' 对同源请求为防御性设置（不影响 cookie 发送）。
 */

export type AssetImageStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface AssetImageState {
  image: HTMLImageElement | null;
  status: AssetImageStatus;
  natural: { width: number; height: number } | null;
}

export function assetRawUrl(assetId: string): string {
  return `/api/agent/assets/${assetId}/raw`;
}

/**
 * 一次性读取图片资产的自然尺寸（经同源 /raw 代理）。
 * 用于「插入 / 替换前按真实比例等比缩放」：上传响应未带尺寸、AI 生成端点只返回 { id }
 * 等场景。加载失败返回 null（调用方回退：插入按正方形、替换沿用原框）。
 */
export function loadNaturalSize(
  assetId: string
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.addEventListener('load', () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    );
    image.addEventListener('error', () => resolve(null));
    image.src = assetRawUrl(assetId);
  });
}

export function useAssetImage(assetId: string | null): AssetImageState {
  const [state, setState] = useState<AssetImageState>({
    image: null,
    status: assetId ? 'loading' : 'idle',
    natural: null
  });

  useEffect(() => {
    if (!assetId) {
      setState({ image: null, status: 'idle', natural: null });
      return;
    }
    let cancelled = false;
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    setState({ image: null, status: 'loading', natural: null });
    const handleLoad = () => {
      if (cancelled) return;
      setState({
        image,
        status: 'loaded',
        natural: { width: image.naturalWidth, height: image.naturalHeight }
      });
    };
    const handleError = () => {
      if (!cancelled) setState({ image: null, status: 'error', natural: null });
    };
    image.addEventListener('load', handleLoad);
    image.addEventListener('error', handleError);
    image.src = assetRawUrl(assetId);
    return () => {
      cancelled = true;
      image.removeEventListener('load', handleLoad);
      image.removeEventListener('error', handleError);
    };
  }, [assetId]);

  return state;
}
