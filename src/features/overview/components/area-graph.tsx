'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

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
  // 全零序列不渲染：否则堆叠面积会在零轴上描出一条无信息的横线（如 imported 恒为 0 时的蓝线）
  const hasGenerated = dailyTrend.some((item) => item.generated > 0);
  const hasImported = dailyTrend.some((item) => item.imported > 0);

  return (
    <Card className='flex h-full flex-col'>
      <CardHeader>
        <CardTitle>近 30 天创作趋势</CardTitle>
        <CardDescription>
          {total > 0
            ? `近 30 天共新增 ${total.toLocaleString('zh-CN')} 个资产`
            : '近 30 天还没有新增资产'}
        </CardDescription>
      </CardHeader>
      <CardContent className='min-h-0 flex-1'>
        {/* h-full：图表高度随行高伸缩（与右列卡片齐平），不再被 aspect-video 拖到 700px+ */}
        <ChartContainer config={chartConfig} className='aspect-auto h-full min-h-64'>
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
            {/* 计数轴：整数刻度 + 无轴线，给出零基线与量级参照 */}
            <YAxis
              tickLine={false}
              axisLine={false}
              width={28}
              tickMargin={8}
              allowDecimals={false}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            {/* monotone：计数数据不允许样条过冲穿零（natural 会在脉冲数据上跌到负值） */}
            {hasImported && (
              <Area
                dataKey='imported'
                type='monotone'
                fill='var(--color-imported)'
                fillOpacity={0.1}
                stroke='var(--color-imported)'
                stackId='a'
                strokeWidth={1.5}
              />
            )}
            {hasGenerated && (
              <Area
                dataKey='generated'
                type='monotone'
                fill='var(--color-generated)'
                fillOpacity={0.1}
                stroke='var(--color-generated)'
                stackId='a'
                strokeWidth={1.5}
              />
            )}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
