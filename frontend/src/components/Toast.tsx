"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

export type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let _nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++_nextId;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const typeConfig: Record<
    ToastType,
    { border: string; bg: string; icon: string }
  > = {
    success: {
      border: "border-l-emerald-500",
      bg: "bg-emerald-50",
      icon: "✅",
    },
    error: {
      border: "border-l-red-500",
      bg: "bg-red-50",
      icon: "❌",
    },
    info: {
      border: "border-l-blue-500",
      bg: "bg-blue-50",
      icon: "ℹ️",
    },
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => {
          const cfg = typeConfig[toast.type];
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 max-w-sm px-4 py-3 rounded-xl border border-l-4 ${cfg.border} ${cfg.bg} shadow-lg ${
                toast.exiting ? "animate-slide-out-right" : "animate-slide-in-right"
              }`}
            >
              <span className="text-base shrink-0 mt-0.5">{cfg.icon}</span>
              <p className="text-sm text-ink font-medium flex-1 leading-snug">
                {toast.message}
              </p>
              <button
                onClick={() => dismiss(toast.id)}
                className="text-ink/40 hover:text-ink text-xs font-bold shrink-0 mt-0.5"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
