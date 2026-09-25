'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useRef, type RefObject } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { FileUploader } from '@/components/file-uploader';
import { Icons } from '@/components/icons';
import { ApiError } from '@/lib/api-client';
import { uploadImageMutation } from '../api/mutations';
import { assetsQueryOptions } from '../api/queries';
import { assetRawUrl } from '../hooks/use-asset-image';
import { useEditor } from '../lib/editor-context';
import type { Asset } from '@/features/agent/api/types';

/**
 * 「插入图片」选择器：上传本地图片 + 从我的资产（kind=image）中选一张插入画布。
 * 只存资产引用 assetId（不存字节）；缩略图经同源 /raw 代理加载，
 * 并在加载完成时记录自然尺寸，插入时据此等比缩放。
 */
interface AssetImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 客户端上传约束（不可 import 服务端 lib——其依赖 sharp 会污染客户端 bundle） */
const MAX_UPLOAD_IMAGE_BYTES = 10 * 1024 * 1024;
const UPLOAD_IMAGE_ACCEPT = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp']
};

/** 上传错误 → 中文文案（复用 413/400/429 分支约定） */
function resolveUploadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) return '图片超过 10MB 上限';
    if (error.status === 400) return '仅支持 PNG/JPEG/WebP 图片，请检查文件';
    if (error.status === 429) return '上传过于频繁，请稍后再试';
  }
  return '上传失败，请稍后重试';
}

/** sharp 未返回尺寸时的回退：经同源 /raw 加载读 naturalWidth/Height（失败返回 null） */
function loadNaturalSize(assetId: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.addEventListener('load', () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    );
    image.addEventListener('error', () => resolve(null));
    image.src = assetRawUrl(assetId);
  });
}

export function AssetImagePicker({ open, onOpenChange }: AssetImagePickerProps) {
  const { insertImage } = useEditor();
  const { data, isLoading, isError } = useQuery({
    ...assetsQueryOptions({ kind: 'image', page: 1, limit: 60 }),
    enabled: open
  });
  const naturalRef = useRef<Map<string, { width: number; height: number }>>(new Map());
  const { mutateAsync: uploadImage } = useMutation(uploadImageMutation);

  const handlePick = (assetId: string) => {
    insertImage(assetId, naturalRef.current.get(assetId) ?? null);
    onOpenChange(false);
  };

  // FileUploader.onUpload：上传 → 插入画布 → 关闭弹窗；失败抛出中文消息（由 FileUploader 的 toast 展示）
  const handleUpload = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      try {
        const result = await uploadImage({ file });
        const natural =
          result.width && result.height
            ? { width: result.width, height: result.height }
            : await loadNaturalSize(result.id);
        insertImage(result.id, natural);
        onOpenChange(false);
      } catch (error) {
        throw new Error(resolveUploadError(error), { cause: error });
      }
    },
    [uploadImage, insertImage, onOpenChange]
  );

  const assets = data?.assets ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>插入图片</DialogTitle>
          <DialogDescription>上传本地图片或从「我的资产」中选择一张插入画布。</DialogDescription>
        </DialogHeader>

        <div className='space-y-1.5'>
          <span className='text-sm font-medium'>上传本地图片</span>
          <FileUploader
            accept={UPLOAD_IMAGE_ACCEPT}
            maxSize={MAX_UPLOAD_IMAGE_BYTES}
            maxFiles={1}
            onUpload={handleUpload}
            className='h-32'
          />
          <p className='text-muted-foreground text-xs'>
            支持 PNG/JPEG/WebP，单个不超过 10MB；上传后自动插入画布并存入「我的资产」（来源=上传）。
          </p>
        </div>

        <Separator />

        <div className='space-y-1.5'>
          <span className='text-sm font-medium'>我的资产</span>
          <div className='max-h-[45svh] min-h-32 overflow-y-auto'>
            {isLoading ? (
              <div className='text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm'>
                <Icons.spinner className='animate-spin' /> 加载中…
              </div>
            ) : isError ? (
              <div className='text-destructive py-12 text-center text-sm'>
                加载图片资产失败，请稍后重试。
              </div>
            ) : assets.length === 0 ? (
              <div className='text-muted-foreground py-12 text-center text-sm'>
                还没有图片资产。可上传本地图片，或在「Agent 创作」中生成。
              </div>
            ) : (
              <ul className='grid grid-cols-3 gap-3 sm:grid-cols-4'>
                {assets.map((asset) => (
                  <li key={asset.id}>
                    <button
                      type='button'
                      onClick={() => handlePick(asset.id)}
                      className='border-border hover:border-primary focus-visible:ring-ring group flex w-full flex-col gap-1.5 rounded-lg border p-1.5 text-left focus-visible:ring-2 focus-visible:outline-none'
                    >
                      <AssetThumb asset={asset} onNatural={naturalRef} />
                      <span className='w-full truncate text-xs'>{asset.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssetThumb({
  asset,
  onNatural
}: {
  asset: Asset;
  onNatural: RefObject<Map<string, { width: number; height: number }>>;
}) {
  return (
    // oxlint-disable-next-line nextjs/no-img-element -- 经同源 /raw 代理加载缩略图，画布导出不被跨域污染
    <img
      src={assetRawUrl(asset.id)}
      alt={asset.title}
      loading='lazy'
      onLoad={(event) => {
        const target = event.currentTarget;
        onNatural.current.set(asset.id, {
          width: target.naturalWidth,
          height: target.naturalHeight
        });
      }}
      className='bg-muted aspect-square w-full rounded object-cover'
    />
  );
}
