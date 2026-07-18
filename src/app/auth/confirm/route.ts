// ============================================================
// GET /auth/confirm
//
// Server-side exchange of a Supabase email-confirmation token for
// a session, BEFORE redirecting to the final destination. This
// route is what `emailRedirectTo` now points to (see
// signup/page.tsx) instead of pointing straight at /join/<token>.
//
// Why this exists: Supabase only honors `emailRedirectTo` when the
// URL is on the project's Redirect URLs allow-list; otherwise it
// silently falls back to the Site URL, dropping the destination
// (and, for invites, the /join/<token> path with it). Exchanging
// the token server-side here means the session is established
// deterministically by this route regardless of where Supabase's
// email template ultimately points, as long as this route's own
// origin is allow-listed — a single stable URL to allow-list
// instead of every possible `next` destination.
// ============================================================

import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

function safeNext(next: string | null): string {
  // Only allow same-origin relative paths — never redirect off-site
  // based on a query param an attacker could craft.
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard";
  }
  return next;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"));

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/login?error=confirm_failed", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    console.error("[GET /auth/confirm] verifyOtp error:", error);
    return NextResponse.redirect(new URL("/login?error=confirm_failed", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
