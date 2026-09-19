import { Metadata } from 'next';
import SignUpViewPage from '@/features/auth/components/sign-up-view';

export const metadata: Metadata = {
  title: '身份认证 | 注册',
  description: '用于身份认证的注册页面。'
};

export default function Page() {
  return <SignUpViewPage />;
}
