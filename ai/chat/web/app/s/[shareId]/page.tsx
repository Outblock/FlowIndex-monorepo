import { createServiceClient } from "@/lib/api-auth";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SharePageClient from "./SharePageClient";

type Params = { params: Promise<{ shareId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { shareId } = await params;
  const supabase = createServiceClient();
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("title")
    .eq("share_id", shareId)
    .single();

  return {
    title: session?.title
      ? `${session.title} — FlowIndex AI`
      : "Shared Conversation — FlowIndex AI",
    description: "A shared AI conversation on FlowIndex",
  };
}

export default async function SharePage({ params }: Params) {
  const { shareId } = await params;
  const supabase = createServiceClient();

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id, title, source, shared_at")
    .eq("share_id", shareId)
    .single();

  if (!session) notFound();

  const { data: messages } = await supabase
    .from("chat_messages")
    .select(
      "id, role, content, tool_calls, tool_results, attachments, created_at"
    )
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  return (
    <SharePageClient
      session={{
        title: session.title,
        source: session.source,
        shared_at: session.shared_at,
      }}
      messages={messages || []}
    />
  );
}
