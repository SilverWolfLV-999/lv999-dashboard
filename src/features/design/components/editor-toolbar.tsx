'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Icons, type Icon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useEditor } from '../lib/editor-context';
import { AssetImagePicker } from './asset-image-picker';

/**
 * 顶部工具栏：标题、加图形/文字/图片、撤销重做、缩放、导出、保存。
 * 图标按钮统一用 ToolButton（Tooltip + aria-label，满足可达性）。
 */

interface ToolButtonProps {
  label: string;
  icon: Icon;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

function ToolButton({ label, icon: IconCmp, onClick, disabled, active }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-pressed={active}
            className={cn(active && 'bg-muted text-foreground')}
          />
        }
      >
        <IconCmp />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function EditorToolbar() {
  const {
    title,
    setTitle,
    addShape,
    undo,
    redo,
    canUndo,
    canRedo,
    zoom,
    zoomIn,
    zoomOut,
    fitToScreen,
    exportPng,
    save,
    isSaving,
    isDirty
  } = useEditor();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <TooltipProvider>
      <div className='flex h-12 shrink-0 flex-wrap items-center gap-1 border-b px-2 sm:flex-nowrap sm:px-3'>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder='未命名设计'
          aria-label='设计标题'
          className='h-8 w-32 border-transparent bg-transparent px-2 shadow-none hover:bg-muted/60 focus-visible:border-input focus-visible:bg-background sm:w-44'
        />

        <Separator orientation='vertical' className='mx-1 h-6 data-vertical:self-center' />

        <ToolButton label='矩形' icon={Icons.square} onClick={() => addShape('rect')} />
        <ToolButton label='圆形' icon={Icons.circle} onClick={() => addShape('circle')} />
        <ToolButton label='文字' icon={Icons.text} onClick={() => addShape('text')} />
        <ToolButton label='插入图片' icon={Icons.media} onClick={() => setPickerOpen(true)} />

        <Separator orientation='vertical' className='mx-1 h-6 data-vertical:self-center' />

        <ToolButton label='撤销 (Ctrl+Z)' icon={Icons.undo} onClick={undo} disabled={!canUndo} />
        <ToolButton
          label='重做 (Ctrl+Shift+Z)'
          icon={Icons.redo}
          onClick={redo}
          disabled={!canRedo}
        />

        <div className='ml-auto flex items-center gap-2'>
          <div className='bg-muted/70 flex items-center rounded-lg p-0.5'>
            <ToolButton label='缩小' icon={Icons.minus} onClick={zoomOut} />
            <span className='text-muted-foreground w-11 text-center text-xs tabular-nums'>
              {Math.round(zoom * 100)}%
            </span>
            <ToolButton label='放大' icon={Icons.add} onClick={zoomIn} />
            <ToolButton label='适应画布' icon={Icons.maximize} onClick={fitToScreen} />
          </div>

          <Separator orientation='vertical' className='mx-0.5 h-6 data-vertical:self-center' />

          <Button variant='outline' size='sm' onClick={exportPng}>
            <Icons.download /> 导出
          </Button>
          <Button size='sm' onClick={() => void save()} disabled={isSaving}>
            {isSaving ? <Icons.spinner className='animate-spin' /> : <Icons.save />}
            保存
            {isDirty && !isSaving && (
              <span className='bg-background/80 ml-0.5 size-1.5 rounded-full' aria-hidden />
            )}
          </Button>
        </div>
      </div>

      <AssetImagePicker open={pickerOpen} onOpenChange={setPickerOpen} />
    </TooltipProvider>
  );
}
