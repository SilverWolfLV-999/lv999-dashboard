import PageContainer from '@/components/layout/page-container';
import ArtifactListingPage from '@/features/agent/components/artifacts/artifact-listing';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';

export const metadata = {
  title: 'Dashboard: 产物中心'
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function ArtifactsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <PageContainer
      pageTitle='产物中心'
      pageDescription='Agent 生成的全部 Markdown / HTML 产物，可预览、下载与删除。'
    >
      <ArtifactListingPage />
    </PageContainer>
  );
}
