"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, resolveImageUrl, getCategoryFallbackImage, uploadAvatar, updateProfile, removeToken, User } from "@/lib/api";
import { useToast } from "@/components/Toast";

type ProfileListing = {
  id: number;
  title: string;
  price: number | null;
  transaction_type: string;
  category: string;
  condition: string | null;
  image_urls: string[];
  status: string;
  created_at: string | null;
};

type ProfileReview = {
  id: number;
  rating: number;
  comment: string | null;
  reviewer_name: string;
  created_at: string | null;
};

type ProfileUser = {
  id: number;
  full_name: string | null;
  avatar_url?: string | null;
  email: string;
  college: string | null;
  is_verified: boolean;
  avg_rating: number;
  rating_count: number;
  created_at: string | null;
};

type ProfileData = {
  user: ProfileUser;
  listings: ProfileListing[];
  reviews: ProfileReview[];
};

const typeBadges: Record<string, string> = {
  BUY: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800",
  EXCHANGE: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800",
  RENT: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800",
  DONATE: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/60 dark:text-purple-200 dark:border-purple-800",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={`text-sm ${s <= Math.round(rating) ? "text-amber-400" : "text-ink/15 dark:text-stone-700"}`}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<ProfileData | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"listings" | "reviews">("listings");

  // Edit Profile Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCollege, setEditCollege] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Avatar upload
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // GDPR Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api("/auth/me").then(setCurrentUser).catch(() => setCurrentUser(null));

    loadProfile();
  }, [id]);

  function loadProfile() {
    api(`/auth/users/${id}/public-profile`)
      .then((res) => {
        setData(res);
        if (res.user) {
          setEditName(res.user.full_name || "");
          setEditCollege(res.user.college || "");
        }
      })
      .catch((e) => setError(e.message));
  }

  const isOwner = currentUser?.id === Number(id);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      showToast("Avatar image must be under 3MB", "error");
      return;
    }

    setUploadingAvatar(true);
    try {
      const res = await uploadAvatar(file);
      showToast("📸 Profile avatar updated!", "success");
      if (data) {
        setData({
          ...data,
          user: { ...data.user, avatar_url: res.avatar_url },
        });
      }
    } catch (e: any) {
      showToast(e.message || "Failed to upload avatar", "error");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile({ full_name: editName, college: editCollege });
      showToast("✅ Profile updated successfully!", "success");
      setEditModalOpen(false);
      loadProfile();
    } catch (e: any) {
      showToast(e.message || "Failed to update profile", "error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleExportData() {
    try {
      const exportJson = await api("/auth/me/export");
      const blob = new Blob([JSON.stringify(exportJson, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `productxchange_my_data_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("📁 Personal data export downloaded!", "success");
    } catch (e: any) {
      showToast(e.message || "Export failed", "error");
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await api("/auth/me", { method: "DELETE" });
      removeToken();
      showToast("Your account has been deleted.", "success");
      router.push("/");
    } catch (e: any) {
      showToast(e.message || "Failed to delete account", "error");
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center animate-fade-in">
        <span className="text-5xl mb-3">😞</span>
        <h1 className="text-xl font-bold text-ink dark:text-white mb-2">User Not Found</h1>
        <p className="text-sm text-ink/60 dark:text-stone-400 mb-4">{error}</p>
        <Link href="/" className="text-sm text-moss dark:text-emerald-400 font-semibold hover:underline">
          ← Back to listings
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center animate-pulse text-ink/60 dark:text-stone-400 text-sm">
        Loading profile…
      </div>
    );
  }

  const { user, listings, reviews } = data;
  const joinDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : "Unknown";

  return (
    <div className="max-w-3xl mx-auto py-3 sm:py-4 px-1 sm:px-4 animate-fade-in">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <Link href="/" className="text-xs text-ink/60 dark:text-stone-400 hover:text-moss dark:hover:text-emerald-400 font-medium">
          ← Back to listings
        </Link>

        {isOwner && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditModalOpen(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-ink/15 dark:border-stone-700 hover:border-moss hover:text-moss dark:hover:border-emerald-400 dark:hover:text-emerald-400 bg-white dark:bg-stone-800 text-ink dark:text-white transition-colors flex items-center gap-1.5"
            >
              <span>✏️</span> Edit Profile
            </button>
            <button
              onClick={handleExportData}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-ink/15 dark:border-stone-700 hover:bg-sand dark:hover:bg-stone-800 text-ink/70 dark:text-stone-300 transition-colors"
              title="Download GDPR data export"
            >
              <span>📁</span> Export Data
            </button>
          </div>
        )}
      </div>

      {/* Profile Header Card */}
      <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm mb-6 transition-colors">
        {/* Banner */}
        <div className="h-24 sm:h-28 bg-gradient-to-r from-moss via-emerald-600 to-teal-700 relative">
          <div className="absolute -bottom-10 sm:-bottom-12 left-4 sm:left-6">
            <div className="relative group w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white dark:bg-stone-900 border-4 border-white dark:border-stone-900 shadow-md flex items-center justify-center text-2xl sm:text-3xl font-bold text-moss dark:text-emerald-300 bg-gradient-to-br from-moss/10 to-emerald-100 dark:from-emerald-950 dark:to-stone-800 overflow-hidden">
              {user.avatar_url ? (
                <img
                  src={resolveImageUrl(user.avatar_url)}
                  alt={user.full_name || "Avatar"}
                  className="w-full h-full object-cover"
                />
              ) : (
                user.full_name?.charAt(0)?.toUpperCase() || user.email.charAt(0).toUpperCase()
              )}

              {/* Camera upload overlay for owner */}
              {isOwner && (
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-semibold"
                  title="Upload profile photo"
                >
                  <span>📷</span>
                  <span>{uploadingAvatar ? "…" : "Change"}</span>
                </button>
              )}
            </div>

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
        </div>

        <div className="pt-12 sm:pt-14 px-4 sm:px-6 pb-4 sm:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-ink dark:text-white">
                  {user.full_name || user.email.split("@")[0]}
                </h1>
                {user.is_verified && (
                  <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    ✓ Verified
                  </span>
                )}
              </div>
              {user.college && (
                <p className="text-sm text-ink/70 dark:text-stone-300 mt-1 flex items-center gap-1">
                  <span>🎓</span> {user.college}
                </p>
              )}
              <p className="text-xs text-ink/40 dark:text-stone-500 mt-1">Joined {joinDate}</p>

              <Link
                href="/impact"
                className="inline-flex items-center gap-1.5 mt-3 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
              >
                <span>🌱</span> Campus Eco-Contributor • View Impact →
              </Link>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="text-center px-3 sm:px-4 py-2 bg-sand/60 dark:bg-stone-800 rounded-xl border border-ink/5 dark:border-stone-700">
                <div className="flex items-center gap-1 justify-center">
                  <StarRating rating={user.avg_rating} />
                  <span className="text-sm font-bold text-ink dark:text-white ml-1">
                    {user.avg_rating.toFixed(1)}
                  </span>
                </div>
                <p className="text-[11px] text-ink/50 dark:text-stone-400 mt-0.5">
                  {user.rating_count} review{user.rating_count !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="text-center px-3 sm:px-4 py-2 bg-sand/60 dark:bg-stone-800 rounded-xl border border-ink/5 dark:border-stone-700">
                <p className="text-lg font-bold text-moss dark:text-emerald-400">{listings.length}</p>
                <p className="text-[11px] text-ink/50 dark:text-stone-400">Active Listings</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs with Touch Horizontal Scroll */}
      <div className="flex overflow-x-auto scrollbar-none touch-pan-x border-b border-ink/10 dark:border-stone-800 mb-6 gap-2 text-sm whitespace-nowrap">
        <button
          onClick={() => setActiveTab("listings")}
          className={`pb-3 px-4 font-semibold transition-colors border-b-2 shrink-0 ${
            activeTab === "listings"
              ? "border-moss text-moss dark:border-emerald-400 dark:text-emerald-400"
              : "border-transparent text-ink/60 dark:text-stone-400 hover:text-ink dark:hover:text-white"
          }`}
        >
          Active Listings ({listings.length})
        </button>
        <button
          onClick={() => setActiveTab("reviews")}
          className={`pb-3 px-4 font-semibold transition-colors border-b-2 ${
            activeTab === "reviews"
              ? "border-moss text-moss dark:border-emerald-400 dark:text-emerald-400"
              : "border-transparent text-ink/60 dark:text-stone-400 hover:text-ink dark:hover:text-white"
          }`}
        >
          Reviews ({reviews.length})
        </button>
      </div>

      {/* Listings Tab */}
      {activeTab === "listings" && (
        <div className="animate-fade-in">
          {listings.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-stone-900 border border-ink/10 dark:border-stone-800 rounded-2xl">
              <span className="text-4xl">📦</span>
              <p className="text-sm text-ink/60 dark:text-stone-400 mt-2">No active listings</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {listings.map((p) => {
                const badge = typeBadges[p.transaction_type] || "bg-gray-100 text-gray-800";
                const hasImage = p.image_urls && p.image_urls.length > 0;
                return (
                  <Link
                    key={p.id}
                    href={`/listings/${p.id}`}
                    className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-stone-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
                  >
                    <div className="aspect-[4/3] bg-sand/60 dark:bg-stone-800 overflow-hidden">
                      <img
                        src={hasImage ? resolveImageUrl(p.image_urls[0]) : getCategoryFallbackImage(p.category)}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          const fallback = getCategoryFallbackImage(p.category);
                          if (e.currentTarget.src !== fallback) {
                            e.currentTarget.src = fallback;
                          }
                        }}
                      />
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold text-sm text-ink dark:text-white line-clamp-1">{p.title}</h3>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="font-bold text-moss dark:text-emerald-400 text-sm">
                          {p.price != null && p.price > 0 ? `₹${p.price.toLocaleString("en-IN")}` : "Free"}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge}`}>
                          {p.transaction_type}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Reviews Tab */}
      {activeTab === "reviews" && (
        <div className="animate-fade-in space-y-3">
          {reviews.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-stone-900 border border-ink/10 dark:border-stone-800 rounded-2xl">
              <span className="text-4xl">⭐</span>
              <p className="text-sm text-ink/60 dark:text-stone-400 mt-2">No reviews yet</p>
            </div>
          ) : (
            reviews.map((r) => (
              <div key={r.id} className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-stone-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-sand dark:bg-stone-800 flex items-center justify-center text-xs font-bold text-moss dark:text-emerald-400 border border-moss/20">
                      {r.reviewer_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink dark:text-white">{r.reviewer_name}</p>
                      <StarRating rating={r.rating} />
                    </div>
                  </div>
                  {r.created_at && (
                    <span className="text-[11px] text-ink/40 dark:text-stone-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {r.comment && (
                  <p className="text-sm text-ink/70 dark:text-stone-300 leading-relaxed mt-1">
                    &ldquo;{r.comment}&rdquo;
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Owner Account Danger Zone */}
      {isOwner && (
        <div className="mt-12 pt-6 border-t border-ink/10 dark:border-stone-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">Account Deletion (GDPR)</p>
              <p className="text-[11px] text-ink/50 dark:text-stone-400">Permanently close your student account and remove listings</p>
            </div>
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            >
              Delete Account
            </button>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in" onClick={() => setEditModalOpen(false)}>
          <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-stone-700 rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-ink dark:text-white mb-1">Edit Student Profile</h3>
            <p className="text-xs text-ink/60 dark:text-stone-400 mb-4">Update your display name and campus college information.</p>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink dark:text-stone-200 mb-1">Full Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-ink/20 dark:border-stone-700 rounded-lg px-3 py-2 text-xs text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink dark:text-stone-200 mb-1">College / Campus</label>
                <input
                  type="text"
                  value={editCollege}
                  onChange={(e) => setEditCollege(e.target.value)}
                  placeholder="e.g. National Institute of Technology"
                  className="w-full border border-ink/20 dark:border-stone-700 rounded-lg px-3 py-2 text-xs text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-ink/20 dark:border-stone-700 text-ink/70 dark:text-stone-300 hover:bg-sand dark:hover:bg-stone-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-moss text-white hover:bg-moss/90 disabled:opacity-50 transition-colors"
                >
                  {savingProfile ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in" onClick={() => setDeleteModalOpen(false)}>
          <div className="bg-white dark:bg-stone-900 border border-red-200 dark:border-red-900 rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 mb-2">Delete Account Confirmation</h3>
            <p className="text-xs text-ink/70 dark:text-stone-300 leading-relaxed mb-4">
              Are you sure you want to delete your account? All your active listings will be removed, and your profile data will be permanently anonymized. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-ink/20 dark:border-stone-700 text-ink/70 dark:text-stone-300 hover:bg-sand dark:hover:bg-stone-800 transition-colors"
              >
                Keep Account
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting…" : "Yes, Delete Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
