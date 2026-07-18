// ============================================================
// POST /api/admin/members/[userId]/reassign   (platform super-admin only)
//
//   { targetAccountId: string | null, role?: AccountRole }
//
// targetAccountId = null → "release" the user to a brand-new
// personal account (role is ignored in that case).
// targetAccountId = <id> → move the user into that company with
// the given role (must not be 'owner' — use the existing
// /api/account/transfer-ownership flow for ownership changes).
// ============================================================

import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { isAccountRole } from "@/lib/auth/roles";

function rpcErrorToResponse(err: PostgrestError): NextResponse {
  if (err.code === "42501") {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err.code === "22023") {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error("[members/:id/reassign] unexpected RPC error:", err);
  return NextResponse.json({ error: "No se pudo mover al miembro" }, { status: 500 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const ctx = await requirePlatformAdmin();
    const { userId } = await params;

    const body = (await request.json().catch(() => null)) as
      | { targetAccountId?: unknown; role?: unknown }
      | null;

    const targetAccountId =
      body?.targetAccountId === null
        ? null
        : typeof body?.targetAccountId === "string" && body.targetAccountId.trim() !== ""
          ? body.targetAccountId
          : undefined;

    if (targetAccountId === undefined) {
      return NextResponse.json(
        { error: "'targetAccountId' es obligatorio (usa null para liberar)" },
        { status: 400 },
      );
    }

    let role: string | null = null;
    if (targetAccountId !== null) {
      if (!isAccountRole(body?.role) || body?.role === "owner") {
        return NextResponse.json(
          { error: "'role' debe ser admin, agent o viewer cuando se mueve a una empresa" },
          { status: 400 },
        );
      }
      role = body.role;
    }

    const { data, error } = await ctx.admin.rpc("platform_reassign_member", {
      p_user_id: userId,
      p_target_account_id: targetAccountId,
      p_new_role: role,
    });

    if (error) return rpcErrorToResponse(error);

    return NextResponse.json({ ok: true, accountId: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
