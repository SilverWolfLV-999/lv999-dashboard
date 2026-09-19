'use client';

import PageContainer from '@/components/layout/page-container';
import { OrganizationProfile } from '@clerk/nextjs';
import { teamInfoContent } from '@/config/infoconfig';

export default function TeamPage() {
  return (
    <PageContainer
      pageTitle='团队管理'
      pageDescription='管理团队成员、角色与安全设置等。'
      infoContent={teamInfoContent}
    >
      <OrganizationProfile />
    </PageContainer>
  );
}
