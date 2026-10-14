"use client";

import { useState, useRef } from "react";
import Product3DViewer from "@/components/Product3DViewer";

export interface AngleData {
  front?: File | null;
  right?: File | null;
  back?: File | null;
  left?: File | null;
  top?: File | null;
  bottom?: File | null;
}

export interface AnglePreviews {
  front?: string;
  right?: string;
  back?: string;
  left?: string;
  top?: string;
  bottom?: string;
}

interface MultiAnglePhotoStudioProps {
  initialPreviews?: AnglePreviews;
  onAnglesChange: (files: AngleData, previews: AnglePreviews, is3DReady: boolean) => void;
  onError?: (err: string | null) => void;
}

const ANGLE_SLOTS = [
  {
    key: "front",
    label: "Front Face",
    angleDeg: "0°",
    icon: "🏷️",
    desc: "Main face / default cover photo",
    instruction: "Place item upright and photograph straight on.",
    required: true,
  },
  {
    key: "right",
    label: "Right Profile",
    angleDeg: "90°",
    icon: "➡️",
    desc: "Right profile angle",
    instruction: "Rotate item 90° clockwise and capture right side.",
    required: true,
  },
  {
    key: "back",
    label: "Back View",
    angleDeg: "180°",
    icon: "🔄",
    desc: "Rear panel / ports / labels",
    instruction: "Turn item completely around to capture the back.",
    required: true,
  },
  {
    key: "left",
    label: "Left Profile",
    angleDeg: "270°",
    icon: "⬅️",
    desc: "Left profile angle",
    instruction: "Rotate to capture the complete left profile.",
    required: true,
  },
  {
    key: "top",
    label: "Top View",
    angleDeg: "Top",
    icon: "⬆️",
    desc: "Bird's eye perspective",
    instruction: "Photograph looking directly down at the item.",
    required: false,
  },
  {
    key: "bottom",
    label: "Bottom View",
    angleDeg: "Base",
    icon: "⬇️",
    desc: "Base / underside",
    instruction: "Turn upside down to show the base, feet, or underside.",
    required: false,
  },
] as const;

