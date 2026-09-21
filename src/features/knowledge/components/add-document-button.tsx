'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

/**
 * 对话框按需加载：内含资产列表查询与表单链路，未点击「新增文档」就不下载该 chunk
 * （bundle-dynamic-imports，与资产预览弹窗同策略）。
 */
const AddDocumentDialog = dynamic(
  () => import('./add-document-dialog').then((module) => module.AddDocumentDialog),
  { ssr: false }
);

export function AddDocumentButton() {
  const [open, setOpen] = useState(false);
  // 首次点击后才挂载（挂载即触发 chunk 加载）；之后保持挂载以保留关闭动画
  const [mounted, setMounted] = useState(false);

  return (
    <>
      <Button
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <Icons.add />
        新增文档
      </Button>
      {mounted && <AddDocumentDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}
