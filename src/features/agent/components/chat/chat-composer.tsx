'use client';

import type { KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Icons } from '@/components/icons';
import { ModelSelector } from './model-selector';

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isGenerating: boolean;
  model: string;
  onModelChange: (value: string) => void;
}

/** 输入区：模型选择 + 文本输入 + 发送/停止 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  isGenerating,
  model,
  onModelChange
}: ChatComposerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!isGenerating && value.trim()) {
        onSubmit();
      }
    }
  };

  return (
    <div className='shrink-0 border-t'>
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 py-3'>
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='描述你的创作需求…（Enter 发送，Shift+Enter 换行）'
          rows={2}
          className='max-h-40 min-h-[3.25rem] resize-none'
        />
        <div className='flex items-center justify-between gap-2'>
          <ModelSelector value={model} onChange={onModelChange} disabled={isGenerating} />
          {isGenerating ? (
            <Button variant='outline' size='sm' onClick={onStop}>
              <Icons.stop /> 停止
            </Button>
          ) : (
            <Button size='sm' onClick={onSubmit} disabled={!value.trim()}>
              <Icons.send /> 发送
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
