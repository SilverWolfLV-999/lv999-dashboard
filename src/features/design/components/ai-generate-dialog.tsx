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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Icons } from '@/components/icons';
import { ASPECT_KEYS, type AspectKey } from '@/features/agent/constants/image-models';
import { aiGenerateImageMutation } from '../api/mutations';
import { loadNaturalSize } from '../hooks/use-asset-image';
import { resolveAiImageError } from '../lib/ai-image-error';
import { useEditor } from '../lib/editor-context';

/** 「自动比例」哨兵值（Select 不接受空字符串 value）；不传 size 由模型自动推荐分辨率 */
const ASPECT_AUTO = 'auto';

const MAX_PROMPT_LENGTH = 2000;

const ASPECT_ITEMS = [
  { value: ASPECT_AUTO, label: '自动（模型推荐）' },
  ...ASPECT_KEYS.map((key) => ({ value: key, label: key }))
];

interface AiGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 画布内「AI 生成图片」对话框（直连 T2I，不经聊天）：
 * prompt + 可选比例 → POST /api/agent/assets/generate → 新资产 id →
 * 经同源 /raw 读自然尺寸 → insertImage（等比、居中、选中）。
 *
 * 生成通常需 10-60 秒：进行中锁定对话框（禁关闭、禁重复提交、禁改输入），
 * 失败保留输入并就地显示中文错误（402 余额不足 / 审核拒绝等由 resolveAiImageError 统一映射）。
 */
export function AiGenerateDialog({ open, onOpenChange }: AiGenerateDialogProps) {
  const { insertImage } = useEditor();
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<string>(ASPECT_AUTO);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation(aiGenerateImageMutation);

  // 每次重新打开时重置表单（关闭即丢弃上次草稿与错误）
  useEffect(() => {
    if (open) {
      setPrompt('');
      setAspect(ASPECT_AUTO);
      setError(null);
    }
  }, [open]);

  const trimmed = prompt.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_PROMPT_LENGTH;
  const isPending = mutation.isPending;

  const handleSubmit = async () => {
    if (!canSubmit || isPending) return;
    setError(null);
    try {
      const { id } = await mutation.mutateAsync({
        prompt: trimmed,
        ...(aspect !== ASPECT_AUTO && { aspect: aspect as AspectKey })
      });
      // 端点只返回 { id }：经 /raw 读新图自然尺寸后等比插入（失败回退正方形，可再手动缩放）
      const natural = await loadNaturalSize(id);
      insertImage(id, natural);
      onOpenChange(false);
      toast.success('已生成并插入画布');
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
          <DialogTitle>AI 生成图片</DialogTitle>
          <DialogDescription>
            描述画面即可生成图片并插入画布中心，同时存入「我的资产」供复用。
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <label htmlFor='ai-generate-prompt' className='text-sm font-medium'>
              画面描述
            </label>
            <Textarea
              id='ai-generate-prompt'
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder='描述要生成的画面，如「小红书封面：秋日露营，暖色调，留出标题文字区域」'
              rows={4}
              maxLength={MAX_PROMPT_LENGTH}
              disabled={isPending}
              autoFocus
            />
            <p className='text-muted-foreground text-right text-xs'>
              {prompt.length}/{MAX_PROMPT_LENGTH}
            </p>
          </div>

          <div className='space-y-2'>
            <span className='text-sm font-medium'>输出比例</span>
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
