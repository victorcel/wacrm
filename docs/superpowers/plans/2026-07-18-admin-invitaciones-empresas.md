# Fix de invitaciones + gestión de empresas en /admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bug where an invited member ends up owning a brand-new personal company instead of joining the inviter's company, and give the platform super-admin (`/admin`) the ability to edit a company's name, reassign/release a member between companies, and delete an empty company.

**Architecture:** The invitation-join bug is fixed with a new server-side `/auth/confirm` Route Handler that exchanges Supabase's email confirmation token for a session before redirecting to `/join/<token>` — the current code redirects straight to `/join/<token>` and relies on Supabase's `emailRedirectTo` being honored, which fails silently when the URL isn't in Supabase's Redirect URLs allow-list. The admin features are new SECURITY DEFINER Postgres RPCs (mirroring the existing `018_account_member_rpcs.sql` pattern) exposed through new `/api/admin/*` routes protected by `requirePlatformAdmin()`, with new dialogs in the existing `/admin` company table.

**Tech Stack:** Next.js App Router (Route Handlers), Supabase (Postgres + Auth + `@supabase/ssr`), TypeScript, Vitest.

## Global Constraints

- All new API routes under `/api/admin/*` MUST call `requirePlatformAdmin()` from `src/lib/auth/platform.ts` and wrap the body in `try { ... } catch (err) { return toErrorResponse(err); }` — this is the existing pattern in every `/api/admin/*` route in this repo.
- All new SQL goes in a single new migration file `supabase/migrations/041_platform_member_reassign.sql` — migration numbers must not collide (040 is the latest existing one; verify with `ls supabase/migrations/ | sort | tail -3` before creating the file, since a prior migration in this repo was misnumbered once and had to be renamed).
- New RPCs are `SECURITY DEFINER`, `SET search_path = public`, owned by `postgres`, `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE ... TO authenticated` — copy this boilerplate from `018_account_member_rpcs.sql` exactly.
- Error contract for new RPCs: SQLSTATE `42501` (insufficient_privilege) → HTTP 403, SQLSTATE `22023` (invalid_parameter_value) → HTTP 400 — same mapping as `rpcErrorToResponse` in `src/app/api/account/members/[userId]/route.ts`.
- UI strings are in Spanish, matching every existing string in `src/app/(dashboard)/admin/*`.
- Do not modify `src/app/api/admin/companies/route.ts` (company creation) — confirmed working, out of scope.

---

## File Structure

New files:
- `supabase/migrations/041_platform_member_reassign.sql` — `platform_reassign_member`, `platform_delete_account` RPCs.
- `src/app/auth/confirm/route.ts` — email confirmation exchange Route Handler.
- `src/app/api/admin/companies/[accountId]/route.ts` — `PATCH` (rename) + `DELETE` (delete empty company).
- `src/app/api/admin/companies/[accountId]/members/route.ts` — `GET` list members of one company (super-admin, cross-account).
- `src/app/api/admin/members/[userId]/reassign/route.ts` — `POST` reassign/release a member.
- `src/app/(dashboard)/admin/edit-company-dialog.tsx` — rename dialog.
- `src/app/(dashboard)/admin/company-members-dialog.tsx` — members list + reassign/release UI for one company.

Modified files:
- `src/app/(auth)/signup/page.tsx` — `emailRedirectTo` now points at `/auth/confirm?next=...` instead of directly at `/join/<token>` or the default.
- `src/app/(dashboard)/admin/admin-dashboard.tsx` — add "Editar", "Miembros", "Eliminar" buttons + wire the two new dialogs.

---

## Task 1: `platform_reassign_member` RPC

**Files:**
- Create: `supabase/migrations/041_platform_member_reassign.sql`

**Interfaces:**
- Produces: SQL function `public.platform_reassign_member(p_user_id UUID, p_target_account_id UUID, p_new_role account_role_enum) RETURNS UUID` — returns the account_id the user ends up in. Callable via `ctx.admin.rpc("platform_reassign_member", { p_user_id, p_target_account_id, p_new_role })`.

- [ ] **Step 1: Confirm migration number is free**

Run: `ls supabase/migrations/ | sort | tail -3`
Expected: highest file is `040_conversation_contact_dedup.sql` — confirms `041` is free.

- [ ] **Step 2: Write the migration file**

