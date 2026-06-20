// ============================================================
// /api/admin/plans   (platform super-admin only)
//
//   GET   — list every plan (including inactive/comp), for the
//           admin UI plan picker and plan management.
//   POST  — create a plan.
//   PATCH — update a plan (id in body).
//
// Limits use null = unlimited. `features` is a JSON flag map.
// ============================================================

import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformAdmin } from "@/lib/auth/platform";

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function asNullableInt(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (v === undefined) return undefined;
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isInteger(Number(v))) {
    return Number(v);
  }
  return undefined;
}

export async function GET() {
  try {
    const { admin } = await requirePlatformAdmin();
    const { data, error } = await admin
      .from("subscription_plans")
      .select(
        "id, key, name, price_amount, currency, max_seats, max_broadcasts_per_month, features, is_active, sort_order",
      )
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[GET /api/admin/plans] error:", error);
      return NextResponse.json({ error: "Failed to load plans" }, { status: 500 });
    }
    return NextResponse.json({ plans: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { admin } = await requirePlatformAdmin();
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const key = asString(body?.key);
    const name = asString(body?.name);
    if (!key || !name) {
      return NextResponse.json(
        { error: "key y name son obligatorios" },
        { status: 400 },
      );
    }

    const { data, error } = await admin
      .from("subscription_plans")
      .insert({
        key,
        name,
        price_amount: typeof body?.priceAmount === "number" ? body.priceAmount : 0,
        currency: asString(body?.currency) ?? "USD",
        max_seats: asNullableInt(body?.maxSeats) ?? null,
        max_broadcasts_per_month: asNullableInt(body?.maxBroadcastsPerMonth) ?? null,
        features:
          body?.features && typeof body.features === "object"
            ? body.features
            : {},
        is_active: body?.isActive !== false,
        sort_order: typeof body?.sortOrder === "number" ? body.sortOrder : 0,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[POST /api/admin/plans] error:", error);
      return NextResponse.json(
        { error: error?.message ?? "No se pudo crear el plan" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const { admin } = await requirePlatformAdmin();
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const id = asString(body?.id);
    if (!id) {
      return NextResponse.json({ error: "id es obligatorio" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (asString(body?.name)) update.name = asString(body?.name);
    if (typeof body?.priceAmount === "number") update.price_amount = body.priceAmount;
    if (asString(body?.currency)) update.currency = asString(body?.currency);
    const seats = asNullableInt(body?.maxSeats);
    if (seats !== undefined) update.max_seats = seats;
    const bc = asNullableInt(body?.maxBroadcastsPerMonth);
    if (bc !== undefined) update.max_broadcasts_per_month = bc;
    if (body?.features && typeof body.features === "object")
      update.features = body.features;
    if (typeof body?.isActive === "boolean") update.is_active = body.isActive;
    if (typeof body?.sortOrder === "number") update.sort_order = body.sortOrder;

    const { error } = await admin
      .from("subscription_plans")
      .update(update)
      .eq("id", id);

    if (error) {
      console.error("[PATCH /api/admin/plans] error:", error);
      return NextResponse.json(
        { error: "No se pudo actualizar el plan" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
