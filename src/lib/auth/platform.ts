// ============================================================
// Platform super-admin context — for the /admin area and its API
// routes. A platform admin operates the SaaS itself (creating
// companies, activating subscriptions, recording payments) rather
// than belonging to a single customer account.
//
// Server-only: imports the Supabase SSR client (cookies) and the
// service-role admin client. Never import from a client component.
//
// Calling convention (mirrors lib/auth/account.ts):
//
//   try {
//     const ctx = await requirePlatformAdmin();
//     // ctx.supabase — SSR client (RLS scoped to the caller)
//     // ctx.admin    — service-role client (bypasses RLS)
//     // ctx.userId   — auth.uid()
//   } catch (err) {
//     return toErrorResponse(err);
//   }
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { UnauthorizedError, ForbiddenError } from "./account";

export interface PlatformAdminContext {
  /** SSR client, RLS scoped to the calling user. */
  supabase: SupabaseClient;
  /** Service-role client — bypasses RLS for cross-account admin ops. */
  admin: SupabaseClient;
  /** `auth.uid()` for the caller. */
  userId: string;
}

/**
 * Non-throwing check: is this user a platform super-admin? Used by
 * the dashboard gate (to let admins bypass) and to guard /admin.
 *
 * Reads through the SERVICE-ROLE client on purpose: platform-admin
 * status is the source of truth for cross-account access, so it must
 * not depend on the caller's RLS context (which could hide the row
 * and silently lock a real admin out). Server-only — never call from
 * a client component.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[isPlatformAdmin] lookup error:", error);
    return false;
  }
  return !!data;
}

/**
 * Resolve the caller and assert they are a platform super-admin.
 *
 * Throws `UnauthorizedError` when there's no session, `ForbiddenError`
 * when the user isn't a platform admin.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new UnauthorizedError();
  }

  if (!(await isPlatformAdmin(user.id))) {
    throw new ForbiddenError("Platform admin access required");
  }

  return { supabase, admin: supabaseAdmin(), userId: user.id };
}