export default function MultiAnglePhotoStudio({
  initialPreviews = {},
  onAnglesChange,
  onError,
}: MultiAnglePhotoStudioProps) {
  const [angleFiles, setAngleFiles] = useState<AngleData>({});
  const [anglePreviews, setAnglePreviews] = useState<AnglePreviews>(initialPreviews);
  const [converting, setConverting] = useState(false);
  const [conversionStage, setConversionStage] = useState<string>("");
  const [is3DReady, setIs3DReady] = useState(
    Boolean(initialPreviews.front && (initialPreviews.right || initialPreviews.back || initialPreviews.left))
  );
  const [showLivePreview, setShowLivePreview] = useState(true);

  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const uploadedCount = Object.values(anglePreviews).filter(Boolean).length;
  const progressPct = Math.round((uploadedCount / 6) * 100);

  function handleFileSelect(key: keyof AngleData, file?: File) {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      if (onError) onError(`Photo for ${key} must be under 5MB.`);
      return;
    }

    const preview = URL.createObjectURL(file);
    const nextFiles = { ...angleFiles, [key]: file };
    const nextPreviews = { ...anglePreviews, [key]: preview };

    setAngleFiles(nextFiles);
    setAnglePreviews(nextPreviews);

    const hasMinSides = Boolean(nextPreviews.front && (nextPreviews.right || nextPreviews.back || nextPreviews.left));
    onAnglesChange(nextFiles, nextPreviews, is3DReady || hasMinSides);
    if (onError) onError(null);
  }

  function handleRemoveSide(key: keyof AngleData) {
    const nextFiles = { ...angleFiles, [key]: null };
    const nextPreviews = { ...anglePreviews };
    delete nextPreviews[key];

    setAngleFiles(nextFiles);
    setAnglePreviews(nextPreviews);

    const hasMinSides = Boolean(nextPreviews.front && (nextPreviews.right || nextPreviews.back || nextPreviews.left));
    const ready = is3DReady && hasMinSides;
    setIs3DReady(ready);
    onAnglesChange(nextFiles, nextPreviews, ready);
  }

  async function handleConvertTo3D() {
    if (!anglePreviews.front) {
      if (onError) onError("Please upload at least the Front View to generate a 3D model.");
      return;
    }

    if (uploadedCount < 2) {
      if (onError) onError("Please upload at least 2 sides (ideally all 6 angles) to convert into an interactive 3D model.");
      return;
    }

    setConverting(true);
    if (onError) onError(null);

    // Multi-stage photogrammetric synthesis simulation
    setConversionStage("Calibrating angle coordinates & focal length...");
    await new Promise((r) => setTimeout(r, 450));
    setConversionStage("Extracting perspective feature mesh...");
    await new Promise((r) => setTimeout(r, 450));
    setConversionStage("Stitching 360° turntable depth frames...");
    await new Promise((r) => setTimeout(r, 400));
    setConversionStage("Finalizing interactive 3D model!");
    await new Promise((r) => setTimeout(r, 300));

    setIs3DReady(true);
    setShowLivePreview(true);
    setConverting(false);
    setConversionStage("");
    onAnglesChange(angleFiles, anglePreviews, true);
  }

  return (
    <div className="space-y-5 rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-b from-emerald-950/10 via-emerald-900/5 to-transparent dark:from-emerald-950/30 dark:via-stone-900 dark:to-stone-900 p-5 sm:p-6 shadow-sm">
      {/* Studio Banner & Instructions */}
      <div className="rounded-xl bg-gradient-to-r from-emerald-600/15 via-teal-600/10 to-indigo-600/15 border border-emerald-500/30 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-xl shrink-0 shadow-md">
            🧊
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-extrabold text-base text-ink dark:text-white flex items-center gap-2">
                <span>3D Photogrammetry Studio</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/40 uppercase tracking-wide">
                  Verified 3D
                </span>
              </h3>
              <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-white/70 dark:bg-stone-800 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                {uploadedCount} of 6 Angles Uploaded ({progressPct}%)
              </span>
            </div>

            <p className="text-xs text-ink/80 dark:text-stone-300 mt-1 leading-relaxed">
              <strong>Instructions:</strong> Please upload a photo of <strong>every side of your item</strong> (Front, Right, Back, Left, Top, and Bottom). Once uploaded, click <strong>&quot;Convert to 3D Image&quot;</strong> to generate an interactive 360° turntable that buyers can rotate and inspect!
            </p>

            {/* Stepper Progress Bar */}
            <div className="mt-3 w-full bg-sand/60 dark:bg-stone-800 rounded-full h-2 overflow-hidden border border-emerald-500/20">
              <div
                style={{ width: `${progressPct}%` }}
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 6-Angle Capture Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {ANGLE_SLOTS.map((slot, index) => {
          const preview = anglePreviews[slot.key];
          const hasImage = Boolean(preview);

          return (
            <div
              key={slot.key}
              className={`relative rounded-xl border-2 transition-all duration-200 overflow-hidden flex flex-col justify-between group ${
                hasImage
                  ? "border-emerald-500 bg-white dark:bg-stone-900 shadow-md ring-1 ring-emerald-500/30"
                  : slot.required
                  ? "border-emerald-500/40 bg-sand/40 dark:bg-stone-900/60 hover:border-emerald-500 hover:shadow-sm"
                  : "border-dashed border-ink/20 dark:border-stone-700 bg-sand/20 dark:bg-stone-900/30 hover:border-emerald-500/50"
              }`}
            >
              {/* Hidden file input for this angle */}
              <input
                ref={(el) => {
                  fileInputRefs.current[slot.key] = el;
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(slot.key, f);
                }}
              />

              {/* Angle Header Badge */}
              <div className="flex items-center justify-between px-2 py-1.5 bg-sand/60 dark:bg-stone-800/80 border-b border-ink/5 dark:border-stone-700 text-[10px]">
                <span className="font-bold text-ink/70 dark:text-stone-300">
                  Step {index + 1}
                </span>
                <span className="px-1.5 py-0.2 rounded font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10">
                  {slot.angleDeg}
                </span>
              </div>

              {/* Slot Body */}
              {hasImage ? (
                <div
                  className="relative aspect-square w-full cursor-pointer"
                  onClick={() => fileInputRefs.current[slot.key]?.click()}
                >
                  <img
                    src={preview}
                    alt={slot.label}
                    className="w-full h-full object-cover"
                  />
                  {/* Remove Button for Touch & Desktop */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveSide(slot.key);
                    }}
                    className="absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow-md hover:bg-rose-700 transition-colors"
                    title="Remove Photo"
                  >
                    ✕
                  </button>

                  {/* Hover / Tap Actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-2 backdrop-blur-[2px]">
                    <span className="text-[10px] font-bold bg-white text-ink px-2.5 py-1 rounded shadow">
                      Tap to Change
                    </span>
                  </div>
                  <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center shadow-md ring-2 ring-white dark:ring-stone-900">
                    ✓
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[slot.key]?.click()}
                  className="aspect-square w-full flex flex-col items-center justify-center p-2.5 text-center hover:bg-emerald-500/10 transition-colors"
                >
                  <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">
                    {slot.icon}
                  </span>
                  <span className="text-xs font-bold text-ink dark:text-white">
                    {slot.label}
                  </span>
                  <span className="text-[10px] text-ink/50 dark:text-stone-400 mt-0.5">
                    {slot.required ? "Required" : "Optional"}
                  </span>
                  <span className="text-[9px] text-emerald-700 dark:text-emerald-400 mt-1 font-semibold">
                    + Take Photo
                  </span>
                </button>
              )}

              {/* Slot Footer Guidance */}
              <div className="p-1.5 text-center bg-sand/30 dark:bg-stone-800/40 border-t border-ink/5 dark:border-stone-800">
                <p className="text-[9px] text-ink/60 dark:text-stone-400 line-clamp-1" title={slot.instruction}>
                  {slot.instruction}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Convert to 3D Action Banner */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-white/80 dark:bg-stone-900/80 border border-emerald-500/30 shadow-sm">
        <div>
          <h4 className="text-sm font-bold text-ink dark:text-white flex items-center gap-1.5">
            <span>✨ 3D Model Generator</span>
            {is3DReady && (
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                (Model Calibrated)
              </span>
            )}
          </h4>
          <p className="text-xs text-ink/70 dark:text-stone-300 mt-0.5">
            {uploadedCount >= 2
              ? `Ready to synthesize your ${uploadedCount} side photos into an interactive 3D viewer.`
              : "Upload at least 2 sides (Front + Right or Back) to generate an interactive 3D model."}
          </p>
        </div>

        <button
          type="button"
          disabled={uploadedCount < 2 || converting}
          onClick={handleConvertTo3D}
          className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 shadow-md ${
            uploadedCount >= 2 && !converting
              ? "bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white hover:opacity-95 hover:scale-[1.02] active:scale-95"
              : "bg-stone-300 dark:bg-stone-800 text-stone-500 cursor-not-allowed"
          }`}
        >
          {converting ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              <span>{conversionStage || "Converting to 3D…"}</span>
            </>
          ) : is3DReady ? (
            <>
              <span>🧊</span> Re-generate 3D Model
            </>
          ) : (
            <>
              <span>✨</span> Convert Images into 3D
            </>
          )}
        </button>
      </div>

      {/* Interactive 3D Model Live Inspector */}
      {is3DReady && (
        <div className="pt-2 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <span>🎉</span> Interactive 3D Model Preview
            </span>
            <button
              type="button"
              onClick={() => setShowLivePreview(!showLivePreview)}
              className="text-xs font-bold text-moss dark:text-emerald-400 hover:underline"
            >
              {showLivePreview ? "Hide 3D Viewer ▲" : "Show 3D Viewer ▼"}
            </button>
          </div>

          {showLivePreview && (
            <div className="rounded-2xl overflow-hidden border border-emerald-500/40 shadow-lg">
              <Product3DViewer
                angles={anglePreviews as Record<string, string>}
                title="Product 3D Model Preview"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
