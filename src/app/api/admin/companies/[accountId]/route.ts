// ============================================================
// /api/admin/companies/[accountId]   (platform super-admin only)
//
//   PATCH  — rename a company.
//   DELETE — delete an empty company (0 or 1 member — the RPC
//            releases the sole remaining member to their own
//            personal account first). Rejects if 2+ members.
// ============================================================

import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/auth/platform";

function rpcErrorToResponse(err: PostgrestError): NextResponse {
  if (err.code === "42501") {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err.code === "22023") {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error("[admin companies/:id] unexpected RPC error:", err);
  return NextResponse.json({ error: "Operación fallida" }, { status: 500 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const ctx = await requirePlatformAdmin();
    const { accountId } = await params;

    const body = (await request.json().catch(() => null)) as
      | { name?: unknown }
      | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json(
        { error: "El nombre de la empresa es obligatorio" },
        { status: 400 },
      );
    }

    const { error } = await ctx.admin
      .from("accounts")
      .update({ name })
      .eq("id", accountId);

    if (error) {
      console.error("[PATCH /api/admin/companies/:id] error:", error);
      return NextResponse.json(
        { error: "No se pudo renombrar la empresa" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const ctx = await requirePlatformAdmin();
    const { accountId } = await params;

    const { data, error } = await ctx.admin.rpc("platform_delete_account", {
      p_account_id: accountId,
    });

    if (error) return rpcErrorToResponse(error);

    return NextResponse.json({ ok: true, releasedOwnerAccountId: data ?? null });
  } catch (err) {
    return toErrorResponse(err);
  }
}
