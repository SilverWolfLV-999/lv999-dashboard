'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Icons, type Icon } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { DesignObject, DesignObjectType } from '../api/types';
import { CANVAS_PRESETS, FILL_SWATCHES, FONT_SIZE_PRESETS } from '../constants/canvas';
import { useEditor } from '../lib/editor-context';

/**
 * 右侧属性面板 + 图层列表。
 * - 选中对象：填充色 / 字号（文字）/ 层级前后 / 删除；
 * - 未选中：画布背景色 + 尺寸预设；
 * - 图层列表：把画布对象镜像为 HTML 按钮（canvas 对辅助技术不可见），
 *   支持键盘聚焦与选择，满足可达性要求。
 */

const OBJECT_TYPE_META: Record<DesignObjectType, { label: string; icon: Icon }> = {
  rect: { label: '矩形', icon: Icons.square },
  circle: { label: '圆形', icon: Icons.circle },
  text: { label: '文字', icon: Icons.text },
  image: { label: '图片', icon: Icons.media }
};

function Swatches({
  value,
  onPick,
  label
}: {
  value: string;
  onPick: (color: string) => void;
  label: string;
}) {
  return (
    <div className='flex flex-wrap gap-1.5' role='group' aria-label={label}>
      {FILL_SWATCHES.map((color) => (
        <button
          key={color}
          type='button'
          title={color}
          aria-label={`${label} ${color}`}
          aria-pressed={value.toLowerCase() === color.toLowerCase()}
          onClick={() => onPick(color)}
          className={cn(
            'border-border size-6 rounded-md border transition-transform hover:scale-110',
            value.toLowerCase() === color.toLowerCase() && 'ring-ring ring-2 ring-offset-1'
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function ObjectProperties({ object }: { object: DesignObject }) {
  const { commitObject, removeObject, reorder } = useEditor();
  const meta = OBJECT_TYPE_META[object.type];
  const fill = object.type === 'image' ? null : object.fill;

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <span className='flex items-center gap-1.5 text-sm font-medium'>
          <meta.icon className='text-muted-foreground size-4' />
          {meta.label}
        </span>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label='删除对象'
          onClick={() => removeObject(object.id)}
          className='text-destructive hover:text-destructive'
        >
          <Icons.trash />
        </Button>
      </div>

      {fill !== null && (
        <div className='space-y-1.5'>
          <span className='text-muted-foreground text-xs'>填充色</span>
          <Swatches
            value={fill}
            onPick={(color) => commitObject(object.id, { fill: color })}
            label='填充色'
          />
        </div>
      )}

      {object.type === 'text' && (
        <div className='space-y-1.5'>
          <span className='text-muted-foreground text-xs'>字号</span>
          <div className='flex flex-wrap gap-1.5'>
            {FONT_SIZE_PRESETS.map((size) => (
              <Button
                key={size}
                variant={object.fontSize === size ? 'secondary' : 'outline'}
                size='xs'
                onClick={() => commitObject(object.id, { fontSize: size })}
              >
                {size}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className='space-y-1.5'>
        <span className='text-muted-foreground text-xs'>层级</span>
        <div className='flex gap-1.5'>
          <Button variant='outline' size='sm' onClick={() => reorder(object.id, 'forward')}>
            <Icons.chevronUp /> 上移
          </Button>
          <Button variant='outline' size='sm' onClick={() => reorder(object.id, 'backward')}>
            <Icons.chevronDown /> 下移
          </Button>
        </div>
      </div>
    </div>
  );
}

function CanvasProperties() {
  const { document, updateDocument, fitToScreen } = useEditor();

  const applyPreset = (width: number, height: number) => {
    updateDocument({ width, height });
    // 等状态提交后再按新尺寸自适应视图
    requestAnimationFrame(() => fitToScreen());
  };

  return (
    <div className='space-y-4'>
      <span className='text-sm font-medium'>画布</span>

      <div className='space-y-1.5'>
        <span className='text-muted-foreground text-xs'>背景色</span>
        <Swatches
          value={document.background}
          onPick={(color) => updateDocument({ background: color })}
          label='背景色'
        />
      </div>

      <div className='space-y-1.5'>
        <span className='text-muted-foreground text-xs'>尺寸预设</span>
        <div className='flex flex-col gap-1.5'>
          {CANVAS_PRESETS.map((preset) => {
            const active = document.width === preset.width && document.height === preset.height;
            return (
              <Button
                key={preset.label}
                variant={active ? 'secondary' : 'outline'}
                size='sm'
                className='justify-between'
                onClick={() => applyPreset(preset.width, preset.height)}
              >
                <span>{preset.label}</span>
                <span className='text-muted-foreground text-xs'>
                  {preset.width}×{preset.height}
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LayersList() {
  const { objects, selectedId, select } = useEditor();
  // 逆序：数组末尾为最上层，列表顶部显示最上层
  const layered = objects.toReversed();

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='text-muted-foreground px-3 py-2 text-xs'>图层（{objects.length}）</div>
      {layered.length === 0 ? (
        <p className='text-muted-foreground px-3 pb-3 text-xs'>
          画布为空。用上方工具添加矩形、圆形、文字或图片。
        </p>
      ) : (
        <ul className='min-h-0 flex-1 overflow-y-auto px-2 pb-2'>
          {layered.map((object) => {
            const meta = OBJECT_TYPE_META[object.type];
            const active = object.id === selectedId;
            const name =
              object.type === 'text'
                ? object.text.split('\n')[0].slice(0, 18) || '文字'
                : meta.label;
            return (
              <li key={object.id}>
                <button
                  type='button'
                  onClick={() => select(object.id)}
                  aria-current={active}
                  className={cn(
                    'hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                    active && 'bg-muted font-medium'
                  )}
                >
                  <meta.icon className='text-muted-foreground size-4 shrink-0' />
                  <span className='truncate'>{name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PropertiesPanel() {
  const { selectedObject } = useEditor();
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='shrink-0 p-3'>
        {selectedObject ? <ObjectProperties object={selectedObject} /> : <CanvasProperties />}
      </div>
      <Separator />
      <LayersList />
    </div>
  );
}
