import { ChatWindow } from '@/features/agent/components/chat/chat-window';

export const metadata = {
  title: 'Dashboard: Agent 创作'
};

export default function AgentPage() {
  return <ChatWindow initialMessages={[]} />;
}
