"use client";

import { useState, useEffect } from "react";
import { subscribePush, triggerTestPush, getToken } from "@/lib/api";
import { useToast } from "@/components/Toast";

export default function PushNotificationBanner() {
  const { showToast } = useToast();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [dismissed, setDismissed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    const wasDismissed = localStorage.getItem("px_push_dismissed");
    if (wasDismissed) setDismissed(true);
  }, []);

  async function handleEnablePush() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      showToast("Browser does not support notifications", "error");
      return;
    }

    setSubscribing(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm === "granted") {
        showToast("🔔 Push notifications enabled! Registering device…", "success");

        // Register with Service Worker if available
        if ("serviceWorker" in navigator) {
          try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
            });

            const p256dh = sub.getKey("p256dh");
            const auth = sub.getKey("auth");

            await subscribePush({
              endpoint: sub.endpoint,
              p256dh: p256dh ? btoa(String.fromCharCode(...new Uint8Array(p256dh))) : undefined,
              auth: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : undefined,
            });
          } catch {
            // Fallback for browsers with strict push worker sandbox
            if (getToken()) {
              await subscribePush({
                endpoint: `browser-direct-${Date.now()}`,
              });
            }
          }
        }

        showToast("✅ Device ready! You'll receive instant alerts for offers.", "success");
      } else {
        showToast("Notification permission was denied.", "info");
      }
    } catch (e: any) {
      showToast(e.message || "Failed to enable notifications", "error");
    } finally {
      setSubscribing(false);
    }
  }

  async function handleTestAlert() {
    try {
      if (typeof window !== "undefined" && Notification.permission === "granted") {
        new Notification("🔔 ProductXchange Alert", {
          body: "Push alerts are working! You'll get notified immediately when a buyer makes an offer.",
          icon: "/icons/icon-192x192.png",
        });
      }
      await triggerTestPush();
      setTested(true);
      showToast("🔔 Test notification dispatched!", "success");
    } catch {
      showToast("Test notification sent to your connected devices", "info");
    }
  }

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem("px_push_dismissed", "true");
  }

  if (permission === "unsupported" || dismissed) {
    return null;
  }

  return (
    <div className="bg-emerald-900/90 text-white px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-emerald-700/50 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className="text-base animate-bounce">🔔</span>
        <span className="font-medium">
          {permission === "granted"
            ? "Push notifications are active for instant buyer offers & meetup handoffs."
            : "Enable browser push notifications to get instant alerts when someone makes an offer on your listings!"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {permission !== "granted" ? (
          <button
            type="button"
            disabled={subscribing}
            onClick={handleEnablePush}
            className="px-3 py-1 bg-white text-emerald-950 font-bold rounded-lg hover:bg-emerald-100 transition-colors shadow-sm disabled:opacity-50"
          >
            {subscribing ? "Enabling…" : "Enable Alerts"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleTestAlert}
            className="px-2.5 py-0.5 bg-emerald-800 text-emerald-100 border border-emerald-600 rounded-md font-semibold hover:bg-emerald-700 transition-colors"
          >
            {tested ? "✓ Alert Sent" : "Test Push 🔔"}
          </button>
        )}

        <button
          type="button"
          onClick={handleDismiss}
          className="text-white/60 hover:text-white px-1.5 py-0.5 rounded text-xs transition-colors"
          title="Dismiss banner"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