```sql
-- ============================================================
-- 041_platform_member_reassign.sql — platform super-admin RPCs
-- for moving a member between companies, releasing them to their
-- own account, and deleting an emptied-out company.
--
-- Mirrors the SECURITY DEFINER pattern from 018_account_member_rpcs.sql
-- (set_member_role / remove_account_member / transfer_account_ownership),
-- but scoped to `platform_admins` instead of "caller's own account" —
-- these are cross-account operations only the platform super-admin
-- panel (/admin) may perform.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- platform_reassign_member(p_user_id, p_target_account_id, p_new_role)
--
-- Moves a member to a different company, or "releases" them to a
-- fresh personal account of their own (p_target_account_id = NULL).
--
--   - p_target_account_id IS NULL:
--       Same effect as remove_account_member (018): create a new
--       personal account, make the user its owner. p_new_role is
--       ignored in this branch (always 'owner').
--   - p_target_account_id IS NOT NULL:
--       Move the user's profile into that account with p_new_role.
--       Rejects p_new_role = 'owner' — use transfer_account_ownership
--       for ownership changes (same rule as set_member_role in 018).
--       Rejects moving the CURRENT owner of their account without
--       transferring ownership first, so an account is never left
--       with zero owners.
--
-- Refusal codes (SQLSTATE):
--   42501 — caller is not a platform admin
--   22023 — bad input (unknown target account, invalid role, owner
--           move without transfer, user not found)
-- ============================================================
CREATE OR REPLACE FUNCTION public.platform_reassign_member(
  p_user_id UUID,
  p_target_account_id UUID,
  p_new_role account_role_enum
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_current_account UUID;
  v_target_current_role account_role_enum;
  v_target_name TEXT;
  v_target_email TEXT;
  v_dest_exists BOOLEAN;
  v_new_account_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Platform admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role, full_name, email
  INTO v_target_current_account, v_target_current_role, v_target_name, v_target_email
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_current_account IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  -- Release branch: give the user a fresh personal account.
  IF p_target_account_id IS NULL THEN
    INSERT INTO accounts (name, owner_user_id)
    VALUES (
      COALESCE(NULLIF(v_target_name, ''), v_target_email, 'My account'),
      p_user_id
    )
    RETURNING id INTO v_new_account_id;

    UPDATE profiles
    SET account_id = v_new_account_id,
        account_role = 'owner'
    WHERE user_id = p_user_id;

    RETURN v_new_account_id;
  END IF;

  -- Move branch: target account must exist.
  SELECT EXISTS (
    SELECT 1 FROM accounts WHERE id = p_target_account_id
  ) INTO v_dest_exists;
  IF NOT v_dest_exists THEN
    RAISE EXCEPTION 'Target account not found' USING ERRCODE = '22023';
  END IF;

  IF p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership to make a user an owner'
      USING ERRCODE = '22023';
  END IF;

  IF v_target_current_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot move an account owner directly; transfer ownership first'
      USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
  SET account_id = p_target_account_id,
      account_role = p_new_role
  WHERE user_id = p_user_id;

  RETURN p_target_account_id;
END;
$$;

ALTER FUNCTION public.platform_reassign_member(UUID, UUID, account_role_enum) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.platform_reassign_member(UUID, UUID, account_role_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_reassign_member(UUID, UUID, account_role_enum) TO authenticated;
```

- [ ] **Step 3: Apply the migration to the linked project**

Run: `npx supabase db push`
Expected: output lists `041_platform_member_reassign.sql` as applied, no errors.

- [ ] **Step 4: Manual verification query**

