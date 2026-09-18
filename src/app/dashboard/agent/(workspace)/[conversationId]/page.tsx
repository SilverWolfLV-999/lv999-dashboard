import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';
import type { UIMessage } from 'ai';
import { getConversation, listMessages } from '@/features/agent/api/service';
import { ChatWindow } from '@/features/agent/components/chat/chat-window';

export const metadata = {
  title: 'Dashboard: Agent 创作'
};

type PageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function ConversationPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) notFound();

  const { conversationId } = await params;
  const conversation = await getConversation(userId, conversationId);
  if (!conversation) notFound();

  const messageRows = await listMessages(userId, conversationId);
  const initialMessages: UIMessage[] = (messageRows ?? []).map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts,
    metadata: message.metadata ?? undefined
  }));

  return <ChatWindow conversation={conversation} initialMessages={initialMessages} />;
}
