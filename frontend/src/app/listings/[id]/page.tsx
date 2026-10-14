"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api, Product, resolveImageUrl, getCategoryFallbackImage, User, reportListing } from "@/lib/api";
import ProductCard from "@/components/ProductCard";

const CampusMap = dynamic(() => import("@/components/CampusMap"), {
  ssr: false,
  loading: () => <div className="h-44 rounded-xl bg-stone-100 dark:bg-stone-800 animate-pulse" />,
});
import Product3DViewer from "@/components/Product3DViewer";
import { useToast } from "@/components/Toast";

const typeBadges: Record<string, { bg: string }> = {
  BUY: { bg: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800" },
  EXCHANGE: { bg: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800" },
  RENT: { bg: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800" },
  DONATE: { bg: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800" },
};

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [offerAmount, setOfferAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [createdTxId, setCreatedTxId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [bumping, setBumping] = useState(false);

  // Lightbox & Report & Similar products states
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("Counterfeit or Misleading");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [activeMediaTab, setActiveMediaTab] = useState<"2d" | "3d">("3d");

  useEffect(() => {
    api("/auth/me").then(setCurrentUser).catch(() => setCurrentUser(null));

    api(`/products/${id}`)
      .then((data) => {
        setProduct(data);
        if (data.price) {
          setOfferAmount(String(data.price));
        }
        // Display all products in 3D by default whenever images are available
        if (data.image_urls && data.image_urls.length > 0) {
          setActiveMediaTab("3d");
        }
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (product?.category) {
      const lat = product.latitude || 12.9716;
      const lng = product.longitude || 77.5946;
      api(`/products/nearby/search?lat=${lat}&lng=${lng}&category=${encodeURIComponent(product.category)}&radius_km=50&limit=6`)
        .then((items: Product[]) => {
          setSimilarProducts(items.filter((p) => p.id !== product.id).slice(0, 4));
        })
        .catch(() => {});
    }
  }, [product?.id, product?.category]);

  async function sendOffer() {
    if (!product) return;
    setError(null);
    setSubmittingOffer(true);
    try {
      const res = await api("/transactions", {
        method: "POST",
        body: JSON.stringify({
          product_id: product.id,
          offer_amount: offerAmount ? Number(offerAmount) : null,
          notes: notes || null,
        }),
      });
      setCreatedTxId(res.id);
      setStatus("Offer sent successfully! The seller has been notified.");
      showToast("📤 Offer sent successfully!", "success");
    } catch (e: any) {
      setError(e.message);
      showToast(e.message, "error");
    } finally {
      setSubmittingOffer(false);
    }
  }

  async function handleMessageSeller() {
    if (!product) return;
    setStartingChat(true);
    try {
      const res = await api(`/chat/conversations/start?other_user_id=${product.seller_id}&product_id=${product.id}`, {
        method: "POST",
      });
      router.push(`/chat/${res.conversation_id}`);
    } catch (e: any) {
      showToast(e.message || "Please log in to message sellers", "error");
      setStartingChat(false);
    }
  }

  // Feature #10: Share Listing
  function handleCopyLink() {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      showToast("🔗 Listing link copied to clipboard!", "success");
    }
  }

  function handleShareWhatsApp() {
    if (!product || typeof window === "undefined") return;
    const text = `Check out "${product.title}" on ProductXchange for ₹${product.price || 0}! Meetup at campus: ${window.location.href}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  }

  function handleNativeShare() {
    if (!product || typeof window === "undefined") return;
    if (navigator.share) {
      navigator
        .share({
          title: product.title,
          text: `Check out this listing on ProductXchange!`,
          url: window.location.href,
        })
        .catch(() => {});
    } else {
      handleCopyLink();
    }
  }

  async function handleReportSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    setSubmittingReport(true);
    try {
      await reportListing(product.id, reportReason, reportDetails);
      showToast("🚩 Report submitted. Campus moderators will review it shortly.", "success");
      setReportModalOpen(false);
      setReportDetails("");
    } catch (e: any) {
      showToast(e.message || "Failed to submit report", "error");
    } finally {
      setSubmittingReport(false);
    }
  }

  // Feature #12: Bump Listing
  async function handleBumpListing() {
    if (!product) return;
    setBumping(true);
    try {
      const updated = await api(`/products/${product.id}/bump`, { method: "POST" });
      setProduct(updated);
      showToast("🚀 Listing bumped to top of recent searches!", "success");
    } catch (e: any) {
      showToast(e.message || "Failed to bump listing", "error");
    } finally {
      setBumping(false);
    }
  }

  if (error && !product) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center animate-fade-in">
        <p className="text-clay text-base font-semibold mb-3">{error}</p>
        <Link href="/" className="text-sm text-moss dark:text-emerald-400 hover:underline">
          ← Back to nearby listings
        </Link>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center text-ink/60 dark:text-stone-400">
        <div className="animate-pulse">Loading listing details…</div>
      </div>
    );
  }

  const badge = typeBadges[product.transaction_type] || { bg: "bg-gray-100 text-gray-800 border-gray-200" };
  const images = product.image_urls || [];
  const currentImage = images[selectedImageIndex] || null;
  const isSeller = currentUser?.id === product.seller_id;

  return (
    <div className="max-w-3xl mx-auto py-3 sm:py-4 px-1 sm:px-4 animate-fade-in">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Link href="/" className="text-xs text-ink/60 dark:text-stone-400 hover:text-moss dark:hover:text-emerald-400 inline-flex items-center gap-1 font-medium">
          ← Back to listings
        </Link>

        {/* Action Buttons: Edit, Report, Share */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {isSeller ? (
            <Link
              href={`/listings/edit/${product.id}`}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 flex items-center gap-1 transition-colors"
            >
              <span>✏️</span> Edit Listing
            </Link>
          ) : (
            <button
              onClick={() => setReportModalOpen(true)}
              className="text-xs font-medium px-2 py-1 rounded-lg text-ink/50 dark:text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors flex items-center gap-1"
              title="Report suspicious or abusive listing"
            >
              <span>🚩</span> Report
            </button>
          )}

          <button
            onClick={handleShareWhatsApp}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 flex items-center gap-1 transition-colors"
            title="Share on WhatsApp"
          >
            <span>💬</span> WhatsApp
          </button>
          <button
            onClick={handleCopyLink}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-sand dark:bg-stone-800 text-ink/70 dark:text-stone-300 border border-ink/15 dark:border-stone-700 hover:bg-white dark:hover:bg-stone-700 flex items-center gap-1 transition-colors"
            title="Copy link to clipboard"
          >
            <span>🔗</span> Copy
          </button>
          {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
            <button
              onClick={handleNativeShare}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-sand dark:bg-stone-800 text-ink/70 dark:text-stone-300 border border-ink/15 dark:border-stone-700 hover:bg-white dark:hover:bg-stone-700 flex items-center gap-1 transition-colors"
              title="Share"
            >
              <span>📤</span> Share
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-4 sm:p-6 shadow-sm transition-colors">
        {/* Photo Gallery Column */}
        <div className="flex flex-col gap-3">
          {/* 2D / 3D Mode Switcher (Display all products in 3D) */}
          {images.length > 0 && (
            <div className="flex items-center justify-between bg-sand/70 dark:bg-stone-800 p-1 rounded-xl border border-ink/10 dark:border-stone-700">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveMediaTab("3d")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeMediaTab === "3d"
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm"
                      : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                  }`}
                >
                  <span>🧊</span> Interactive 3D Model
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMediaTab("2d")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeMediaTab === "2d"
                      ? "bg-white dark:bg-stone-900 text-ink dark:text-white shadow-sm"
                      : "text-ink/60 dark:text-stone-400 hover:text-ink dark:hover:text-white"
                  }`}
                >
                  <span>🖼️</span> 2D Photos ({images.length})
                </button>
              </div>

              <span className="hidden sm:inline-block text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 px-2">
                {product.has_3d ? "✨ 360° Photogrammetry" : "🧊 Interactive 3D Projection"}
              </span>
            </div>
          )}

          {/* Active View: 3D Viewer vs 2D Gallery */}
          {activeMediaTab === "3d" ? (
            <Product3DViewer
              angles={product.image_angles}
              imageUrls={images}
              title={product.title}
            />
          ) : (
            <>
              <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-sand/60 dark:bg-stone-800 border border-ink/10 dark:border-stone-700 flex items-center justify-center">
                <img
                  src={currentImage ? resolveImageUrl(currentImage) : getCategoryFallbackImage(product.category)}
                  alt={product.title}
                  onClick={() => setLightboxOpen(true)}
                  className="w-full h-full object-cover cursor-zoom-in hover:scale-[1.02] transition-transform duration-200"
                  title="Click to view full size"
                  onError={(e) => {
                    const fallback = getCategoryFallbackImage(product.category);
                    if (e.currentTarget.src !== fallback) {
                      e.currentTarget.src = fallback;
                    }
                  }}
                />
                <span
                  className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border backdrop-blur-sm ${badge.bg}`}
                >
                  {product.transaction_type}
                </span>
              </div>

              {/* Thumbnails if multiple images exist */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 ${
                        selectedImageIndex === idx ? "border-moss" : "border-transparent opacity-70"
                      }`}
                    >
                      <img
                        src={resolveImageUrl(img)}
                        alt={`Thumbnail ${idx}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = getCategoryFallbackImage(product.category);
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Feature #12: Listing Lifecycle & Expiry Indicator */}
          <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-sand/50 dark:bg-stone-800 border border-ink/10 dark:border-stone-700">
            <span className="text-ink/70 dark:text-stone-300 flex items-center gap-1.5">
              <span>📅</span>
              {product.is_expired ? (
                <strong className="text-rose-600 dark:text-rose-400">Listing Expired (30+ days)</strong>
              ) : (
                <span>Expires in <strong>{product.days_remaining ?? 30} days</strong></span>
              )}
            </span>
            {isSeller && (
              <button
                onClick={handleBumpListing}
                disabled={bumping}
                className="text-[11px] font-semibold text-moss dark:text-emerald-400 hover:underline flex items-center gap-1"
                title="Bumping refreshes your item to the top of campus search"
              >
                <span>🚀</span> {bumping ? "Bumping…" : "Bump to Top"}
              </button>
            )}
          </div>

          {/* Privacy Location Card */}
          <div className="rounded-xl border border-ink/10 dark:border-stone-700 p-3.5 bg-sand/30 dark:bg-stone-800/40 text-xs text-ink/80 dark:text-stone-300 space-y-1.5">
            <p className="font-semibold text-ink dark:text-white flex items-center gap-1.5">
              <span>📍</span>
              {product.pickup_area ? "Confirmed Pickup Location" : "Campus Vicinity (~1.1 km radius)"}
            </p>
            {product.pickup_area ? (
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-900 dark:text-emerald-200 font-medium">
                {product.pickup_area}
              </div>
            ) : (
              <p className="text-ink/60 dark:text-stone-400 leading-normal">
                To protect student dorm and personal privacy, exact meetup instructions and pickup spots are unlocked once the offer is confirmed by both parties.
              </p>
            )}
          </div>

          {/* Interactive Campus Vicinity Mini-Map */}
          {product.latitude != null && product.longitude != null && (
            <div className="mt-1 overflow-hidden rounded-xl border border-ink/10 dark:border-stone-700 shadow-2xs">
              <CampusMap
                products={[product]}
                userCoords={{ lat: product.latitude, lng: product.longitude }}
                radiusKm={1}
                height="190px"
              />
            </div>
          )}
        </div>

        {/* Product Details & Negotiation Column */}
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-ink/60 dark:text-stone-400 mb-1">
              <span>Category: <strong className="text-ink dark:text-stone-200 font-semibold">{product.category}</strong></span>
              <span>Condition: <strong className="text-ink dark:text-stone-200 font-semibold">{product.condition || "Good"}</strong></span>
            </div>

            <h1 className="text-2xl font-bold text-ink dark:text-white mt-1">{product.title}</h1>

            {/* Seller Link & Campus Hub */}
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <Link
                href={`/profile/${product.seller_id}`}
                className="inline-flex items-center gap-1.5 text-xs text-ink/60 dark:text-stone-400 hover:text-moss dark:hover:text-emerald-400 transition-colors group"
              >
                <div className="w-5 h-5 rounded-full bg-moss/10 dark:bg-moss/20 flex items-center justify-center text-[9px] font-bold text-moss dark:text-emerald-300 border border-moss/20 group-hover:bg-moss/20 transition-colors">
                  S
                </div>
                <span className="underline-offset-2 group-hover:underline">View Seller Profile</span>
              </Link>

              {product.college && (
                <div className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                  <span>🏫</span>
                  <span>{product.college}</span>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-moss dark:text-emerald-400">
                {product.price != null && product.price > 0
                  ? `₹${product.price.toLocaleString("en-IN")}`
                  : product.transaction_type === "DONATE"
                  ? "Free"
                  : "Offer Based"}
              </span>
              {product.transaction_type === "RENT" && (
                <span className="text-xs text-ink/60 dark:text-stone-400 font-medium">/ rental period</span>
              )}
            </div>

            <div className="mt-4 border-t border-ink/10 dark:border-stone-800 pt-4">
              <h2 className="text-xs uppercase font-semibold text-ink/50 dark:text-stone-400 tracking-wider mb-1.5">
                Item Description
              </h2>
              <p className="text-sm text-ink/80 dark:text-stone-300 leading-relaxed whitespace-pre-line">
                {product.description || "The student seller did not provide an extended description."}
              </p>
            </div>
          </div>

          {/* Message Seller Button */}
          {!isSeller && (
            <div className="mt-4">
              <button
                onClick={handleMessageSeller}
                disabled={startingChat}
                className="w-full bg-white dark:bg-stone-800 border border-ink/15 dark:border-stone-700 text-ink dark:text-white font-semibold py-2.5 px-4 rounded-xl hover:border-moss hover:text-moss dark:hover:border-emerald-400 dark:hover:text-emerald-400 transition-all text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {startingChat ? "Opening chat…" : "💬 Message Seller"}
              </button>
            </div>
          )}

          {/* Make an Offer / Negotiation Box */}
          {!isSeller && (
            <div className="mt-4 border-t border-ink/10 dark:border-stone-800 pt-4">
              <h3 className="text-sm font-bold text-ink dark:text-white mb-1">Start Deal / Make an Offer</h3>
              <p className="text-xs text-ink/60 dark:text-stone-400 mb-3">
                Propose your price or rental terms. You and the seller can negotiate via the Deals dashboard.
              </p>

              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2.5 text-xs text-ink/40 dark:text-stone-500 font-bold">₹</span>
                    <input
                      className="w-full border border-ink/20 dark:border-stone-700 rounded-lg pl-7 pr-3 py-2 text-sm text-ink dark:text-white dark:bg-stone-800 font-semibold focus:outline-none focus:border-moss"
                      placeholder="Offer price"
                      type="number"
                      value={offerAmount}
                      onChange={(e) => setOfferAmount(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={sendOffer}
                    disabled={submittingOffer}
                    className="bg-moss text-white text-sm font-semibold rounded-lg px-5 py-2 hover:bg-moss/90 disabled:opacity-50 transition-colors shrink-0 shadow-sm touch-manipulation"
                  >
                    {submittingOffer ? "Sending…" : "Send Offer"}
                  </button>
                </div>

                <input
                  className="w-full border border-ink/20 dark:border-stone-700 rounded-lg px-3 py-2 text-xs text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
                  placeholder="Optional note (e.g. Can meet after 4 PM at cafeteria)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {status && (
                <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-900 dark:text-emerald-200 flex flex-col gap-2">
                  <span>{status}</span>
                  <Link
                    href="/deals"
                    className="inline-flex items-center gap-1 font-semibold text-emerald-800 dark:text-emerald-300 underline hover:text-emerald-950"
                  >
                    Go to Deals & Negotiation Dashboard →
                  </Link>
                </div>
              )}

              {error && (
                <p className="text-xs text-clay mt-2.5 font-medium bg-red-50 dark:bg-red-950/40 p-2 rounded border border-red-200 dark:border-red-900">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Similar Campus Listings Section */}
      {similarProducts.length > 0 && (
        <div className="mt-12 border-t border-ink/10 dark:border-stone-800 pt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-ink dark:text-white flex items-center gap-2">
              <span>🎯</span> Similar Campus Listings in {product.category}
            </h3>
            <span className="text-xs text-ink/50 dark:text-stone-400">Within campus vicinity</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {similarProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}

      {/* Full-Screen Image Lightbox Modal */}
      {lightboxOpen && currentImage && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-in"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-5 right-5 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full w-10 h-10 flex items-center justify-center transition-colors text-xl font-bold"
            title="Close Lightbox (ESC)"
          >
            ✕
          </button>

          <div className="relative max-w-4xl max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={currentImage ? resolveImageUrl(currentImage) : getCategoryFallbackImage(product.category)}
              alt={product.title}
              className="max-h-[80vh] max-w-full object-contain rounded-xl shadow-2xl"
              onError={(e) => {
                const fallback = getCategoryFallbackImage(product.category);
                if (e.currentTarget.src !== fallback) {
                  e.currentTarget.src = fallback;
                }
              }}
            />

            {images.length > 1 && (
              <>
                <button
                  onClick={() => setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/90 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors font-bold"
                  title="Previous image"
                >
                  ‹
                </button>
                <button
                  onClick={() => setSelectedImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/90 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors font-bold"
                  title="Next image"
                >
                  ›
                </button>
              </>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImageIndex === idx ? "border-emerald-400 scale-105" : "border-white/20 opacity-60 hover:opacity-100"
                  }`}
                >
                  <img src={resolveImageUrl(img)} alt={`Thumbnail ${idx}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Report Listing Modal */}
      {reportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
          onClick={() => setReportModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-stone-700 rounded-2xl max-w-md w-full p-6 shadow-2xl transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-ink dark:text-white flex items-center gap-1.5">
                <span>🚩</span> Report Listing
              </h3>
              <button
                onClick={() => setReportModalOpen(false)}
                className="text-ink/40 hover:text-ink dark:text-stone-400 dark:hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-ink/70 dark:text-stone-300 mb-4">
              Please help keep ProductXchange safe. All reports are immediately reviewed by campus student moderators.
            </p>

            <form onSubmit={handleReportSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink dark:text-stone-200 mb-1">
                  Reason for reporting
                </label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full border border-ink/20 dark:border-stone-700 rounded-lg px-3 py-2 text-xs text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
                >
                  <option value="Counterfeit or Misleading">Counterfeit or Misleading Information</option>
                  <option value="Scam or Fraud">Suspicious / Scam / Fraudulent Activity</option>
                  <option value="Prohibited Campus Item">Prohibited Item on Campus Premises</option>
                  <option value="Harassment or Abusive Content">Harassment or Inappropriate Content</option>
                  <option value="Duplicate or Spam">Duplicate Listing or Spam</option>
                  <option value="Other">Other Violation</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink dark:text-stone-200 mb-1">
                  Additional Details (Optional)
                </label>
                <textarea
                  rows={3}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Provide any additional context or proof to assist moderators..."
                  className="w-full border border-ink/20 dark:border-stone-700 rounded-lg p-2.5 text-xs text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-ink/20 dark:border-stone-700 text-ink/70 dark:text-stone-300 hover:bg-sand dark:hover:bg-stone-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {submittingReport ? "Submitting…" : "Submit Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
