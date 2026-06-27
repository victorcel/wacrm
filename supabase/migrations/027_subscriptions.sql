-- ============================================================
-- 024_subscriptions.sql
--
-- Turns the free, open-signup CRM into a manually-billed, plan-based
-- SaaS WITHOUT touching any existing CRM logic. Everything here is a
-- layer ON TOP of the account model from 017_account_sharing.sql:
--
--   1. `subscription_plans`     — the catalogue (seats / broadcasts /
--                                 feature limits per plan).
--   2. `account_subscriptions`  — one row per account: which plan,
--                                 status, and "paid-until" date.
--   3. `subscription_payments`  — manual payment ledger (transfer /
--                                 cash / card) recorded by an admin.
--   4. `platform_admins`        — who can operate the platform-level
--                                 super-admin panel (/admin).
--
-- Plus two SQL helpers (`is_platform_admin`, `account_subscription_active`)
-- mirroring the `is_account_member` convention, RLS that lets an
-- account read its OWN billing state (writes go through the
-- service-role admin API), a backfill that grandfathers every
-- existing account onto an unlimited "comp" plan so nothing breaks,
-- and a recreated `handle_new_user` so any freshly-created account
-- starts `inactive` (the registration is now closed by default).
--
-- Idempotent / safe to re-run, same as the other migrations.
-- ============================================================

-- ============================================================
-- SUBSCRIPTION_PLANS — the plan catalogue.
--
-- Limits use NULL to mean "unlimited". `features` is a JSONB flag
-- map so new gated modules can be added without a schema change
-- (e.g. {"automations": true, "flows": false}).
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  -- Informational only — billing is manual for now. Kept so the
  -- admin panel and (future) checkout can show a price.
  price_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  -- NULL = unlimited on each limit.
  max_seats INT,
  max_broadcasts_per_month INT,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON subscription_plans;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ACCOUNT_SUBSCRIPTIONS — one subscription per account (1:1).
--
-- `status` + `current_period_end` together drive the access gate:
-- an account can use the app iff status is active/trialing AND the
-- period hasn't ended (NULL end = never expires, used for comp).
--
-- The `provider` / `external_*` columns are unused today (billing
-- is manual) but reserved so a future Stripe / Mercado Pago webhook
-- can drive the same row without a schema change.
-- ============================================================
CREATE TABLE IF NOT EXISTS account_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('active', 'trialing', 'suspended', 'expired', 'inactive')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  notes TEXT,
  -- Reserved for future automated billing.
  provider TEXT NOT NULL DEFAULT 'manual',
  external_customer_id TEXT,
  external_subscription_id TEXT,
  activated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_subscriptions_plan
  ON account_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_account_subscriptions_status
  ON account_subscriptions(status);

ALTER TABLE account_subscriptions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON account_subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON account_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SUBSCRIPTION_PAYMENTS — manual payment ledger.
--
-- One row per recorded payment. Recording a payment is what extends
-- `account_subscriptions.current_period_end` (done in the admin API,
-- not by trigger, so the admin stays in control of the dates).
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  method TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  note TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_account
  ON subscription_payments(account_id, paid_at DESC);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PLATFORM_ADMINS — the platform operators (super-admins).
--
-- Membership here is what unlocks /admin. Deliberately tiny and
-- only writable by the service role (the admin API). Seeded below.
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPERS
--
-- SECURITY DEFINER so RLS policies / app callers can use them
-- without recursive policy evaluation. Mirrors `is_account_member`.
-- ============================================================

-- True iff the calling user is a platform super-admin.
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()
  );
$$;

ALTER FUNCTION is_platform_admin() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated, service_role;

-- True iff the account currently has usable access: an active or
-- trialing subscription whose period hasn't ended (NULL = no expiry).
CREATE OR REPLACE FUNCTION account_subscription_active(p_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM account_subscriptions s
    WHERE s.account_id = p_account_id
      AND s.status IN ('active', 'trialing')
      AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
  );
$$;