Run this against the Supabase SQL editor (or `psql`) to confirm the function exists with the right signature:
```sql
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE proname = 'platform_reassign_member';
```
Expected: one row, `platform_reassign_member | p_user_id uuid, p_target_account_id uuid, p_new_role account_role_enum`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/041_platform_member_reassign.sql
git commit -m "feat: add platform_reassign_member RPC for cross-account member moves"
```

---

## Task 2: `platform_delete_account` RPC

**Files:**
- Modify: `supabase/migrations/041_platform_member_reassign.sql` (append to the file created in Task 1)

**Interfaces:**
- Consumes: nothing from Task 1 at the SQL level (independent function), but lives in the same migration file.
- Produces: SQL function `public.platform_delete_account(p_account_id UUID) RETURNS UUID` — returns the id of the released owner's new personal account, or `NULL` if the account had no members left to release. Callable via `ctx.admin.rpc("platform_delete_account", { p_account_id })`.

- [ ] **Step 1: Append the function to the migration file**

Add this block at the end of `supabase/migrations/041_platform_member_reassign.sql`:

```sql
-- ============================================================
-- platform_delete_account(p_account_id)
--
-- Deletes a company. Refuses if the account has more than one
-- member (the caller must reassign/release the extra members via
-- platform_reassign_member first — this avoids accidentally
-- stranding a team). If exactly one member remains (necessarily
-- the owner, since every account always has exactly one owner),
-- that member is released to a fresh personal account first (same
-- logic as platform_reassign_member's release branch) so no
-- profile is ever left pointing at a deleted account_id, then the
-- now-empty account is deleted.
--
-- Refusal codes (SQLSTATE):
--   42501 — caller is not a platform admin
--   22023 — account not found, or has 2+ members
-- ============================================================
CREATE OR REPLACE FUNCTION public.platform_delete_account(
  p_account_id UUID
) RETURNS UUID  -- released owner's new personal account id, or NULL
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_count INT;
  v_sole_member_user_id UUID;
  v_released_account_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Platform admin access required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM profiles WHERE account_id = p_account_id;

  IF v_member_count > 1 THEN
    RAISE EXCEPTION 'Account has % members; reassign or release them before deleting', v_member_count
      USING ERRCODE = '22023';
  END IF;

  IF v_member_count = 1 THEN
    SELECT user_id INTO v_sole_member_user_id
    FROM profiles WHERE account_id = p_account_id;

    v_released_account_id := platform_reassign_member(v_sole_member_user_id, NULL, NULL);
  END IF;

  DELETE FROM accounts WHERE id = p_account_id;

  RETURN v_released_account_id;
END;
$$;

ALTER FUNCTION public.platform_delete_account(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.platform_delete_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_delete_account(UUID) TO authenticated;
```

- [ ] **Step 2: Re-apply the migration**

Run: `npx supabase db push`
Expected: no errors (the file already has one migration entry — `db push` applies the whole file's remaining un-applied statements, or re-runs cleanly since every statement is `CREATE OR REPLACE` / idempotent).

- [ ] **Step 3: Manual verification query**

```sql
SELECT proname FROM pg_proc WHERE proname = 'platform_delete_account';
```
Expected: one row returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/041_platform_member_reassign.sql
git commit -m "feat: add platform_delete_account RPC for deleting empty companies"
```

---

## Task 3: `/auth/confirm` Route Handler (email confirmation fix)

**Files:**
- Create: `src/app/auth/confirm/route.ts`
- Test: manual (Route Handlers in this repo have no existing test harness — see Task 3 Step 4 for the manual verification procedure).

**Interfaces:**
- Consumes: `@/lib/supabase/server` → `createClient()` (async, returns a Supabase SSR client bound to cookies — see `src/lib/supabase/server.ts:4`).
- Produces: `GET /auth/confirm?token_hash=...&type=...&next=...` — on success, sets the session cookies and redirects (302) to `next` (defaults to `/dashboard` if absent or not a same-origin relative path). On failure, redirects to `/login?error=confirm_failed`.

- [ ] **Step 1: Write the Route Handler**

```typescript
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
```

- [ ] **Step 2: Verify it builds**

Run: `npx tsc --noEmit`
Expected: no new type errors referencing `src/app/auth/confirm/route.ts`.

- [ ] **Step 3: Start the dev server**

Run: `npm run dev`
Expected: server starts without error; `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/auth/confirm"` returns `307` or `302` (redirect to `/login?error=confirm_failed`, since no `token_hash`/`type` were passed).

- [ ] **Step 4: Manual end-to-end verification (requires Task 5's Supabase config change to be live)**

1. In Settings → Miembros, create an invite link.
2. Open the link in an incognito window, click "Crear cuenta y unirse", sign up with a real, reachable test email.
3. Open the confirmation email — the link should now be of the form `https://<your-domain>/auth/confirm?token_hash=...&type=signup&next=%2Fjoin%2F<token>`.
4. Click it. Expected: lands on `/join/<token>` already signed in, showing "Aceptar invitación" (not the signed-out signup/login prompt).
5. Click "Aceptar invitación". Expected: toast "Bienvenido al equipo", redirect to `/dashboard`, and the account settings show the user as a member of the inviting company (not a new company of their own).

- [ ] **Step 5: Commit**

```bash
git add src/app/auth/confirm/route.ts
git commit -m "feat: add /auth/confirm route to exchange email tokens server-side"
```

---

## Task 4: Point `emailRedirectTo` at `/auth/confirm`

**Files:**
- Modify: `src/app/(auth)/signup/page.tsx:64-70`

**Interfaces:**
- Consumes: `/auth/confirm` route from Task 3 (must exist before this task is meaningful, though the change compiles independently).

- [ ] **Step 1: Update the `emailRedirectTo` construction**

In `src/app/(auth)/signup/page.tsx`, replace lines 64-70:

```typescript
    // If we have an invite token, point Supabase's verification
    // email back at the join page so the user can accept after
    // verifying. Without a token, Supabase uses its default
    // redirect (the app root).
    const emailRedirectTo = inviteToken
      ? `${window.location.origin}/join/${encodeURIComponent(inviteToken)}`
      : undefined;
```

with:

```typescript
    // Point Supabase's confirmation email at /auth/confirm, which
    // exchanges the token for a session server-side and then
    // forwards to `next` — /join/<token> when this signup came from
    // an invite link, /dashboard otherwise. Going through
    // /auth/confirm (a single stable URL) instead of the final
    // destination directly means only this one path needs to be on
    // Supabase's Redirect URLs allow-list, regardless of invite
    // token or destination.
    const next = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : "/dashboard";
    const emailRedirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`;
```

- [ ] **Step 2: Verify the call site still passes it through unconditionally**

Read `src/app/(auth)/signup/page.tsx` around line 79 (`...(emailRedirectTo ? { emailRedirectTo } : {})`) — since `emailRedirectTo` is now always a string (never `undefined`), simplify:

Replace:
```typescript
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
```
with:
```typescript
        emailRedirectTo,
```

- [ ] **Step 3: Verify it builds**

Run: `npx tsc --noEmit`
Expected: no new type errors in `src/app/(auth)/signup/page.tsx`.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, open `http://localhost:3000/signup?invite=test-token`, open browser devtools → Network, submit the signup form with a throwaway email, inspect the `POST` to Supabase's `/auth/v1/signup` — confirm the request body's `options.emailRedirectTo` (or top-level `redirect_to`, depending on SDK version) is `http://localhost:3000/auth/confirm?next=%2Fjoin%2Ftest-token`.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(auth\)/signup/page.tsx
git commit -m "fix: route signup email confirmation through /auth/confirm"
```

---

## Task 5: Supabase Auth URL configuration (manual, no code)

**Files:** none — dashboard configuration only.

- [ ] **Step 1: Open Supabase project settings**

Go to `https://supabase.com/dashboard/project/uuqgwnkaiwgztvaxytjj/auth/url-configuration` (Authentication → URL Configuration).

- [ ] **Step 2: Set the Site URL**

Set **Site URL** to your production domain (e.g. `https://<your-production-domain>`), replacing whatever is currently set to `http://localhost:3000`.

- [ ] **Step 3: Add Redirect URLs**

In **Redirect URLs**, add (each on its own line):
```
https://<your-production-domain>/auth/confirm
https://<your-production-domain>/**
http://localhost:3000/auth/confirm
http://localhost:3000/**
```
The `localhost` entries keep local development working; the wildcard entries cover `/auth/confirm`, `/join/*`, and every other route in case any other flow adds a new redirect target later.

- [ ] **Step 4: Save and verify**

Click Save. Re-run the `generate_link` reproduction to confirm the fix (this mirrors the diagnostic script used during investigation — run from the repo root with `.env.local` populated):

```bash
node --input-type=module -e '
import { readFileSync } from "node:fs";
const env = readFileSync(".env.local", "utf8");
const get = (k) => (env.match(new RegExp("^"+k+"=(.*)$","m"))||[])[1]?.trim().replace(/^["\x27]|["\x27]$/g,"");
const BASE = get("NEXT_PUBLIC_SUPABASE_URL"), SERVICE = get("SUPABASE_SERVICE_ROLE_KEY");
const svc = { apikey: SERVICE, Authorization: "Bearer "+SERVICE, "Content-Type": "application/json" };
const redirect = "https://<your-production-domain>/auth/confirm?next=%2Fjoin%2Ftest-token";
const r = await fetch(BASE+"/auth/v1/admin/generate_link", {
  method: "POST", headers: svc,
  body: JSON.stringify({ type: "magiclink", email: "someone-not-created@example.com", options: { redirect_to: redirect } }),
});
const body = await r.json();
console.log("status:", r.status);
console.log("action_link redirect_to preserved?", (body.action_link||"").includes(encodeURIComponent(redirect).slice(0,20)) || (body.action_link||"").includes("auth/confirm"));
console.log(body.action_link);
'
```
Expected: `action_link` now contains `redirect_to=https%3A%2F%2F<your-production-domain>%2Fauth%2Fconfirm...` instead of collapsing to `http://localhost:3000`.

- [ ] **Step 5: No commit** — this task changes no repo files. Note the change in the team channel / handoff doc instead.

---

## Task 6: `PATCH` and `DELETE /api/admin/companies/[accountId]`

**Files:**
- Create: `src/app/api/admin/companies/[accountId]/route.ts`

**Interfaces:**
- Consumes: `requirePlatformAdmin()` from `src/lib/auth/platform.ts` (returns `{ supabase, admin, userId }`); `toErrorResponse` from `src/lib/auth/account.ts`; RPC `platform_delete_account` from Task 2.
- Produces: `PATCH /api/admin/companies/[accountId]` body `{ name: string }` → `{ ok: true }`. `DELETE /api/admin/companies/[accountId]` → `{ ok: true, releasedOwnerAccountId: string | null }`.

- [ ] **Step 1: Write the route**

```typescript
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
```

- [ ] **Step 2: Verify it builds**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Manual test — rename**

With a logged-in platform-admin session (browser devtools → copy the `PATCH` request from the eventual UI, or use `curl` with the browser's session cookie):
```bash
curl -X PATCH "http://localhost:3000/api/admin/companies/<accountId>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <paste session cookie>" \
  -d '{"name":"Nuevo nombre de prueba"}'
```
Expected: `{"ok":true}`, and the company table (once Task 8 wires the UI) reflects the new name.

- [ ] **Step 4: Manual test — delete with 2+ members should fail**

Pick a company with 2+ members via `GET /api/admin/companies`, then:
```bash
curl -X DELETE "http://localhost:3000/api/admin/companies/<accountId>" \
  -H "Cookie: <paste session cookie>"
```
Expected: `400` with an error message containing "reassign or release" (from the RPC's RAISE message).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/companies/\[accountId\]/route.ts
git commit -m "feat: add rename and delete endpoints for /admin companies"
```

---

## Task 7: `GET /api/admin/companies/[accountId]/members` and `POST /api/admin/members/[userId]/reassign`

**Files:**
- Create: `src/app/api/admin/companies/[accountId]/members/route.ts`
- Create: `src/app/api/admin/members/[userId]/reassign/route.ts`

**Interfaces:**
- Consumes: `requirePlatformAdmin()`, `toErrorResponse`, `isAccountRole` from `src/lib/auth/roles.ts`, RPC `platform_reassign_member` from Task 1.
- Produces: `GET /api/admin/companies/[accountId]/members` → `{ members: { user_id: string; full_name: string; email: string | null; role: string; joined_at: string }[] }`. `POST /api/admin/members/[userId]/reassign` body `{ targetAccountId: string | null; role?: string }` → `{ ok: true; accountId: string }`.

- [ ] **Step 1: Write the members-listing route**

```typescript
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
```

- [ ] **Step 2: Write the reassign route**

```typescript
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
```

- [ ] **Step 3: Verify it builds**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Manual test — list members**

```bash
curl "http://localhost:3000/api/admin/companies/<accountId>/members" \
  -H "Cookie: <paste session cookie>"
```
Expected: `{"members":[...]}` with every member of that company.

- [ ] **Step 5: Manual test — release a member**

```bash
curl -X POST "http://localhost:3000/api/admin/members/<userId>/reassign" \
  -H "Content-Type: application/json" \
  -H "Cookie: <paste session cookie>" \
  -d '{"targetAccountId":null}'
```
Expected: `{"ok":true,"accountId":"<new-uuid>"}`. Re-run the members-listing route on the original company and confirm the user no longer appears.

- [ ] **Step 6: Manual test — move a member to another company**

```bash
curl -X POST "http://localhost:3000/api/admin/members/<userId>/reassign" \
  -H "Content-Type: application/json" \
  -H "Cookie: <paste session cookie>" \
  -d '{"targetAccountId":"<other-account-id>","role":"agent"}'
```
Expected: `{"ok":true,"accountId":"<other-account-id>"}`. Confirm via the members-listing route on `<other-account-id>`.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/admin/companies/\[accountId\]/members/route.ts src/app/api/admin/members/\[userId\]/reassign/route.ts
git commit -m "feat: add cross-account member listing and reassign endpoints"
```

---

## Task 8: `EditCompanyDialog` component + wire "Editar" button

**Files:**
- Create: `src/app/(dashboard)/admin/edit-company-dialog.tsx`
- Modify: `src/app/(dashboard)/admin/admin-dashboard.tsx`

**Interfaces:**
- Consumes: `PATCH /api/admin/companies/[accountId]` from Task 6. UI components `Button`, `Dialog`/`DialogContent`/`DialogDescription`/`DialogFooter`/`DialogHeader`/`DialogTitle`, `Input`, `Label` from `@/components/ui/*` (same imports as `RecordPaymentDialog`).
- Produces: `EditCompanyDialog` component with props `{ company: { id: string; name: string } | null; onOpenChange: (open: boolean) => void; onSaved: () => void }`.

- [ ] **Step 1: Write the dialog component**

```typescript
"use client";

// ============================================================
// EditCompanyDialog
//
// Renames a company. Mirrors RecordPaymentDialog's shape: `company`
// prop doubles as the open/closed flag (open = company !== null).
// ============================================================

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EditCompanyDialogProps {
  company: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditCompanyDialog({
  company,
  onOpenChange,
  onSaved,
}: EditCompanyDialogProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Seed the input whenever a new company is opened.
  useEffect(() => {
    if (company) setName(company.name);
  }, [company]);

  async function handleSubmit() {
    if (!company) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("El nombre no puede estar vacío");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || "No se pudo renombrar la empresa");
        return;
      }
      toast.success("Empresa renombrada");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("[EditCompanyDialog] error:", err);
      toast.error("No se pudo contactar el servidor. ¿Reintentar?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!company} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            Editar empresa
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Cambia el nombre de la empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label className="text-muted-foreground">Nombre de la empresa</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-muted border-border text-foreground"
          />
        </div>

        <DialogFooter className="bg-popover border-border">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire it into `admin-dashboard.tsx`**

In `src/app/(dashboard)/admin/admin-dashboard.tsx`, add the import:
```typescript
import { EditCompanyDialog } from "./edit-company-dialog";
```

Add state near the other dialog-target state (next to `payTarget`/`historyTarget`):
```typescript
  const [editTarget, setEditTarget] = useState<{ id: string; name: string } | null>(null);
```

In the actions cell (inside the `{c.isSuperAdminAccount ? (...) : (...)}` else-branch, alongside the existing "Ver pagos" / "Registrar pago" buttons), add:
```typescript
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditTarget({ id: c.id, name: c.name })}
                                  className="border-border text-muted-foreground hover:bg-muted"
                                >
                                  Editar
                                </Button>
```

At the bottom of the component, alongside the other dialog JSX (next to `<RecordPaymentDialog .../>`), add:
```typescript
      <EditCompanyDialog
        company={editTarget}
        onOpenChange={(next) => {
          if (!next) setEditTarget(null);
        }}
        onSaved={loadData}
      />
```

- [ ] **Step 3: Verify it builds**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Manual browser test**

Run: `npm run dev`, sign in as a platform admin, go to `/admin`, click "Editar" on a non-super-admin company row, change the name, click "Guardar". Expected: toast "Empresa renombrada", table updates with the new name.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/admin/edit-company-dialog.tsx src/app/\(dashboard\)/admin/admin-dashboard.tsx
git commit -m "feat: add company rename dialog to /admin"
```

---

## Task 9: `CompanyMembersDialog` component (list + reassign + release) + wire "Miembros" button

**Files:**
- Create: `src/app/(dashboard)/admin/company-members-dialog.tsx`
- Modify: `src/app/(dashboard)/admin/admin-dashboard.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/companies/[accountId]/members` and `POST /api/admin/members/[userId]/reassign` from Task 7. Needs the full company list (id + name) to populate the "move to" dropdown — pass it down as a prop from `AdminDashboard`, which already holds `companies` in state.
- Produces: `CompanyMembersDialog` component with props `{ company: { id: string; name: string } | null; allCompanies: { id: string; name: string }[]; onOpenChange: (open: boolean) => void }`.

- [ ] **Step 1: Write the dialog component**

```typescript
"use client";

// ============================================================
// CompanyMembersDialog
//
// Lists every member of one company and lets the platform admin
// move a member to a different company, or release them to their
// own fresh personal account. Read model is independent of Settings
// → Miembros (that one is self-service, RLS-scoped to the caller's
// own account); this one reads cross-account via /api/admin/*.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Member {
  user_id: string;
  full_name: string;
  email: string | null;
  role: string;
  joined_at: string;
}

interface CompanyMembersDialogProps {
  company: { id: string; name: string } | null;
  allCompanies: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
}

const MOVE_ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "agent", label: "Agente" },
  { value: "viewer", label: "Lector" },
];

export function CompanyMembersDialog({
  company,
  allCompanies,
  onOpenChange,
}: CompanyMembersDialogProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  // Per-row pending selection: "release" or a target company id.
  const [destination, setDestination] = useState<Record<string, string>>({});
  const [role, setRole] = useState<Record<string, string>>({});

  const loadMembers = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/members`);
      if (!res.ok) {
        toast.error("No se pudieron cargar los miembros");
        return;
      }
      const data = (await res.json()) as { members: Member[] };
      setMembers(data.members ?? []);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function applyMove(userId: string) {
    const dest = destination[userId];
    if (!dest) {
      toast.error("Elige un destino primero");
      return;
    }
    setBusyUserId(userId);
    try {
      const body =
        dest === "release"
          ? { targetAccountId: null }
          : { targetAccountId: dest, role: role[userId] ?? "agent" };

      const res = await fetch(`/api/admin/members/${userId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || "No se pudo mover al miembro");
        return;
      }
      toast.success(
        dest === "release" ? "Miembro liberado a su propia cuenta" : "Miembro movido",
      );
      await loadMembers();
    } catch (err) {
      console.error("[CompanyMembersDialog] reassign error:", err);
      toast.error("No se pudo contactar el servidor. ¿Reintentar?");
    } finally {
      setBusyUserId(null);
    }
  }

  const otherCompanies = allCompanies.filter((c) => c.id !== company?.id);

  return (
    <Dialog open={!!company} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            Miembros{company ? ` · ${company.name}` : ""}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Mueve un miembro a otra empresa o libéralo a su propia cuenta.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin miembros.</p>
            ) : (
              members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex flex-col gap-2 rounded-md border border-border p-3"
                >
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {m.full_name || m.email || m.user_id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.email ?? "—"} · {m.role}
                    </div>
                  </div>

                  {m.role === "owner" ? (
                    <p className="text-xs text-muted-foreground italic">
                      Es el propietario; transfiere la propiedad antes de moverlo.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={destination[m.user_id] ?? ""}
                        onValueChange={(v) =>
                          v && setDestination((d) => ({ ...d, [m.user_id]: v }))
                        }
                      >
                        <SelectTrigger className="h-8 w-[200px] bg-muted border-border text-foreground">
                          <SelectValue placeholder="Elegir destino..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="release">
                            Liberar (cuenta propia)
                          </SelectItem>
                          {otherCompanies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              Mover a: {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {destination[m.user_id] &&
                        destination[m.user_id] !== "release" && (
                          <Select
                            value={role[m.user_id] ?? "agent"}
                            onValueChange={(v) =>
                              v && setRole((r) => ({ ...r, [m.user_id]: v }))
                            }
                          >
                            <SelectTrigger className="h-8 w-[140px] bg-muted border-border text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MOVE_ROLES.map((r) => (
                                <SelectItem key={r.value} value={r.value}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                      <Button
                        size="sm"
                        disabled={busyUserId === m.user_id || !destination[m.user_id]}
                        onClick={() => applyMove(m.user_id)}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      >
                        {busyUserId === m.user_id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          "Aplicar"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire it into `admin-dashboard.tsx`**

Add the import:
```typescript
import { CompanyMembersDialog } from "./company-members-dialog";
```

Add state:
```typescript
  const [membersTarget, setMembersTarget] = useState<{ id: string; name: string } | null>(null);
```

Add a "Miembros" button next to "Editar" in the actions cell:
```typescript
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setMembersTarget({ id: c.id, name: c.name })}
                                  className="border-border text-muted-foreground hover:bg-muted"
                                >
                                  Miembros
                                </Button>
```

Add the dialog JSX at the bottom, alongside the others:
```typescript
      <CompanyMembersDialog
        company={membersTarget}
        allCompanies={companies.map((c) => ({ id: c.id, name: c.name }))}
        onOpenChange={(next) => {
          if (!next) setMembersTarget(null);
        }}
      />
```

- [ ] **Step 3: Verify it builds**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Manual browser test**

Run: `npm run dev`, go to `/admin`, click "Miembros" on a company with 2+ members. Pick one non-owner member, select "Mover a: <other company>" + a role, click "Aplicar". Expected: toast "Miembro movido", the row disappears from this company's list on reload. Re-open the target company's "Miembros" dialog and confirm the member now appears there with the chosen role.

Repeat with "Liberar (cuenta propia)" on another member — expected: toast "Miembro liberado a su propia cuenta", member disappears from the list; verify via `/api/admin/companies` (Task 6 covers the list endpoint already existing) that a new company now exists owned by that user.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/admin/company-members-dialog.tsx src/app/\(dashboard\)/admin/admin-dashboard.tsx
git commit -m "feat: add member reassign/release dialog to /admin"
```

---

## Task 10: "Eliminar" button + confirm flow

**Files:**
- Modify: `src/app/(dashboard)/admin/admin-dashboard.tsx`

**Interfaces:**
- Consumes: `DELETE /api/admin/companies/[accountId]` from Task 6. Existing `ConfirmDialog` component (`src/components/ui/confirm-dialog.tsx`), same pattern already used for "Suspender" in this file.

- [ ] **Step 1: Add delete state and handler**

Add state near `suspendTarget`:
```typescript
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState(false);
```

Add the handler near `confirmSuspend`:
```typescript
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/companies/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || "No se pudo eliminar la empresa");
        return;
      }
      toast.success("Empresa eliminada");
      setDeleteTarget(null);
      await loadData();
    } finally {
      setDeleting(false);
    }
  }
```

- [ ] **Step 2: Add the "Eliminar" button**

In the actions cell, alongside "Suspender"/"Activar":
```typescript
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDeleteTarget(c)}
                                  className="border-border text-destructive hover:bg-destructive/10 hover:text-destructive"
                                >
                                  Eliminar
                                </Button>
```

- [ ] **Step 3: Add the confirm dialog**

Alongside the existing `<ConfirmDialog ... suspendTarget .../>` at the bottom of the component:
```typescript
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(next) => { if (!next) setDeleteTarget(null); }}
        title="¿Eliminar empresa?"
        description={`Esto elimina "${deleteTarget?.name}" de forma permanente. Solo funciona si la empresa no tiene miembros además de su propietario — si tiene un equipo, muévelos o libéralos primero desde "Miembros".`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
      />
```

- [ ] **Step 4: Verify it builds**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 5: Manual browser test — reject path**

Go to `/admin`, click "Eliminar" on a company with 2+ members, confirm. Expected: toast with the RPC's rejection message (contains "reassign or release" translated context — actually the raw RPC message is in English per Task 2's `RAISE`; note this for Task 11's polish pass, or leave as-is since other RPC messages in this codebase are also English while the UI wrapper is Spanish — same precedent as `018_account_member_rpcs.sql`'s messages surfaced as-is in `src/app/api/account/members/[userId]/route.ts`).

- [ ] **Step 6: Manual browser test — success path**

Use "Miembros" (Task 9) to release/move every member of a test company down to just its owner, then click "Eliminar" → confirm. Expected: toast "Empresa eliminada", row disappears from the table, and (verify via `/api/admin/companies`) a new personal company now exists for the released owner.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/admin/admin-dashboard.tsx
git commit -m "feat: add delete-company flow to /admin"
```

---

## Task 11: Full regression pass

**Files:** none created/modified — verification only.

- [ ] **Step 1: Run the existing test suite**

Run: `npm test` (or `npx vitest run` if that's the configured script — check `package.json` `scripts.test` first with `grep -n '"test"' package.json`)
Expected: all existing tests pass, including `src/lib/auth/invitations.test.ts`.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Confirm company creation (owner flow) still works unchanged**

In `/admin`, use "Crear empresa" to onboard a new test company + owner email. Expected: same behavior as before this plan — company appears, owner receives an invite email, no regression (this flow was not touched by any task above).

- [ ] **Step 4: End-to-end invited-member flow (the original bug)**

Repeat Task 3 Step 4's manual verification once more, end to end, with a fresh invite + fresh test email, to confirm the fix holds after all subsequent tasks landed on top of it. Expected: invited member ends up as a member of the inviting company, not a new company of their own.

- [ ] **Step 5: Commit (if any fixes were needed during this pass)**

Only if Steps 1-4 surfaced issues requiring code changes — otherwise this task produces no commit.

---

## Self-Review Notes

- **Spec coverage:** Task 3+4+5 cover spec section 1 (confirmation fix). Task 6+8 cover section 2 (edit company). Task 1+7+9 cover section 3 (reassign/release). Task 2+6+10 cover section 4 (delete company). Task 11 covers the spec's Testing section, including the explicit regression check for company creation.
- **Type consistency:** `platform_reassign_member(p_user_id, p_target_account_id, p_new_role)` (Task 1) is called identically in Task 7's route (`p_user_id`, `p_target_account_id`, `p_new_role`) and internally in Task 2's `platform_delete_account` (`platform_reassign_member(v_sole_member_user_id, NULL, NULL)`). `Member` shape in Task 9 (`user_id, full_name, email, role, joined_at`) matches Task 7's `GET .../members` response shape exactly.
- **Known follow-up (not blocking):** RPC error messages (Task 1, 2) are in English (matching the existing `018_account_member_rpcs.sql` precedent) while the UI (Task 8-10) is in Spanish — consistent with how `set_member_role`/`remove_account_member` errors already surface today, so not a new inconsistency introduced by this plan.
