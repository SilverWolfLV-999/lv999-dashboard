'use client';

import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import React from 'react';

const chartData = [
  { month: '1月', desktop: 342, mobile: 245 },
  { month: '2月', desktop: 876, mobile: 654 },
  { month: '3月', desktop: 512, mobile: 387 },
  { month: '4月', desktop: 629, mobile: 521 },
  { month: '5月', desktop: 458, mobile: 412 },
  { month: '6月', desktop: 781, mobile: 598 },
  { month: '7月', desktop: 394, mobile: 312 },
  { month: '8月', desktop: 925, mobile: 743 },
  { month: '9月', desktop: 647, mobile: 489 },
  { month: '10月', desktop: 532, mobile: 476 },
  { month: '11月', desktop: 803, mobile: 687 },
  { month: '12月', desktop: 271, mobile: 198 }
];

const chartConfig = {
  desktop: {
    label: '桌面端',
    color: 'var(--chart-1)'
  },
  mobile: {
    label: '移动端',
    color: 'var(--chart-2)'
  }
} satisfies ChartConfig;

export function AreaGraph() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          点状面积图
          <Badge variant='outline'>
            <Icons.trendingUp />
            -5.2%
          </Badge>
        </CardTitle>
        <CardDescription>展示最近 6 个月的总访客数</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} strokeDasharray='3 3' />
            <XAxis
              dataKey='month'
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <defs>
              <DottedBackgroundPattern config={chartConfig} />
            </defs>
            <Area
              dataKey='mobile'
              type='natural'
              fill='url(#dotted-background-pattern-mobile)'
              fillOpacity={0.4}
              stroke='var(--color-mobile)'
              stackId='a'
              strokeWidth={0.8}
            />
            <Area
              dataKey='desktop'
              type='natural'
              fill='url(#dotted-background-pattern-desktop)'
              fillOpacity={0.4}
              stroke='var(--color-desktop)'
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
