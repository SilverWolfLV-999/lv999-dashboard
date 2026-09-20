'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import type { DailyAssetCount } from '../api/types';

/** 创作量周对比：近 30 天按周分组（从最早一天起每 7 天一档），对比 AI 生成 / 用户上传 */

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

interface BarGraphProps {
  dailyTrend: DailyAssetCount[];
}

interface WeekBucket {
  label: string;
  generated: number;
  imported: number;
}

/** 逐日趋势（升序）→ 周分组；不足 7 天的尾档照常展示 */
function buildWeekBuckets(dailyTrend: DailyAssetCount[]): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  dailyTrend.forEach((item, index) => {
    const weekIndex = Math.floor(index / 7);
    let bucket = buckets[weekIndex];
    if (!bucket) {
      bucket = { label: `第${weekIndex + 1}周`, generated: 0, imported: 0 };
      buckets.push(bucket);
    }
    bucket.generated += item.generated;
    bucket.imported += item.imported;
  });
  return buckets;
}

export function BarGraph({ dailyTrend }: BarGraphProps) {
  const chartData = buildWeekBuckets(dailyTrend);
  const total = chartData.reduce((sum, item) => sum + item.generated + item.imported, 0);

  return (
    <Card className='flex h-full flex-col'>
      <CardHeader>
        <CardTitle>创作量周对比</CardTitle>
        <CardDescription>
          {total > 0
            ? `近 30 天按周对比 AI 生成与用户上传（共 ${total.toLocaleString('zh-CN')} 个）`
            : '近 30 天还没有新增资产'}
        </CardDescription>
      </CardHeader>
      <CardContent className='min-h-0 flex-1'>
        <ChartContainer config={chartConfig} className='aspect-auto h-full min-h-64'>
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} strokeDasharray='3 3' />
            <XAxis dataKey='label' tickLine={false} tickMargin={10} axisLine={false} />
            {/* 计数轴：整数刻度 + 无轴线，与趋势图同一套轴语言 */}
            <YAxis
              tickLine={false}
              axisLine={false}
              width={28}
              tickMargin={8}
              allowDecimals={false}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator='dashed' hideLabel />}
            />
            <Bar
              dataKey='generated'
              color='var(--chart-1)'
              fill='var(--color-generated)'
              shape={<CustomHatchedBar isHatched={false} />}
              radius={4}
            />
            <Bar
              dataKey='imported'
              fill='var(--color-imported)'
              shape={<CustomHatchedBar />}
              radius={4}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const CustomHatchedBar = (
  props: React.SVGProps<SVGRectElement> & {
    dataKey?: string;
    isHatched?: boolean;
  }
) => {
  const { fill, x, y, width, height, dataKey } = props;

  const isHatched = props.isHatched ?? true;

  return (
    <>
      <rect
        rx={4}
        x={x}
        y={y}
        width={width}
        height={height}
        stroke='none'
        fill={isHatched ? `url(#hatched-bar-pattern-${dataKey})` : fill}
      />
      <defs>
        <pattern
          key={dataKey}
          id={`hatched-bar-pattern-${dataKey}`}
          x='0'
          y='0'
          width='5'
          height='5'
          patternUnits='userSpaceOnUse'
          patternTransform='rotate(-45)'
        >
          <rect width='10' height='10' opacity={0.5} fill={fill}></rect>
          <rect width='1' height='10' fill={fill}></rect>
        </pattern>
      </defs>
    </>
  );
};
