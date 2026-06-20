// ============================================================
// PATCH /api/admin/companies/[accountId]/subscription
//
// Platform super-admin only. Adjust a company's subscription:
// activate / suspend, change plan, or extend / clear the
// "paid-until" date. Any subset of fields may be sent.
//
//   { planId?, status?, currentPeriodEnd? }
//
// `currentPeriodEnd` may be an ISO string or null (never expires).
// ============================================================

import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/auth/platform";

const VALID_STATUSES = [
  "active",
  "trialing",
  "suspended",
  "expired",
  "inactive",
] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const ctx = await requirePlatformAdmin();
    const { accountId } = await params;

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const update: Record<string, unknown> = { activated_by: ctx.userId };

    if (typeof body?.planId === "string" && body.planId.trim() !== "") {
      update.plan_id = body.planId;
    }
    if (typeof body?.status === "string") {
      if (!(VALID_STATUSES as readonly string[]).includes(body.status)) {
        return NextResponse.json({ error: "status inválido" }, { status: 400 });
      }
      update.status = body.status;
    }
    if (body && "currentPeriodEnd" in body) {
      const v = body.currentPeriodEnd;
      update.current_period_end =
        v === null ? null : typeof v === "string" ? v : undefined;
    }

    // upsert so a missing subscription row (edge case) is created
    // rather than silently updating nothing.
    const { error } = await ctx.admin
      .from("account_subscriptions")
      .upsert(
        { account_id: accountId, ...update },
        { onConflict: "account_id" },
      );

    if (error) {
      console.error(
        "[PATCH /api/admin/companies/[accountId]/subscription] error:",
        error,
      );
      return NextResponse.json(
        { error: "No se pudo actualizar la suscripción" },
        { status: 500 },
      );
    }

    // When suspending, immediately revoke all active sessions for every
    // member of this account. This prevents users from continuing to
    // operate while their subscription is inactive — their current page
    // will keep working until they navigate or refresh, at which point
    // the expired session forces a redirect to /suspended.
    if (update.status === "suspended") {
      const { error: revokeErr } = await ctx.admin.rpc(
        "revoke_account_sessions",
        { p_account_id: accountId },
      );
      if (revokeErr) {
        // Non-fatal: the subscription is already suspended. Log the
        // error but return 200 — the gate will block access anyway.
        console.error(
          "[PATCH subscription] session revocation failed:",
          revokeErr,
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
