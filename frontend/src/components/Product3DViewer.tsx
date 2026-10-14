"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { resolveImageUrl } from "@/lib/api";

interface Product3DViewerProps {
  angles?: Record<string, string> | null;
  imageUrls?: string[];
  title?: string;
  className?: string;
}

type ViewMode = "turntable" | "box3d";

export default function Product3DViewer({
  angles,
  imageUrls = [],
  title = "Product",
  className = "",
}: Product3DViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("turntable");
  const [rotationY, setRotationY] = useState(0); // 0 to 360 degrees
  const [rotationX, setRotationX] = useState(15); // -45 to 45 degrees vertical tilt
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [autoRotate, setAutoRotate] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize available angle photos
  const sidePhotos = {
    front: angles?.front || imageUrls[0] || "",
    right: angles?.right || imageUrls[1] || angles?.front || imageUrls[0] || "",
    back: angles?.back || imageUrls[2] || angles?.front || imageUrls[0] || "",
    left: angles?.left || imageUrls[3] || angles?.right || imageUrls[0] || "",
    top: angles?.top || imageUrls[4] || angles?.front || imageUrls[0] || "",
    bottom: angles?.bottom || imageUrls[5] || angles?.back || imageUrls[0] || "",
  };

  // Determine current active side image in Turntable mode based on rotation angle
  const normalizedY = ((rotationY % 360) + 360) % 360;

  let activeTurntableSide: "front" | "right" | "back" | "left" | "top" | "bottom" = "front";
  let activeAngleLabel = "0° Front";

  if (rotationX < -25 && sidePhotos.top) {
    activeTurntableSide = "top";
    activeAngleLabel = "Top View";
  } else if (rotationX > 25 && sidePhotos.bottom) {
    activeTurntableSide = "bottom";
    activeAngleLabel = "Bottom View";
  } else if (normalizedY >= 45 && normalizedY < 135) {
    activeTurntableSide = "right";
    activeAngleLabel = `${Math.round(normalizedY)}° Right Side`;
  } else if (normalizedY >= 135 && normalizedY < 225) {
    activeTurntableSide = "back";
    activeAngleLabel = `${Math.round(normalizedY)}° Back View`;
  } else if (normalizedY >= 225 && normalizedY < 315) {
    activeTurntableSide = "left";
    activeAngleLabel = `${Math.round(normalizedY)}° Left Side`;
  } else {
    activeTurntableSide = "front";
    activeAngleLabel = `${Math.round(normalizedY)}° Front View`;
  }

  const currentTurntableImage = sidePhotos[activeTurntableSide] || sidePhotos.front;

  // Auto-rotation turntable loop
  useEffect(() => {
    if (!autoRotate || isDragging) return;
    const interval = setInterval(() => {
      setRotationY((prev) => (prev + 1.2) % 360);
    }, 30);
    return () => clearInterval(interval);
  }, [autoRotate, isDragging]);

  // Mouse & Touch interaction handlers
  const handlePointerDown = (clientX: number, clientY: number) => {
    setIsDragging(true);
    setAutoRotate(false);
    setDragStart({ x: clientX, y: clientY });
  };

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging) return;
      const deltaX = clientX - dragStart.x;
      const deltaY = clientY - dragStart.y;

      // Sensitivity factor
      const sensitivity = 0.8;

      setRotationY((prev) => prev + deltaX * sensitivity);
      setRotationX((prev) => Math.min(45, Math.max(-45, prev - deltaY * 0.4)));
      setDragStart({ x: clientX, y: clientY });
    },
    [isDragging, dragStart]
  );

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  function jumpToAngle(side: "front" | "right" | "back" | "left" | "top" | "bottom") {
    setAutoRotate(false);
    switch (side) {
      case "front":
        setRotationY(0);
        setRotationX(10);
        break;
      case "right":
        setRotationY(90);
        setRotationX(10);
        break;
      case "back":
        setRotationY(180);
        setRotationX(10);
        break;
      case "left":
        setRotationY(270);
        setRotationX(10);
        break;
      case "top":
        setRotationX(-40);
        break;
      case "bottom":
        setRotationX(40);
        break;
    }
  }

  function handleZoom(delta: number) {
    setZoom((prev) => Math.min(2.0, Math.max(0.7, prev + delta)));
  }

  function resetView() {
    setRotationY(0);
    setRotationX(15);
    setZoom(1);
    setAutoRotate(true);
  }

  return (
    <div
      ref={containerRef}
      className={`relative rounded-2xl overflow-hidden border border-emerald-500/20 bg-stone-950 text-white select-none ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none" : "w-full"
      } ${className}`}
      onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
      onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchStart={(e) => {
        if (e.touches.length === 1) {
          handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
      onTouchMove={(e) => {
        if (e.touches.length === 1) {
          handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
      onTouchEnd={handlePointerUp}
    >
      {/* 3D Viewer Header Controls */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1.5 z-20 pointer-events-auto">
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            3D Studio
          </span>

          {/* Mode Switcher */}
          <div className="bg-stone-900/80 backdrop-blur-md border border-white/10 rounded-lg p-0.5 flex text-xs">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewMode("turntable");
              }}
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-all ${
                viewMode === "turntable"
                  ? "bg-emerald-600 text-white font-semibold shadow-sm"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              🔄 360° Turntable
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewMode("box3d");
              }}
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-all ${
                viewMode === "box3d"
                  ? "bg-emerald-600 text-white font-semibold shadow-sm"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              🧊 3D Box
            </button>
          </div>
        </div>

        {/* Action Buttons: Auto-Rotate, Zoom, Fullscreen */}
        <div className="flex items-center gap-1 bg-stone-900/80 backdrop-blur-md border border-white/10 rounded-xl p-0.5 sm:p-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAutoRotate(!autoRotate);
            }}
            className={`p-1 sm:p-1.5 rounded-lg text-xs transition-colors ${
              autoRotate ? "bg-emerald-500/30 text-emerald-300" : "text-stone-400 hover:text-white"
            }`}
            title={autoRotate ? "Pause Auto-Rotate" : "Start Auto-Rotate"}
          >
            {autoRotate ? "⏸️" : "▶️"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleZoom(0.2);
            }}
            className="p-1 sm:p-1.5 rounded-lg text-xs text-stone-400 hover:text-white transition-colors"
            title="Zoom In"
          >
            🔍+
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleZoom(-0.2);
            }}
            className="p-1 sm:p-1.5 rounded-lg text-xs text-stone-400 hover:text-white transition-colors"
            title="Zoom Out"
          >
            🔍-
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              resetView();
            }}
            className="p-1 sm:p-1.5 rounded-lg text-xs text-stone-400 hover:text-white transition-colors"
            title="Reset 3D View"
          >
            ↺
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsFullscreen(!isFullscreen);
            }}
            className="p-1 sm:p-1.5 rounded-lg text-xs text-stone-400 hover:text-white transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen 3D"}
          >
            {isFullscreen ? "✕" : "⛶"}
          </button>
        </div>
      </div>

      {/* 3D Scene Viewport */}
      <div
        className={`w-full ${
          isFullscreen ? "h-screen" : "aspect-[4/3] sm:aspect-[16/10] max-h-[460px]"
        } flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing relative`}
        style={{ perspective: "1000px" }}
      >
        {/* Subtle Ambient Radial Lighting */}
        <div className="absolute inset-0 bg-radial from-emerald-950/20 via-transparent to-black/80 pointer-events-none" />

        {/* Virtual Turntable Floor Disc */}
        <div
          className="absolute bottom-6 w-72 h-72 rounded-full border border-emerald-500/20 bg-emerald-500/5 blur-[1px] pointer-events-none transition-transform duration-100"
          style={{
            transform: `rotateX(75deg) rotateZ(${rotationY}deg)`,
          }}
        />

        {/* MODE 1: 360° Photogrammetric Turntable */}
        {viewMode === "turntable" && (
          <div
            className="relative flex items-center justify-center transition-transform duration-75 ease-out"
            style={{
              transform: `scale(${zoom}) rotateX(${-rotationX * 0.3}deg)`,
            }}
          >
            {currentTurntableImage ? (
              <img
                src={resolveImageUrl(currentTurntableImage)}
                alt={`${title} - ${activeAngleLabel}`}
                className="max-h-[340px] max-w-[90%] object-contain drop-shadow-[0_20px_35px_rgba(0,0,0,0.8)] pointer-events-none transition-opacity duration-150"
              />
            ) : (
              <div className="text-stone-500 text-sm">No photo mapped for {activeTurntableSide}</div>
            )}

            {/* Depth shine reflection */}
            <div
              className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none"
              style={{
                transform: `translateX(${(normalizedY / 360 - 0.5) * 60}px)`,
              }}
            />
          </div>
        )}

        {/* MODE 2: True 3D Volumetric Cuboid / Box Model (CSS 3D) */}
        {viewMode === "box3d" && (
          <div
            className="relative w-56 h-56 transition-transform duration-75 ease-out"
            style={{
              transformStyle: "preserve-3d",
              transform: `scale(${zoom}) rotateX(${-rotationX}deg) rotateY(${rotationY}deg)`,
            }}
          >
            {/* Front Face */}
            <div
              className="absolute inset-0 border border-white/20 rounded-lg overflow-hidden bg-stone-900 shadow-2xl backface-visible"
              style={{ transform: "translateZ(112px)" }}
            >
              {sidePhotos.front && (
                <img
                  src={resolveImageUrl(sidePhotos.front)}
                  alt="Front side"
                  className="w-full h-full object-cover pointer-events-none"
                />
              )}
              <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 px-1 py-0.5 rounded text-white font-mono">
                Front
              </span>
            </div>

            {/* Back Face */}
            <div
              className="absolute inset-0 border border-white/20 rounded-lg overflow-hidden bg-stone-900 shadow-2xl backface-visible"
              style={{ transform: "rotateY(180deg) translateZ(112px)" }}
            >
              {sidePhotos.back && (
                <img
                  src={resolveImageUrl(sidePhotos.back)}
                  alt="Back side"
                  className="w-full h-full object-cover pointer-events-none"
                />
              )}
              <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 px-1 py-0.5 rounded text-white font-mono">
                Back
              </span>
            </div>

            {/* Right Face */}
            <div
              className="absolute inset-0 border border-white/20 rounded-lg overflow-hidden bg-stone-900 shadow-2xl backface-visible"
              style={{ transform: "rotateY(90deg) translateZ(112px)" }}
            >
              {sidePhotos.right && (
                <img
                  src={resolveImageUrl(sidePhotos.right)}
                  alt="Right side"
                  className="w-full h-full object-cover pointer-events-none"
                />
              )}
              <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 px-1 py-0.5 rounded text-white font-mono">
                Right
              </span>
            </div>

            {/* Left Face */}
            <div
              className="absolute inset-0 border border-white/20 rounded-lg overflow-hidden bg-stone-900 shadow-2xl backface-visible"
              style={{ transform: "rotateY(-90deg) translateZ(112px)" }}
            >
              {sidePhotos.left && (
                <img
                  src={resolveImageUrl(sidePhotos.left)}
                  alt="Left side"
                  className="w-full h-full object-cover pointer-events-none"
                />
              )}
              <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 px-1 py-0.5 rounded text-white font-mono">
                Left
              </span>
            </div>

            {/* Top Face */}
            <div
              className="absolute inset-0 border border-white/20 rounded-lg overflow-hidden bg-stone-900 shadow-2xl backface-visible"
              style={{ transform: "rotateX(90deg) translateZ(112px)" }}
            >
              {sidePhotos.top && (
                <img
                  src={resolveImageUrl(sidePhotos.top)}
                  alt="Top side"
                  className="w-full h-full object-cover pointer-events-none"
                />
              )}
              <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 px-1 py-0.5 rounded text-white font-mono">
                Top
              </span>
            </div>

            {/* Bottom Face */}
            <div
              className="absolute inset-0 border border-white/20 rounded-lg overflow-hidden bg-stone-900 shadow-2xl backface-visible"
              style={{ transform: "rotateX(-90deg) translateZ(112px)" }}
            >
              {sidePhotos.bottom && (
                <img
                  src={resolveImageUrl(sidePhotos.bottom)}
                  alt="Bottom side"
                  className="w-full h-full object-cover pointer-events-none"
                />
              )}
              <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 px-1 py-0.5 rounded text-white font-mono">
                Bottom
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Angle HUD & Quick Angle Switchers */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-1.5 z-20 pointer-events-auto">
        {/* Active Angle Compass Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-900/80 backdrop-blur-md border border-white/10 text-[11px] sm:text-xs font-mono text-emerald-300">
          <span>🧭</span>
          <span>{activeAngleLabel}</span>
        </div>

        {/* Quick Side Angle Buttons */}
        <div className="flex items-center gap-1 bg-stone-900/80 backdrop-blur-md border border-white/10 rounded-xl p-1 overflow-x-auto scrollbar-none touch-pan-x max-w-full">
          {(["front", "right", "back", "left", "top", "bottom"] as const).map((side) => {
            const hasPhoto = Boolean(sidePhotos[side]);
            const isCurrent = activeTurntableSide === side;
            return (
              <button
                key={side}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  jumpToAngle(side);
                }}
                className={`px-2 py-0.5 rounded-lg text-[10px] sm:text-[11px] uppercase font-bold transition-all shrink-0 ${
                  isCurrent
                    ? "bg-emerald-500 text-stone-950 shadow"
                    : hasPhoto
                    ? "text-stone-300 hover:bg-white/10"
                    : "text-stone-600 hover:text-stone-400"
                }`}
              >
                {side}
              </button>
            );
          })}
        </div>
      </div>

      {/* Drag Instruction Cue */}
      <div className="absolute top-1/2 left-3 -translate-y-1/2 opacity-30 hover:opacity-80 transition-opacity pointer-events-none hidden sm:block text-xs text-stone-400">
        ⇄ Drag to rotate 3D
      </div>
    </div>
  );
}
