"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, getToken, resolveImageUrl } from "@/lib/api";
import { useToast } from "@/components/Toast";

type Report = {
  id: number;
  reporter_id: number;
  reason: string;
  details: string | null;
  reported_user_id: number | null;
  reported_product_id: number | null;
  resolved: boolean;
  admin_notes: string | null;
  created_at: string;
};

type AdminUser = {
  id: number;
  email: string;
  full_name: string | null;
  avatar_url?: string | null;
  college: string | null;
  is_verified: boolean;
  is_admin: boolean;
  is_blocked_flag: boolean;
  avg_rating: number;
  rating_count: number;
  created_at: string | null;
};

type AnalyticsBreakdown = {
  categories: { category: string; count: number }[];
  transaction_states: { state: string; count: number }[];
  transaction_types: { type: string; count: number }[];
};

type Stats = Record<string, number>;

export default function AdminPage() {
  const { showToast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [resolvedReports, setResolvedReports] = useState<Report[]>([]);
  const [activeTab, setActiveTab] = useState<"reports" | "resolved" | "users" | "breakdown" | "exports">("reports");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Users tab state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Breakdown tab state
  const [breakdown, setBreakdown] = useState<AnalyticsBreakdown | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [statsRes, openReports, closedReports] = await Promise.all([
        api("/admin/stats"),
        api("/admin/reports?resolved=false"),
        api("/admin/reports?resolved=true"),
      ]);
      setStats(statsRes);
      setReports(openReports);
      setResolvedReports(closedReports);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function loadUsers(q = "") {
    setLoadingUsers(true);
    try {
      const res = await api(`/admin/users?q=${encodeURIComponent(q)}&limit=50`);
      setUsers(res.users || []);
    } catch (e: any) {
      showToast(e.message || "Failed to load users", "error");
    } finally {
      setLoadingUsers(false);
    }
  }

  async function loadBreakdown() {
    try {
      const res = await api("/admin/analytics/breakdown");
      setBreakdown(res);
    } catch {}
  }

  useEffect(() => {
    if (activeTab === "users") {
      loadUsers(userQuery);
    } else if (activeTab === "breakdown") {
      loadBreakdown();
    }
  }, [activeTab]);

  async function resolveReport(id: number) {
    setActionLoading(id);
    try {
      await api(`/admin/reports/${id}/resolve`, { method: "POST" });
      showToast("Report resolved", "success");
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function suspendUser(userId: number) {
    if (!confirm(`Are you sure you want to suspend User #${userId}?`)) return;
    try {
      await api(`/admin/users/${userId}/suspend`, { method: "POST" });
      showToast(`User #${userId} suspended`, "success");
      await load();
      if (activeTab === "users") loadUsers(userQuery);
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function unsuspendUser(userId: number) {
    try {
      await api(`/admin/users/${userId}/unsuspend`, { method: "POST" });
      showToast(`User #${userId} reinstated`, "success");
      await load();
      if (activeTab === "users") loadUsers(userQuery);
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function removeListing(productId: number) {
    if (!confirm(`Remove listing #${productId}?`)) return;
    try {
      await api(`/admin/listings/${productId}/remove`, { method: "POST" });
      showToast(`Listing #${productId} removed`, "success");
      await load();
    } catch (e: any) {
      showToast(e.message, "error");
    }
  }

  async function downloadCsv(resource: string) {
    try {
      const token = getToken();
      const res = await fetch(`http://localhost:8000/admin/export/${resource}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `productxchange_${resource}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`📥 ${resource}.csv downloaded successfully!`, "success");
    } catch (e: any) {
      showToast(e.message || "Failed to download CSV", "error");
    }
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-8 text-center animate-fade-in">
        <span className="text-5xl block mb-3">🛡️</span>
        <h1 className="text-xl font-bold text-ink dark:text-white mb-2">Admin Access Required</h1>
        <p className="text-sm text-clay">{error}</p>
        <Link href="/" className="text-sm text-moss dark:text-emerald-400 font-semibold hover:underline mt-4 inline-block">
          ← Back to home
        </Link>
      </div>
    );
  }

  const statCards: { key: string; label: string; icon: string }[] = [
    { key: "total_users", label: "Total Users", icon: "👥" },
    { key: "verified_users", label: "Verified", icon: "✅" },
    { key: "active_listings", label: "Active Listings", icon: "📦" },
    { key: "total_transactions", label: "Transactions", icon: "🤝" },
    { key: "open_reports", label: "Open Reports", icon: "⚠️" },
  ];

  const totalUsers = stats?.total_users || 1;
  const verifiedUsers = stats?.verified_users || 0;
  const verifiedPercent = Math.min(100, Math.round((verifiedUsers / totalUsers) * 100));
  const totalReportsCount = (reports.length + resolvedReports.length) || 1;
  const resolutionRate = Math.min(100, Math.round((resolvedReports.length / totalReportsCount) * 100));

  return (
    <div className="max-w-4xl mx-auto py-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl">🛡️</span>
        <div>
          <h1 className="text-2xl font-bold text-ink dark:text-white">Admin Dashboard</h1>
          <p className="text-sm text-ink/60 dark:text-stone-300">Manage users, reports, metrics, and data exports</p>
        </div>
      </div>

      {/* Stats Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-xl p-4 animate-pulse">
              <div className="h-3 bg-sand dark:bg-stone-800 rounded w-2/3 mb-2" />
              <div className="h-6 bg-sand dark:bg-stone-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {statCards.map((card) => (
            <div
              key={card.key}
              className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ink/60 dark:text-stone-400 font-medium">{card.label}</span>
                <span className="text-base">{card.icon}</span>
              </div>
              <p className="text-2xl font-bold text-ink dark:text-white">
                {stats[card.key] ?? 0}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Visual Analytics Charts & Velocity */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* User Verification Ratio Chart */}
          <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink/70 dark:text-stone-300 flex items-center gap-1.5">
                <span>🎓</span> Student Verification Ratio
              </h3>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{verifiedPercent}% Verified</span>
            </div>
            <div className="w-full bg-sand dark:bg-stone-800 h-3.5 rounded-full overflow-hidden flex">
              <div style={{ width: `${verifiedPercent}%` }} className="bg-emerald-500 h-full transition-all duration-500" />
              <div style={{ width: `${100 - verifiedPercent}%` }} className="bg-amber-400 h-full transition-all duration-500" />
            </div>
            <div className="flex justify-between text-[11px] text-ink/50 dark:text-stone-400">
              <span>Verified: {verifiedUsers}</span>
              <span>Unverified: {totalUsers - verifiedUsers}</span>
            </div>
          </div>

          {/* Moderation Resolution Velocity */}
          <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink/70 dark:text-stone-300 flex items-center gap-1.5">
                <span>⚡</span> Moderation Resolution Velocity
              </h3>
              <span className="text-xs font-bold text-moss dark:text-emerald-400">{resolutionRate}% Solved</span>
            </div>
            <div className="w-full bg-sand dark:bg-stone-800 h-3.5 rounded-full overflow-hidden flex">
              <div style={{ width: `${resolutionRate}%` }} className="bg-moss dark:bg-emerald-500 h-full transition-all duration-500" />
              <div style={{ width: `${100 - resolutionRate}%` }} className="bg-rose-500 h-full transition-all duration-500" />
            </div>
            <div className="flex justify-between text-[11px] text-ink/50 dark:text-stone-400">
              <span>Resolved: {resolvedReports.length}</span>
              <span>Open Pending: {reports.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Admin Tabs */}
      <div className="flex border-b border-ink/10 dark:border-stone-800 mb-6 gap-2 text-sm overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab("reports")}
          className={`pb-3 px-3 font-semibold transition-colors border-b-2 shrink-0 flex items-center gap-1.5 ${
            activeTab === "reports" ? "border-moss text-moss dark:text-emerald-400" : "border-transparent text-ink/60 dark:text-stone-400 hover:text-ink dark:hover:text-white"
          }`}
        >
          Open Reports
          {reports.length > 0 && (
            <span className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-[11px] font-bold px-1.5 py-0.5 rounded-full">
              {reports.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("resolved")}
          className={`pb-3 px-3 font-semibold transition-colors border-b-2 shrink-0 ${
            activeTab === "resolved" ? "border-moss text-moss dark:text-emerald-400" : "border-transparent text-ink/60 dark:text-stone-400 hover:text-ink dark:hover:text-white"
          }`}
        >
          Resolved ({resolvedReports.length})
        </button>

        <button
          onClick={() => setActiveTab("users")}
          className={`pb-3 px-3 font-semibold transition-colors border-b-2 shrink-0 flex items-center gap-1 ${
            activeTab === "users" ? "border-moss text-moss dark:text-emerald-400" : "border-transparent text-ink/60 dark:text-stone-400 hover:text-ink dark:hover:text-white"
          }`}
        >
          <span>👥</span> User Management
        </button>

        <button
          onClick={() => setActiveTab("breakdown")}
          className={`pb-3 px-3 font-semibold transition-colors border-b-2 shrink-0 flex items-center gap-1 ${
            activeTab === "breakdown" ? "border-moss text-moss dark:text-emerald-400" : "border-transparent text-ink/60 dark:text-stone-400 hover:text-ink dark:hover:text-white"
          }`}
        >
          <span>📊</span> Category Breakdown
        </button>

        <button
          onClick={() => setActiveTab("exports")}
          className={`pb-3 px-3 font-semibold transition-colors border-b-2 shrink-0 flex items-center gap-1 ${
            activeTab === "exports" ? "border-moss text-moss dark:text-emerald-400" : "border-transparent text-ink/60 dark:text-stone-400 hover:text-ink dark:hover:text-white"
          }`}
        >
          <span>📥</span> Export CSV
        </button>
      </div>

      {/* Tab: Open Reports */}
      {activeTab === "reports" && (
        <div className="space-y-3 animate-fade-in">
          {reports.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl">
              <span className="text-4xl block mb-2">🎉</span>
              <h3 className="font-semibold text-ink dark:text-white">No open reports</h3>
              <p className="text-xs text-ink/50 dark:text-stone-400 mt-1">Everything looks clean!</p>
            </div>
          ) : (
            reports.map((r) => (
              <div
                key={r.id}
                className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-xl p-5 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-red-700 bg-red-100 dark:bg-red-950/40 dark:text-red-300 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
                        ⚠️ {r.reason}
                      </span>
                      <span className="text-[11px] text-ink/40 dark:text-stone-400">
                        #{r.id} · {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {r.details && (
                      <p className="text-sm text-ink/80 dark:text-stone-300 mb-3 bg-sand/30 dark:bg-stone-800/40 p-2.5 rounded-lg">
                        {r.details}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 text-xs">
                      {r.reported_user_id && (
                        <span className="text-ink/60 dark:text-stone-400">
                          Reported User: <strong>#{r.reported_user_id}</strong>
                        </span>
                      )}
                      {r.reported_product_id && (
                        <span className="text-ink/60 dark:text-stone-400">
                          Reported Listing:{" "}
                          <Link
                            href={`/listings/${r.reported_product_id}`}
                            className="text-moss dark:text-emerald-400 underline font-semibold"
                          >
                            #{r.reported_product_id}
                          </Link>
                        </span>
                      )}
                      <span className="text-ink/40 dark:text-stone-500">
                        By User #{r.reporter_id}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex sm:flex-col gap-2 shrink-0">
                    <button
                      onClick={() => resolveReport(r.id)}
                      disabled={actionLoading === r.id}
                      className="text-xs bg-emerald-600 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === r.id ? "Resolving…" : "✓ Resolve"}
                    </button>
                    {r.reported_user_id && (
                      <button
                        onClick={() => suspendUser(r.reported_user_id!)}
                        className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 rounded transition-colors"
                      >
                        Suspend User
                      </button>
                    )}
                    {r.reported_product_id && (
                      <button
                        onClick={() => removeListing(r.reported_product_id!)}
                        className="text-xs text-clay hover:text-red-800 font-semibold px-2 py-1 rounded transition-colors"
                      >
                        Remove Item
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Resolved Reports */}
      {activeTab === "resolved" && (
        <div className="space-y-3 animate-fade-in">
          {resolvedReports.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl">
              <p className="text-sm text-ink/50 dark:text-stone-400">No resolved reports yet</p>
            </div>
          ) : (
            resolvedReports.map((r) => (
              <div
                key={r.id}
                className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-xl p-4 opacity-75"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-ink/60 dark:text-stone-400">
                      #{r.id} · {r.reason}
                    </span>
                    {r.details && (
                      <p className="text-xs text-ink/50 dark:text-stone-400 mt-1">{r.details}</p>
                    )}
                  </div>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                    Resolved
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: User Management */}
      {activeTab === "users" && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search users by name, email, or college…"
              value={userQuery}
              onChange={(e) => {
                setUserQuery(e.target.value);
                loadUsers(e.target.value);
              }}
              className="flex-1 border border-ink/20 dark:border-stone-700 rounded-xl px-4 py-2.5 text-xs text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
            />
          </div>

          {loadingUsers ? (
            <div className="text-center py-12 animate-pulse text-xs text-ink/50 dark:text-stone-400">Loading student directory…</div>
          ) : (
            <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-sand/60 dark:bg-stone-800/60 border-b border-ink/10 dark:border-stone-700 text-ink/70 dark:text-stone-300">
                    <tr>
                      <th className="p-3">User</th>
                      <th className="p-3">College</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Rating</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5 dark:divide-stone-800 text-ink dark:text-stone-200">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-sand/20 dark:hover:bg-stone-800/30">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-sand dark:bg-stone-800 flex items-center justify-center font-bold text-[11px] text-moss border border-moss/20 overflow-hidden">
                              {u.avatar_url ? (
                                <img src={resolveImageUrl(u.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
                              ) : (
                                u.full_name?.charAt(0) || u.email.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div>
                              <p className="font-semibold">{u.full_name || "Student"}</p>
                              <p className="text-[11px] text-ink/50 dark:text-stone-400">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-ink/70 dark:text-stone-300">{u.college || "—"}</td>
                        <td className="p-3">
                          {u.is_blocked_flag ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              Suspended
                            </span>
                          ) : u.is_verified ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Verified
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 dark:bg-stone-800 dark:text-stone-300">
                              Standard
                            </span>
                          )}
                        </td>
                        <td className="p-3">★ {u.avg_rating.toFixed(1)} ({u.rating_count})</td>
                        <td className="p-3 text-right">
                          {u.is_blocked_flag ? (
                            <button
                              onClick={() => unsuspendUser(u.id)}
                              className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                              Reinstate
                            </button>
                          ) : (
                            <button
                              onClick={() => suspendUser(u.id)}
                              className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                            >
                              Suspend
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Analytics Breakdown */}
      {activeTab === "breakdown" && (
        <div className="space-y-6 animate-fade-in">
          {breakdown ? (
            <>
              {/* Category Breakdown */}
              <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-ink dark:text-white mb-4">Listings by Category</h3>
                <div className="space-y-3">
                  {breakdown.categories.map((c) => (
                    <div key={c.category} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-ink dark:text-stone-200">{c.category}</span>
                        <span className="text-ink/60 dark:text-stone-400">{c.count} items</span>
                      </div>
                      <div className="w-full bg-sand dark:bg-stone-800 h-2 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${Math.min(100, (c.count / (stats?.active_listings || 1)) * 100)}%` }}
                          className="bg-moss dark:bg-emerald-500 h-full rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transaction States Breakdown */}
              <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-ink dark:text-white mb-4">Transactions by Lifecycle State</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {breakdown.transaction_states.map((s) => (
                    <div key={s.state} className="p-3 rounded-xl bg-sand/40 dark:bg-stone-800/40 border border-ink/5 dark:border-stone-700">
                      <p className="text-[11px] font-semibold text-ink/60 dark:text-stone-400 uppercase">{s.state}</p>
                      <p className="text-xl font-bold text-ink dark:text-white mt-0.5">{s.count}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 animate-pulse text-xs text-ink/50 dark:text-stone-400">Loading breakdown data…</div>
          )}
        </div>
      )}

      {/* Tab: Data Exports */}
      {activeTab === "exports" && (
        <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-6 sm:p-8 shadow-sm animate-fade-in space-y-6">
          <div>
            <h3 className="text-base font-bold text-ink dark:text-white mb-1">Export Database Records</h3>
            <p className="text-xs text-ink/60 dark:text-stone-400">
              Download complete comma-separated value (CSV) reports for external audit, accreditation, or reporting.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-ink/10 dark:border-stone-700 bg-sand/30 dark:bg-stone-800/40 flex flex-col justify-between">
              <div>
                <p className="text-sm font-bold text-ink dark:text-white flex items-center gap-1.5">
                  <span>👥</span> Users Directory
                </p>
                <p className="text-xs text-ink/60 dark:text-stone-400 mt-1">
                  All student profiles, verified flags, colleges, and trust ratings.
                </p>
              </div>
              <button
                onClick={() => downloadCsv("users")}
                className="mt-4 text-xs font-semibold px-3 py-2 rounded-lg bg-moss text-white hover:bg-moss/90 transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <span>📥</span> Download users.csv
              </button>
            </div>

            <div className="p-4 rounded-xl border border-ink/10 dark:border-stone-700 bg-sand/30 dark:bg-stone-800/40 flex flex-col justify-between">
              <div>
                <p className="text-sm font-bold text-ink dark:text-white flex items-center gap-1.5">
                  <span>📦</span> Marketplace Listings
                </p>
                <p className="text-xs text-ink/60 dark:text-stone-400 mt-1">
                  Active, completed, and removed items with prices and categories.
                </p>
              </div>
              <button
                onClick={() => downloadCsv("products")}
                className="mt-4 text-xs font-semibold px-3 py-2 rounded-lg bg-moss text-white hover:bg-moss/90 transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <span>📥</span> Download products.csv
              </button>
            </div>

            <div className="p-4 rounded-xl border border-ink/10 dark:border-stone-700 bg-sand/30 dark:bg-stone-800/40 flex flex-col justify-between">
              <div>
                <p className="text-sm font-bold text-ink dark:text-white flex items-center gap-1.5">
                  <span>🤝</span> Campus Transactions
                </p>
                <p className="text-xs text-ink/60 dark:text-stone-400 mt-1">
                  All transactions with buyer/seller IDs, agreed prices, and timestamps.
                </p>
              </div>
              <button
                onClick={() => downloadCsv("transactions")}
                className="mt-4 text-xs font-semibold px-3 py-2 rounded-lg bg-moss text-white hover:bg-moss/90 transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <span>📥</span> Download transactions.csv
              </button>
            </div>

            <div className="p-4 rounded-xl border border-ink/10 dark:border-stone-700 bg-sand/30 dark:bg-stone-800/40 flex flex-col justify-between">
              <div>
                <p className="text-sm font-bold text-ink dark:text-white flex items-center gap-1.5">
                  <span>⚠️</span> Moderation Reports
                </p>
                <p className="text-xs text-ink/60 dark:text-stone-400 mt-1">
                  Report history with reporter ID, flagged content, reasons, and status.
                </p>
              </div>
              <button
                onClick={() => downloadCsv("reports")}
                className="mt-4 text-xs font-semibold px-3 py-2 rounded-lg bg-moss text-white hover:bg-moss/90 transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <span>📥</span> Download reports.csv
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
