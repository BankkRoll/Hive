import { MessagesContent } from "@/components/messages/messages-content";
import type { Id } from "../../../../../convex/_generated/dataModel";

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { conversationId } = await params;

  return <MessagesContent conversationId={conversationId as Id<"conversations">} />;
}
