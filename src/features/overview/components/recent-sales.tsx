import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { getAssetKindMeta } from '@/features/agent/constants/kinds';
import type { RecentAssetItem } from '../api/types';

/**
 * 最近创作列表（@sales 槽）：单行密度（图标 + 标题 + 类型徽标 + 相对时间），
 * 展示最近 8 条资产；双行 + 大行距的旧布局单条约占 130px，8 条会冲出首屏。
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
          <div className='space-y-1'>
            {items.map((item) => {
              const { label, icon: KindIcon } = getAssetKindMeta(item.kind);
              return (
                <div key={item.id} className='flex items-center gap-3 py-1.5'>
                  <div className='bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full'>
                    <KindIcon className='size-4' />
                  </div>
                  <p className='min-w-0 flex-1 truncate text-sm font-medium'>{item.title}</p>
                  <Badge variant='outline' className='shrink-0 text-xs'>
                    {label}
                  </Badge>
                  <div className='text-muted-foreground shrink-0 text-xs tabular-nums'>
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
