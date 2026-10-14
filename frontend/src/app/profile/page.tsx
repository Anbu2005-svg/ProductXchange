"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";

export default function ProfileRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }

    api("/auth/me")
      .then((user) => router.replace(`/profile/${user.id}`))
      .catch(() => router.push("/login"));
  }, [router]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center text-ink/60 animate-pulse text-sm">
      Loading profile…
    </div>
  );
}
