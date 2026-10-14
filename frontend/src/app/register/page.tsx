"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setToken } from "@/lib/api";
import { useToast } from "@/components/Toast";

function getPasswordStrength(pw: string): { label: string; color: string; width: string } {
  if (pw.length === 0) return { label: "", color: "", width: "0%" };
  if (pw.length < 6) return { label: "Too short", color: "bg-red-400", width: "20%" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: "Weak", color: "bg-orange-400", width: "40%" };
  if (score === 2) return { label: "Medium", color: "bg-yellow-400", width: "60%" };
  if (score === 3) return { label: "Strong", color: "bg-emerald-400", width: "80%" };
  return { label: "Very Strong", color: "bg-emerald-600", width: "100%" };
}

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    full_name: "",
    college: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const isNameValid = form.full_name.trim().length >= 2;
  const isPasswordValid = form.password.length >= 6;
  const doPasswordsMatch = form.password === form.confirmPassword;
  const strength = getPasswordStrength(form.password);

  const isFormValid = isEmailValid && isNameValid && isPasswordValid && doPasswordsMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;
    setSubmitting(true);
    setError(null);
    try {
      const { access_token } = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          college: form.college || null,
        }),
      });
      setToken(access_token);
      showToast("Account created! Welcome to ProductXchange 🎉", "success");

      navigator.geolocation?.getCurrentPosition(
        async (pos) => {
          try {
            await api("/auth/me/location", {
              method: "PATCH",
              body: JSON.stringify({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              }),
            });
          } catch {}
          router.push("/");
        },
        () => router.push("/")
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[75vh] flex items-center justify-center -mt-6">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-0 bg-white rounded-2xl shadow-lg overflow-hidden border border-ink/10 animate-scale-in">
        {/* Left: Branding Panel */}
        <div className="hidden md:flex flex-col justify-between p-8 bg-gradient-to-br from-moss via-moss-dark to-emerald-900 text-white relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/5 rounded-full" />
          <div className="absolute -bottom-16 -left-8 w-52 h-52 bg-white/5 rounded-full" />
          <div className="absolute top-1/2 right-0 w-32 h-32 bg-white/[0.03] rounded-full" />

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-8">
              <span className="text-3xl">🔄</span>
              <span className="font-extrabold text-2xl tracking-tight">
                Product<span className="text-emerald-300">Xchange</span>
              </span>
            </div>

            <h2 className="text-2xl font-bold leading-snug mb-4">
              Your Campus<br />
              Marketplace Awaits
            </h2>
            <p className="text-sm text-white/70 leading-relaxed mb-8">
              Join your fellow students to trade textbooks, share lab equipment,
              and find hostel essentials — all within your campus radius.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <span className="text-base">🎓</span>
                </div>
                <div>
                  <p className="font-semibold text-sm">Campus Verified</p>
                  <p className="text-xs text-white/60">College email & phone OTP verification</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <span className="text-base">🔒</span>
                </div>
                <div>
                  <p className="font-semibold text-sm">Privacy-First Design</p>
                  <p className="text-xs text-white/60">Location blurred until deal confirmed</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <span className="text-base">⭐</span>
                </div>
                <div>
                  <p className="font-semibold text-sm">Trust & Ratings</p>
                  <p className="text-xs text-white/60">Community-driven reputation system</p>
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-white/40 relative z-10">
            Trusted by students across campuses
          </p>
        </div>

        {/* Right: Register Form */}
        <div className="flex flex-col justify-center p-5 sm:p-8 md:p-10">
          <div className="md:hidden flex items-center gap-2 mb-6">
            <span className="text-2xl">🔄</span>
            <span className="font-extrabold text-xl tracking-tight text-moss dark:text-emerald-400">
              Product<span className="text-ink dark:text-sand">Xchange</span>
            </span>
          </div>

          <h1 className="text-2xl font-bold text-ink dark:text-white mb-1">Create your account</h1>
          <p className="text-sm text-ink/60 dark:text-stone-400 mb-6">
            Start trading on campus in seconds
          </p>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Full Name */}
            <div>
              <label htmlFor="reg-name" className="block text-xs font-semibold text-ink/70 mb-1.5">
                Full Name *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-sm text-ink/35">👤</span>
                <input
                  id="reg-name"
                  className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink focus:outline-none transition-colors ${
                    form.full_name && !isNameValid
                      ? "border-red-300 focus:border-red-400"
                      : "border-ink/15 focus:border-moss"
                  }`}
                  placeholder="Your full name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </div>
              {form.full_name && !isNameValid && (
                <p className="text-[11px] text-red-500 mt-1">Name must be at least 2 characters</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="reg-email" className="block text-xs font-semibold text-ink/70 mb-1.5">
                Email Address *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-sm text-ink/35">📧</span>
                <input
                  id="reg-email"
                  className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink focus:outline-none transition-colors ${
                    form.email && !isEmailValid
                      ? "border-red-300 focus:border-red-400"
                      : "border-ink/15 focus:border-moss"
                  }`}
                  placeholder="you@college.edu"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              {form.email && !isEmailValid && (
                <p className="text-[11px] text-red-500 mt-1">Please enter a valid email</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="reg-password" className="block text-xs font-semibold text-ink/70 mb-1.5">
                Password *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-sm text-ink/35">🔒</span>
                <input
                  id="reg-password"
                  className="w-full border border-ink/15 rounded-xl pl-10 pr-11 py-2.5 text-sm text-ink focus:outline-none focus:border-moss transition-colors"
                  placeholder="Minimum 6 characters"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-2.5 text-sm text-ink/40 hover:text-ink/70 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
              {form.password.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-ink/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                      style={{ width: strength.width }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-ink/50">{strength.label}</span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="reg-confirm" className="block text-xs font-semibold text-ink/70 mb-1.5">
                Confirm Password *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-sm text-ink/35">🔒</span>
                <input
                  id="reg-confirm"
                  className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink focus:outline-none transition-colors ${
                    form.confirmPassword && !doPasswordsMatch
                      ? "border-red-300 focus:border-red-400"
                      : "border-ink/15 focus:border-moss"
                  }`}
                  placeholder="Re-enter your password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                />
              </div>
              {form.confirmPassword && !doPasswordsMatch && (
                <p className="text-[11px] text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>

            {/* College */}
            <div>
              <label htmlFor="reg-college" className="block text-xs font-semibold text-ink/70 mb-1.5">
                College <span className="text-ink/40 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-sm text-ink/35">🎓</span>
                <input
                  id="reg-college"
                  className="w-full border border-ink/15 rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink focus:outline-none focus:border-moss transition-colors"
                  placeholder="e.g. IIT Madras, VIT, SRM"
                  value={form.college}
                  onChange={(e) => setForm({ ...form, college: e.target.value })}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 border-l-4 border-l-red-500 rounded-lg text-xs text-red-700 font-medium animate-fade-in">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              disabled={!isFormValid || submitting}
              className="w-full bg-moss text-white font-semibold py-3 px-4 rounded-xl shadow-sm hover:bg-moss/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Creating account…
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-ink/10 text-center">
            <p className="text-sm text-ink/60">
              Already have an account?{" "}
              <Link href="/login" className="text-moss font-semibold hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
