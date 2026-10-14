"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { api, getToken, API_BASE } from "@/lib/api";

type NotificationItem = {
  id: number;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

const TYPE_ICONS: Record<string, string> = {
  OFFER_RECEIVED: "📩",
  OFFER_ACCEPTED: "✅",
  DEAL_CONFIRMED: "🔓",
  DEAL_COMPLETED: "🤝",
  NEW_MESSAGE: "💬",
  REVIEW_RECEIVED: "⭐",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await api("/notifications/unread-count");
      setUnreadCount(res.count);
    } catch {}
  }, []);

  // Connect to live notification WebSocket with background polling fallback
  useEffect(() => {
    fetchUnreadCount();

    const token = getToken();
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;

    function connectWs() {
      if (!token) return;
      try {
        const apiBase = API_BASE;
        const wsProto = apiBase.startsWith("https") ? "wss" : "ws";
        const wsHost = apiBase.replace(/^https?:\/\//, "");
        const wsUrl = `${wsProto}://${wsHost}/notifications/ws?token=${encodeURIComponent(token)}`;

        ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setUnreadCount((c) => c + 1);
            if (data.title) {
              setNotifications((prev) => [
                {
                  id: Date.now(),
                  type: data.type || "ALERT",
                  title: data.title,
                  message: data.message || null,
                  link: data.link || null,
                  is_read: false,
                  created_at: new Date().toISOString(),
                },
                ...prev,
              ]);
            }
          } catch {}
        };

        ws.onclose = () => {
          reconnectTimer = setTimeout(connectWs, 5000);
        };
      } catch {}
    }

    connectWs();

    const interval = setInterval(fetchUnreadCount, 30000);
    return () => {
      clearInterval(interval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [fetchUnreadCount]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  async function toggleDropdown() {
    if (!isOpen) {
      // Fetch full notifications list
      try {
        const list = await api("/notifications");
        setNotifications(list);
        setLoaded(true);
      } catch {}
    }
    setIsOpen(!isOpen);
  }

  async function markAsRead(notifId: number) {
    try {
      await api(`/notifications/${notifId}/read`, { method: "POST" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  }

  async function markAllRead() {
    try {
      await api("/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={toggleDropdown}
        className="relative p-1.5 rounded-lg hover:bg-sand/60 transition-colors"
        title="Notifications"
      >
        <svg
          className="w-5 h-5 text-ink/60 hover:text-moss transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>

        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-clay text-white text-[10px] font-bold w-4.5 h-4.5 min-w-[18px] flex items-center justify-center rounded-full leading-none px-1 animate-scale-in">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-white border border-ink/10 rounded-xl shadow-xl z-[60] overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10">
            <h3 className="text-sm font-bold text-ink">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-moss font-semibold hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto max-h-72">
            {!loaded ? (
              <div className="py-8 text-center text-sm text-ink/50 animate-pulse">
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center">
                <span className="text-3xl block mb-2">🔔</span>
                <p className="text-sm text-ink/50">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => {
                const icon = TYPE_ICONS[n.type] || "🔔";
                const content = (
                  <div
                    className={`flex items-start gap-3 px-4 py-3 border-b border-ink/5 transition-colors cursor-pointer ${
                      n.is_read
                        ? "bg-white hover:bg-sand/30"
                        : "bg-moss/[0.03] hover:bg-moss/[0.06]"
                    }`}
                    onClick={() => {
                      if (!n.is_read) markAsRead(n.id);
                      setIsOpen(false);
                    }}
                  >
                    <span className="text-base mt-0.5 shrink-0">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug ${n.is_read ? "text-ink/70" : "text-ink font-semibold"}`}>
                        {n.title}
                      </p>
                      {n.message && (
                        <p className="text-[11px] text-ink/50 mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                      )}
                      <p className="text-[10px] text-ink/40 mt-1">
                        {timeAgo(n.created_at)}
                      </p>
                    </div>
                    {!n.is_read && (
                      <span className="w-2 h-2 bg-moss rounded-full mt-1.5 shrink-0" />
                    )}
                  </div>
                );

                return n.link ? (
                  <Link key={n.id} href={n.link}>
                    {content}
                  </Link>
                ) : (
                  <div key={n.id}>{content}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
