import { Metadata } from 'next';
import SignInViewPage from '@/features/auth/components/sign-in-view';

export const metadata: Metadata = {
  title: '身份认证 | 登录',
  description: '用于身份认证的登录页面。'
};

export default async function Page() {
  return <SignInViewPage />;
}
