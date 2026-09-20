'use client';

import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useRef } from 'react';
import { Layer, Rect, Stage } from 'react-konva';
import { Icons } from '@/components/icons';
import { useEditor } from '../lib/editor-context';
import { EditableObject } from './editable-object';
import { TextOverlay } from './text-overlay';

/** 工作区点阵网格基准间距（文档坐标，随相机缩放） */
const GRID_SIZE = 24;

/**
 * 画布：受控 Stage（相机 = zoom + position）+ 单层 Layer。
 * - 背景 Rect listening=false：点击空白处 e.target === Stage → 取消选中并开启平移拖拽；
 * - 对象拖拽/变换只在结束时提交（见 EditableObject）；
 * - 滚轮相对指针缩放、空白处拖拽平移；
 * - ResizeObserver 量容器尺寸回写 context（供自适应与坐标换算）。
 */
export function EditorCanvas() {
  const {
    document: doc,
    objects,
    selectedId,
    editingTextId,
    select,
    commitObject,
    startTextEdit,
    zoom,
    position,
    stageRef,
    containerSize,
    setContainerSize,
    handleWheel,
    panTo
  } = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [setContainerSize]);

  const handlePointerDown = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = event.target.getStage();
    if (!stage) return;
    if (event.target === stage) {
      select(null);
      stage.draggable(true);
    } else {
      stage.draggable(false);
    }
  };

  const handleStageDragEnd = (event: KonvaEventObject<DragEvent>) => {
    const stage = stageRef.current;
    if (stage && event.target === stage) {
      panTo({ x: stage.x(), y: stage.y() });
      stage.draggable(false);
    }
  };

  // 平移过程中同步相机状态：保证点阵网格与纸张投影跟手（不等到 dragEnd 才跳变）
  const handleStageDragMove = (event: KonvaEventObject<DragEvent>) => {
    const stage = stageRef.current;
    if (stage && event.target === stage) {
      panTo({ x: stage.x(), y: stage.y() });
    }
  };

  // 网格 LOD：缩放过小时加倍步长，避免点阵过密产生摩尔纹
  let gridStep = GRID_SIZE;
  while (gridStep * zoom < 12) gridStep *= 2;

  return (
    <div
      ref={containerRef}
      className='bg-muted/60 relative min-h-0 flex-1 overflow-hidden'
      style={{
        backgroundImage:
          'radial-gradient(circle, color-mix(in oklch, var(--foreground) 12%, transparent) 1px, transparent 1px)',
        backgroundSize: `${gridStep * zoom}px ${gridStep * zoom}px`,
        backgroundPosition: `${position.x}px ${position.y}px`
      }}
    >
      {/* 纸张投影：DOM 阴影层随相机实时定位；不在 canvas 上，故绝不进入导出 PNG */}
      <div
        aria-hidden
        className='shadow-xl pointer-events-none absolute'
        style={{
          left: position.x,
          top: position.y,
          width: doc.width * zoom,
          height: doc.height * zoom
        }}
      />
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        scaleX={zoom}
        scaleY={zoom}
        x={position.x}
        y={position.y}
        onWheel={handleWheel}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onDragMove={handleStageDragMove}
        onDragEnd={handleStageDragEnd}
      >
        <Layer>
          {/* 文档背景：不拦截事件（点击穿透到 Stage 以取消选中），导出时作为整幅底色 */}
          <Rect
            listening={false}
            x={0}
            y={0}
            width={doc.width}
            height={doc.height}
            fill={doc.background}
          />
          {objects.map((object) => (
            <EditableObject
              key={object.id}
              object={object}
              selected={object.id === selectedId}
              isEditing={object.id === editingTextId}
              onSelect={select}
              onCommit={commitObject}
              onStartTextEdit={startTextEdit}
            />
          ))}
        </Layer>
      </Stage>
      <TextOverlay />
      {objects.length === 0 && (
        <div className='pointer-events-none absolute inset-0 flex items-center justify-center p-6'>
          <div className='bg-background/90 text-muted-foreground flex flex-col items-center gap-2 rounded-xl border px-6 py-5 text-center shadow-sm backdrop-blur-sm'>
            <span className='bg-muted text-foreground flex size-9 items-center justify-center rounded-full'>
              <Icons.palette className='size-4' />
            </span>
            <p className='text-foreground text-sm font-medium'>空白画布</p>
            <p className='max-w-56 text-xs leading-relaxed'>
              用顶部工具栏添加矩形、圆形、文字或图片；滚轮缩放、拖拽空白处平移。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
