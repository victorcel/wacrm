-- ============================================================
-- 042_unsupported_content_type.sql — allow messages.content_type
-- = 'unsupported' for Meta's undeliverable-message placeholder.
--
-- WhatsApp Cloud API does not hand every message over. Round videos
-- (PTV — recorded by holding the camera button), polls, edited
-- messages and view-once media arrive as a placeholder webhook with
-- `type: "unsupported"`, an `errors` entry (131051 / 131060), and
-- **no media id**. See src/lib/whatsapp/unsupported-message.ts.
--
-- Until now the webhook mapped those to content_type 'text' with the
-- English literal "[Unsupported message type: unsupported]" baked into
-- content_text, which no locale could translate. Giving them their own
-- content_type lets the inbox render a translated placeholder and keeps
-- content_text NULL.
--
-- Ordering: apply this BEFORE deploying the matching webhook change.
-- The reverse order makes every such INSERT fail the CHECK constraint,
-- which drops the message entirely rather than rendering it badly.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- Drop & re-add the CHECK to add 'unsupported' as an allowed value.
-- Migration 001 named it `messages_content_type_check` (the Postgres
-- default for an inline CHECK on a TEXT column) and migration 010 kept
-- that name when it widened the list for 'interactive'.
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_content_type_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_content_type_check
  CHECK (content_type IN (
    'text', 'image', 'document', 'audio', 'video',
    'location', 'template', 'interactive', 'unsupported'
  ));

-- Backfill the rows already written by the old code path. These were
-- stored as plain text carrying the untranslatable English literal;
-- move them onto the new content_type and clear the literal so the UI
-- renders the localized placeholder instead.
UPDATE messages
SET content_type = 'unsupported',
    content_text = NULL
WHERE content_type = 'text'
  AND content_text = '[Unsupported message type: unsupported]';
