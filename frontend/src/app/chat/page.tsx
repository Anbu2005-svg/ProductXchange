"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, User } from "@/lib/api";

type Conversation = {
  id: number;
  product_id: number | null;
  user_a_id: number;
  user_b_id: number;
  created_at: string;
};

type LastMessage = {
  content: string;
  sender_id: number;
  created_at: string;
};

type ConversationDisplay = Conversation & {
  otherUser: { id: number; name: string };
  lastMessage?: LastMessage | null;
};

export default function ChatListPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<ConversationDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const user = await api("/auth/me").catch(() => null);
        if (!user) {
          setError("Please log in to view your conversations.");
          setLoading(false);
          return;
        }
        setCurrentUser(user);

        const convos: Conversation[] = await api("/chat/conversations");

        // For each conversation, load the last message
        const displayed: ConversationDisplay[] = await Promise.all(
          convos.map(async (c) => {
            const otherId = c.user_a_id === user.id ? c.user_b_id : c.user_a_id;

            // Try to fetch last message
            let lastMsg: LastMessage | null = null;
            try {
              const msgs = await api(`/chat/conversations/${c.id}/messages`);
              if (msgs.length > 0) {
                lastMsg = msgs[msgs.length - 1];
              }
            } catch {}

            return {
              ...c,
              otherUser: { id: otherId, name: `User #${otherId}` },
              lastMessage: lastMsg,
            };
          })
        );

        setConversations(displayed);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-ink/60 animate-pulse text-sm">
        Loading conversations…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-8 text-center animate-fade-in">
        <span className="text-5xl mb-4 block">💬</span>
        <h1 className="text-xl font-bold text-ink mb-2">Messages</h1>
        <p className="text-sm text-ink/60 mb-4">{error}</p>
        <Link href="/login" className="text-sm text-moss font-semibold hover:underline">
          Log in to continue →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink dark:text-white">Messages</h1>
          <p className="text-sm text-ink/60 dark:text-stone-400">Chat with buyers and sellers</p>
        </div>
      </div>

      {conversations.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-6">
          <span className="text-5xl mb-3 block">💬</span>
          <h3 className="font-semibold text-ink dark:text-white text-base">No conversations yet</h3>
          <p className="text-xs text-ink/60 dark:text-stone-400 mt-1 max-w-sm mx-auto">
            Browse listings and message a seller to start a conversation!
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-xs font-semibold text-moss dark:text-emerald-400 underline hover:text-moss/80"
          >
            Browse Nearby Items →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => (
            <Link
              key={c.id}
              href={`/chat/${c.id}`}
              className="flex items-center gap-3.5 sm:gap-4 bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-xl p-3.5 sm:p-4 hover:shadow-md hover:border-moss/20 dark:hover:border-emerald-500/30 transition-all group"
            >
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-moss/15 to-emerald-100 dark:from-emerald-950 dark:to-stone-800 flex items-center justify-center text-sm sm:text-base font-bold text-moss dark:text-emerald-300 border border-moss/10 dark:border-stone-700 shrink-0">
                {c.otherUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-sm font-semibold text-ink dark:text-white group-hover:text-moss dark:group-hover:text-emerald-400 transition-colors truncate">
                    {c.otherUser.name}
                  </p>
                  <span className="text-[11px] text-ink/40 dark:text-stone-500 shrink-0 ml-2">
                    {new Date(c.lastMessage?.created_at || c.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-ink/60 dark:text-stone-400 truncate">
                  {c.lastMessage
                    ? `${c.lastMessage.sender_id === currentUser?.id ? "You: " : ""}${c.lastMessage.content}`
                    : "No messages yet — say hello!"}
                </p>
              </div>
              <svg className="w-4 h-4 text-ink/30 dark:text-stone-500 group-hover:text-moss dark:group-hover:text-emerald-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
