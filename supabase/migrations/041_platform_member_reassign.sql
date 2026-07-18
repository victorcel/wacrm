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
