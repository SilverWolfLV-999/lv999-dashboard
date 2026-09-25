'use client';

import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { memo, useCallback } from 'react';
import { Circle, Image as KonvaImage, Rect, Text as KonvaText } from 'react-konva';
import type { DesignObject } from '../api/types';
import { TEXT_FONT_FAMILY } from '../constants/canvas';
import { useAssetImage } from '../hooks/use-asset-image';

/**
 * 单个对象渲染器（Konva 官方 Canvas Editor 范式）：
 * - 文档是纯数据，节点只是交互层；拖拽/变换只在结束时提交回 React（提交逻辑在 canvas 层）；
 * - Transformer 已提到 canvas 层共享单例（多选官方范式）；本组件只经 registerShape 上报自身节点，
 *   并把 id 写到 Konva 节点（node.id()）供 canvas 反查对象；
 * - memo 化：仅当自身 object / isEditing 变化时重渲染（回调均为 canvas 层稳定引用）。
 */

interface EditableObjectProps {
  object: DesignObject;
  isEditing: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string) => void;
  onDragEnd: (id: string) => void;
  onStartTextEdit: (id: string) => void;
  /** 上报自身 Konva 节点（卸载时传 null），供 canvas 层共享 Transformer 与拖拽收集 */
  registerShape: (id: string, node: Konva.Shape | null) => void;
}

function EditableObjectImpl({
  object,
  isEditing,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onStartTextEdit,
  registerShape
}: EditableObjectProps) {
  const { image, status } = useAssetImage(object.type === 'image' ? object.assetId : null);

  // ref 回调稳定（仅依赖 id/registerShape）：避免 memo 化对象每次渲染重挂 ref
  const setShapeRef = useCallback(
    (node: Konva.Shape | null) => registerShape(object.id, node),
    [object.id, registerShape]
  );

  const handleSelect = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    onSelect(object.id, event.evt.shiftKey);
  };
  const handleDoubleClick = () => {
    if (object.type === 'text') onStartTextEdit(object.id);
  };
  const handleDragStart = () => onDragStart(object.id);
  const handleDragMove = () => onDragMove(object.id);
  const handleDragEnd = () => onDragEnd(object.id);

  const handlers = {
    id: object.id,
    draggable: !isEditing,
    onClick: handleSelect,
    onTap: handleSelect,
    onDblClick: handleDoubleClick,
    onDblTap: handleDoubleClick,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onDragEnd: handleDragEnd
  };

  if (object.type === 'rect') {
    return (
      <Rect
        ref={setShapeRef}
        x={object.x}
        y={object.y}
        rotation={object.rotation}
        width={object.width}
        height={object.height}
        fill={object.fill}
        cornerRadius={object.cornerRadius}
        {...handlers}
      />
    );
  }

  if (object.type === 'circle') {
    return (
      <Circle
        ref={setShapeRef}
        x={object.x}
        y={object.y}
        rotation={object.rotation}
        radius={object.radius}
        fill={object.fill}
        {...handlers}
      />
    );
  }

  if (object.type === 'text') {
    return (
      <KonvaText
        ref={setShapeRef}
        x={object.x}
        y={object.y}
        rotation={object.rotation}
        text={object.text}
        fontSize={object.fontSize}
        fontStyle={object.fontStyle}
        fontFamily={TEXT_FONT_FAMILY}
        fill={object.fill}
        {...(object.width ? { width: object.width } : {})}
        visible={!isEditing}
        {...handlers}
      />
    );
  }

  // image：始终渲染 Konva Image 节点（ref 稳定），未加载/失败时叠加占位框
  return (
    <>
      {status !== 'loaded' && (
        <Rect
          listening={false}
          x={object.x}
          y={object.y}
          rotation={object.rotation}
          width={object.width}
          height={object.height}
          fill='rgba(148,163,184,0.18)'
          stroke={status === 'error' ? '#ef4444' : '#94a3b8'}
          dash={[8, 6]}
          strokeWidth={2}
        />
      )}
      <KonvaImage
        ref={setShapeRef}
        image={image ?? undefined}
        x={object.x}
        y={object.y}
        rotation={object.rotation}
        width={object.width}
        height={object.height}
        {...handlers}
      />
    </>
  );
}

export const EditableObject = memo(EditableObjectImpl);
