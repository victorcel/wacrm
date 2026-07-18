// ============================================================
// GET /api/admin/companies/[accountId]/members   (platform super-admin only)
//
// Cross-account member listing for the /admin "Miembros" dialog.
// Unlike /api/account/members (self-service, scoped to the caller's
// own account via RLS), this reads through the service-role client
// so a platform admin can see any company's roster.
// ============================================================

import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/auth/platform";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const ctx = await requirePlatformAdmin();
    const { accountId } = await params;

    const { data, error } = await ctx.admin
      .from("profiles")
      .select("user_id, full_name, email, account_role, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /api/admin/companies/:id/members] error:", error);
      return NextResponse.json(
        { error: "No se pudieron cargar los miembros" },
        { status: 500 },
      );
    }

    const members = (data ?? []).map((row) => ({
      user_id: row.user_id,
      full_name: row.full_name ?? "",
      email: row.email,
      role: row.account_role,
      joined_at: row.created_at,
    }));

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}
