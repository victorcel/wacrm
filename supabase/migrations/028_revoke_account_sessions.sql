-- ============================================================
-- Migration 025 — revoke_account_sessions helper
--
-- Immediately invalidates all auth sessions for every member of
-- a given account. Called by the /api/admin subscription PATCH
-- route when a super-admin suspends a company, ensuring that
-- active users are kicked out rather than continuing to operate
-- on a suspended account.
--
-- Pattern:
--   • SECURITY DEFINER: the function runs with the owner's
--     privileges (postgres = superuser) regardless of who calls
--     it. This lets service_role invoke it and still reach the
--     auth.* tables that are normally off-limits to service_role.
--   • Only service_role may EXECUTE it — no user-facing exposure.
-- ============================================================

CREATE OR REPLACE FUNCTION public.revoke_account_sessions(p_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(user_id) INTO v_user_ids
  FROM public.profiles
  WHERE account_id = p_account_id;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
    RETURN;
  END IF;

  -- Revoke refresh tokens first so clients can't silently renew
  -- an expired access token.
  DELETE FROM auth.refresh_tokens WHERE user_id = ANY(v_user_ids);

  -- Drop active sessions so the next cookie / token validation
  -- returns "session not found" and forces a sign-in.
  DELETE FROM auth.sessions WHERE user_id = ANY(v_user_ids);
END;
$$;

-- Restrict execution: only the service-role key (used by the
-- /api/admin routes via supabaseAdmin()) may call this function.
REVOKE ALL ON FUNCTION public.revoke_account_sessions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_account_sessions(UUID) TO service_role;
