import { auth } from '@clerk/nextjs/server';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { agentKeys } from '@/features/agent/api/queries';
import { listConversations } from '@/features/agent/api/service';
import { ConversationSidebar } from '@/features/agent/components/conversations/conversation-sidebar';

/**
 * Agent 创作工作台布局：左侧会话列表 + 右侧对话区。
 * 高度按 dashboard Header 的尺寸（移动端 h-16，桌面 h-14）扣减，保证区域内部滚动。
 */
export default async function AgentWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) return null;

  const queryClient = getQueryClient();
  // 注意：预取数据的结构必须与客户端 queryFn（ConversationsResponse）一致，
  // 否则水合后的 useSuspenseQuery 会拿到错误形状的数据。
  void queryClient.prefetchQuery({
    queryKey: agentKeys.conversations(),
    queryFn: async () => ({ conversations: await listConversations(userId) })
  });

  return (
    <div className='flex h-[calc(100svh-4rem)] md:h-[calc(100svh-3.5rem)]'>
      <aside className='hidden w-64 shrink-0 border-r lg:block'>
        <HydrationBoundary state={dehydrate(queryClient)}>
          <ConversationSidebar />
        </HydrationBoundary>
      </aside>
      <div className='flex min-h-0 min-w-0 flex-1 flex-col'>{children}</div>
    </div>
  );
}
