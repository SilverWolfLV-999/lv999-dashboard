'use client';

import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import type { DailyAssetCount } from '../api/types';

/** 近 30 天创作趋势：按天资产计数，拆分 AI 生成 / 用户上传两个来源 */

const chartConfig = {
  generated: {
    label: 'AI 生成',
    color: 'var(--chart-1)'
  },
  imported: {
    label: '用户上传',
    color: 'var(--chart-2)'
  }
} satisfies ChartConfig;

interface AreaGraphProps {
  dailyTrend: DailyAssetCount[];
}

/** YYYY-MM-DD → M/D（X 轴刻度紧凑展示） */
function formatDayLabel(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}

export function AreaGraph({ dailyTrend }: AreaGraphProps) {
  const chartData = dailyTrend.map((item) => ({
    day: item.date,
    label: formatDayLabel(item.date),
    generated: item.generated,
    imported: item.imported
  }));
  const total = dailyTrend.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>近 30 天创作趋势</CardTitle>
        <CardDescription>
          {total > 0
            ? `近 30 天共新增 ${total.toLocaleString('zh-CN')} 个资产`
            : '近 30 天还没有新增资产'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} strokeDasharray='3 3' />
            <XAxis
              dataKey='label'
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval='preserveStartEnd'
              minTickGap={24}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <defs>
              <DottedBackgroundPattern config={chartConfig} />
            </defs>
            <Area
              dataKey='imported'
              type='natural'
              fill='url(#dotted-background-pattern-imported)'
              fillOpacity={0.4}
              stroke='var(--color-imported)'
              stackId='a'
              strokeWidth={0.8}
            />
            <Area
              dataKey='generated'
              type='natural'
              fill='url(#dotted-background-pattern-generated)'
              fillOpacity={0.4}
              stroke='var(--color-generated)'
              stackId='a'
              strokeWidth={0.8}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const DottedBackgroundPattern = ({ config }: { config: ChartConfig }) => {
  const items = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, value.color])
  );
  return (
    <>
      {Object.entries(items).map(([key, value]) => (
        <pattern
          key={key}
          id={`dotted-background-pattern-${key}`}
          x='0'
          y='0'
          width='7'
          height='7'
          patternUnits='userSpaceOnUse'
        >
          <circle cx='5' cy='5' r='1.5' fill={value} opacity={0.5}></circle>
        </pattern>
      ))}
    </>
  );
};
