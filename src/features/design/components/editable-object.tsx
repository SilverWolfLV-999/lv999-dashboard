'use client';

import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { memo, useEffect, useRef, type RefObject } from 'react';
import { Circle, Image as KonvaImage, Rect, Text as KonvaText, Transformer } from 'react-konva';
import type { DesignObject } from '../api/types';
import { TEXT_FONT_FAMILY } from '../constants/canvas';
import type { ObjectPatch } from '../hooks/use-editor-reducer';
import { useAssetImage } from '../hooks/use-asset-image';

/**
 * 单个对象渲染器（Konva 官方 Canvas Editor 范式）：
 * - 文档是纯数据，节点只是交互层；只在 dragEnd / transformEnd 读节点值提交回 React；
 * - Transformer 通过改变 scale 缩放，提交前把 scale 折算回 width/height/radius/fontSize，
 *   并把节点 scale 归一，保证文档干净、与 Konva 内部解耦；
 * - memo 化：仅当自身 object / selected / isEditing 变化时重渲染。
 */

const SELECTION_COLOR = '#3b82f6';

interface EditableObjectProps {
  object: DesignObject;
  selected: boolean;
  isEditing: boolean;
  onSelect: (id: string) => void;
  onCommit: (id: string, patch: ObjectPatch) => void;
  onStartTextEdit: (id: string) => void;
}

function EditableObjectImpl({
  object,
  selected,
  isEditing,
  onSelect,
  onCommit,
  onStartTextEdit
}: EditableObjectProps) {
  const shapeRef = useRef<Konva.Shape | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const { image, status } = useAssetImage(object.type === 'image' ? object.assetId : null);

  useEffect(() => {
    if (selected && shapeRef.current && transformerRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  const handleSelect = () => onSelect(object.id);
  const handleDoubleClick = () => {
    if (object.type === 'text') onStartTextEdit(object.id);
  };
  const handleDragEnd = (event: KonvaEventObject<DragEvent>) => {
    onCommit(object.id, { x: event.target.x(), y: event.target.y() });
  };
  const handleTransformEnd = () => {
    const node = shapeRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const base = { x: node.x(), y: node.y(), rotation: node.rotation() };
    if (object.type === 'rect' || object.type === 'image') {
      onCommit(object.id, {
        ...base,
        width: Math.max(1, node.width() * scaleX),
        height: Math.max(1, node.height() * scaleY)
      });
    } else if (object.type === 'circle') {
      const average = (scaleX + scaleY) / 2;
      onCommit(object.id, { ...base, radius: Math.max(1, object.radius * average) });
    } else if (object.type === 'text') {
      const average = (scaleX + scaleY) / 2;
      onCommit(object.id, { ...base, fontSize: Math.max(4, object.fontSize * average) });
    }
  };

  const handlers = {
    draggable: !isEditing,
    onClick: handleSelect,
    onTap: handleSelect,
    onDblClick: handleDoubleClick,
    onDblTap: handleDoubleClick,
    onDragEnd: handleDragEnd,
    onTransformEnd: handleTransformEnd
  };

  const transformer =
    selected && !isEditing ? (
      <Transformer
        ref={transformerRef}
        rotateEnabled
        flipEnabled={false}
        keepRatio={object.type !== 'rect'}
        rotateAnchorOffset={24}
        anchorSize={9}
        anchorStroke={SELECTION_COLOR}
        anchorFill='#ffffff'
        borderStroke={SELECTION_COLOR}
        boundBoxFunc={(oldBox, newBox) => (newBox.width < 8 || newBox.height < 8 ? oldBox : newBox)}
      />
    ) : null;

  if (object.type === 'rect') {
    return (
      <>
        <Rect
          ref={shapeRef as RefObject<Konva.Rect | null>}
          x={object.x}
          y={object.y}
          rotation={object.rotation}
          width={object.width}
          height={object.height}
          fill={object.fill}
          cornerRadius={object.cornerRadius}
          {...handlers}
        />
        {transformer}
      </>
    );
  }

  if (object.type === 'circle') {
    return (
      <>
        <Circle
          ref={shapeRef as RefObject<Konva.Circle | null>}
          x={object.x}
          y={object.y}
          rotation={object.rotation}
          radius={object.radius}
          fill={object.fill}
          {...handlers}
        />
        {transformer}
      </>
    );
  }

  if (object.type === 'text') {
    return (
      <>
        <KonvaText
          ref={shapeRef as RefObject<Konva.Text | null>}
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
        {transformer}
      </>
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
        ref={shapeRef as RefObject<Konva.Image | null>}
        image={image ?? undefined}
        x={object.x}
        y={object.y}
        rotation={object.rotation}
        width={object.width}
        height={object.height}
        {...handlers}
      />
      {transformer}
    </>
  );
}

export const EditableObject = memo(EditableObjectImpl);
