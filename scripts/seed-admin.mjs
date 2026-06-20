#!/usr/bin/env node
// ============================================================
// seed-admin.mjs — bootstrap the first platform super-admin.
//
// Registration is invite-only, so on a fresh deployment there is no
// way to create the very first operator through the UI. This script
// creates (or finds) a user via the Supabase service-role admin API
// and marks them as a platform admin in `platform_admins`. Idempotent.
//
// Usage (local, Node 20.6+ for --env-file):
//   SUPER_ADMIN_EMAIL=you@example.com \
//   SUPER_ADMIN_PASSWORD='a-strong-password' \
//   npm run seed:admin
//
// Or in production, with the env already set in the environment:
//   node scripts/seed-admin.mjs
//
// Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//               SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD
// ============================================================

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SUPER_ADMIN_EMAIL;
const password = process.env.SUPER_ADMIN_PASSWORD;
const fullName = process.env.SUPER_ADMIN_NAME || "Platform Admin";

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

if (!url || !serviceKey) {
  fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}
if (!email || !password) {
  fail("Missing SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD.");
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function resolveUserId() {
  // Try to create the user (email_confirm so they can log in straight
  // away). The on_auth_user_created trigger bootstraps their account.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (!error && data?.user) {
    console.log(`✓ Created auth user ${email}`);
    return data.user.id;
  }

  // Already exists (or another non-fatal create error) — look them up
  // via the profile row the signup trigger created (it carries email).
  console.log(`• User may already exist (${error?.message ?? "unknown"}); looking up…`);
  const { data: profile, error: lookupErr } = await admin
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();

  if (lookupErr) fail(`Lookup failed: ${lookupErr.message}`);
  if (!profile?.user_id) {
    fail(`Could not create or find a user for ${email}.`);
  }
  console.log(`✓ Found existing user ${email}`);
  return profile.user_id;
}

const userId = await resolveUserId();

const { error: paErr } = await admin
  .from("platform_admins")
  .upsert({ user_id: userId }, { onConflict: "user_id" });

if (paErr) fail(`Could not mark platform admin: ${paErr.message}`);

console.log(`✓ ${email} is now a platform super-admin. Done.`);
process.exit(0);
