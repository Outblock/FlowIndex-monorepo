"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { persistTokens, clearTokens } from "@flowindex/auth-core";
import { Chat } from "@/components/chat";
import { Sidebar } from "@/components/sidebar";
import { ArtifactPanelProvider, ArtifactPanel } from "@/components/artifact-panel";

function generateId() {
  return crypto.randomUUID();
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string>(generateId());
  const [sidebarRefresh, setSidebarRefresh] = useState(0);

  const supabase = createClient();

  useEffect(() => {
    async function initAuth() {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUser(data.user);
        return;
      }
      // No Supabase session — try fi_auth cross-subdomain cookie from flowindex.io
      const match = document.cookie.match(/(?:^|;\s*)fi_auth=([^;]*)/);
      if (match) {
        try {
          const parsed = JSON.parse(decodeURIComponent(match[1]));
          if (parsed?.access_token && parsed?.refresh_token) {
            const { data: sessionData } = await supabase.auth.setSession({
              access_token: parsed.access_token,
              refresh_token: parsed.refresh_token,
            });
            if (sessionData?.user) {
              setUser(sessionData.user);
            }
          }
        } catch { /* invalid cookie — ignore */ }
      }
    }
    initAuth();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      // Sync shared cross-subdomain cookie for flowindex.io SSO
      try {
        if (session?.access_token && session?.refresh_token) {
          persistTokens(session.access_token, session.refresh_token);
        } else {
          clearTokens();
        }
      } catch { /* ignore */ }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleNewChat = useCallback(() => {
    setSessionId(generateId());
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  return (
    <ArtifactPanelProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar
          activeSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          refreshKey={sidebarRefresh}
        />
        <main className="flex-1 flex relative overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <Chat key={sessionId} sessionId={sessionId} userId={user?.id ?? null} />
          </div>
          <ArtifactPanel />
        </main>
      </div>
    </ArtifactPanelProvider>
  );
}
