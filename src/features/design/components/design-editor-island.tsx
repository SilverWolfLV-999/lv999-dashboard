'use client';

import dynamic from 'next/dynamic';
import type { DesignDocument } from '../api/types';

/**
 * 纯客户端孤岛的挂载点：Konva/react-konva 依赖 window，必须 ssr:false。
 * 服务端页面渲染本组件（含骨架），编辑器 chunk 仅在客户端加载后挂载。
 */
const DesignEditor = dynamic(() => import('./design-editor').then((m) => m.DesignEditor), {
  ssr: false,
  loading: () => <EditorSkeleton />
});

interface DesignEditorIslandProps {
  assetId: string | null;
  initialTitle: string;
  initialDocument: DesignDocument;
}

export function DesignEditorIsland(props: DesignEditorIslandProps) {
  return <DesignEditor {...props} />;
}

function EditorSkeleton() {
  return (
    <div className='flex h-[calc(100svh-4rem)] min-w-0 flex-1 animate-pulse flex-col md:h-[calc(100svh-3.5rem)]'>
      <div className='bg-muted h-12 shrink-0 border-b' />
      <div className='flex min-h-0 flex-1'>
        <div className='bg-muted/40 flex-1' />
        <div className='bg-muted hidden w-64 shrink-0 border-l lg:block' />
      </div>
    </div>
  );
}
