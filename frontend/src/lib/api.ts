export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

const TOKEN_KEY = "px_token";
const TOKEN_EXPIRY_DAYS = 7;

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${isSecure ? "; Secure" : ""}`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name: string) {
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax${isSecure ? "; Secure" : ""}`;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  let token = getCookie(TOKEN_KEY);
  if (!token) {
    token = getCookie("access_token");
  }
  if (!token) {
    try {
      const local = localStorage.getItem(TOKEN_KEY);
      if (local) {
        setToken(local);
        token = local;
      }
    } catch {}
  }
  return token;
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  setCookie(TOKEN_KEY, token, TOKEN_EXPIRY_DAYS);
  setCookie("access_token", token, TOKEN_EXPIRY_DAYS);
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function removeToken() {
  if (typeof window === "undefined") return;
  deleteCookie(TOKEN_KEY);
  deleteCookie("access_token");
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export async function logout() {
  try {
    await api("/auth/logout", { method: "POST" });
  } finally {
    removeToken();
  }
}

export function resolveImageUrl(url?: string | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:image/")) {
    return trimmed;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/uploads/") || trimmed.startsWith("uploads/")) {
    const clean = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return clean;
  }
  if (trimmed.startsWith("/")) {
    return trimmed;
  }
  return `/uploads/${trimmed}`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function getCategoryEmoji(category?: string | null): string {
  const cat = (category || "").toLowerCase();
  if (cat.includes("textbook") || cat.includes("book") || cat.includes("study")) return "📚";
  if (cat.includes("electronic") || cat.includes("gadget") || cat.includes("calc")) return "💻";
  if (cat.includes("lab") || cat.includes("equipment")) return "🔬";
  if (cat.includes("hostel") || cat.includes("room")) return "🛏️";
  if (cat.includes("cycle") || cat.includes("mobility")) return "🚲";
  return "📦";
}

export function getCategoryFallbackImage(category?: string | null): string {
  const cat = (category || "").toLowerCase();
  let emoji = "📦";
  let bgGradient1 = "#1b4332";
  let bgGradient2 = "#081c15";
  let accentColor = "#52b788";

  if (cat.includes("textbook") || cat.includes("book") || cat.includes("study")) {
    emoji = "📚";
    bgGradient1 = "#1e3a8a";
    bgGradient2 = "#172554";
    accentColor = "#60a5fa";
  } else if (cat.includes("electronic") || cat.includes("gadget") || cat.includes("calc")) {
    emoji = "💻";
    bgGradient1 = "#0f766e";
    bgGradient2 = "#134e4a";
    accentColor = "#2dd4bf";
  } else if (cat.includes("lab") || cat.includes("equipment")) {
    emoji = "🔬";
    bgGradient1 = "#6d28d9";
    bgGradient2 = "#4c1d95";
    accentColor = "#c084fc";
  } else if (cat.includes("hostel") || cat.includes("room")) {
    emoji = "🛏️";
    bgGradient1 = "#b45309";
    bgGradient2 = "#78350f";
    accentColor = "#fcd34d";
  } else if (cat.includes("cycle") || cat.includes("mobility")) {
    emoji = "🚲";
    bgGradient1 = "#047857";
    bgGradient2 = "#064e3b";
    accentColor = "#6ee7b7";
  }

  const label = escapeXml(category || "Campus Item");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgGradient1}"/>
        <stop offset="100%" stop-color="${bgGradient2}"/>
      </linearGradient>
    </defs>
    <rect width="600" height="450" fill="url(#g)"/>
    <circle cx="300" cy="190" r="85" fill="#ffffff" fill-opacity="0.12"/>
    <text x="300" y="218" font-size="76" text-anchor="middle">${emoji}</text>
    <text x="300" y="325" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="700" font-size="22" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">${label}</text>
    <text x="300" y="360" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-weight="600" font-size="14" fill="${accentColor}" text-anchor="middle">ProductXchange Campus Verified</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function api(path: string, options: RequestInit = {}) {
  const token = getToken();
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include", // Ensures httpOnly cookies are sent automatically
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function uploadProductImage(productId: number, file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  return api(`/products/${productId}/images`, {
    method: "POST",
    body: formData,
  });
}

export async function uploadProductImageWithAngle(
  productId: number,
  file: File,
  angle?: string
): Promise<{ url: string; angle?: string; has_3d?: boolean }> {
  const formData = new FormData();
  formData.append("file", file);
  const query = angle ? `?angle=${encodeURIComponent(angle)}` : "";
  return api(`/products/${productId}/images${query}`, {
    method: "POST",
    body: formData,
  });
}

export async function convertProductTo3D(
  productId: number,
  angles?: Record<string, string>
): Promise<{
  success: boolean;
  has_3d: boolean;
  angles: Record<string, string>;
  turntable_frames: string[];
  message: string;
}> {
  return api(`/products/${productId}/3d-convert`, {
    method: "POST",
    body: JSON.stringify({ angles: angles || null }),
  });
}

export async function getCampuses(): Promise<{ college: string; count: number }[]> {
  return api("/products/campuses");
}

export async function getPushConfig(): Promise<{ enabled: boolean; publicKey: string }> {
  return api("/notifications/push-config");
}

export async function subscribePush(subscription: {
  endpoint: string;
  p256dh?: string;
  auth?: string;
}): Promise<{ status: string }> {
  return api("/notifications/push-subscription", {
    method: "POST",
    body: JSON.stringify(subscription),
  });
}

export async function triggerTestPush(): Promise<{ success: boolean; title: string; message: string }> {
  return api("/notifications/test-push", {
    method: "POST",
  });
}

export async function suggestListingAI(file: File): Promise<{
  attributes?: Record<string, any>;
  title?: string;
  description?: string;
  suggested_price?: number;
}> {
  const formData = new FormData();
  formData.append("file", file);
  return api("/ai/suggest-listing", {
    method: "POST",
    body: formData,
  });
}

export type Product = {
  id: number;
  seller_id: number;
  title: string;
  description: string | null;
  category: string;
  condition: string | null;
  price: number | null;
  transaction_type: "BUY" | "EXCHANGE" | "RENT" | "DONATE";
  pickup_area: string | null;
  latitude?: number | null;
  longitude?: number | null;
  image_urls: string[];
  has_3d?: boolean;
  image_angles?: Record<string, string> | null;
  college?: string | null;
  status: string;
  created_at: string;
  distance_m?: number | null;
  days_remaining?: number;
  is_expired?: boolean;
  can_bump?: boolean;
};

export type Offer = {
  id: number;
  proposed_by_id: number;
  amount: number;
  message?: string | null;
  created_at: string;
};

export type Transaction = {
  id: number;
  product_id: number;
  buyer_id: number;
  seller_id: number;
  state: "PENDING" | "ACCEPTED" | "REJECTED" | "COUNTERED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  agreed_price?: number | null;
  rental_period_days?: number | null;
  buyer_completed: boolean;
  seller_completed: boolean;
  handshake_pin?: string | null;
  created_at: string;
  updated_at: string;
  product?: Product | null;
  buyer?: { id: number; full_name?: string | null; email: string } | null;
  seller?: { id: number; full_name?: string | null; email: string } | null;
  offers?: Offer[];
};

export type User = {
  id: number;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  college?: string | null;
  is_verified: boolean;
  is_admin: boolean;
  avg_rating: number;
  rating_count: number;
};

export async function uploadAvatar(file: File): Promise<{ avatar_url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  return api("/auth/me/avatar", {
    method: "POST",
    body: formData,
  });
}

export async function updateProfile(data: { full_name?: string; college?: string }): Promise<User> {
  return api("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function reportListing(productId: number, reason: string, details?: string): Promise<{ message: string }> {
  return api("/reports", {
    method: "POST",
    body: JSON.stringify({
      reported_product_id: productId,
      reason,
      details: details || null,
    }),
  });
}

export async function getUnreadChatCount(): Promise<{ unread_count: number }> {
  return api("/chat/unread-count");
}
