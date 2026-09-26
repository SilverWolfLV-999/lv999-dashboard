'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { TextObject } from '../api/types';
import { TEXT_FONT_FAMILY } from '../constants/canvas';
import { useEditor } from '../lib/editor-context';
import type { Point } from '../lib/document';

/**
 * 画布内文字编辑 overlay（Konva 官方 Editable Text 范式）：
 * 双击文字 → 在其屏幕位置覆盖一个原生 <textarea> 编辑，失焦/回车提交一次历史。
 * 用原生输入元素保证中文 IME、光标、选区正常（canvas 无法提供）。
 * 位置/字号按相机（zoom + position）换算，字体与 Konva Text 严格一致以对齐度量。
 */
export function TextOverlay() {
  const { editingTextId, objects, zoom, position, commitText } = useEditor();
  const object = editingTextId
    ? objects.find((item): item is TextObject => item.id === editingTextId && item.type === 'text')
    : undefined;

  if (!object) return null;
  return (
    <TextOverlayInput
      key={object.id}
      object={object}
      zoom={zoom}
      position={position}
      onCommit={commitText}
    />
  );
}

interface TextOverlayInputProps {
  object: TextObject;
  zoom: number;
  position: Point;
  onCommit: (id: string, text: string) => void;
}

function TextOverlayInput({ object, zoom, position, onCommit }: TextOverlayInputProps) {
  const [draft, setDraft] = useState(object.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const committedRef = useRef(false);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.select();
  }, []);

  // 高度随内容自增，逼近 Konva Text 的换行行为
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft]);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(object.id, draft);
  };

  const screenX = object.x * zoom + position.x;
  const screenY = object.y * zoom + position.y;
  const fontSize = object.fontSize * zoom;
  // 无固定换行宽度时，按最长行粗略估算单行宽度，避免过早折行
  const longestLine = draft.split('\n').reduce((max, line) => Math.max(max, line.length), 1);
  const width = object.width
    ? object.width * zoom
    : Math.max(120, longestLine * fontSize * 0.6 + fontSize);

  return (
    <textarea
      ref={textareaRef}
      value={draft}
      rows={1}
      aria-label='编辑文字内容'
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // 阻止冒泡到全局快捷键（删除/撤销等）——编辑态按键只作用于文本
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          commit();
          return;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          commit();
        }
      }}
      className='ring-primary absolute z-20 resize-none overflow-hidden rounded-sm border-0 bg-transparent p-0 outline-none ring-2'
      style={{
        left: screenX,
        top: screenY,
        width,
        fontSize,
        lineHeight: 1,
        fontFamily: TEXT_FONT_FAMILY,
        fontStyle: object.fontStyle,
        // 与 Konva Text 的 align 同步（枚举值与 CSS text-align 同名），保证编辑态所见即所得
        textAlign: object.align,
        color: object.fill,
        transform: `rotate(${object.rotation}deg)`,
        transformOrigin: '0 0',
        caretColor: object.fill
      }}
    />
  );
}
