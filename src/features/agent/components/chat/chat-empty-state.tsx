'use client';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import { Icons } from '@/components/icons';

const EXAMPLES = [
  '写一篇介绍杭州秋日漫步路线的小红书文案，语气轻快，保存为 Markdown',
  '为一个精品咖啡品牌写 3 版 slogan，每版保存为一个 Markdown 产物',
  '做一个「星空观测入门指南」的单页 HTML 落地页，包含样式与简单交互'
];

export function ChatEmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <Empty className='border-none'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Icons.sparkles />
        </EmptyMedia>
        <EmptyTitle>Agent 创作工作台</EmptyTitle>
        <EmptyDescription>
          用自然语言描述创作需求，Agent 会规划并产出 Markdown / HTML 产物，可在产物中心统一管理。
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className='max-w-lg'>
        <div className='flex w-full flex-col gap-2'>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type='button'
              onClick={() => onPick(example)}
              className='hover:bg-muted rounded-lg border px-3 py-2 text-left text-sm transition-colors'
            >
              {example}
            </button>
          ))}
        </div>
      </EmptyContent>
    </Empty>
  );
}
