"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, uploadProductImage, uploadProductImageWithAngle, convertProductTo3D, suggestListingAI } from "@/lib/api";
import MultiAnglePhotoStudio, { AngleData, AnglePreviews } from "@/components/MultiAnglePhotoStudio";
import { useToast } from "@/components/Toast";

const TRANSACTION_TYPES = ["BUY", "EXCHANGE", "RENT", "DONATE"];
const CATEGORIES = [
  "Textbooks & Study Material",
  "Electronics & Gadgets",
  "Lab Equipment & Calculators",
  "Cycles & Mobility",
  "Hostel & Room Essentials",
  "Sports & Fitness",
  "Other",
];

const COIMBATORE_LOCATION_PRESETS = [
  {
    name: "Saravanampatti",
    area: "Saravanampatti, Coimbatore (Kumaraguru / KGiSL / SNS Hub)",
    lat: 11.0797,
    lng: 76.9997,
    badge: "KCT / KGiSL / SNS",
  },
  {
    name: "Vattamalaipalayam",
    area: "Vattamalaipalayam, Coimbatore (Sri Ramakrishna SREC Campus)",
    lat: 11.0854,
    lng: 76.9452,
    badge: "SREC Campus",
  },
  {
    name: "Peelamedu",
    area: "Peelamedu, Coimbatore (PSG Tech / CIT Hub)",
    lat: 11.0267,
    lng: 77.0125,
    badge: "PSG / CIT Hub",
  },
  {
    name: "Gandhipuram",
    area: "Gandhipuram, Coimbatore (Central City Hub)",
    lat: 11.0168,
    lng: 76.9676,
    badge: "City Hub",
  },
];

