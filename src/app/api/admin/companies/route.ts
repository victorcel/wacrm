// ============================================================
// /api/admin/companies   (platform super-admin only)
//
//   GET  — list every company (account) with its owner, member
//          count, and subscription state.
//   POST — onboard a new company: invite the owner by email
//          (Supabase sends the email — same mechanism the public
//          signup used), then name the account, activate the plan
//          to the chosen "paid-until" date, and optionally record
//          the first manual payment.
//
// All access goes through `requirePlatformAdmin()` + the service-
// role client (`ctx.admin`), which bypasses RLS so a platform
// operator can read/write across every account.
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

function baseUrl(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

export async function GET() {
  try {
    const { admin } = await requirePlatformAdmin();

    const [accountsRes, subsRes, profilesRes, adminsRes] = await Promise.all([
      admin
        .from("accounts")
        .select("id, name, created_at")
        .order("created_at", { ascending: false }),
      admin
        .from("account_subscriptions")
        .select(
          "account_id, status, current_period_end, plan:subscription_plans(key, name)",
        ),
      admin.from("profiles").select("account_id, user_id, email, account_role"),
      admin.from("platform_admins").select("user_id"),
    ]);

    if (accountsRes.error) {
      console.error("[GET /api/admin/companies] accounts error:", accountsRes.error);
      return NextResponse.json({ error: "Failed to load companies" }, { status: 500 });
    }

    const platformAdminIds = new Set(
      (adminsRes.data ?? []).map((r) => r.user_id),
    );

    type SubRow = NonNullable<typeof subsRes.data>[number];
    const subsByAccount = new Map<string, SubRow>();
    for (const s of subsRes.data ?? []) subsByAccount.set(s.account_id, s);

    const memberCount = new Map<string, number>();
    const ownerEmail = new Map<string, string>();
    const ownerUserId = new Map<string, string>();
    for (const p of profilesRes.data ?? []) {
      if (!p.account_id) continue;
      memberCount.set(p.account_id, (memberCount.get(p.account_id) ?? 0) + 1);
      if (p.account_role === "owner") {
        if (p.email) ownerEmail.set(p.account_id, p.email);
        if (p.user_id) ownerUserId.set(p.account_id, p.user_id);
      }
    }

    const companies = (accountsRes.data ?? []).map((a) => {
      const sub = subsByAccount.get(a.id);
      const planRow = Array.isArray(sub?.plan) ? sub?.plan[0] : sub?.plan;
      const ownerId = ownerUserId.get(a.id);
      return {
        id: a.id,
        name: a.name,
        createdAt: a.created_at,
        ownerEmail: ownerEmail.get(a.id) ?? null,
        memberCount: memberCount.get(a.id) ?? 0,
        isSuperAdminAccount: ownerId ? platformAdminIds.has(ownerId) : false,
        subscription: sub
          ? {
              status: sub.status,
              currentPeriodEnd: sub.current_period_end ?? null,
              planKey: planRow?.key ?? null,
              planName: planRow?.name ?? null,
            }
          : null,
      };
    });

    return NextResponse.json({ companies });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    const admin = ctx.admin;

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const companyName = asString(body?.companyName);
    const ownerEmail = asString(body?.ownerEmail);
    const ownerName = asString(body?.ownerName) ?? "";
    const planId = asString(body?.planId);
    const paidUntil = asString(body?.paidUntil); // ISO date/timestamp

    if (!companyName || !ownerEmail || !planId || !paidUntil) {
      return NextResponse.json(
        {
          error:
            "companyName, ownerEmail, planId y paidUntil son obligatorios",
        },
        { status: 400 },
      );
    }

    const { data: plan, error: planErr } = await admin
      .from("subscription_plans")
      .select("id, currency")
      .eq("id", planId)
      .maybeSingle();
    if (planErr || !plan) {
      return NextResponse.json({ error: "Plan no encontrado" }, { status: 400 });
    }

    // Invite the owner. Supabase creates the auth user (which fires
    // handle_new_user → account + profile + inactive subscription)
    // AND sends the invitation email with a set-password link.
    const { data: invited, error: inviteErr } =
      await admin.auth.admin.inviteUserByEmail(ownerEmail, {
        data: { full_name: ownerName },
        redirectTo: `${baseUrl(request)}/login`,
      });

    if (inviteErr || !invited?.user) {
      console.error("[POST /api/admin/companies] invite error:", inviteErr);
      return NextResponse.json(
        { error: inviteErr?.message ?? "No se pudo invitar al usuario" },
        { status: 400 },
      );
    }

    const userId = invited.user.id;

    // The trigger created the account synchronously; look it up.
    const { data: profile } = await admin
      .from("profiles")
      .select("account_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile?.account_id) {
      console.error("[POST /api/admin/companies] account not bootstrapped for", userId);
      return NextResponse.json(
        { error: "La cuenta no se creó correctamente; revisa los logs" },
        { status: 500 },
      );
    }
    const accountId = profile.account_id;

    await admin.from("accounts").update({ name: companyName }).eq("id", accountId);

    const periodStart = new Date().toISOString();
    const { error: subErr } = await admin
      .from("account_subscriptions")
      .upsert(
        {
          account_id: accountId,
          plan_id: planId,
          status: "active",
          current_period_start: periodStart,
          current_period_end: paidUntil,
          activated_by: ctx.userId,
          provider: "manual",
        },
        { onConflict: "account_id" },
      );
    if (subErr) {
      console.error("[POST /api/admin/companies] subscription error:", subErr);
      return NextResponse.json(
        { error: "Empresa creada pero falló la activación del plan" },
        { status: 500 },
      );
    }

    // Optional first payment.
    const amount = asNumber(body?.amount);
    if (amount !== null) {
      await admin.from("subscription_payments").insert({
        account_id: accountId,
        plan_id: planId,
        amount,
        currency: asString(body?.currency) ?? plan.currency,
        method: asString(body?.method),
        paid_at: periodStart,
        period_start: periodStart,
        period_end: paidUntil,
        note: asString(body?.note),
        recorded_by: ctx.userId,
      });
    }

    return NextResponse.json({ ok: true, accountId }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
