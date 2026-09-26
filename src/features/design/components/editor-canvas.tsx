'use client';

import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Layer, Line, Rect, Stage, Transformer } from 'react-konva';
import { Icons } from '@/components/icons';
import type { DesignObject } from '../api/types';
import type { ObjectPatch, ObjectPatchEntry } from '../hooks/use-editor-reducer';
import { objectBounds, unionBox, type Box } from '../lib/document';
import { useEditor } from '../lib/editor-context';
import { computeSnap, sameGuides, snapThreshold, type Guide } from '../lib/snap';
import { EditableObject } from './editable-object';
import { TextOverlay } from './text-overlay';

/** 工作区点阵网格基准间距（文档坐标，随相机缩放） */
const GRID_SIZE = 24;
/** 选择框/参考线颜色（与对象高亮一致） */
const SELECTION_COLOR = '#3b82f6';
/** 吸附屏幕阈值（px）；文档坐标阈值 = 该值 / zoom，缩放下体验恒定 */
const SNAP_SCREEN_THRESHOLD = 6;

/**
 * 把 Transformer 的 scale 缩放折算回对象自身尺寸（提交前归一 scale，保证文档干净）。
 * 单选/多选共享此逻辑（多选时逐个节点折算，一次 commit 入一条历史）。
 */
function foldScale(
  object: DesignObject,
  node: Konva.Shape,
  scaleX: number,
  scaleY: number
): ObjectPatch {
  const base = { x: node.x(), y: node.y(), rotation: node.rotation() };
  if (object.type === 'rect' || object.type === 'image') {
    return {
      ...base,
      width: Math.max(1, node.width() * scaleX),
      height: Math.max(1, node.height() * scaleY)
    };
  }
  if (object.type === 'circle') {
    const average = (scaleX + scaleY) / 2;
    return { ...base, radius: Math.max(1, object.radius * average) };
  }
  const average = (scaleX + scaleY) / 2;
  return { ...base, fontSize: Math.max(4, object.fontSize * average) };
}

interface DragState {
  /** 本次拖拽的移动单元（单选=1，多选且拖的是选中项=全部选中） */
  ids: string[];
  /** 拖拽起始时各节点位置（文档坐标） */
  start: Map<string, { x: number; y: number }>;
  /** 移动单元的整体 AABB（起始） */
  groupBox: Box;
  /** 其他对象的 AABB（吸附目标，拖拽起始预计算一次） */
  otherBoxes: Box[];
  /** 画布框（吸附目标之一） */
  canvasBox: Box;
}

/**
 * 画布：受控 Stage（相机 = zoom + position）+ 单层 Layer。
 * - 共享 Transformer（Konva 多选官方范式）：canvas 层单例 + id→shapeRef 注册表，selectedIds 变化时挂载节点；
 * - 背景 Rect listening=false：点击空白处 e.target === Stage → 清空选中并开启平移拖拽；
 * - 拖拽：单选移动自身；多选拖选中项则整体移动；拖拽中按吸附修正节点位置并渲染参考线，
 *   仅在 dragEnd 提交吸附后坐标（Konva 铁律：拖拽中只改节点视觉，不入文档）；
 * - 滚轮相对指针缩放、空白处拖拽平移；ResizeObserver 量容器尺寸回写 context。
 */
