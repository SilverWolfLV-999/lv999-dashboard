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
import { ApiError } from '@/lib/api-client';
import { INSUFFICIENT_CREDITS_MESSAGE } from '@/features/credits/constants/credits';
import { ASPECT_KEYS, type AspectKey } from '../../constants/image-models';
import { editImageAssetMutation } from '../../api/mutations';
import type { Asset } from '../../api/types';

/** 「延续源图构图」的哨兵值（Select 不接受空字符串 value） */
const ASPECT_AUTO = 'auto';

const MAX_INSTRUCTION_LENGTH = 2000;

interface ImageEditDialogProps {
  asset: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 生成成功后回调（携带新派生资产 id，调用方可据此打开预览） */
  onSuccess?: (newAssetId: string) => void;
}

/**
 * 图片资产「继续修改」对话框（直连 I2I，不经聊天）：
 * 指令 + 可选输出比例 → POST /api/agent/assets/[id]/edit → 生成派生资产（记录血缘）。
 * 生成通常需 10-60 秒，进行中禁止关闭对话框，避免用户误以为失败重复提交。
 */
export function ImageEditDialog({ asset, open, onOpenChange, onSuccess }: ImageEditDialogProps) {
  const [instruction, setInstruction] = useState('');
  const [aspect, setAspect] = useState<string>(ASPECT_AUTO);
  const mutation = useMutation(editImageAssetMutation);

  // 每次重新打开时重置表单（关闭即丢弃上次草稿）
  useEffect(() => {
    if (open) {
      setInstruction('');
      setAspect(ASPECT_AUTO);
    }
  }, [open]);

  const trimmed = instruction.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_INSTRUCTION_LENGTH;

  const handleSubmit = () => {
    if (!canSubmit || mutation.isPending) return;
    mutation.mutate(
      {
        id: asset.id,
        values: {
          instruction: trimmed,
          ...(aspect !== ASPECT_AUTO && { aspect: aspect as AspectKey })
        }
      },
      {
        onSuccess: ({ id }) => {
          onOpenChange(false);
          toast.success('已生成修改版本');
          onSuccess?.(id);
        },
        onError: (error) => {
          const message =
            error instanceof ApiError && error.status === 402
              ? INSUFFICIENT_CREDITS_MESSAGE
              : error instanceof ApiError && error.status === 429
                ? '操作过于频繁，请稍后再试'
                : error instanceof ApiError && error.status === 404
                  ? '源图片不存在或已被删除'
                  : error instanceof ApiError && error.status === 413
                    ? '源图片超过 10MB 编辑上限'
                    : '图片生成失败，请稍后重试';
          toast.error(message);
        }
      }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 生成进行中不允许关闭（请求已发出，关闭只会让用户失去结果反馈）
        if (!next && mutation.isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>继续修改</DialogTitle>
          <DialogDescription className='truncate'>
            基于「{asset.title}」生成新的图片资产，原图保持不变。
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='space-y-2'>
            <label htmlFor='image-edit-instruction' className='text-sm font-medium'>
              修改指令
            </label>
            <Textarea
              id='image-edit-instruction'
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder='描述如何修改这张图，如「背景换成夜晚」「改成水墨淡彩风格」'
              rows={4}
              maxLength={MAX_INSTRUCTION_LENGTH}
              disabled={mutation.isPending}
              autoFocus
            />
            <p className='text-muted-foreground text-right text-xs'>
              {instruction.length}/{MAX_INSTRUCTION_LENGTH}
            </p>
          </div>
          <div className='space-y-2'>
            <span className='text-sm font-medium'>输出比例（可选）</span>
            <Select
              items={[
                { value: ASPECT_AUTO, label: '延续源图（自动）' },
                ...ASPECT_KEYS.map((key) => ({ value: key, label: key }))
              ]}
              value={aspect}
              onValueChange={(next) => {
                if (typeof next === 'string') setAspect(next);
              }}
              disabled={mutation.isPending}
            >
              <SelectTrigger className='w-44' size='sm'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ASPECT_AUTO}>延续源图（自动）</SelectItem>
                {ASPECT_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? '生成中，约需 10-60 秒…' : '开始生成'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
