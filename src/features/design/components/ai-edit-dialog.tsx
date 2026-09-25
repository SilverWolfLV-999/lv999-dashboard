'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Icons } from '@/components/icons';
import { editImageAssetMutation } from '@/features/agent/api/mutations';
import { ASPECT_KEYS, type AspectKey } from '@/features/agent/constants/image-models';
import type { ImageObject } from '../api/types';
import { loadNaturalSize } from '../hooks/use-asset-image';
import { resolveAiImageError } from '../lib/ai-image-error';
import { useEditor } from '../lib/editor-context';
import { imageReplacePatch } from '../lib/document';

/** 「延续源图构图」哨兵值（Select 不接受空字符串 value）；不传 aspect 由模型自动推荐分辨率 */
const ASPECT_AUTO = 'auto';

const MAX_INSTRUCTION_LENGTH = 2000;

const ASPECT_ITEMS = [
  { value: ASPECT_AUTO, label: '延续源图（自动）' },
  ...ASPECT_KEYS.map((key) => ({ value: key, label: key }))
];

/** 生成结果处置：替换当前对象（默认）/ 作为新对象插入 */
type ResultMode = 'replace' | 'insert';

interface AiEditDialogProps {
  /** 被修改的画布图片对象（属性面板单选 image 时传入） */
  object: ImageObject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 画布内「AI 修改」对话框（复用直连 I2I 端点，不经聊天）：
 * instruction + 可选比例 → POST /api/agent/assets/[id]/edit（源为对象的 assetId，
 * 端点自带计费/限流/402，并记录 sourceAssetId 血缘）→ 新资产 id → 经 /raw 读自然尺寸 →
 * 按处置方式「替换当前对象」（等比适配原框、保持中心、一条历史）或「作为新对象插入」。
 *
 * 生成通常需 10-60 秒：进行中锁定对话框（禁关闭、禁重复提交、禁改输入），
 * 失败保留输入并就地显示中文错误（与 AiGenerateDialog 共用 resolveAiImageError）。
 */
export function AiEditDialog({ object, open, onOpenChange }: AiEditDialogProps) {
  const { commitObject, insertImage } = useEditor();
  const [instruction, setInstruction] = useState('');
  const [aspect, setAspect] = useState<string>(ASPECT_AUTO);
  const [mode, setMode] = useState<ResultMode>('replace');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation(editImageAssetMutation);

  // 每次重新打开时重置表单（关闭即丢弃上次草稿与错误）
  useEffect(() => {
    if (open) {
      setInstruction('');
      setAspect(ASPECT_AUTO);
      setMode('replace');
      setError(null);
    }
  }, [open]);

  const trimmed = instruction.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_INSTRUCTION_LENGTH;
  const isPending = mutation.isPending;

  const handleSubmit = async () => {
    if (!canSubmit || isPending) return;
    setError(null);
    // 快照提交时刻的对象：生成期间对话框模态锁定，画布不会被改动
    const target = object;
    try {
      const { id } = await mutation.mutateAsync({
        id: target.assetId,
        values: {
          instruction: trimmed,
          ...(aspect !== ASPECT_AUTO && { aspect: aspect as AspectKey })
        }
      });
      // 端点只返回 { id }：经 /raw 读新图自然尺寸，供等比适配（失败回退沿用原框/正方形）
      const natural = await loadNaturalSize(id);
      if (mode === 'replace') {
        commitObject(target.id, imageReplacePatch(target, id, natural));
        toast.success('已替换为新图');
      } else {
        insertImage(id, natural);
        toast.success('已作为新对象插入');
      }
      onOpenChange(false);
    } catch (submitError) {
      const message = resolveAiImageError(submitError);
      setError(message);
      toast.error(message);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 生成进行中不允许关闭（请求已发出且不可中止，关闭只会让用户失去结果反馈）
        if (!next && isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>AI 修改图片</DialogTitle>
          <DialogDescription>
            按指令基于当前选中的图片生成新版本（原资产保留，新资产记录来源血缘）。
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <label htmlFor='ai-edit-instruction' className='text-sm font-medium'>
              修改指令
            </label>
            <Textarea
              id='ai-edit-instruction'
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder='描述如何修改这张图，如「背景换成夜晚霓虹」「改成水墨淡彩风格」'
              rows={4}
              maxLength={MAX_INSTRUCTION_LENGTH}
              disabled={isPending}
              autoFocus
            />
            <p className='text-muted-foreground text-right text-xs'>
              {instruction.length}/{MAX_INSTRUCTION_LENGTH}
            </p>
          </div>

          <div className='space-y-2'>
            <span className='text-sm font-medium'>输出比例（可选）</span>
            <Select
              items={ASPECT_ITEMS}
              value={aspect}
              onValueChange={(next) => {
                if (typeof next === 'string') setAspect(next);
              }}
              disabled={isPending}
            >
              <SelectTrigger className='w-48' size='sm'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className='text-muted-foreground text-xs'>
              消耗 Credits（图片档），生成后计入流水。
            </p>
          </div>

          <div className='space-y-2'>
            <span className='text-sm font-medium'>生成后</span>
            <RadioGroup
              value={mode}
              onValueChange={(next) => setMode(next === 'insert' ? 'insert' : 'replace')}
              disabled={isPending}
              aria-label='生成结果的处置方式'
            >
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='replace' id='ai-edit-mode-replace' />
                <Label htmlFor='ai-edit-mode-replace' className='font-normal'>
                  替换当前对象（保持位置，按新图比例适配）
                </Label>
              </div>
              <div className='flex items-center gap-2'>
                <RadioGroupItem value='insert' id='ai-edit-mode-insert' />
                <Label htmlFor='ai-edit-mode-insert' className='font-normal'>
                  作为新对象插入（保留原图便于对比）
                </Label>
              </div>
            </RadioGroup>
          </div>

          {isPending && (
            <p className='text-muted-foreground flex items-center gap-2 text-xs'>
              <Icons.spinner className='animate-spin' />
              正在生成，通常需要 10-60 秒，请勿关闭页面…
            </p>
          )}

          {error && !isPending && (
            <p role='alert' className='text-destructive text-xs'>
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!canSubmit || isPending}>
            {isPending ? <Icons.spinner className='animate-spin' /> : <Icons.sparkles />}
            {isPending ? '生成中…' : '生成'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
