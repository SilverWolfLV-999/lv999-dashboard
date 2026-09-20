import PageContainer from '@/components/layout/page-container';
import AssetListingPage from '@/features/agent/components/assets/asset-listing';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';

export const metadata = {
  title: 'Dashboard: 我的资产'
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function AssetsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <PageContainer pageTitle='我的资产' pageDescription='文本、图片与设计作品，一站管理。'>
      <AssetListingPage />
    </PageContainer>
  );
}