ALTER FUNCTION account_subscription_active(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION account_subscription_active(UUID) TO authenticated, service_role;

-- ============================================================
-- RLS POLICIES
--
-- Reads: an account sees its own billing state; platform admins see
-- everything. Writes: none from the client — all mutations go
-- through the service-role admin API, which bypasses RLS.
-- (Postgres has no CREATE POLICY IF NOT EXISTS, so drop-then-create.)
-- ============================================================

-- Plans are a public catalogue to any signed-in user (the app shows
-- plan name/limits); writes are service-role only.
DROP POLICY IF EXISTS subscription_plans_select ON subscription_plans;
CREATE POLICY subscription_plans_select ON subscription_plans
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS account_subscriptions_select ON account_subscriptions;
CREATE POLICY account_subscriptions_select ON account_subscriptions
  FOR SELECT TO authenticated
  USING (is_account_member(account_id) OR is_platform_admin());

DROP POLICY IF EXISTS subscription_payments_select ON subscription_payments;
CREATE POLICY subscription_payments_select ON subscription_payments
  FOR SELECT TO authenticated
  USING (is_account_member(account_id, 'admin') OR is_platform_admin());

-- platform_admins: a user may check whether THEY themselves are an
-- admin (needed for client-side nav), nothing more.
DROP POLICY IF EXISTS platform_admins_select_self ON platform_admins;
CREATE POLICY platform_admins_select_self ON platform_admins
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- SEED PLANS
--
-- Three sellable tiers plus a hidden "comp" (courtesy / unlimited)
-- used to grandfather pre-existing accounts. Re-runnable via
-- ON CONFLICT (key).
-- ============================================================
INSERT INTO subscription_plans
  (key, name, price_amount, currency, max_seats, max_broadcasts_per_month, features, is_active, sort_order)
VALUES
  ('free',  'Gratis',  0,  'USD', 1,    10,
    '{"automations": false, "flows": false, "broadcasts": true}'::jsonb, TRUE, 0),
  ('basic', 'Básico',  29, 'USD', 3,    500,
    '{"automations": true, "flows": false, "broadcasts": true}'::jsonb,  TRUE, 1),
  ('pro',   'Pro',     79, 'USD', 10,   5000,
    '{"automations": true, "flows": true, "broadcasts": true}'::jsonb,   TRUE, 2),
  ('comp',  'Cortesía', 0, 'USD', NULL, NULL,
    '{"automations": true, "flows": true, "broadcasts": true}'::jsonb,   FALSE, 99)
ON CONFLICT (key) DO UPDATE SET
  name                     = EXCLUDED.name,
  max_seats                = EXCLUDED.max_seats,
  max_broadcasts_per_month = EXCLUDED.max_broadcasts_per_month,
  features                 = EXCLUDED.features;

-- ============================================================
-- BACKFILL — grandfather existing accounts.
--
-- Every account that predates this migration keeps working: put it
-- on the unlimited "comp" plan, active, with no expiry. New accounts
-- created after this point start `inactive` (see handle_new_user).
-- ============================================================
INSERT INTO account_subscriptions (account_id, plan_id, status, current_period_start, current_period_end, notes)
SELECT a.id,
       (SELECT id FROM subscription_plans WHERE key = 'comp'),
       'active',
       NOW(),
       NULL,
       'Grandfathered on subscriptions rollout'
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM account_subscriptions s WHERE s.account_id = a.id
);

-- ============================================================
-- PLATFORM ADMIN BOOTSTRAP
--
-- Intentionally NOT seeded here. Registration is invite-only, so the
-- first super-admin is created out-of-band by `scripts/seed-admin.mjs`
-- (run `npm run seed:admin`), which creates/looks-up the user via the
-- service-role API and inserts the platform_admins row. Keeping the
-- email out of the migration avoids committing an operator identity
-- into version control and keeps a single bootstrap path.
-- ============================================================

-- ============================================================
-- RECREATE handle_new_user
--
-- Same account + profile bootstrap as 017, but now also seeds an
-- `inactive` subscription. Effect: a brand-new self-created account
-- is walled off by the gate until a platform admin activates it —
-- which is exactly the "closed registration" model. Accounts created
-- by the admin API are activated by that API right after creation;
-- invited teammates redeem into an already-active account and their
-- throwaway personal account (inactive) is deleted on redeem.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  -- New accounts start with no usable subscription. The gate blocks
  -- them until a platform admin activates a plan (manual billing).
  INSERT INTO public.account_subscriptions (account_id, status)
  VALUES (v_account_id, 'inactive');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
