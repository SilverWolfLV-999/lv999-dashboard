import { auth } from '@clerk/nextjs/server';
import { apiError } from '@/lib/api-error';
import { listAssets } from '@/features/agent/api/service';
import type { AssetFilters } from '@/features/agent/api/types';

export const runtime = 'nodejs';

function parseInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return apiError(401, 'unauthorized', 'Unauthorized');
  }

  const { searchParams } = new URL(request.url);
  const filters: AssetFilters = {
    page: parseInteger(searchParams.get('page')),
    limit: parseInteger(searchParams.get('limit')),
    search: searchParams.get('search') ?? undefined,
    kind: searchParams.get('kind') ?? undefined,
    sort: searchParams.get('sort') ?? undefined
  };

  const result = await listAssets(userId, filters);
  return Response.json(result);
}
