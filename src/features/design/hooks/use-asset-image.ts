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
