"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { api, logout, getToken, User, getCampuses, resolveImageUrl } from "@/lib/api";
import NotificationBell from "@/components/NotificationBell";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [campuses, setCampuses] = useState<{ college: string; count: number }[]>([]);
  const [selectedCampus, setSelectedCampus] = useState("ALL");
  const [campusDropdownOpen, setCampusDropdownOpen] = useState(false);

  useEffect(() => {
    getCampuses()
      .then(setCampuses)
      .catch(() => {});

    if (typeof window !== "undefined") {
      const savedCampus = localStorage.getItem("px_campus") || "ALL";
      setSelectedCampus(savedCampus);
    }
  }, []);

  function handleSelectCampus(campus: string) {
    setSelectedCampus(campus);
    if (typeof window !== "undefined") {
      localStorage.setItem("px_campus", campus);
      window.dispatchEvent(new CustomEvent("campusChanged", { detail: campus }));
    }
    setCampusDropdownOpen(false);
    if (pathname !== "/") {
      router.push(`/?college=${encodeURIComponent(campus)}`);
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem("px_theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (saved === "dark" || (!saved && prefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    } else {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    }
  }, []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("px_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("px_theme", "light");
    }
  }

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    api("/auth/me")
      .then((u) => {
        setUser(u);
        api("/chat/unread-count")
          .then((res) => setUnreadChatCount(res.unread_count || 0))
          .catch(() => {});
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [pathname]);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await logout();
    setUser(null);
    setMenuOpen(false);
    router.push("/login");
  }

  const navLinks = [
    { href: "/", label: "Nearby", icon: "📍" },
    { href: "/deals", label: "Deals", icon: "🤝" },
    { href: "/chat", label: "Chat", icon: "💬", badge: unreadChatCount },
    { href: "/impact", label: "Eco-Impact", icon: "🌱" },
  ];

  return (
    <header className="border-b border-ink/10 dark:border-white/10 bg-white/80 dark:bg-stone-900/80 backdrop-blur-md sticky top-0 z-50 transition-colors">
      <nav className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-extrabold text-xl tracking-tight text-moss flex items-center gap-1.5">
            <span className="text-2xl">🔄</span>
            <span>Product<span className="text-ink dark:text-sand">Xchange</span></span>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden sm:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 relative ${
                  pathname === link.href
                    ? "text-moss bg-moss/5 dark:bg-moss/20"
                    : "text-ink/60 dark:text-stone-300 hover:text-moss hover:bg-moss/5 dark:hover:bg-moss/10"
                }`}
              >
                <span className="text-[13px]">{link.icon}</span>
                {link.label}
                {Boolean(link.badge && link.badge > 0) && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                    {link.badge}
                  </span>
                )}
              </Link>
            ))}
            {/* Multi-Campus Selector Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setCampusDropdownOpen(!campusDropdownOpen)}
                className="hidden md:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-ink/10 dark:border-white/10 bg-sand/60 dark:bg-stone-800 text-ink/80 dark:text-stone-200 hover:border-moss transition-all"
                title="Filter by college campus"
              >
                <span>🏫</span>
                <span className="max-w-[130px] truncate">
                  {selectedCampus === "ALL" ? "All Campuses" : selectedCampus}
                </span>
                <span className="text-[10px] text-ink/40 dark:text-stone-400">▾</span>
              </button>

              {campusDropdownOpen && (
                <div className="absolute top-full mt-1.5 left-0 w-64 bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-xl shadow-xl py-1 z-50 text-xs">
                  <div className="px-3 py-1.5 border-b border-ink/5 dark:border-stone-800 font-bold text-ink/50 dark:text-stone-400 text-[10px] uppercase tracking-wider">
                    Select Campus Hub
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectCampus("ALL")}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-sand dark:hover:bg-stone-800 ${
                      selectedCampus === "ALL" ? "font-bold text-moss dark:text-emerald-400 bg-moss/5" : "text-ink dark:text-white"
                    }`}
                  >
                    <span>🌐 All Bangalore Campuses</span>
                    {selectedCampus === "ALL" && <span>✓</span>}
                  </button>

                  {user?.college && (
                    <button
                      type="button"
                      onClick={() => handleSelectCampus(user.college!)}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between border-t border-b border-ink/5 dark:border-stone-800 hover:bg-sand dark:hover:bg-stone-800 ${
                        selectedCampus === user.college ? "font-bold text-moss dark:text-emerald-400 bg-moss/5" : "text-ink dark:text-white"
                      }`}
                    >
                      <span className="truncate">🎓 My Campus: {user.college}</span>
                      {selectedCampus === user.college && <span>✓</span>}
                    </button>
                  )}

                  <div className="max-h-48 overflow-y-auto">
                    {campuses.map((c) => (
                      <button
                        key={c.college}
                        type="button"
                        onClick={() => handleSelectCampus(c.college)}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-sand dark:hover:bg-stone-800 ${
                          selectedCampus === c.college ? "font-bold text-moss dark:text-emerald-400 bg-moss/5" : "text-ink dark:text-white"
                        }`}
                      >
                        <span className="truncate pr-2">{c.college}</span>
                        <span className="text-[10px] text-ink/40 dark:text-stone-400">{c.count} items</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-sm">
          {/* Dark Mode Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-ink/70 dark:text-stone-300 hover:bg-sand dark:hover:bg-stone-800 transition-colors"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle Theme"
          >
            {isDark ? "☀️" : "🌙"}
          </button>

          {/* Desktop Sell Button */}
          <Link
            href="/listings/new"
            className="hidden sm:inline-flex items-center gap-1 bg-moss text-white font-semibold text-xs px-3.5 py-2 rounded-lg hover:bg-moss/90 shadow-sm transition-all"
          >
            <span>+</span> Sell Item
          </Link>

          {!loading && user ? (
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-ink/10 dark:border-stone-700">
              <NotificationBell />
              <Link href="/profile" className="flex items-center gap-1.5 text-xs text-ink/80 dark:text-stone-200 hover:text-moss dark:hover:text-emerald-400 transition-colors">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-moss/20 to-emerald-100 dark:from-emerald-950 dark:to-stone-800 flex items-center justify-center font-bold text-[11px] text-moss dark:text-emerald-300 border border-moss/20 overflow-hidden">
                  {user.avatar_url ? (
                    <img src={resolveImageUrl(user.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()
                  )}
                </div>
                <span className="font-medium hidden md:inline">{user.full_name || user.email.split("@")[0]}</span>
              </Link>
              {user.is_admin && (
                <Link href="/admin" className="text-[11px] text-ink/40 dark:text-stone-400 hover:text-moss dark:hover:text-emerald-400 font-medium transition-colors" title="Admin Dashboard">
                  🛡️
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="text-xs text-ink/50 dark:text-stone-400 hover:text-clay transition-colors"
                title="Log out"
              >
                Log out
              </button>
            </div>
          ) : !loading ? (
            <div className="hidden sm:flex items-center gap-2">
              <Link
                href="/login"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-ink/20 dark:border-stone-700 text-ink dark:text-stone-200 hover:border-moss hover:text-moss transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/register"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-moss text-white hover:bg-moss/90 transition-colors shadow-2xs"
              >
                Join
              </Link>
            </div>
          ) : null}

          {/* Mobile Notification Bell */}
          {!loading && user && (
            <div className="sm:hidden flex items-center">
              <NotificationBell />
            </div>
          )}

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="sm:hidden flex flex-col items-center justify-center w-9 h-9 gap-1 rounded-lg hover:bg-sand dark:hover:bg-stone-800 transition-colors p-1"
            aria-label="Toggle menu"
          >
            <span
              className={`block w-5 h-0.5 bg-ink/80 dark:bg-stone-200 rounded-full transition-all duration-200 ${
                menuOpen ? "rotate-45 translate-y-[3px]" : ""
              }`}
            />
            <span
              className={`block w-5 h-0.5 bg-ink/80 dark:bg-stone-200 rounded-full transition-all duration-200 ${
                menuOpen ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block w-5 h-0.5 bg-ink/80 dark:bg-stone-200 rounded-full transition-all duration-200 ${
                menuOpen ? "-rotate-45 -translate-y-[3px]" : ""
              }`}
            />
          </button>
        </div>
      </nav>

      {/* Mobile Slide-Down Menu */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="sm:hidden fixed inset-0 top-[57px] bg-black/40 backdrop-blur-xs z-40"
            onClick={() => setMenuOpen(false)}
          />

          <div className="sm:hidden absolute left-0 right-0 top-full bg-white dark:bg-stone-900 border-b border-ink/10 dark:border-white/10 shadow-2xl z-50 animate-slide-down max-h-[calc(100dvh-60px)] overflow-y-auto">
            <div className="max-w-5xl mx-auto px-4 py-4 space-y-1.5">
              {/* Campus Selector in Mobile Menu */}
              <div className="pb-2 border-b border-ink/10 dark:border-stone-800">
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink/50 dark:text-stone-400 block mb-1.5 px-1">
                  🏫 Campus Hub
                </label>
                <select
                  value={selectedCampus}
                  onChange={(e) => handleSelectCampus(e.target.value)}
                  className="w-full bg-sand/60 dark:bg-stone-800 border border-ink/10 dark:border-stone-700 rounded-xl px-3 py-2 text-xs font-semibold text-ink dark:text-white focus:outline-none focus:border-moss"
                >
                  <option value="ALL">🌐 All Campuses (Bangalore)</option>
                  {user?.college && (
                    <option value={user.college}>🎓 My Campus ({user.college})</option>
                  )}
                  {campuses.map((c) => (
                    <option key={c.college} value={c.college}>
                      {c.college} ({c.count} items)
                    </option>
                  ))}
                </select>
              </div>

              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? "text-moss dark:text-emerald-400 bg-moss/10 dark:bg-moss/20 font-bold"
                      : "text-ink/80 dark:text-stone-200 hover:text-moss dark:hover:text-emerald-400 hover:bg-sand/60 dark:hover:bg-stone-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base">{link.icon}</span>
                    {link.label}
                  </div>
                  {Boolean(link.badge && link.badge > 0) && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                      {link.badge}
                    </span>
                  )}
                </Link>
              ))}

              <Link
                href="/listings/new"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-moss hover:bg-moss/90 transition-colors shadow-sm"
              >
                <span className="text-base">➕</span>
                Sell / List Item
              </Link>

              <div className="border-t border-ink/10 dark:border-stone-800 pt-3 mt-2">
                {user ? (
                  <div className="space-y-1">
                    <Link
                      href="/profile"
                      className="flex items-center justify-between p-2.5 rounded-xl hover:bg-sand/60 dark:hover:bg-stone-800 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-moss/20 to-emerald-100 dark:from-emerald-950 dark:to-stone-800 flex items-center justify-center font-bold text-xs text-moss dark:text-emerald-300 border border-moss/20 overflow-hidden shrink-0">
                          {user.avatar_url ? (
                            <img src={resolveImageUrl(user.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink dark:text-white truncate">{user.full_name || user.email.split("@")[0]}</p>
                          <p className="text-[11px] text-ink/50 dark:text-stone-400 truncate">{user.email}</p>
                        </div>
                      </div>
                      <span className="text-xs text-moss dark:text-emerald-400 font-semibold shrink-0">Profile →</span>
                    </Link>

                    {user.is_admin && (
                      <Link
                        href="/admin"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-ink/80 dark:text-stone-300 hover:text-moss dark:hover:text-emerald-400 hover:bg-sand/60 dark:hover:bg-stone-800 transition-colors"
                      >
                        <span>🛡️</span> Admin Dashboard
                      </Link>
                    )}

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left font-medium"
                    >
                      <span>🚪</span> Log out
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <Link
                      href="/login"
                      className="flex-1 text-center text-sm font-semibold text-ink dark:text-white border border-ink/20 dark:border-stone-700 py-2.5 rounded-xl hover:border-moss hover:text-moss dark:hover:border-emerald-400 dark:hover:text-emerald-400 transition-colors"
                    >
                      Log in
                    </Link>
                    <Link
                      href="/register"
                      className="flex-1 text-center text-sm font-semibold text-white bg-moss py-2.5 rounded-xl hover:bg-moss/90 transition-colors shadow-sm"
                    >
                      Sign up
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
