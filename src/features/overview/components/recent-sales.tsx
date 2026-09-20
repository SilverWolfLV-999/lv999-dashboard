import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { getAssetKindMeta } from '@/features/agent/constants/kinds';
import type { RecentAssetItem } from '../api/types';

/**
 * 最近创作列表（@sales 槽）：复用原「最近销售」的列表布局，
 * 展示最近 8 条资产 = 类型图标 + 标题 + 类型徽标 + 相对时间。
 * 服务端组件（相对时间在 RSC 渲染时计算；槽经流式渲染送达，无水合不一致问题）。
 */
interface RecentCreationsProps {
  items: RecentAssetItem[];
}

export function RecentCreations({ items }: RecentCreationsProps) {
  return (
    <Card className='h-full'>
      <CardHeader>
        <CardTitle>最近创作</CardTitle>
        <CardDescription>最近产出的 {items.length} 个资产。</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className='text-muted-foreground py-10 text-center text-sm'>
            还没有创作资产。去「Agent 创作」或「设计画布」产出第一个作品吧。
          </div>
        ) : (
          <div className='space-y-8'>
            {items.map((item) => {
              const { label, icon: KindIcon } = getAssetKindMeta(item.kind);
              return (
                <div key={item.id} className='flex items-center gap-4'>
                  <div className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full'>
                    <KindIcon className='size-4' />
                  </div>
                  <div className='min-w-0 space-y-1'>
                    <p className='truncate text-sm leading-none font-medium'>{item.title}</p>
                    <Badge variant='outline' className='text-xs'>
                      {label}
                    </Badge>
                  </div>
                  <div className='text-muted-foreground ml-auto shrink-0 text-sm'>
                    {formatDistanceToNow(new Date(item.createdAt), {
                      addSuffix: true,
                      locale: zhCN
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
