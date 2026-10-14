"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, Product, resolveImageUrl, getCategoryFallbackImage, uploadProductImage, uploadProductImageWithAngle, convertProductTo3D } from "@/lib/api";
import MultiAnglePhotoStudio, { AngleData, AnglePreviews } from "@/components/MultiAnglePhotoStudio";
import { useToast } from "@/components/Toast";

const CATEGORIES = [
  "Textbooks & Study Material",
  "Electronics & Gadgets",
  "Lab Equipment & Calculators",
  "Cycles & Mobility",
  "Hostel & Room Essentials",
  "Sports & Fitness",
  "Other",
];

const CONDITIONS = ["Brand New", "Like New", "Good", "Fair"];

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    condition: "Good",
    price: "",
    pickup_area: "",
  });

  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  // 3D Studio state
  const [activePhotoTab, setActivePhotoTab] = useState<"3d" | "classic">("3d");
  const [angleFiles, setAngleFiles] = useState<AngleData>({});
  const [anglePreviews, setAnglePreviews] = useState<AnglePreviews>({});
  const [is3DReady, setIs3DReady] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const user = await api("/auth/me").catch(() => null);
        if (!user) {
          router.push(`/login?redirect=/listings/edit/${id}`);
          return;
        }

        const product: Product = await api(`/products/${id}`);
        if (product.seller_id !== user.id) {
          setError("You do not have permission to edit this listing.");
          setLoading(false);
          return;
        }

        setForm({
          title: product.title || "",
          description: product.description || "",
          category: product.category || CATEGORIES[0],
          condition: product.condition || "Good",
          price: product.price ? String(product.price) : "",
          pickup_area: product.pickup_area || "",
        });
        setExistingImages(product.image_urls || []);

        if (product.image_angles) {
          try {
            const rawAngles = typeof product.image_angles === "string" 
              ? JSON.parse(product.image_angles) 
              : product.image_angles;
            const resolved: AnglePreviews = {};
            for (const [k, v] of Object.entries(rawAngles)) {
              if (v) resolved[k as keyof AnglePreviews] = resolveImageUrl(v as string);
            }
            setAnglePreviews(resolved);
            if (product.has_3d) {
              setIs3DReady(true);
            }
          } catch {}
        }
      } catch (e: any) {
        setError(e.message || "Failed to load listing.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (existingImages.length + newFiles.length + files.length > 5) {
      setError("Maximum 5 photos allowed per listing.");
      return;
    }

    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        setError("Each photo must be under 5MB.");
        return;
      }
    }

    setNewFiles([...newFiles, ...files]);
    setNewPreviews([...newPreviews, ...files.map((f) => URL.createObjectURL(f))]);
    setError(null);
  }

  function handleRemoveNewFile(index: number) {
    setNewFiles(newFiles.filter((_, i) => i !== index));
    setNewPreviews(newPreviews.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // 1. Update listing metadata
      const payload: Record<string, any> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        condition: form.condition,
        pickup_area: form.pickup_area.trim() || null,
        has_3d: is3DReady,
      };

      if (form.price !== "") {
        payload.price = Number(form.price);
      }

      await api(`/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      // 2. Upload 3D angle images
      const angleEntries = Object.entries(angleFiles).filter(([_, f]) => Boolean(f)) as [string, File][];
      if (angleEntries.length > 0) {
        setUploadingImage(true);
        for (const [angle, file] of angleEntries) {
          try {
            await uploadProductImageWithAngle(Number(id), file, angle);
          } catch {}
        }
        if (is3DReady) {
          try {
            await convertProductTo3D(Number(id));
          } catch {}
        }
      } else if (is3DReady) {
        try {
          await convertProductTo3D(Number(id));
        } catch {}
      }

      // 3. Upload any newly selected classic images
      if (newFiles.length > 0) {
        setUploadingImage(true);
        for (const file of newFiles) {
          await uploadProductImage(Number(id), file);
        }
      }

      showToast("✅ Listing updated successfully!", "success");
      router.push(`/listings/${id}`);
    } catch (e: any) {
      setError(e.message || "Failed to update listing.");
      showToast(e.message || "Update failed", "error");
    } finally {
      setSubmitting(false);
      setUploadingImage(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center text-ink/60 dark:text-stone-400">
        <div className="animate-pulse">Loading listing details…</div>
      </div>
    );
  }

  if (error && !form.title) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center animate-fade-in">
        <p className="text-clay text-base font-semibold mb-3">{error}</p>
        <Link href={`/listings/${id}`} className="text-sm text-moss dark:text-emerald-400 hover:underline">
          ← Return to listing
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-6 animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <Link href={`/listings/${id}`} className="text-xs text-ink/60 dark:text-stone-400 hover:text-moss dark:hover:text-emerald-400">
          ← Cancel and return
        </Link>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-sand dark:bg-stone-800 text-ink/70 dark:text-stone-300 border border-ink/10 dark:border-stone-700">
          Edit Listing #{id}
        </span>
      </div>

      <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-6 sm:p-8 shadow-sm transition-colors">
        <h1 className="text-xl font-bold text-ink dark:text-white mb-1">Edit Item Details</h1>
        <p className="text-xs text-ink/60 dark:text-stone-400 mb-6">
          Update item price, condition description, or add clearer photos for campus buyers.
        </p>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-clay dark:text-red-300 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-ink dark:text-stone-200 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-ink/20 dark:border-stone-700 rounded-xl px-3.5 py-2.5 text-sm text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
            />
          </div>

          {/* Category & Condition */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink dark:text-stone-200 mb-1.5">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border border-ink/20 dark:border-stone-700 rounded-xl px-3 py-2.5 text-xs text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink dark:text-stone-200 mb-1.5">
                Condition
              </label>
              <select
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
                className="w-full border border-ink/20 dark:border-stone-700 rounded-xl px-3 py-2.5 text-xs text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="block text-xs font-semibold text-ink dark:text-stone-200 mb-1.5">
              Price (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-sm text-ink/40 dark:text-stone-500 font-bold">₹</span>
              <input
                type="number"
                min="0"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full border border-ink/20 dark:border-stone-700 rounded-xl pl-8 pr-3.5 py-2.5 text-sm text-ink dark:text-white dark:bg-stone-800 font-semibold focus:outline-none focus:border-moss"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-ink dark:text-stone-200 mb-1.5">
              Item Description
            </label>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-ink/20 dark:border-stone-700 rounded-xl p-3 text-xs text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
            />
          </div>

          {/* Confirmed Pickup Area */}
          <div>
            <label className="block text-xs font-semibold text-ink dark:text-stone-200 mb-1.5">
              Pickup Area (Revealed only to confirmed buyers)
            </label>
            <input
              type="text"
              value={form.pickup_area}
              onChange={(e) => setForm({ ...form, pickup_area: e.target.value })}
              placeholder="e.g. Central Library 1st Floor, Hostel B Lounge"
              className="w-full border border-ink/20 dark:border-stone-700 rounded-xl px-3.5 py-2.5 text-xs text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
            />
          </div>

          {/* Photos and 3D Studio */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="block text-xs font-bold text-ink dark:text-stone-200 flex items-center gap-1.5">
                  <span>Item Photos &amp; 3D Studio</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                    3D Multi-Angle
                  </span>
                </label>
                <p className="text-[11px] text-ink/70 dark:text-stone-300">
                  Upload every angle of your item (Front, Right, Back, Left, Top, Bottom) to convert it into 3D!
                </p>
              </div>

              <div className="flex items-center gap-1 bg-sand/60 dark:bg-stone-800 p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setActivePhotoTab("3d")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    activePhotoTab === "3d"
                      ? "bg-moss text-white shadow-sm"
                      : "text-ink/70 dark:text-stone-300 hover:text-ink"
                  }`}
                >
                  🧊 3D Studio
                </button>
                <button
                  type="button"
                  onClick={() => setActivePhotoTab("classic")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    activePhotoTab === "classic"
                      ? "bg-moss text-white shadow-sm"
                      : "text-ink/70 dark:text-stone-300 hover:text-ink"
                  }`}
                >
                  📸 Classic
                </button>
              </div>
            </div>

            {activePhotoTab === "3d" ? (
              <div className="space-y-3">
                <MultiAnglePhotoStudio
                  initialPreviews={anglePreviews}
                  onAnglesChange={(files, previews, ready) => {
                    setAngleFiles(files);
                    setAnglePreviews(previews);
                    setIs3DReady(ready);
                  }}
                  onError={(err) => setError(err)}
                />
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap gap-2.5 mb-3">
                  {/* Existing Images */}
                  {existingImages.map((url, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-ink/10 dark:border-stone-700">
                      <img
                        src={resolveImageUrl(url)}
                        alt={`Photo ${idx}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = getCategoryFallbackImage(category);
                        }}
                      />
                      <span className="absolute bottom-1 right-1 text-[9px] bg-black/70 text-white px-1 rounded">Saved</span>
                    </div>
                  ))}

                  {/* New Photos Preview */}
                  {newPreviews.map((url, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-emerald-500">
                      <img src={url} alt={`New upload ${idx}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveNewFile(idx)}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {/* Add Photo Button */}
                  {existingImages.length + newFiles.length < 5 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-20 h-20 rounded-xl border-2 border-dashed border-ink/20 dark:border-stone-700 hover:border-moss dark:hover:border-emerald-400 flex flex-col items-center justify-center text-ink/40 dark:text-stone-400 text-xs gap-1 transition-colors"
                    >
                      <span className="text-lg">+</span>
                      <span className="text-[10px]">Add Photo</span>
                    </button>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Submit and Cancel Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-ink/10 dark:border-stone-800">
            <Link
              href={`/listings/${id}`}
              className="px-4 py-2.5 text-xs font-semibold rounded-xl border border-ink/20 dark:border-stone-700 text-ink/70 dark:text-stone-300 hover:bg-sand dark:hover:bg-stone-800 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting || uploadingImage}
              className="px-6 py-2.5 text-xs font-bold rounded-xl bg-moss text-white hover:bg-moss/90 disabled:opacity-50 transition-all shadow-sm flex items-center gap-1.5"
            >
              {submitting || uploadingImage ? (
                <>
                  <span className="animate-spin text-sm">⏳</span> Saving Changes…
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
