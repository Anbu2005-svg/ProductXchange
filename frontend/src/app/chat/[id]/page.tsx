"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, User, getToken, API_BASE } from "@/lib/api";

type Message = {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  image_url: string | null;
  created_at: string;
};

type ConversationInfo = {
  id: number;
  product_id: number | null;
  user_a_id: number;
  user_b_id: number;
};

export default function ChatThreadPage() {
  const { id: conversationId } = useParams<{ id: string }>();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [convo, setConvo] = useState<ConversationInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const msgs = await api(`/chat/conversations/${conversationId}/messages`);
      setMessages(msgs);
    } catch {}
  }, [conversationId]);

  useEffect(() => {
    async function load() {
      try {
        const user = await api("/auth/me");
        setCurrentUser(user);

        // Get conversation info
        const convos = await api("/chat/conversations");
        const thisConvo = convos.find((c: ConversationInfo) => c.id === Number(conversationId));
        setConvo(thisConvo || null);

        await fetchMessages();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();

    // Connect to WebSocket for instant real-time messaging
    const token = getToken();
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;

    function connectWs() {
      if (!token || !conversationId) return;
      try {
        const apiBase = API_BASE;
        const wsProto = apiBase.startsWith("https") ? "wss" : "ws";
        const wsHost = apiBase.replace(/^https?:\/\//, "");
        const wsUrl = `${wsProto}://${wsHost}/chat/ws/${conversationId}?token=${encodeURIComponent(token)}`;

        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Handle typing indicator
            if (data.type === "typing") {
              if (currentUser && data.sender_id !== currentUser.id) {
                setIsOtherTyping(data.is_typing);
                if (data.is_typing) {
                  if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                  typingTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), 3000);
                }
              }
              return;
            }

            if (data.id && data.conversation_id === Number(conversationId)) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === data.id)) return prev;
                return [...prev, data];
              });
            }
          } catch {}
        };

        ws.onclose = () => {
          setIsWsConnected(false);
          reconnectTimer = setTimeout(connectWs, 4000);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        setIsWsConnected(false);
      }
    }

    connectWs();

    // Fallback background polling every 20 seconds
    pollRef.current = setInterval(fetchMessages, 20000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [conversationId, fetchMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    const content = newMessage.trim();
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ content }));
        setNewMessage("");
      } else {
        await api(`/chat/conversations/${conversationId}/messages`, {
          method: "POST",
          body: JSON.stringify({ content }),
        });
        setNewMessage("");
        await fetchMessages();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-ink/60 animate-pulse text-sm">
        Loading conversation…
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-8 text-center animate-fade-in">
        <p className="text-sm text-clay">{error}</p>
        <Link href="/chat" className="text-sm text-moss font-semibold hover:underline mt-2 inline-block">
          ← Back to conversations
        </Link>
      </div>
    );
  }

  const otherUserId = convo
    ? convo.user_a_id === currentUser?.id
      ? convo.user_b_id
      : convo.user_a_id
    : null;

  return (
    <div className="max-w-2xl mx-auto py-2 sm:py-4 px-1 sm:px-4 animate-fade-in flex flex-col h-[calc(100dvh-130px)] sm:h-[calc(100vh-190px)]">
      {/* Chat Header */}
      <div className="flex items-center gap-3 pb-3 sm:pb-4 border-b border-ink/10 dark:border-stone-800 mb-3">
        <Link href="/chat" className="text-ink/60 dark:text-stone-400 hover:text-moss dark:hover:text-emerald-400 transition-colors p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-moss/15 to-emerald-100 dark:from-emerald-950 dark:to-stone-800 flex items-center justify-center text-sm font-bold text-moss dark:text-emerald-300 border border-moss/10 dark:border-stone-700 shrink-0">
          U
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink dark:text-white truncate">
            {otherUserId ? (
              <Link href={`/profile/${otherUserId}`} className="hover:text-moss dark:hover:text-emerald-400 transition-colors">
                User #{otherUserId}
              </Link>
            ) : (
              "Chat"
            )}
          </p>
          {convo?.product_id && (
            <Link href={`/listings/${convo.product_id}`} className="text-[11px] text-moss dark:text-emerald-400 hover:underline">
              View listing →
            </Link>
          )}
        </div>
        <div className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium shrink-0 ${
          isWsConnected
            ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
            : "text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
        }`}>
          <span className={`w-2 h-2 rounded-full ${isWsConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
          {isWsConnected ? "Live Socket" : "Polling"}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 px-1 scrollbar-none">
        {messages.length === 0 && (
          <div className="text-center py-12 text-ink/50 dark:text-stone-400 text-sm">
            <span className="text-3xl block mb-2">👋</span>
            Start the conversation — say hello!
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMe = msg.sender_id === currentUser?.id;
          const showTime =
            idx === 0 ||
            new Date(msg.created_at).getTime() - new Date(messages[idx - 1].created_at).getTime() > 300000;

          return (
            <div key={msg.id}>
              {showTime && (
                <div className="text-center my-3">
                  <span className="text-[11px] text-ink/50 dark:text-stone-400 bg-sand/80 dark:bg-stone-800 px-3 py-1 rounded-full border border-ink/5 dark:border-stone-700">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" · "}
                    {new Date(msg.created_at).toLocaleDateString()}
                  </span>
                </div>
              )}
              <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] sm:max-w-[75%] px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? "bg-moss text-white rounded-br-md shadow-2xs"
                      : "bg-white dark:bg-stone-800 border border-ink/10 dark:border-stone-700 text-ink dark:text-white rounded-bl-md shadow-2xs"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      {isOtherTyping && (
        <div className="px-3 py-1.5 text-xs text-ink/60 dark:text-stone-400 italic flex items-center gap-2 animate-fade-in">
          <span className="inline-flex gap-1 items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-moss dark:bg-emerald-400 animate-bounce"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-moss dark:bg-emerald-400 animate-bounce [animation-delay:0.2s]"></span>
            <span className="w-1.5 h-1.5 rounded-full bg-moss dark:bg-emerald-400 animate-bounce [animation-delay:0.4s]"></span>
          </span>
          <span>Student is typing…</span>
        </div>
      )}

      {/* Message Input */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-ink/10 dark:border-stone-800 pt-4"
      >
        <input
          className="flex-1 border border-ink/15 dark:border-stone-700 rounded-xl px-4 py-3 text-sm text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
          placeholder="Type a message…"
          value={newMessage}
          onChange={(e) => {
            setNewMessage(e.target.value);
            const now = Date.now();
            if (now - lastTypingSentRef.current > 2000) {
              lastTypingSentRef.current = now;
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "typing", is_typing: true }));
              }
            }
          }}
          autoFocus
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="bg-moss text-white rounded-xl px-5 py-3 text-sm font-semibold hover:bg-moss/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0 flex items-center gap-1.5 shadow-sm"
        >
          {sending ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <>
              Send
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