export function EditorCanvas() {
  const {
    document: doc,
    objects,
    selectedIds,
    selectedObjects,
    editingTextId,
    select,
    toggleSelect,
    clearSelection,
    commitObject,
    commitObjects,
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
  const transformerRef = useRef<Konva.Transformer>(null);
  /** id → Konva 节点注册表（对象挂载时上报，卸载时注销） */
  const shapeRegistry = useRef<Map<string, Konva.Shape>>(new Map());
  const dragStateRef = useRef<DragState | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);

  // latest refs：让拖拽/变换回调保持稳定引用（memo 化对象不因回调变化而重渲染）
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const docRef = useRef(doc);
  docRef.current = doc;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

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

  const registerShape = useCallback((id: string, node: Konva.Shape | null) => {
    if (node) shapeRegistry.current.set(id, node);
    else shapeRegistry.current.delete(id);
  }, []);

  // 共享 Transformer 挂载选中节点：selectedIds / 文档变化时刷新（文字编辑态隐藏）
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const nodes = editingTextId
      ? []
      : selectedIds
          .map((id) => shapeRegistry.current.get(id))
          .filter((node): node is Konva.Shape => Boolean(node));
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedIds, editingTextId, objects]);

  const handleSelect = useCallback(
    (id: string, additive: boolean) => {
      if (additive) toggleSelect(id);
      else select([id]);
    },
    [select, toggleSelect]
  );

  const handleDragStart = useCallback((id: string) => {
    const selected = selectedIdsRef.current;
    const ids = selected.includes(id) && selected.length > 1 ? selected : [id];
    const start = new Map<string, { x: number; y: number }>();
    for (const sid of ids) {
      const node = shapeRegistry.current.get(sid);
      if (node) start.set(sid, { x: node.x(), y: node.y() });
    }
    const all = objectsRef.current;
    const idSet = new Set(ids);
    const groupBox = unionBox(all.filter((object) => idSet.has(object.id)).map(objectBounds)) ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    };
    const otherBoxes = all.filter((object) => !idSet.has(object.id)).map(objectBounds);
    const canvasDoc = docRef.current;
    dragStateRef.current = {
      ids,
      start,
      groupBox,
      otherBoxes,
      canvasBox: { x: 0, y: 0, width: canvasDoc.width, height: canvasDoc.height }
    };
  }, []);

  const handleDragMove = useCallback((id: string) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const node = shapeRegistry.current.get(id);
    const start = drag.start.get(id);
    if (!node || !start) return;
    // Konva 已把被拖节点移到指针位置；据此算未吸附位移，再叠加吸附修正
    const movingBox: Box = {
      ...drag.groupBox,
      x: drag.groupBox.x + (node.x() - start.x),
      y: drag.groupBox.y + (node.y() - start.y)
    };
    const threshold = snapThreshold(SNAP_SCREEN_THRESHOLD, zoomRef.current);
    const snap = computeSnap(movingBox, drag.otherBoxes, drag.canvasBox, threshold);
    const dx = snap.x - drag.groupBox.x;
    const dy = snap.y - drag.groupBox.y;
    // 整体移动：把最终位移施加到移动单元的每个节点（覆盖 Konva 对被拖节点的默认位置）
    for (const sid of drag.ids) {
      const target = shapeRegistry.current.get(sid);
      const origin = drag.start.get(sid);
      if (target && origin) target.position({ x: origin.x + dx, y: origin.y + dy });
    }
    setGuides((prev) => (sameGuides(prev, snap.guides) ? prev : snap.guides));
  }, []);

  const handleDragEnd = useCallback(
    (id: string) => {
      const drag = dragStateRef.current;
      dragStateRef.current = null;
      setGuides((prev) => (prev.length === 0 ? prev : []));
      if (!drag) {
        const node = shapeRegistry.current.get(id);
        if (node) commitObject(id, { x: node.x(), y: node.y() });
        return;
      }
      const patches: ObjectPatchEntry[] = [];
      for (const sid of drag.ids) {
        const node = shapeRegistry.current.get(sid);
        const origin = drag.start.get(sid);
        if (node && origin && (node.x() !== origin.x || node.y() !== origin.y)) {
          patches.push({ id: sid, patch: { x: node.x(), y: node.y() } });
        }
      }
      if (patches.length === 1) commitObject(patches[0].id, patches[0].patch);
      else if (patches.length > 1) commitObjects(patches);
    },
    [commitObject, commitObjects]
  );

  // 共享 Transformer 变换结束：逐个节点把 scale 折算回尺寸并归一，一次 commit（一条历史）
  const handleTransformEnd = useCallback(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const all = objectsRef.current;
    // 循环前一次建 id 索引，避免每节点在 objects 里线性 find
    const objectById = new Map(all.map((item) => [item.id, item]));
    const patches: ObjectPatchEntry[] = [];
    for (const node of transformer.nodes()) {
      const object = objectById.get(node.id());
      if (!object) continue;
      // 注册表挂载的均为 Shape（Rect/Circle/Text/Image）；Transformer.nodes() 类型放宽为 Node
      const shape = node as Konva.Shape;
      const scaleX = shape.scaleX();
      const scaleY = shape.scaleY();
      shape.scaleX(1);
      shape.scaleY(1);
      patches.push({ id: object.id, patch: foldScale(object, shape, scaleX, scaleY) });
    }
    if (patches.length === 1) commitObject(patches[0].id, patches[0].patch);
    else if (patches.length > 1) commitObjects(patches);
  }, [commitObject, commitObjects]);

  const handlePointerDown = useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = event.target.getStage();
      if (!stage) return;
      if (event.target === stage) {
        clearSelection();
        stage.draggable(true);
      } else {
        stage.draggable(false);
      }
    },
    [clearSelection]
  );

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

  // 单选且非矩形时锁定比例（圆/文字/图片保持宽高比）；多选按整体框自由缩放
  const single = selectedObjects.length === 1 ? selectedObjects[0] : null;
  const keepRatio = single ? single.type !== 'rect' : false;
  const guideStrokeWidth = 1 / zoom;
  const guideDash = [4 / zoom, 4 / zoom];

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
              isEditing={object.id === editingTextId}
              onSelect={handleSelect}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onStartTextEdit={startTextEdit}
              registerShape={registerShape}
            />
          ))}
          {/* 共享 Transformer（canvas 层单例）：挂载 selectedIds 对应节点，文字编辑态清空 */}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            flipEnabled={false}
            keepRatio={keepRatio}
            rotateAnchorOffset={24}
            anchorSize={9}
            anchorStroke={SELECTION_COLOR}
            anchorFill='#ffffff'
            borderStroke={SELECTION_COLOR}
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < 8 || newBox.height < 8 ? oldBox : newBox
            }
            onTransformEnd={handleTransformEnd}
          />
          {/* 吸附参考线：贯穿画布的对齐线，listening=false 不拦截事件；拖拽结束即清空（不入导出） */}
          {guides.map((guide, index) =>
            guide.type === 'v' ? (
              <Line
                key={`guide-v-${index}`}
                listening={false}
                stroke={SELECTION_COLOR}
                strokeWidth={guideStrokeWidth}
                dash={guideDash}
                points={[guide.coord, 0, guide.coord, doc.height]}
              />
            ) : (
              <Line
                key={`guide-h-${index}`}
                listening={false}
                stroke={SELECTION_COLOR}
                strokeWidth={guideStrokeWidth}
                dash={guideDash}
                points={[0, guide.coord, doc.width, guide.coord]}
              />
            )
          )}
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
