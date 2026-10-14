"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, setToken } from "@/lib/api";
import { useToast } from "@/components/Toast";

const LOCAL_DB_ACCOUNTS = [
  {
    name: "Anbuchelvan K",
    email: "anbu@college.edu",
    role: "RVCE Student • Seller",
    avatar: "🎓",
    badge: "Seller",
    badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  {
    name: "Priya Sharma",
    email: "priya@pes.edu",
    role: "PES University • Buyer",
    avatar: "🎒",
    badge: "Buyer",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
  },
  {
    name: "Rahul Nair",
    email: "rahul@bmsce.edu",
    role: "BMSCE Student • Donor",
    avatar: "📚",
    badge: "Student",
    badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300",
  },
  {
    name: "Administrator",
    email: "admin@productxchange.in",
    role: "Platform Administrator",
    avatar: "🛡️",
    badge: "Admin",
    badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const resetTokenParam = searchParams.get("reset_token");

  // Mode: "login" | "forgot" | "reset"
  const [mode, setMode] = useState<"login" | "forgot" | "reset">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleQuickLocalLogin(emailToUse: string) {
    setEmail(emailToUse);
    setPassword("Password123!");
    setError(null);
    setSubmitting(true);
    try {
      const { access_token } = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: emailToUse, password: "Password123!" }),
      });
      setToken(access_token);
      showToast(`Logged in successfully as ${emailToUse}! 👋`, "success");
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (resetTokenParam) {
      setMode("reset");
    }
  }, [resetTokenParam]);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!isEmailValid || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      const { access_token } = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(access_token);
      showToast("Welcome back! 👋", "success");
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!isEmailValid) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSuccessMsg(res.message);
      if (res.dev_reset_token) {
        showToast("Dev reset token received (check URL or console)", "success");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: resetTokenParam, new_password: newPassword }),
      });
      showToast("Password updated! Please log in with your new password.", "success");
      setMode("login");
      setSuccessMsg("Password reset successfully. You can now log in.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[75vh] flex items-center justify-center -mt-6">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-0 bg-white dark:bg-stone-900 rounded-2xl shadow-lg overflow-hidden border border-ink/10 dark:border-white/10 animate-scale-in transition-colors">
        {/* Left: Branding Panel */}
        <div className="hidden md:flex flex-col justify-between p-8 bg-gradient-to-br from-moss via-moss-dark to-emerald-900 text-white relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/5 rounded-full" />
          <div className="absolute -bottom-16 -left-8 w-52 h-52 bg-white/5 rounded-full" />

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-8">
              <span className="text-3xl">🔄</span>
              <span className="font-extrabold text-2xl tracking-tight">
                Product<span className="text-emerald-300">Xchange</span>
              </span>
            </div>

            <h2 className="text-2xl font-bold leading-snug mb-4">
              Trade, Rent &<br />
              Exchange on Campus
            </h2>
            <p className="text-sm text-white/70 leading-relaxed mb-8">
              The location-first marketplace built for college students.
              Buy textbooks, share lab equipment, or donate hostel items —
              all within your campus radius.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">📍</span>
                <div>
                  <p className="font-semibold text-sm">Location-Based Discovery</p>
                  <p className="text-xs text-white/60">Find items within walking distance</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">🤝</span>
                <div>
                  <p className="font-semibold text-sm">Safe Campus Trading</p>
                  <p className="text-xs text-white/60">Built-in trust scores & verified users</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5">✨</span>
                <div>
                  <p className="font-semibold text-sm">AI-Powered Listings</p>
                  <p className="text-xs text-white/60">Auto-fill descriptions from photos</p>
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-white/40 relative z-10">
            Join 500+ students trading on campus
          </p>
        </div>

        {/* Right: Form Container */}
        <div className="flex flex-col justify-center p-5 sm:p-8 md:p-10">
          <div className="md:hidden flex items-center gap-2 mb-6">
            <span className="text-2xl">🔄</span>
            <span className="font-extrabold text-xl tracking-tight text-moss dark:text-emerald-400">
              Product<span className="text-ink dark:text-sand">Xchange</span>
            </span>
          </div>

          {/* MODE 1: Standard Login */}
          {mode === "login" && (
            <>
              <h1 className="text-2xl font-bold text-ink dark:text-white mb-1">Welcome back</h1>
              <p className="text-sm text-ink/60 dark:text-stone-400 mb-8">Sign in to your account to continue</p>

              {successMsg && (
                <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-900 dark:text-emerald-200 font-medium">
                  {successMsg}
                </div>
              )}
              {/* Local Database Quick Login Badges */}
              <div className="mb-5 p-3.5 rounded-xl bg-sand/60 dark:bg-stone-800/80 border border-moss/20 dark:border-emerald-800/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-ink dark:text-sand flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    ⚡ Local SQLite Database Accounts
                  </span>
                  <span className="text-[10px] text-moss dark:text-emerald-400 font-mono font-medium">
                    productxchange.db
                  </span>
                </div>
                <p className="text-[11px] text-ink/65 dark:text-stone-400 mb-2.5">
                  Click any account below for instant 1-click login:
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {LOCAL_DB_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      disabled={submitting}
                      onClick={() => handleQuickLocalLogin(acc.email)}
                      className="flex items-center gap-2 p-2 rounded-lg border border-ink/10 dark:border-stone-700 bg-white dark:bg-stone-900/90 hover:border-moss hover:shadow-sm transition-all text-left group"
                      title={`Login as ${acc.name} (${acc.email})`}
                    >
                      <span className="text-base shrink-0 group-hover:scale-110 transition-transform">
                        {acc.avatar}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-semibold text-ink dark:text-white truncate">
                            {acc.name.split(" ")[0]}
                          </p>
                          <span className={`text-[9px] px-1 py-0.2 rounded font-medium ${acc.badgeColor}`}>
                            {acc.badge}
                          </span>
                        </div>
                        <p className="text-[10px] text-ink/50 dark:text-stone-400 truncate font-mono">
                          {acc.email}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative flex items-center justify-center my-4">
                <div className="border-t border-ink/10 dark:border-stone-700 w-full" />
                <span className="bg-white dark:bg-stone-900 px-3 text-[10px] uppercase tracking-wider text-ink/40 dark:text-stone-500 font-bold absolute">
                  or sign in with email
                </span>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-xs font-semibold text-ink/70 dark:text-stone-300 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-sm text-ink/35">📧</span>
                    <input
                      id="login-email"
                      className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink dark:text-white dark:bg-stone-800 focus:outline-none transition-colors ${
                        email && !isEmailValid
                          ? "border-red-300 focus:border-red-400"
                          : "border-ink/15 dark:border-stone-700 focus:border-moss"
                      }`}
                      placeholder="you@college.edu"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-password" className="block text-xs font-semibold text-ink/70 dark:text-stone-300">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setError(null);
                        setSuccessMsg(null);
                      }}
                      className="text-xs text-moss dark:text-emerald-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-sm text-ink/35">🔒</span>
                    <input
                      id="login-password"
                      className="w-full border border-ink/15 dark:border-stone-700 rounded-xl pl-10 pr-11 py-2.5 text-sm text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss transition-colors"
                      placeholder="Enter your password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-2.5 text-sm text-ink/40 dark:text-stone-400 hover:text-ink/70 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <p className="text-[11px] text-ink/50 dark:text-stone-400 mt-1">
                    Local demo accounts default password: <code className="bg-sand dark:bg-stone-800 px-1 py-0.5 rounded text-moss dark:text-emerald-400 font-semibold font-mono">Password123!</code>
                  </p>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 border-l-4 border-l-red-500 rounded-lg text-xs text-red-700 dark:text-red-300 font-medium">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!isEmailValid || !password || submitting}
                  className="w-full bg-moss text-white font-semibold py-3 px-4 rounded-xl shadow-sm hover:bg-moss/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center gap-2"
                >
                  {submitting ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-ink/10 dark:border-stone-800 text-center">
                <p className="text-sm text-ink/60 dark:text-stone-400">
                  New here?{" "}
                  <Link href="/register" className="text-moss dark:text-emerald-400 font-semibold hover:underline">
                    Create an account
                  </Link>
                </p>
              </div>
            </>
          )}

          {/* MODE 2: Forgot Password */}
          {mode === "forgot" && (
            <div className="animate-fade-in">
              <h1 className="text-2xl font-bold text-ink dark:text-white mb-1">Reset Password</h1>
              <p className="text-sm text-ink/60 dark:text-stone-400 mb-6">
                Enter your campus student email and we'll send you a password recovery link.
              </p>

              {successMsg ? (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
                    {successMsg}
                  </div>
                  <button
                    onClick={() => setMode("login")}
                    className="w-full border border-ink/20 dark:border-stone-700 text-ink dark:text-white text-xs font-semibold py-2.5 rounded-xl hover:bg-sand dark:hover:bg-stone-800 transition-colors"
                  >
                    ← Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-ink/70 dark:text-stone-300 mb-1.5">
                      Your Registered Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@college.edu"
                      className="w-full border border-ink/15 dark:border-stone-700 rounded-xl px-4 py-2.5 text-sm text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
                    />
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!isEmailValid || submitting}
                    className="w-full bg-moss text-white font-semibold py-3 px-4 rounded-xl hover:bg-moss/90 disabled:opacity-50 transition-all text-sm"
                  >
                    {submitting ? "Sending Link…" : "Send Reset Link"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                    className="w-full text-xs text-ink/60 dark:text-stone-400 hover:underline text-center pt-2"
                  >
                    ← Back to Sign In
                  </button>
                </form>
              )}
            </div>
          )}

          {/* MODE 3: Enter New Password (via reset token) */}
          {mode === "reset" && (
            <div className="animate-fade-in">
              <h1 className="text-2xl font-bold text-ink dark:text-white mb-1">Set New Password</h1>
              <p className="text-sm text-ink/60 dark:text-stone-400 mb-6">Choose a secure new password for your account.</p>

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink/70 dark:text-stone-300 mb-1.5">
                    New Password (min 8 characters)
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full border border-ink/15 dark:border-stone-700 rounded-xl px-4 py-2.5 text-sm text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={newPassword.length < 8 || submitting}
                  className="w-full bg-moss text-white font-semibold py-3 px-4 rounded-xl hover:bg-moss/90 disabled:opacity-50 transition-all text-sm"
                >
                  {submitting ? "Updating Password…" : "Update Password"}
                </button>

                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="w-full text-xs text-ink/60 dark:text-stone-400 hover:underline text-center pt-2"
                >
                  ← Back to Sign In
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center text-sm text-ink/60 dark:text-stone-400 animate-pulse">
          Loading sign in…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
