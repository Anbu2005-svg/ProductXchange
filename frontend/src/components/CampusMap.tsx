"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Product, resolveImageUrl, getCategoryFallbackImage } from "@/lib/api";
import "leaflet/dist/leaflet.css";

interface CampusMapProps {
  products: Product[];
  userCoords: { lat: number; lng: number } | null;
  radiusKm?: number;
  selectedProductId?: number | null;
  onSelectProduct?: (product: Product) => void;
  height?: string;
}

export default function CampusMap({
  products,
  userCoords,
  radiusKm = 15,
  selectedProductId,
  onSelectProduct,
  height = "520px",
}: CampusMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const circleLayerRef = useRef<any>(null);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);

  const defaultCenter = userCoords || { lat: 12.9716, lng: 77.5946 }; // Default Bangalore campus center

  useEffect(() => {
    if (!mapContainerRef.current || typeof window === "undefined") return;

    // Dynamically import Leaflet to prevent Next.js SSR errors
    let L: any;
    let map: any;

    import("leaflet").then((leafletModule) => {
      L = leafletModule.default || leafletModule;

      // Fix Leaflet's default icon path issue with Webpack/Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (!mapInstanceRef.current && mapContainerRef.current) {
        map = L.map(mapContainerRef.current, {
          center: [defaultCenter.lat, defaultCenter.lng],
          zoom: 13,
          zoomControl: true,
        });

        // OpenStreetMap clean carto tiles
        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a> & OpenStreetMap',
          maxZoom: 19,
        }).addTo(map);

        const markersLayer = L.layerGroup().addTo(map);
        markersLayerRef.current = markersLayer;
        mapInstanceRef.current = map;
      } else {
        map = mapInstanceRef.current;
      }

      // Draw user position marker and search radius circle
      if (circleLayerRef.current) {
        circleLayerRef.current.remove();
      }

      if (userCoords && map) {
        const userGroup = L.layerGroup();

        // User location pulsing blue dot
        const userIcon = L.divIcon({
          className: "user-loc-marker",
          html: `<div style="position:relative; width:22px; height:22px;">
            <div style="position:absolute; width:22px; height:22px; border-radius:50%; background:rgba(42, 122, 90, 0.25); animation:ping 1.8s infinite;"></div>
            <div style="position:absolute; top:4px; left:4px; width:14px; height:14px; border-radius:50%; background:#2A7A5A; border:2.5px solid #ffffff; box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>
          </div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

        L.marker([userCoords.lat, userCoords.lng], { icon: userIcon })
          .bindTooltip("📍 You Are Here", { direction: "top", offset: [0, -10] })
          .addTo(userGroup);

        // Subtle radius zone circle
        if (radiusKm) {
          L.circle([userCoords.lat, userCoords.lng], {
            radius: radiusKm * 1000,
            color: "#2A7A5A",
            weight: 1.5,
            dashArray: "6, 8",
            fillColor: "#2A7A5A",
            fillOpacity: 0.04,
          }).addTo(userGroup);
        }

        userGroup.addTo(map);
        circleLayerRef.current = userGroup;
      }

      // Populate product markers
      if (markersLayerRef.current && map) {
        markersLayerRef.current.clearLayers();

        products.forEach((product) => {
          if (!product.latitude || !product.longitude) return;

          const isSelected = selectedProductId === product.id;
          const priceDisplay =
            product.transaction_type === "DONATE"
              ? "FREE"
              : product.price != null
              ? `₹${product.price}`
              : product.transaction_type;

          const markerHtml = `
            <div style="
              background:${isSelected ? "#1B4332" : "#2A7A5A"};
              color:white;
              padding:3px 8px;
              border-radius:14px;
              font-size:11px;
              font-weight:700;
              box-shadow:0 3px 8px rgba(0,0,0,0.25);
              white-space:nowrap;
              border:2px solid white;
              cursor:pointer;
              display:inline-flex;
              align-items:center;
              gap:4px;
              transition:transform 0.15s ease;
            ">
              <span>🏷️</span>
              <span>${priceDisplay}</span>
            </div>
          `;

          const customIcon = L.divIcon({
            className: "product-map-pin",
            html: markerHtml,
            iconSize: [60, 24],
            iconAnchor: [30, 12],
          });

          const marker = L.marker([product.latitude, product.longitude], {
            icon: customIcon,
          });

          // Also add a subtle 250m privacy zone ring around each product
          L.circle([product.latitude, product.longitude], {
            radius: 200,
            color: "#E28743",
            weight: 1,
            fillColor: "#E28743",
            fillOpacity: 0.06,
          }).addTo(markersLayerRef.current);

          marker.on("click", () => {
            setActiveProduct(product);
            if (onSelectProduct) onSelectProduct(product);
          });

          marker.addTo(markersLayerRef.current);
        });
      }
    });

    return () => {
      // Map cleanup if container is unmounted
    };
  }, [products, userCoords, radiusKm, selectedProductId]);

  function handleRecenter() {
    if (mapInstanceRef.current && defaultCenter) {
      mapInstanceRef.current.flyTo([defaultCenter.lat, defaultCenter.lng], 13);
    }
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-ink/10 shadow-sm bg-stone-50">
      {/* Map Element */}
      <div ref={mapContainerRef} style={{ height, width: "100%", zIndex: 1 }} />

      {/* Map Overlay Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <button
          onClick={handleRecenter}
          className="bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs font-semibold text-ink/80 hover:text-moss border border-ink/10 shadow-md hover:bg-white transition-all flex items-center gap-1.5"
          title="Recenter map to campus"
        >
          <span>🎯</span> Recenter
        </button>
      </div>

      {/* Legend Badge */}
      <div className="absolute top-3 left-3 z-10 bg-white/95 dark:bg-stone-900/95 backdrop-blur-sm px-3 py-1.5 rounded-lg text-[11px] font-medium text-ink/70 dark:text-stone-300 border border-ink/10 dark:border-white/10 shadow-md flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-moss inline-block" /> Listings
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-clay inline-block" /> ~200m Privacy Zone
        </span>
      </div>

      {/* Active Product Popover Card */}
      {activeProduct && (
        <div className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4 md:left-auto md:right-4 md:w-80 z-20 bg-white dark:bg-stone-900 rounded-xl p-3.5 shadow-2xl border border-ink/15 dark:border-white/10 animate-fade-in">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-moss dark:text-emerald-400 bg-moss/10 dark:bg-moss/20 px-2 py-0.5 rounded-md inline-block mb-1">
                {activeProduct.category}
              </span>
              <h4 className="text-sm font-bold text-ink dark:text-white truncate">{activeProduct.title}</h4>
            </div>
            <button
              onClick={() => setActiveProduct(null)}
              className="text-ink/40 dark:text-stone-400 hover:text-ink dark:hover:text-white text-xs p-1 rounded-md"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <img
              src={activeProduct.image_urls?.[0] ? resolveImageUrl(activeProduct.image_urls[0]) : getCategoryFallbackImage(activeProduct.category)}
              alt={activeProduct.title}
              className="w-14 h-14 rounded-lg object-cover border border-ink/10 dark:border-stone-700 shrink-0"
              onError={(e) => {
                const fallback = getCategoryFallbackImage(activeProduct.category);
                if (e.currentTarget.src !== fallback) {
                  e.currentTarget.src = fallback;
                }
              }}
            />
            <div className="text-xs space-y-0.5 min-w-0">
              <div className="font-extrabold text-moss dark:text-emerald-400 text-base">
                {activeProduct.transaction_type === "DONATE"
                  ? "Free"
                  : activeProduct.price != null
                  ? `₹${activeProduct.price}`
                  : activeProduct.transaction_type}
              </div>
              <div className="text-ink/60 dark:text-stone-400 text-[11px] truncate">
                {activeProduct.condition || "Used"} • {activeProduct.pickup_area || "Campus Hub"}
              </div>
              {activeProduct.distance_m != null && (
                <div className="text-[10px] text-clay font-medium">
                  📍 ~{(activeProduct.distance_m / 1000).toFixed(1)} km from you
                </div>
              )}
            </div>
          </div>

          <Link
            href={`/listings/${activeProduct.id}`}
            className="block text-center w-full bg-moss text-white text-xs font-semibold py-2 rounded-lg hover:bg-moss/90 transition-colors shadow-sm touch-manipulation"
          >
            View Listing Details →
          </Link>
        </div>
      )}
    </div>
  );
}
