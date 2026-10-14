import Link from "next/link";

export default function ListingNotFound() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4 animate-fade-in-up">
      <span className="text-6xl mb-4 animate-float">📦</span>
      <h1 className="text-2xl font-bold text-ink mb-2">Listing Not Found</h1>
      <p className="text-sm text-ink/60 max-w-sm leading-relaxed mb-6">
        This listing may have been sold, removed, or is no longer available.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-moss text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-moss/90 shadow-sm transition-all"
      >
        Browse Other Items →
      </Link>
    </div>
  );
}
