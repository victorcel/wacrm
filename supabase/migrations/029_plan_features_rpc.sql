-- ============================================================
-- Migration 026 — get_my_plan_features() helper
--
-- Returns the features JSONB for the plan associated with the
-- calling user's account. Called from the Next.js middleware on
-- every request to a feature-gated route so it can redirect
-- without React rendering.
--
-- Design notes:
--   • STABLE: same inputs → same output within a transaction;
--     lets the query planner cache aggressively.
--   • SECURITY INVOKER (default): runs as the calling user so
--     RLS policies on profiles / account_subscriptions apply
--     naturally — no privilege escalation.
--   • Returns '{}' (empty object) when the user has no profile,
--     no subscription, or no plan; missing keys are treated as
--     "allowed" by the middleware gate (same rule as the app).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_plan_features()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(sp.features, '{}'::jsonb)
  FROM public.profiles p
  JOIN public.account_subscriptions asub ON asub.account_id = p.account_id
  LEFT JOIN public.subscription_plans   sp  ON sp.id = asub.plan_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

-- Any authenticated user may call this (they only see their own
-- data because the underlying tables have user-scoped RLS).
GRANT EXECUTE ON FUNCTION public.get_my_plan_features() TO authenticated;
