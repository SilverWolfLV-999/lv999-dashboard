import { auth } from '@clerk/nextjs/server';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { searchParamsCache } from '@/lib/searchparams';
import { artifactsQueryOptions } from '../../api/queries';
import { listArtifacts } from '../../api/service';
import type { ArtifactFilters } from '../../api/types';
import { ArtifactsTable } from './artifact-tables';

export default async function ArtifactListingPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const page = searchParamsCache.get('page');
  const limit = searchParamsCache.get('perPage');
  const title = searchParamsCache.get('title');
  const kind = searchParamsCache.get('kind');
  const sort = searchParamsCache.get('sort');

  const filters: ArtifactFilters = {
    page,
    limit,
    ...(title && { search: title }),
    ...(kind && { kind }),
    ...(sort && { sort })
  };

  const queryClient = getQueryClient();
  void queryClient.prefetchQuery({
    queryKey: artifactsQueryOptions(filters).queryKey,
    queryFn: () => listArtifacts(userId, filters)
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ArtifactsTable />
    </HydrationBoundary>
  );
}
