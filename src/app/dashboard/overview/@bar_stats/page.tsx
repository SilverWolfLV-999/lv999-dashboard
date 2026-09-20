import { auth } from '@clerk/nextjs/server';
import { getAssetStats } from '@/features/overview/api/service';
import { BarGraph } from '@/features/overview/components/bar-graph';

export default async function BarStats() {
  const { userId } = await auth();
  const stats = await getAssetStats(userId);
  return <BarGraph dailyTrend={stats.dailyTrend} />;
}
