'use client';

import type { DesignDocument } from '../api/types';
import { EditorProvider } from '../lib/editor-context';
import { EditorCanvas } from './editor-canvas';
import { EditorToolbar } from './editor-toolbar';
import { PropertiesPanel } from './properties-panel';

/**
 * 设计画布编辑器根组件（纯客户端孤岛，经 next/dynamic({ ssr:false }) 挂载）。
 * EditorProvider 持有文档/历史/相机/保存状态；布局为「顶部工具栏 + 画布 + 右侧属性/图层」。
 * 高度按 dashboard Header 扣减（移动端 h-16、桌面 h-14），内部各自滚动。
 */
interface DesignEditorProps {
  /** 已存 design 资产 id；新建时为 null */
  assetId: string | null;
  initialTitle: string;
  initialDocument: DesignDocument;
}

export function DesignEditor({ assetId, initialTitle, initialDocument }: DesignEditorProps) {
  return (
    <EditorProvider assetId={assetId} initialTitle={initialTitle} initialDocument={initialDocument}>
      <div className='flex h-[calc(100svh-4rem)] min-w-0 flex-1 flex-col md:h-[calc(100svh-3.5rem)]'>
        <EditorToolbar />
        <div className='flex min-h-0 flex-1'>
          <EditorCanvas />
          <aside className='hidden w-64 shrink-0 border-l lg:block'>
            <PropertiesPanel />
          </aside>
        </div>
      </div>
    </EditorProvider>
  );
}