export default function NewListingPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Textbooks & Study Material",
    condition: "Good",
    price: "",
    transaction_type: "BUY",
    pickup_area: "Saravanampatti, Coimbatore (Kumaraguru / KGiSL / SNS Hub)",
  });

  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number }>({
    lat: 11.0797,
    lng: 76.9997,
  });
  const [detectingGps, setDetectingGps] = useState(false);
  const [locationName, setLocationName] = useState("Saravanampatti, Coimbatore");

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 3D Multi-Angle Studio state
  const [use3DStudio, setUse3DStudio] = useState(true);
  const [angleFiles, setAngleFiles] = useState<AngleData>({});
  const [anglePreviews, setAnglePreviews] = useState<AnglePreviews>({});
  const [is3DReady, setIs3DReady] = useState(false);

  function handleSelectPreset(preset: typeof COIMBATORE_LOCATION_PRESETS[0]) {
    setSelectedCoords({ lat: preset.lat, lng: preset.lng });
    setLocationName(preset.area);
    setForm((prev) => ({
      ...prev,
      pickup_area: preset.area,
    }));
    showToast(`📍 Location set to ${preset.name}`, "info");
  }

  function handleDetectGps() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser. Please select a campus location above.");
      return;
    }
    setDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lng = Number(pos.coords.longitude.toFixed(4));
        setSelectedCoords({ lat, lng });
        const autoLabel = `Current GPS Location (${lat}°, ${lng}°)`;
        setLocationName(autoLabel);
        if (!form.pickup_area || form.pickup_area.includes("Coimbatore")) {
          setForm((prev) => ({ ...prev, pickup_area: `Near My Live GPS Location (${lat}, ${lng})` }));
        }
        setDetectingGps(false);
        showToast("📍 Exact GPS coordinates detected!", "success");
      },
      () => {
        setDetectingGps(false);
        showToast("Could not detect GPS coordinates. Selected Coimbatore Saravanampatti.", "info");
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (selectedFiles.length + files.length > 6) {
      setError("Maximum 6 additional photos allowed.");
      return;
    }

    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        setError("Each photo must be smaller than 5MB.");
        return;
      }
    }

    const newFiles = [...selectedFiles, ...files];
    const newPreviews = [...previewUrls, ...files.map((f) => URL.createObjectURL(f))];

    setSelectedFiles(newFiles);
    setPreviewUrls(newPreviews);
    setError(null);
  }

  function handleRemoveFile(index: number) {
    const updatedFiles = selectedFiles.filter((_, i) => i !== index);
    const updatedPreviews = previewUrls.filter((_, i) => i !== index);
    setSelectedFiles(updatedFiles);
    setPreviewUrls(updatedPreviews);
  }

  function handleSetAsCover(index: number) {
    if (index === 0) return;
    const files = [...selectedFiles];
    const previews = [...previewUrls];

    const [movedFile] = files.splice(index, 1);
    const [movedPreview] = previews.splice(index, 1);

    files.unshift(movedFile);
    previews.unshift(movedPreview);

    setSelectedFiles(files);
    setPreviewUrls(previews);
  }

  async function handleAiAnalyze() {
    const targetPhoto = angleFiles.front || selectedFiles[0];
    if (!targetPhoto) {
      setError("Please choose or upload a product photo (e.g. Front View in 3D Studio) first to use AI Auto-Fill.");
      return;
    }

    setAnalyzingAI(true);
    setAiNotice(null);
    setError(null);

    try {
      const res = await suggestListingAI(targetPhoto);
      if (res.title || res.description || res.suggested_price) {
        setForm((prev) => ({
          ...prev,
          title: res.title || prev.title,
          description: res.description || prev.description,
          price: res.suggested_price != null ? String(res.suggested_price) : prev.price,
          category: res.attributes?.category || prev.category,
          condition: res.attributes?.condition ? capitalize(res.attributes.condition) : prev.condition,
        }));
        setAiNotice("✨ AI analyzed your photo and auto-filled title, description, and suggested pricing! Review or edit before publishing.");
      } else {
        setAiNotice("AI Vision service returned without suggestions. Please fill the details manually.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to analyze image with AI.");
    } finally {
      setAnalyzingAI(false);
    }
  }

  function capitalize(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  async function createWithCoords(lat: number, lng: number) {
    const product = await api("/products", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        price: form.price ? Number(form.price) : null,
        latitude: lat,
        longitude: lng,
        has_3d: is3DReady,
      }),
    });

    if (product.id) {
      // 1. Upload 3D angle images
      const angleEntries = Object.entries(angleFiles).filter(([_, f]) => Boolean(f)) as [string, File][];
      if (angleEntries.length > 0) {
        for (const [angle, file] of angleEntries) {
          try {
            await uploadProductImageWithAngle(product.id, file, angle);
          } catch {}
        }
        if (is3DReady) {
          try {
            await convertProductTo3D(product.id);
          } catch {}
        }
      }

      // 2. Upload any additional standard photos
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          try {
            await uploadProductImage(product.id, file);
          } catch {}
        }
      }
    }

    showToast("Listing created successfully! 🎉", "success");
    router.push(`/listings/${product.id}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const hasAnyPhoto = Boolean(anglePreviews.front || selectedFiles.length > 0);
    if (!hasAnyPhoto) {
      setError("Please upload at least one photo (e.g. Front View in 3D Studio) for your item.");
      return;
    }

    if (!form.title.trim()) {
      setError("Please enter a title for your item.");
      return;
    }
    if (form.transaction_type === "BUY" && (!form.price || Number(form.price) <= 0)) {
      setError("Please set a price for items you wish to sell.");
      return;
    }
    if (form.price) {
      const price = Number(form.price);
      if (isNaN(price) || price < 0) {
        setError("Price must be a valid positive number.");
        return;
      }
      if (price > 1000000) {
        setError("Price seems unreasonable. Please enter a realistic price.");
        return;
      }
    }
    if (form.description && form.description.length > 2000) {
      setError("Description must be under 2000 characters.");
      return;
    }

    if (!form.pickup_area.trim()) {
      setError("📍 Product pickup location & campus landmark is mandatory so nearby students can find your listing.");
      return;
    }

    if (!selectedCoords || (selectedCoords.lat === 0 && selectedCoords.lng === 0)) {
      setError("Please select or detect valid location coordinates for your product.");
      return;
    }

    setSubmitting(true);
    try {
      await createWithCoords(selectedCoords.lat, selectedCoords.lng);
    } catch (err: any) {
      setError(err.message || "Failed to publish listing.");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-3 sm:py-4 px-1 sm:px-4 animate-fade-in">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink dark:text-white">List an Item</h1>
          <p className="text-xs sm:text-sm text-ink/70 dark:text-stone-300">Share books, electronics, or campus essentials with fellow students</p>
        </div>
        <Link href="/" className="text-sm text-moss dark:text-emerald-400 font-medium hover:underline shrink-0">
          Cancel
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-4 sm:p-6 shadow-sm space-y-5 sm:space-y-6 transition-colors">
        {/* Photo Upload Section */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <label className="block text-sm font-semibold text-ink dark:text-white flex items-center gap-2">
                <span>Product Photos &amp; 3D Capture</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
                  3D Multi-Angle
                </span>
              </label>
              <p className="text-xs text-ink/70 dark:text-stone-300">
                Please upload every side of your item (Front, Right, Back, Left, Top, Bottom) and convert it into interactive 3D!
              </p>
            </div>

            <div className="flex items-center gap-1 bg-sand/60 dark:bg-stone-800 p-1 rounded-xl text-xs self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setUse3DStudio(true)}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  use3DStudio
                    ? "bg-moss text-white shadow-sm"
                    : "text-ink/70 dark:text-stone-300 hover:text-ink"
                }`}
              >
                🧊 3D Studio
              </button>
              <button
                type="button"
                onClick={() => setUse3DStudio(false)}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  !use3DStudio
                    ? "bg-moss text-white shadow-sm"
                    : "text-ink/70 dark:text-stone-300 hover:text-ink"
                }`}
              >
                📸 Classic
              </button>
            </div>
          </div>

          {use3DStudio ? (
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

              {/* AI Auto-Fill Action */}
              {anglePreviews.front && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAiAnalyze}
                    disabled={analyzingAI}
                    className="text-xs bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold px-3 py-1.5 rounded-lg hover:from-emerald-700 hover:to-teal-700 flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <span>✨</span> {analyzingAI ? "Analyzing photo…" : "AI Auto-Fill Details"}
                  </button>
                  <span className="text-[11px] text-ink/60 dark:text-stone-400">
                    Uses front photo to predict title, condition, and category
                  </span>
                </div>
              )}

              {aiNotice && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs rounded-xl">
                  {aiNotice}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Thumbnails & Reordering Grid */}
              {previewUrls.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {previewUrls.map((url, idx) => (
                    <div key={idx} className="relative rounded-xl border border-ink/15 dark:border-stone-700 overflow-hidden group bg-sand/30 dark:bg-stone-800">
                      <img src={url} alt={`Upload ${idx}`} className="w-full aspect-[4/3] object-cover" />
                      {idx === 0 && (
                        <span className="absolute top-1.5 left-1.5 bg-moss text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                          Cover
                        </span>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                        {idx !== 0 && (
                          <button
                            type="button"
                            onClick={() => handleSetAsCover(idx)}
                            className="text-[10px] bg-white text-ink px-1.5 py-0.5 rounded font-semibold hover:bg-moss hover:text-white shadow"
                            title="Set as Cover Photo"
                          >
                            Cover
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          className="text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded font-semibold hover:bg-rose-700 shadow"
                          title="Remove photo"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Action Box */}
              {selectedFiles.length < 5 && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-ink/20 dark:border-stone-700 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-moss bg-sand/20 dark:bg-stone-800/40 transition-colors"
                >
                  <svg className="w-6 h-6 text-ink/40 dark:text-stone-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <p className="text-xs font-semibold text-ink dark:text-stone-200">
                    {selectedFiles.length === 0 ? "Click to upload photos" : "Add more photos"}
                  </p>
                  <p className="text-[11px] text-ink/50 dark:text-stone-400">PNG, JPG, WEBP up to 5MB (4:3 recommended)</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              )}

              {/* AI Auto-Fill Action */}
              {selectedFiles.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAiAnalyze}
                    disabled={analyzingAI}
                    className="text-xs bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold px-3 py-1.5 rounded-lg hover:from-emerald-700 hover:to-teal-700 flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <span>✨</span> {analyzingAI ? "Analyzing photo…" : "AI Auto-Fill Details"}
                  </button>
                  <span className="text-[11px] text-ink/60 dark:text-stone-400">Uses cover photo to predict title, condition, and category</span>
                </div>
              )}

              {aiNotice && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs rounded-xl">
                  {aiNotice}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transaction Type */}
        <div>
          <label className="block text-sm font-semibold text-ink dark:text-white mb-2">Transaction Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TRANSACTION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setForm({ ...form, transaction_type: type })}
                className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                  form.transaction_type === type
                    ? "bg-moss text-white border-moss shadow-sm"
                    : "border-ink/15 dark:border-stone-700 text-ink/70 dark:text-stone-300 hover:border-moss"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-semibold text-ink dark:text-white mb-1.5">Item Title</label>
          <input
            type="text"
            required
            placeholder="e.g., Engineering Mathematics 3rd Ed. (Erwin Kreyszig)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full border border-ink/20 dark:border-stone-700 rounded-xl px-3.5 py-2 text-sm text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
          />
        </div>

        {/* Category & Condition */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-ink dark:text-white mb-1.5">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full border border-ink/20 dark:border-stone-700 rounded-xl px-3 py-2 text-sm text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-ink dark:text-white mb-1.5">Condition</label>
            <select
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value })}
              className="w-full border border-ink/20 dark:border-stone-700 rounded-xl px-3 py-2 text-sm text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
            >
              <option value="Brand New">Brand New</option>
              <option value="Like New">Like New</option>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
            </select>
          </div>
        </div>

        {/* Price */}
        <div>
          <label className="block text-sm font-semibold text-ink dark:text-white mb-1.5">
            {form.transaction_type === "DONATE" ? "Price (Free)" : "Price (₹)"}
          </label>
          <input
            type="number"
            disabled={form.transaction_type === "DONATE"}
            placeholder={form.transaction_type === "DONATE" ? "0 (Donation)" : "e.g., 450"}
            value={form.transaction_type === "DONATE" ? "" : form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="w-full border border-ink/20 dark:border-stone-700 rounded-xl px-3.5 py-2 text-sm text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss disabled:opacity-50"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-ink dark:text-white mb-1.5">Description</label>
          <textarea
            rows={3}
            placeholder="Add details on condition, highlighted pages, accessories included, or rental period..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full border border-ink/20 dark:border-stone-700 rounded-xl px-3.5 py-2 text-sm text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss resize-none"
          />
        </div>

        {/* Mandatory Product Location Section */}
        <div className="p-4 rounded-xl bg-sand/60 dark:bg-stone-800/80 border border-moss/20 dark:border-emerald-800/40 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <div>
              <label className="block text-sm font-bold text-ink dark:text-white flex items-center gap-1.5">
                <span>📍 Product Location &amp; Campus Hub</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white uppercase tracking-wider">
                  * Required
                </span>
              </label>
              <p className="text-xs text-ink/65 dark:text-stone-300">
                Setting your exact campus location enables students nearest to you to discover and collect this item quickly!
              </p>
            </div>

            <button
              type="button"
              onClick={handleDetectGps}
              disabled={detectingGps}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-moss text-white hover:bg-moss/90 transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-auto shadow-2xs"
            >
              {detectingGps ? (
                <>
                  <span className="animate-spin text-xs">⌛</span> Detecting GPS…
                </>
              ) : (
                <>
                  <span>📡</span> Auto-Detect My GPS
                </>
              )}
            </button>
          </div>

          {/* Quick Coimbatore Campus Hub Chips */}
          <div>
            <span className="text-[11px] font-semibold text-ink/60 dark:text-stone-400 block mb-1.5">
              Quick Select Coimbatore Student Hub:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COIMBATORE_LOCATION_PRESETS.map((p) => {
                const isSelected =
                  Math.abs(selectedCoords.lat - p.lat) < 0.001 &&
                  Math.abs(selectedCoords.lng - p.lng) < 0.001;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-start gap-2 ${
                      isSelected
                        ? "border-moss bg-moss/10 dark:bg-emerald-950/40 ring-1 ring-moss text-moss dark:text-emerald-300"
                        : "border-ink/10 dark:border-stone-700 bg-white dark:bg-stone-900 hover:border-moss/50 text-ink dark:text-stone-200"
                    }`}
                  >
                    <span className="text-base shrink-0 mt-0.5">🏫</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs truncate">{p.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-moss/10 dark:bg-stone-800 text-moss dark:text-emerald-300 font-mono">
                          {p.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-ink/60 dark:text-stone-400 truncate mt-0.5">
                        {p.lat.toFixed(4)}° N, {p.lng.toFixed(4)}° E
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Specific Landmark / Handover spot */}
          <div>
            <label className="block text-xs font-semibold text-ink/80 dark:text-stone-200 mb-1">
              Exact Handover Landmark / Area <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g., KCT Gate 1 / SREC Mech Block / Boys Hostel Lawn / Saravanampatti"
              value={form.pickup_area}
              onChange={(e) => setForm({ ...form, pickup_area: e.target.value })}
              className="w-full border border-ink/20 dark:border-stone-700 rounded-xl px-3.5 py-2.5 text-sm text-ink dark:text-white dark:bg-stone-800 focus:outline-none focus:border-moss"
            />
            <div className="mt-1 flex items-center justify-between text-[11px] text-ink/50 dark:text-stone-400">
              <span>📍 Coordinates: <strong>{selectedCoords.lat.toFixed(4)}° N, {selectedCoords.lng.toFixed(4)}° E</strong></span>
              <span>🔒 Hidden until deal confirmation</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs rounded-xl">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-moss text-white font-semibold py-3 rounded-xl hover:bg-moss/90 transition-all text-sm shadow-sm disabled:opacity-50"
        >
          {submitting ? "Publishing listing…" : "Publish Listing"}
        </button>
      </form>
    </div>
  );
}
