"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ProductXchange Error]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 animate-fade-in-up">
      <div className="animate-float mb-6">
        <span className="text-7xl">⚠️</span>
      </div>

      <h1 className="text-3xl font-extrabold text-ink mb-2">
        Something Went Wrong
      </h1>
      <p className="text-sm text-ink/60 max-w-md leading-relaxed mb-3">
        An unexpected error occurred. This has been logged and we&apos;ll look into it.
      </p>

      <div className="max-w-lg w-full mb-8">
        <details className="bg-sand/60 border border-ink/10 rounded-xl p-3 text-left">
          <summary className="text-xs font-semibold text-ink/60 cursor-pointer">
            Technical Details
          </summary>
          <pre className="mt-2 text-[11px] text-ink/50 whitespace-pre-wrap break-all font-mono">
            {error.message}
            {error.digest && `\nDigest: ${error.digest}`}
          </pre>
        </details>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 bg-moss text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-moss/90 shadow-md transition-all"
        >
          <span>🔄</span> Try Again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-white border border-ink/15 text-ink font-semibold text-sm px-6 py-3 rounded-xl hover:border-moss hover:text-moss shadow-sm transition-all"
        >
          <span>🏠</span> Go Home
        </Link>
      </div>
    </div>
  );
}
