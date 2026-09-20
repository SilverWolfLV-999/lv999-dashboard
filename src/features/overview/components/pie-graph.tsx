'use client';

import { LabelList, Pie, PieChart } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import type { AssetKindCount } from '../api/types';

/** 资产类型分布：各 kind 计数（数据来自 overview/api/service.ts 的 getAssetStats） */

const chartConfig = {
  count: {
    label: '资产数'
  },
  markdown: {
    label: 'Markdown',
    color: 'var(--chart-1)'
  },
  html: {
    label: 'HTML',
    color: 'var(--chart-2)'
  },
  image: {
    label: '图片',
    color: 'var(--chart-3)'
  },
  design: {
    label: '设计',
    color: 'var(--chart-4)'
  }
} satisfies ChartConfig;

interface PieGraphProps {
  kindCounts: AssetKindCount[];
}

export function PieGraph({ kindCounts }: PieGraphProps) {
  const chartData = kindCounts
    .filter((item) => item.count > 0)
    .map((item) => ({
      kind: item.kind,
      count: item.count,
      fill: `var(--color-${item.kind})`
    }));
  const total = kindCounts.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className='flex h-full flex-col'>
      <CardHeader className='items-center pb-0'>
        <CardTitle>资产类型分布</CardTitle>
        <CardDescription>共 {total.toLocaleString('zh-CN')} 个资产，按类型统计</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-1 items-center justify-center pb-0'>
        {chartData.length === 0 ? (
          <div className='text-muted-foreground flex aspect-square max-h-[300px] min-h-[250px] w-full items-center justify-center text-sm'>
            还没有创作资产，先去 Agent 创作或设计画布产出作品吧。
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className='[&_.recharts-text]:fill-background mx-auto aspect-square max-h-[300px] min-h-[250px]'
          >
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey='kind' hideLabel />} />
              <Pie
                data={chartData}
                innerRadius={30}
                dataKey='count'
                nameKey='kind'
                radius={10}
                cornerRadius={8}
                paddingAngle={4}
              >
                <LabelList
                  dataKey='count'
                  stroke='none'
                  fontSize={12}
                  fontWeight={500}
                  fill='currentColor'
                  formatter={(value) => String(value ?? '')}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
