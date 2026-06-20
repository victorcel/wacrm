// ============================================================
// /api/admin/companies/[accountId]/payments
//
// Platform super-admin only.
//
//   GET  — list all payments for a company (newest first).
//   POST — record a manual payment and roll the subscription
//          forward: the payment's `periodEnd` becomes the new
//          "paid-until" date and the subscription is (re)activated.
//
//          POST body: { amount, periodEnd, currency?, method?, note?, planId? }
// ============================================================

import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/auth/platform";

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { admin } = await requirePlatformAdmin();
    const { accountId } = await params;

    const { data, error } = await admin
      .from("subscription_payments")
      .select(
        "id, amount, currency, method, paid_at, period_start, period_end, note, created_at, plan:subscription_plans(name)",
      )
      .eq("account_id", accountId)
      .order("paid_at", { ascending: false });

    if (error) {
      console.error("[GET .../payments] error:", error);
      return NextResponse.json({ error: "Failed to load payments" }, { status: 500 });
    }

    const payments = (data ?? []).map((p) => {
      const planRow = Array.isArray(p.plan) ? p.plan[0] : p.plan;
      return {
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        method: p.method,
        paidAt: p.paid_at,
        periodStart: p.period_start,
        periodEnd: p.period_end,
        note: p.note,
        createdAt: p.created_at,
        planName: planRow?.name ?? null,
      };
    });

    return NextResponse.json({ payments });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const ctx = await requirePlatformAdmin();
    const admin = ctx.admin;
    const { accountId } = await params;

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const amount = asNumber(body?.amount);
    const periodEnd = asString(body?.periodEnd);
    if (amount === null || !periodEnd) {
      return NextResponse.json(
        { error: "amount y periodEnd son obligatorios" },
        { status: 400 },
      );
    }

    const { data: sub } = await admin
      .from("account_subscriptions")
      .select("plan_id, current_period_start")
      .eq("account_id", accountId)
      .maybeSingle();

    const planId = asString(body?.planId) ?? sub?.plan_id ?? null;
    const currency = asString(body?.currency) ?? "USD";
    const now = new Date().toISOString();
    const periodStart = sub?.current_period_start ?? now;

    const { error: payErr } = await admin.from("subscription_payments").insert({
      account_id: accountId,
      plan_id: planId,
      amount,
      currency,
      method: asString(body?.method),
      paid_at: now,
      period_start: periodStart,
      period_end: periodEnd,
      note: asString(body?.note),
      recorded_by: ctx.userId,
    });
    if (payErr) {
      console.error("[POST .../payments] insert error:", payErr);
      return NextResponse.json(
        { error: "No se pudo registrar el pago" },
        { status: 500 },
      );
    }

    const { error: subErr } = await admin.from("account_subscriptions").upsert(
      {
        account_id: accountId,
        plan_id: planId,
        status: "active",
        current_period_start: periodStart,
        current_period_end: periodEnd,
        activated_by: ctx.userId,
        provider: "manual",
      },
      { onConflict: "account_id" },
    );
    if (subErr) {
      console.error("[POST .../payments] subscription error:", subErr);
      return NextResponse.json(
        { error: "Pago registrado pero falló la extensión del periodo" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
