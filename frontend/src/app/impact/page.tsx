"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, getToken } from "@/lib/api";

type SustainabilityData = {
  summary: {
    total_co2_saved_kg: number;
    trees_equivalent: number;
    total_waste_diverted_kg: number;
    total_rupees_saved: number;
    items_circulated: number;
    completed_deals: number;
  };
  category_distribution: { category: string; count: number }[];
  user_impact: {
    user_id: number;
    tier: string;
    co2_saved_kg: number;
    waste_diverted_kg: number;
    rupees_saved: number;
    items_shared: number;
    deals_completed: number;
  } | null;
};

export default function SustainabilityImpactPage() {
  const [data, setData] = useState<SustainabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const [userName, setUserName] = useState("Campus Student");

  useEffect(() => {
    setIsLoggedIn(!!getToken());
    api("/auth/me")
      .then((u) => {
        if (u?.full_name) setUserName(u.full_name);
        else if (u?.email) setUserName(u.email.split("@")[0]);
      })
      .catch(() => {});

    api("/analytics/sustainability")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const CATEGORY_ICONS: Record<string, string> = {
    Textbooks: "📚",
    Books: "📖",
    Electronics: "💻",
    Stationery: "✏️",
    Cycles: "🚲",
    "Lab Equipment": "🔬",
    "Hostel Essentials": "🛏️",
    Furniture: "🪑",
  };

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 animate-fade-in space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-moss to-emerald-800 rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-15 text-[140px] sm:text-[180px] select-none pointer-events-none">
          🌱
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4 border border-white/20">
            <span>🌿</span> UN SDG 12 & 13 • Campus Circular Economy
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
            Sustainability & Eco-Impact Dashboard
          </h1>
          <p className="mt-3 text-xs sm:text-base text-emerald-100 leading-relaxed">
            By circulating textbooks, lab gear, cycles, and electronics peer-to-peer on campus, students directly cut manufacturing carbon emissions, eliminate packaging waste, and keep tons of items out of landfills.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => setShowCertificate(true)}
              className="bg-white text-moss font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl hover:bg-emerald-50 transition-colors shadow-md flex items-center gap-2 touch-manipulation"
            >
              <span>📜</span> Download / Print Eco Certificate
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-sm text-ink/50 dark:text-stone-400 animate-pulse">
          Calculating live campus eco-metrics…
        </div>
      ) : data ? (
        <>
          {/* Personal Eco Badge (if logged in) */}
          {data.user_impact && (
            <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-sand/40 dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-stone-900 border border-emerald-200/80 dark:border-emerald-800/80 rounded-2xl p-4 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-xl sm:text-2xl shadow-md shrink-0">
                    🌱
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider bg-emerald-100/80 dark:bg-emerald-900/60 px-2.5 py-0.5 rounded-full inline-block mb-1">
                      {data.user_impact.tier}
                    </span>
                    <h2 className="text-base sm:text-lg font-extrabold text-ink dark:text-white">Your Campus Eco-Contribution</h2>
                    <p className="text-xs text-ink/60 dark:text-stone-300">
                      Based on your shared listings and verified handshakes
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 sm:gap-6 self-stretch sm:self-auto justify-around border-t sm:border-t-0 sm:border-l border-ink/10 dark:border-stone-700 pt-3 sm:pt-0 sm:pl-6 text-center">
                  <div>
                    <div className="text-lg sm:text-xl font-black text-emerald-700 dark:text-emerald-400">
                      {data.user_impact.co2_saved_kg} <span className="text-xs font-semibold">kg</span>
                    </div>
                    <div className="text-[11px] text-ink/60 dark:text-stone-400">CO₂ Prevented</div>
                  </div>
                  <div>
                    <div className="text-lg sm:text-xl font-black text-moss dark:text-emerald-400">
                      ₹{data.user_impact.rupees_saved.toLocaleString("en-IN")}
                    </div>
                    <div className="text-[11px] text-ink/60 dark:text-stone-400">Money Saved</div>
                  </div>
                  <div>
                    <div className="text-lg sm:text-xl font-black text-ink dark:text-white">
                      {data.user_impact.items_shared}
                    </div>
                    <div className="text-[11px] text-ink/60 dark:text-stone-400">Items Circulated</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl mb-3">
                🌿
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-400">
                {data.summary.total_co2_saved_kg.toLocaleString("en-IN")} <span className="text-xs font-semibold">kg</span>
              </div>
              <div className="text-xs font-bold text-ink dark:text-white mt-1">CO₂ Prevented</div>
              <p className="text-[11px] text-ink/50 dark:text-stone-400 mt-1">Lifecycle emissions saved vs. purchasing brand new items</p>
            </div>

            <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center text-xl mb-3">
                🌳
              </div>
              <div className="text-2xl sm:text-3xl font-black text-teal-700 dark:text-teal-400">
                {data.summary.trees_equivalent}
              </div>
              <div className="text-xs font-bold text-ink dark:text-white mt-1">Trees Equivalent</div>
              <p className="text-[11px] text-ink/50 dark:text-stone-400 mt-1">Annual CO₂ absorption by mature trees</p>
            </div>

            <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl mb-3">
                ♻️
              </div>
              <div className="text-2xl sm:text-3xl font-black text-amber-700 dark:text-amber-400">
                {data.summary.total_waste_diverted_kg.toLocaleString("en-IN")} <span className="text-xs font-semibold">kg</span>
              </div>
              <div className="text-xs font-bold text-ink dark:text-white mt-1">Waste Diverted</div>
              <p className="text-[11px] text-ink/50 dark:text-stone-400 mt-1">Paper pulp, e-waste, and scrap kept out of campus dumps</p>
            </div>

            <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-moss/10 dark:bg-moss/20 text-moss dark:text-emerald-400 flex items-center justify-center text-xl mb-3">
                💰
              </div>
              <div className="text-2xl sm:text-3xl font-black text-moss dark:text-emerald-400">
                ₹{data.summary.total_rupees_saved.toLocaleString("en-IN")}
              </div>
              <div className="text-xs font-bold text-ink dark:text-white mt-1">Student Savings</div>
              <p className="text-[11px] text-ink/50 dark:text-stone-400 mt-1">Direct economic savings for student community</p>
            </div>
          </div>

          {/* Circularity by Category */}
          <div className="bg-white dark:bg-stone-900 border border-ink/10 dark:border-white/10 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-ink dark:text-white mb-1 flex items-center gap-2">
              <span>📊</span> Circularity Across Campus Categories
            </h3>
            <p className="text-xs text-ink/60 dark:text-stone-400 mb-5">
              Volume of academic goods and student assets given a secondary lifecycle
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {data.category_distribution.map((cat) => (
                <div
                  key={cat.category}
                  className="p-3.5 bg-sand/40 dark:bg-stone-800 border border-ink/10 dark:border-stone-700 rounded-xl flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {CATEGORY_ICONS[cat.category] || "📦"}
                    </span>
                    <span className="text-xs font-semibold text-ink dark:text-stone-200">
                      {cat.category}
                    </span>
                  </div>
                  <span className="text-xs font-black text-emerald-800 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                    {cat.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {/* Feature #14: Campus Sustainability Certificate Modal & Printable Area */}
      {showCertificate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative max-w-2xl w-full bg-white dark:bg-stone-900 border border-ink/20 dark:border-stone-700 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <button
              onClick={() => setShowCertificate(false)}
              className="absolute top-4 right-4 text-ink/40 dark:text-stone-400 hover:text-ink dark:hover:text-white text-lg font-bold"
            >
              ✕
            </button>

            {/* Printable Certificate Card */}
            <div className="printable-area border-4 border-double border-emerald-700/60 rounded-2xl p-6 sm:p-8 text-center space-y-4 bg-gradient-to-b from-emerald-50/50 via-white to-sand/20 dark:from-stone-900 dark:via-stone-900 dark:to-stone-800">
              <div className="flex justify-center items-center gap-2 text-2xl font-black text-emerald-800 dark:text-emerald-400">
                <span>🔄</span> ProductXchange Campus
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                  Certificate of Sustainability
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-ink dark:text-white font-serif">
                  Campus Eco-Hero Award
                </h2>
              </div>

              <p className="text-xs sm:text-sm text-ink/70 dark:text-stone-300 max-w-md mx-auto">
                This certifies that <strong className="text-ink dark:text-white text-base underline underline-offset-4">{userName}</strong> has actively contributed to university environmental sustainability through peer circular exchange.
              </p>

              <div className="grid grid-cols-3 gap-3 max-w-md mx-auto py-2 border-y border-emerald-600/20">
                <div>
                  <div className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                    {data?.user_impact?.co2_saved_kg ?? data?.summary.total_co2_saved_kg ?? 12} kg
                  </div>
                  <div className="text-[10px] text-ink/60 dark:text-stone-400 uppercase">CO₂ Offset</div>
                </div>
                <div>
                  <div className="text-lg font-black text-teal-700 dark:text-teal-400">
                    {data?.summary.trees_equivalent ?? 4}
                  </div>
                  <div className="text-[10px] text-ink/60 dark:text-stone-400 uppercase">Trees Equivalent</div>
                </div>
                <div>
                  <div className="text-lg font-black text-amber-700 dark:text-amber-400">
                    {data?.user_impact?.waste_diverted_kg ?? data?.summary.total_waste_diverted_kg ?? 8} kg
                  </div>
                  <div className="text-[10px] text-ink/60 dark:text-stone-400 uppercase">Waste Diverted</div>
                </div>
              </div>

              <div className="flex justify-between items-end pt-4 text-[10px] text-ink/50 dark:text-stone-400 font-mono">
                <div>
                  <span>ISSUED ON: {new Date().toLocaleDateString("en-IN")}</span>
                </div>
                <div className="text-right">
                  <span>ID: PX-ECO-{Date.now().toString(36).toUpperCase()}</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowCertificate(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-ink/20 dark:border-stone-700 text-ink/70 dark:text-stone-300 hover:bg-sand dark:hover:bg-stone-800"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-md flex items-center gap-1.5"
              >
                <span>🖨️</span> Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
