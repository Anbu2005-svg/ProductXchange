"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Transaction, resolveImageUrl, getCategoryFallbackImage, User } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { DealCardSkeleton } from "@/components/Skeleton";

const STATE_CONFIG: Record<string, { label: string; badge: string; desc: string }> = {
  PENDING: {
    label: "Offer Pending",
    badge: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800",
    desc: "Awaiting initial review and counter/acceptance.",
  },
  COUNTERED: {
    label: "Counter-Offered",
    badge: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800",
    desc: "A new price has been proposed by one of the parties.",
  },
  ACCEPTED: {
    label: "Offer Accepted",
    badge: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800",
    desc: "Agreed on terms! Please confirm to reveal pickup details.",
  },
  CONFIRMED: {
    label: "Deal Confirmed",
    badge: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800",
    desc: "Pickup spot unlocked! Meet up and verify the handover.",
  },
  COMPLETED: {
    label: "Completed",
    badge: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-200 dark:border-green-800",
    desc: "Both parties have confirmed successful handover.",
  },
  REJECTED: {
    label: "Declined",
    badge: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800",
    desc: "This transaction offer was declined.",
  },
  CANCELLED: {
    label: "Cancelled",
    badge: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
    desc: "This deal was cancelled.",
  },
};

export default function DealsPage() {
  const { showToast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "actionable" | "completed">("all");

  // State for countering
  const [counterTxId, setCounterTxId] = useState<number | null>(null);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMsg, setCounterMsg] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  // State for Handshake PIN verification
  const [verifyTxId, setVerifyTxId] = useState<number | null>(null);
  const [verifyPinInput, setVerifyPinInput] = useState("");
  const [verifyingHandshake, setVerifyingHandshake] = useState(false);

  // State for reviews
  const [reviewTxId, setReviewTxId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewedTxIds, setReviewedTxIds] = useState<Set<number>>(new Set());

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const userRes = await api("/auth/me").catch(() => null);
      setCurrentUser(userRes);

      const txList = await api("/transactions/mine");
      setTransactions(txList);
    } catch (e: any) {
      setError(e.message || "Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAction(txId: number, action: string, extra: Record<string, any> = {}) {
    setActionError(null);
    setSubmittingAction(true);
    try {
      await api(`/transactions/${txId}/action`, {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      });
      setCounterTxId(null);
      setCounterAmount("");
      setCounterMsg("");

      const msgs: Record<string, string> = {
        accept: "✅ Offer accepted!",
        reject: "❌ Offer declined",
        counter: "📤 Counter-offer sent!",
        confirm: "🔓 Deal confirmed! Location unlocked.",
        complete: "🤝 Handover signed off!",
        cancel: "Deal cancelled",
      };
      showToast(msgs[action] || `Action '${action}' completed`, action === "reject" || action === "cancel" ? "info" : "success");

      await loadData();
    } catch (e: any) {
      setActionError(e.message);
      showToast(e.message, "error");
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleSubmitReview(txId: number) {
    setSubmittingAction(true);
    try {
      await api("/reviews", {
        method: "POST",
        body: JSON.stringify({
          transaction_id: txId,
          rating: reviewRating,
          comment: reviewComment || null,
        }),
      });
      setReviewedTxIds((prev) => new Set(prev).add(txId));
      setReviewTxId(null);
      setReviewRating(5);
      setReviewComment("");
      showToast("⭐ Review submitted! Thank you.", "success");
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleVerifyHandshake(txId: number) {
    if (!verifyPinInput.trim()) {
      showToast("Please enter the 6-digit handshake PIN", "error");
      return;
    }
    setVerifyingHandshake(true);
    try {
      await api(`/transactions/${txId}/verify-handshake`, {
        method: "POST",
        body: JSON.stringify({ pin: verifyPinInput.trim() }),
      });
      showToast("🤝 Handshake verified! Deal completed successfully.", "success");
      setVerifyTxId(null);
      setVerifyPinInput("");
      await loadData();
    } catch (e: any) {
      showToast(e.message || "Invalid or expired handshake PIN", "error");
    } finally {
      setVerifyingHandshake(false);
    }
  }

  function getLastOffer(tx: Transaction) {
    if (!tx.offers || tx.offers.length === 0) return null;
    return tx.offers[tx.offers.length - 1];
  }

  function isUserTurn(tx: Transaction): boolean {
    if (!currentUser) return false;
    if (tx.state === "PENDING") {
      const lastOffer = getLastOffer(tx);
      if (lastOffer) {
        return lastOffer.proposed_by_id !== currentUser.id;
      }
      return currentUser.id === tx.seller_id;
    }
    if (tx.state === "COUNTERED") {
      const lastOffer = getLastOffer(tx);
      return lastOffer ? lastOffer.proposed_by_id !== currentUser.id : false;
    }
    if (tx.state === "ACCEPTED") {
      return true; // either can confirm
    }
    if (tx.state === "CONFIRMED") {
      const completedByMe = currentUser.id === tx.buyer_id ? tx.buyer_completed : tx.seller_completed;
      return !completedByMe;
    }
    return false;
  }

  const filtered = transactions.filter((tx) => {
    if (activeTab === "active") {
      return ["PENDING", "COUNTERED", "ACCEPTED", "CONFIRMED"].includes(tx.state);
    }
    if (activeTab === "actionable") {
      return isUserTurn(tx);
    }
    if (activeTab === "completed") {
      return ["COMPLETED", "REJECTED", "CANCELLED"].includes(tx.state);
    }
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto py-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink dark:text-white">Deals & Negotiations</h1>
          <p className="text-sm text-ink/70 dark:text-stone-300">
            Track offers, negotiate prices, unlock pickup locations, and complete handovers.
          </p>
        </div>
        <Link
          href="/listings/new"
          className="inline-flex items-center gap-1.5 bg-moss text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm hover:bg-moss/90 transition-all self-start"
        >
          <span>+</span> List New Item
        </Link>
      </div>

      {actionError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs rounded-lg flex justify-between items-center">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="font-bold ml-2">✕</button>
        </div>
      )}

      {/* Tabs with Smooth Touch Horizontal Scroll */}
      <div className="flex overflow-x-auto scrollbar-none touch-pan-x border-b border-ink/10 dark:border-stone-800 mb-6 gap-2 text-sm whitespace-nowrap -mx-1 px-1">
        <button
          onClick={() => setActiveTab("all")}
          className={`pb-3 px-3 font-semibold transition-colors border-b-2 shrink-0 ${
            activeTab === "all"
              ? "border-moss text-moss dark:border-emerald-400 dark:text-emerald-400"
              : "border-transparent text-ink/60 dark:text-stone-400 hover:text-ink dark:hover:text-white"
          }`}
        >
          All Deals ({transactions.length})
        </button>
        <button
          onClick={() => setActiveTab("actionable")}
          className={`pb-3 px-3 font-semibold transition-colors border-b-2 flex items-center gap-1.5 shrink-0 ${
            activeTab === "actionable"
              ? "border-moss text-moss dark:border-emerald-400 dark:text-emerald-400"
              : "border-transparent text-ink/60 dark:text-stone-400 hover:text-ink dark:hover:text-white"
          }`}
        >
          Needs Your Action
          {transactions.filter(isUserTurn).length > 0 && (
            <span className="bg-clay text-white text-[11px] font-bold px-1.5 py-0.2 rounded-full">
              {transactions.filter(isUserTurn).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("active")}
          className={`pb-3 px-3 font-semibold transition-colors border-b-2 shrink-0 ${
            activeTab === "active"
              ? "border-moss text-moss dark:border-emerald-400 dark:text-emerald-400"
              : "border-transparent text-ink/60 dark:text-stone-400 hover:text-ink dark:hover:text-white"
          }`}
        >
          Active Negotiations
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`pb-3 px-3 font-semibold transition-colors border-b-2 shrink-0 ${
            activeTab === "completed"
              ? "border-moss text-moss dark:border-emerald-400 dark:text-emerald-400"
              : "border-transparent text-ink/60 dark:text-stone-400 hover:text-ink dark:hover:text-white"
          }`}
        >
          Past / Completed
        </button>
      </div>

      {loading && (
        <div className="space-y-4">
          <DealCardSkeleton />
          <DealCardSkeleton />
          <DealCardSkeleton />
        </div>
      )}

      {!loading && error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16 bg-white border border-ink/10 rounded-2xl p-8">
          <svg className="w-12 h-12 mx-auto text-ink/30 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="font-semibold text-ink text-base">No transactions found</h3>
          <p className="text-xs text-ink/60 mt-1 max-w-sm mx-auto">
            {activeTab === "actionable"
              ? "You have no offers waiting for your response right now."
              : "Browse campus listings to find essentials, or list something to start negotiating."}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-xs font-semibold text-moss underline hover:text-moss/80"
          >
            Browse Nearby Items →
          </Link>
        </div>
      )}

      {/* Transactions List */}
      <div className="space-y-4">
        {filtered.map((tx) => {
          const isBuyer = currentUser?.id === tx.buyer_id;
          const roleLabel = isBuyer ? "You are Buyer" : "You are Seller";
          const otherPartyName = isBuyer ? (tx.seller?.full_name || tx.seller?.email || "Seller") : (tx.buyer?.full_name || tx.buyer?.email || "Buyer");
          const stateMeta = STATE_CONFIG[tx.state] || { label: tx.state, badge: "bg-gray-100 text-gray-800", desc: "" };
          const lastOffer = getLastOffer(tx);
          const needsMyResponse = isUserTurn(tx);
          const hasImage = tx.product?.image_urls && tx.product.image_urls.length > 0;

          return (
            <div
              key={tx.id}
              className={`bg-white dark:bg-stone-900 border rounded-2xl p-4 sm:p-5 shadow-sm transition-all ${
                needsMyResponse
                  ? "border-moss ring-1 ring-moss/30 dark:border-emerald-500/50 dark:ring-emerald-500/30"
                  : "border-ink/10 dark:border-white/10"
              }`}
            >
              {/* Top Bar: Role & Status */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-ink/5 dark:border-stone-800">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    isBuyer ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800" : "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border border-teal-200 dark:border-teal-800"
                  }`}>
                    {roleLabel}
                  </span>
                  <span className="text-xs text-ink/60 dark:text-stone-400">
                    with <strong className="text-ink dark:text-white">{otherPartyName}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${stateMeta.badge}`}>
                    {stateMeta.label}
                  </span>
                  <span className="text-[11px] text-ink/40 dark:text-stone-500">
                    {new Date(tx.updated_at || tx.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="flex flex-col sm:flex-row gap-4 py-4">
                {/* Product Thumbnail */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-sand/60 dark:bg-stone-800 border border-ink/10 dark:border-stone-700 shrink-0 flex items-center justify-center">
                  <img
                    src={hasImage ? resolveImageUrl(tx.product?.image_urls[0]) : getCategoryFallbackImage(tx.product?.category)}
                    alt={tx.product?.title || "Item"}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const fallback = getCategoryFallbackImage(tx.product?.category);
                      if (e.currentTarget.src !== fallback) {
                        e.currentTarget.src = fallback;
                      }
                    }}
                  />
                </div>

                {/* Deal Details */}
                <div className="flex-1">
                  <Link
                    href={`/listings/${tx.product_id}`}
                    className="font-bold text-base text-ink dark:text-white hover:text-moss dark:hover:text-emerald-400 transition-colors line-clamp-1"
                  >
                    {tx.product?.title || `Item #${tx.product_id}`}
                  </Link>

                  <div className="mt-1 flex flex-wrap items-baseline gap-3 text-sm">
                    <span className="text-ink/60 dark:text-stone-400 text-xs">
                      Listing Price: <strong className="text-ink dark:text-stone-300">₹{tx.product?.price || 0}</strong>
                    </span>
                    <span className="text-moss dark:text-emerald-400 font-bold text-sm">
                      Current Agreed Price: ₹{tx.agreed_price != null ? tx.agreed_price : (lastOffer?.amount || tx.product?.price || 0)}
                    </span>
                  </div>

                  {/* Negotiation Offer History Thread */}
                  {tx.offers && tx.offers.length > 0 && (
                    <div className="mt-3 bg-sand/30 dark:bg-stone-800/40 border border-ink/5 dark:border-stone-800 rounded-xl p-3 space-y-1.5">
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-ink/50 dark:text-stone-400">
                        Negotiation Timeline
                      </p>
                      {tx.offers.map((offer, oIdx) => {
                        const isByMe = currentUser?.id === offer.proposed_by_id;
                        return (
                          <div key={offer.id || oIdx} className="text-xs flex items-baseline justify-between text-ink/80 dark:text-stone-300">
                            <span>
                              <strong>{isByMe ? "You" : otherPartyName}</strong> offered{" "}
                              <strong className="text-moss dark:text-emerald-400">₹{offer.amount}</strong>
                              {offer.message && <em className="text-ink/60 dark:text-stone-400 ml-1.5 font-normal">"{offer.message}"</em>}
                            </span>
                            <span className="text-[10px] text-ink/40 dark:text-stone-500">
                              {new Date(offer.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Confirmed Location Box (If Deal is Confirmed or Completed) */}
                  {["CONFIRMED", "COMPLETED"].includes(tx.state) && (
                    <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs space-y-1">
                      <p className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                        <span>🔓</span> Pickup Location Unlocked:
                      </p>
                      <p className="text-emerald-950 dark:text-emerald-100 font-medium">
                        {tx.product?.pickup_area || "Meetup spot agreed with student counterparty."}
                      </p>
                    </div>
                  )}

                  {/* Double-Party Completion Tracker */}
                  {tx.state === "CONFIRMED" && (
                    <div className="mt-3 p-3 bg-sand/60 dark:bg-stone-800/60 border border-ink/10 dark:border-stone-700 rounded-xl text-xs flex flex-wrap gap-4 items-center justify-between">
                      <div className="flex gap-4">
                        <span className={`inline-flex items-center gap-1 font-semibold ${
                          tx.buyer_completed ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
                        }`}>
                          {tx.buyer_completed ? "✅ Buyer Signed Off" : "⏳ Buyer Pending"}
                        </span>
                        <span className={`inline-flex items-center gap-1 font-semibold ${
                          tx.seller_completed ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
                        }`}>
                          {tx.seller_completed ? "✅ Seller Signed Off" : "⏳ Seller Pending"}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink/50 dark:text-stone-400">Requires both sign-offs to complete</p>
                    </div>
                  )}

                  {/* Campus Meetup Handshake PIN Card */}
                  {tx.state === "CONFIRMED" && (
                    <div className="mt-3 p-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/5 border border-emerald-500/30 rounded-2xl">
                      {isBuyer ? (
                        <div>
                          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                            <span>🤝</span>
                            <span>Campus Handshake Pass (Your Secret PIN)</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className="font-mono font-black text-lg tracking-widest text-emerald-950 dark:text-emerald-100 bg-white dark:bg-stone-800 px-3 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 shadow-sm">
                              {tx.handshake_pin || "------"}
                            </span>
                            <span className="text-xs text-ink/70 dark:text-stone-300">
                              Show this PIN to the seller upon inspecting & receiving your item at the meetup.
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                              <span>🤝</span>
                              <span>Verify Buyer Meetup Handover</span>
                            </div>
                            <p className="text-xs text-ink/70 dark:text-stone-300 mt-1">
                              Ask the buyer for their 6-digit handshake PIN to verify the handover and complete the deal.
                            </p>
                          </div>

                          <div>
                            {verifyTxId === tx.id ? (
                              <div className="flex items-center gap-1.5 bg-white dark:bg-stone-800 p-1.5 rounded-xl border border-emerald-400 shadow-sm">
                                <input
                                  type="text"
                                  maxLength={10}
                                  placeholder="Enter PIN"
                                  value={verifyPinInput}
                                  onChange={(e) => setVerifyPinInput(e.target.value)}
                                  className="w-24 px-2 py-1 text-xs font-mono font-bold border border-ink/20 dark:border-stone-600 rounded-lg text-ink dark:text-white dark:bg-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                                <button
                                  disabled={verifyingHandshake}
                                  onClick={() => handleVerifyHandshake(tx.id)}
                                  className="text-xs bg-emerald-700 text-white font-semibold px-2.5 py-1 rounded-lg hover:bg-emerald-800 disabled:opacity-50"
                                >
                                  {verifyingHandshake ? "Verifying…" : "Sign Off"}
                                </button>
                                <button
                                  onClick={() => { setVerifyTxId(null); setVerifyPinInput(""); }}
                                  className="text-xs text-ink/50 hover:text-ink px-1"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setVerifyTxId(tx.id); setVerifyPinInput(""); }}
                                className="text-xs bg-emerald-600 text-white font-semibold px-3 py-2 rounded-xl hover:bg-emerald-700 shadow-sm flex items-center gap-1.5 transition-all"
                              >
                                <span>🔑</span> Enter Buyer PIN
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Review / Rating UI for Completed Deals */}
                  {tx.state === "COMPLETED" && !reviewedTxIds.has(tx.id) && (
                    <div className="mt-3">
                      {reviewTxId === tx.id ? (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 animate-fade-in">
                          <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Rate this transaction</h4>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setReviewRating(star)}
                                className={`text-2xl transition-transform hover:scale-110 ${star <= reviewRating ? "text-amber-400" : "text-ink/15"}`}
                              >
                                ★
                              </button>
                            ))}
                            <span className="text-xs text-ink/60 ml-2">{reviewRating}/5</span>
                          </div>
                          <textarea
                            placeholder="How was your experience? (optional)"
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            className="w-full border border-ink/15 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-moss resize-none"
                            rows={2}
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setReviewTxId(null)}
                              className="text-xs px-3 py-1.5 border border-ink/20 rounded-lg text-ink hover:bg-white"
                            >
                              Cancel
                            </button>
                            <button
                              disabled={submittingAction}
                              onClick={() => handleSubmitReview(tx.id)}
                              className="text-xs bg-amber-500 text-white font-semibold px-4 py-1.5 rounded-lg hover:bg-amber-600 disabled:opacity-50"
                            >
                              Submit Review
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setReviewTxId(tx.id); setReviewRating(5); setReviewComment(""); }}
                          className="text-xs text-amber-700 bg-amber-50 border border-amber-200 font-semibold px-3.5 py-2 rounded-lg hover:bg-amber-100 transition-colors inline-flex items-center gap-1.5"
                        >
                          ⭐ Leave a Review
                        </button>
                      )}
                    </div>
                  )}
                  {tx.state === "COMPLETED" && reviewedTxIds.has(tx.id) && (
                    <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg font-medium inline-block">✅ Review submitted</p>
                  )}
                </div>
              </div>

              {/* Counter Offer Form (Modal / Inline) */}
              {counterTxId === tx.id && (
                <div className="my-3 p-4 bg-sand/50 dark:bg-stone-800/60 border border-ink/10 dark:border-stone-700 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-ink dark:text-white uppercase tracking-wider">Propose Counter-Offer</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="number"
                      placeholder="New proposed price (₹)"
                      value={counterAmount}
                      onChange={(e) => setCounterAmount(e.target.value)}
                      className="border border-ink/20 dark:border-stone-700 dark:bg-stone-900 dark:text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-moss"
                    />
                    <input
                      placeholder="Optional note (e.g. Can do ₹350 if we meet at hostel)"
                      value={counterMsg}
                      onChange={(e) => setCounterMsg(e.target.value)}
                      className="border border-ink/20 dark:border-stone-700 dark:bg-stone-900 dark:text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-moss"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setCounterTxId(null)}
                      className="text-xs px-3 py-1.5 border border-ink/20 dark:border-stone-700 rounded-lg text-ink dark:text-stone-300 hover:bg-white dark:hover:bg-stone-800"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!counterAmount || submittingAction}
                      onClick={() => handleAction(tx.id, "counter", {
                        counter_amount: Number(counterAmount),
                        message: counterMsg || null,
                      })}
                      className="text-xs bg-moss text-white font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      Submit Counter
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-2 pt-3 border-t border-ink/5 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2">
                {needsMyResponse ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {(tx.state === "PENDING" || tx.state === "COUNTERED") && (
                      <>
                        <button
                          disabled={submittingAction}
                          onClick={() => handleAction(tx.id, "accept")}
                          className="bg-moss text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-moss/90 transition-colors shadow-sm touch-manipulation"
                        >
                          ✓ Accept Offer
                        </button>
                        <button
                          disabled={submittingAction}
                          onClick={() => {
                            setCounterTxId(tx.id);
                            setCounterAmount(String(lastOffer?.amount || tx.agreed_price || ""));
                          }}
                          className="bg-sand dark:bg-stone-800 border border-ink/20 dark:border-stone-700 text-ink dark:text-stone-200 text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-white dark:hover:bg-stone-700 transition-colors touch-manipulation"
                        >
                          ⇄ Counter-Offer
                        </button>
                        <button
                          disabled={submittingAction}
                          onClick={() => handleAction(tx.id, "reject")}
                          className="text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-rose-100 transition-colors touch-manipulation"
                        >
                          ✕ Decline
                        </button>
                      </>
                    )}

                    {tx.state === "ACCEPTED" && (
                      <button
                        disabled={submittingAction}
                        onClick={() => handleAction(tx.id, "confirm")}
                        className="bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                      >
                        🔓 Confirm Deal & Reveal Location
                      </button>
                    )}

                    {tx.state === "CONFIRMED" && (
                      <button
                        disabled={submittingAction}
                        onClick={() => handleAction(tx.id, "complete")}
                        className="bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-emerald-800 transition-colors shadow-sm"
                      >
                        🤝 Sign Off Handover Complete
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-ink/50 italic">
                    {["PENDING", "COUNTERED"].includes(tx.state)
                      ? "Awaiting response from other party…"
                      : tx.state === "CONFIRMED"
                      ? "Waiting for counterparty to sign off completion…"
                      : stateMeta.desc}
                  </div>
                )}

                {/* Cancel deal option for unfinalized transactions */}
                {!["COMPLETED", "REJECTED", "CANCELLED"].includes(tx.state) && (
                  <button
                    disabled={submittingAction}
                    onClick={() => {
                      if (confirm("Are you sure you want to cancel this deal?")) {
                        handleAction(tx.id, "cancel");
                      }
                    }}
                    className="text-xs text-ink/40 hover:text-clay transition-colors ml-auto"
                  >
                    Cancel deal
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
