"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 animate-fade-in-up">
      <div className="animate-float mb-6">
        <span className="text-7xl">🔍</span>
      </div>

      <h1 className="text-3xl font-extrabold text-ink mb-2">Page Not Found</h1>
      <p className="text-sm text-ink/60 max-w-md leading-relaxed mb-8">
        The page you&apos;re looking for doesn&apos;t exist, was removed, or you may
        have mistyped the address. Let&apos;s get you back on track.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-moss text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-moss/90 shadow-md transition-all"
        >
          <span>🏠</span> Go Home
        </Link>
        <Link
          href="/listings/new"
          className="inline-flex items-center gap-2 bg-white border border-ink/15 text-ink font-semibold text-sm px-6 py-3 rounded-xl hover:border-moss hover:text-moss shadow-sm transition-all"
        >
          <span>+</span> List an Item
        </Link>
      </div>

      <p className="text-[11px] text-ink/40 mt-10">
        Error 404 · ProductXchange
      </p>
    </div>
  );
}
