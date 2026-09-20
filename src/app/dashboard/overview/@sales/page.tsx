import { auth } from '@clerk/nextjs/server';
import { getAssetStats } from '@/features/overview/api/service';
import { RecentCreations } from '@/features/overview/components/recent-sales';

export default async function Sales() {
  const { userId } = await auth();
  const stats = await getAssetStats(userId);
  return <RecentCreations items={stats.recentAssets} />;
}
