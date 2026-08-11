-- ============================================================
-- 044_bsuid_usernames
--
-- Support WhatsApp usernames / business-scoped user IDs (BSUID).
--
-- Meta's 2026 username rollout means a customer can hide their phone
-- number from the business. When they do, the inbound webhook OMITS
-- `wa_id` and `messages[].from` entirely and identifies the person only
-- by `user_id` / `from_user_id` — an opaque per-portfolio BSUID shaped
-- `<ISO-3166-alpha-2>.<alphanumeric>` (e.g. `US.13491208655302741918`).
--
-- Until now the webhook fed `message.from` straight into
-- `normalizePhone`, which returns '' for undefined. That produced two
-- failures:
--
--   1. `findExistingContact` bails on an empty phone, so EVERY inbound
--      message from a username-only customer missed the lookup and
--      inserted a brand-new contact — and a brand-new conversation with
--      it. The unique index from migration 022 is partial
--      (`WHERE phone_normalized <> ''`) so it never caught them.
--   2. Replying failed with "Contact phone number not found", because
--      the send path requires `contacts.phone`.
--
-- This migration adds the identity columns those paths need. It is
-- purely additive: no existing row is modified, merged, or deleted.
-- Contacts already created with an empty phone are left exactly as they
-- are — they carry no BSUID, so there is no way to tell which of them
-- are the same person, and guessing would merge unrelated customers.
--
-- Idempotent.
-- ============================================================

-- 1) Identity columns.
--
--    `bsuid` is the durable identifier for a username-only contact and
--    is stored VERBATIM — Meta rejects any request where the value has
--    been trimmed, re-cased, or otherwise normalized, so unlike `phone`
--    this column gets no generated normalized twin.
--
--    `username` is the customer's public @handle. It is display-only:
--    users can change it at any time and it is NOT an identity key, so
--    nothing may ever look a contact up by it.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS bsuid TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT;

COMMENT ON COLUMN contacts.bsuid IS
  'Meta business-scoped user ID (e.g. US.13491208655302741918). Portfolio-scoped and stored verbatim. Present for contacts reached via a WhatsApp username; NULL for phone-only contacts.';
COMMENT ON COLUMN contacts.username IS
  'Customer''s public WhatsApp @username. Display only — mutable, never an identity key.';

-- 2) One contact per BSUID per account — the BSUID-side equivalent of
--    migration 022's phone uniqueness, and the backstop that stops the
--    fragmentation described above from recurring under a race (Meta
--    retries a delivery, or a batch fans out to concurrent handlers).
--    Partial so the many phone-only contacts with a NULL bsuid don't
--    collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_bsuid
  ON contacts (account_id, bsuid)
  WHERE bsuid IS NOT NULL;

-- 3) Every NEW contact must be reachable by at least one identifier.
--
--    NOT VALID deliberately: it enforces the rule on inserts and updates
--    from here on without validating the rows already in the table. The
--    pre-existing empty-phone contacts this bug created would fail it,
--    and per the decision above they are being preserved untouched.
--    Promoting this to a validated constraint later (VALIDATE CONSTRAINT)
--    is a follow-up that requires cleaning those rows up first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contacts_has_identifier'
      AND conrelid = 'contacts'::regclass
  ) THEN
    ALTER TABLE contacts
      ADD CONSTRAINT contacts_has_identifier
      CHECK (phone_normalized <> '' OR bsuid IS NOT NULL)
      NOT VALID;
  END IF;
END $$;
