'use client';

import { useQuery } from '@tanstack/react-query';
import { useRef, type RefObject } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Icons } from '@/components/icons';
import { assetsQueryOptions } from '../api/queries';
import { assetRawUrl } from '../hooks/use-asset-image';
import { useEditor } from '../lib/editor-context';
import type { Asset } from '@/features/agent/api/types';

/**
 * 「插入图片」选择器：从我的资产（kind=image）中选一张插入画布。
 * 只存资产引用 assetId（不存字节）；缩略图经同源 /raw 代理加载，
 * 并在加载完成时记录自然尺寸，插入时据此等比缩放。
 */
interface AssetImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssetImagePicker({ open, onOpenChange }: AssetImagePickerProps) {
  const { insertImage } = useEditor();
  const { data, isLoading, isError } = useQuery({
    ...assetsQueryOptions({ kind: 'image', page: 1, limit: 60 }),
    enabled: open
  });
  const naturalRef = useRef<Map<string, { width: number; height: number }>>(new Map());

  const handlePick = (assetId: string) => {
    insertImage(assetId, naturalRef.current.get(assetId) ?? null);
    onOpenChange(false);
  };

  const assets = data?.assets ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>插入图片</DialogTitle>
          <DialogDescription>从「我的资产」中选择一张图片插入画布。</DialogDescription>
        </DialogHeader>
        <div className='max-h-[60svh] min-h-40 overflow-y-auto'>
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
              还没有图片资产。可先在「Agent 创作」中生成图片。
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
