// ============================================================
// Recipient identity — phone number vs BSUID
//
// Meta began rolling out WhatsApp *usernames* in 2026. A user who
// adopts one can hide their phone number from businesses, and Meta
// then OMITS `wa_id` / `from` from the webhook payload entirely.
// What is always present instead is a **BSUID** (business-scoped
// user ID): an opaque per-portfolio identifier shaped
// `<ISO-3166-alpha-2>.<alphanumeric>`, e.g. `US.13491208655302741918`.
//
// Sending works the same way in reverse: `POST /{phone_number_id}/messages`
// takes the phone in `to` OR the BSUID in `recipient` — never both.
// If both are supplied Meta silently lets `to` win, which would make a
// BSUID send fail in a way that looks like a delivery problem rather
// than a bug, so `buildRecipientFields` only ever emits one key.
//
// See: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/
// ============================================================

/**
 * Meta's BSUID grammar: an ISO-3166 alpha-2 country code, an optional
 * `ENT` segment for *parent* BSUIDs (portfolios enrolled under a shared
 * parent account), then up to 128 alphanumeric characters.
 *
 * The whole value must be used verbatim — Meta rejects the request if
 * any part is dropped or altered, so we never normalize a BSUID the way
 * `sanitizePhoneForMeta` normalizes a phone.
 *
 * A phone number can never match this pattern: our stored numbers are
 * digits (plus formatting punctuation), never `XX.` prefixed.
 */
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
} from './phone-utils'

const BSUID_PATTERN = /^[A-Z]{2}(?:\.ENT)?\.[A-Za-z0-9]{1,128}$/

/**
 * Template categories Meta refuses to deliver to a BSUID. Authentication
 * templates (one-tap, zero-tap, copy-code) are phone-number-only, so a
 * username-only contact simply cannot receive them — callers should fail
 * loudly rather than let Meta return an opaque error.
 */
export const BSUID_UNSUPPORTED_TEMPLATE_CATEGORIES = ['AUTHENTICATION'] as const

/** True when `value` is a Meta business-scoped user ID rather than a phone. */
export function isBsuid(value: string | null | undefined): boolean {
  if (!value) return false
  return BSUID_PATTERN.test(value)
}

/**
 * The recipient key/value pair for a Meta send body.
 *
 * Exactly one of `to` / `recipient` is returned, chosen by the shape of
 * `target`. Spread this into the message body instead of hard-coding
 * `to` so every send path (text, media, template, interactive, reaction)
 * supports username-only contacts identically.
 */
export function buildRecipientFields(
  target: string
): { to: string } | { recipient: string } {
  if (!target) {
    throw new Error('buildRecipientFields requires a recipient (phone or BSUID).')
  }
  return isBsuid(target) ? { recipient: target } : { to: target }
}

/**
 * Pick the identifier to send to for a contact row.
 *
 * Phone wins when present: it's portfolio-independent, works for
 * authentication templates, and keeps behaviour identical for the
 * overwhelming majority of contacts. The BSUID is the fallback for
 * username-only contacts whose number Meta never gave us.
 *
 * Returns null when the contact carries neither — the caller should
 * surface that as a user-facing error, not post an empty body to Meta.
 */
export function resolveSendTarget(contact: {
  phone?: string | null
  bsuid?: string | null
}): string | null {
  const phone = contact.phone?.trim()
  if (phone) return phone
  const bsuid = contact.bsuid?.trim()
  if (bsuid) return bsuid
  return null
}

/** A contact resolved into everything a send path needs to address it. */
export type PreparedRecipient =
  | {
      ok: true
      /** Value to pass as a send helper's `to` — sanitized phone or verbatim BSUID. */
      target: string
      isBsuid: boolean
      /**
       * Candidates to try in order, `target` first. Phone numbers get
       * trunk-prefix variants (Meta's allow-list is picky about a
       * leading 0 after the country code); a BSUID has exactly one
       * valid form, so its list is a single entry.
       */
      variants: string[]
    }
  | { ok: false; reason: 'no_identifier' | 'invalid_phone' }

/**
 * Resolve a contact row into a send-ready recipient.
 *
 * Every outbound path — inbox, public API, Flows engine, reactions —
 * needs the same three decisions: which identity to use, whether it may
 * be normalized, and what to retry on rejection. Getting any of them
 * wrong for a BSUID means a guaranteed rejection from Meta (the value
 * must arrive byte-identical), so they live here once rather than being
 * re-derived per call site.
 */
export function prepareRecipient(contact: {
  phone?: string | null
  bsuid?: string | null
}): PreparedRecipient {
  const target = resolveSendTarget(contact)
  if (!target) return { ok: false, reason: 'no_identifier' }

  if (isBsuid(target)) {
    return { ok: true, target, isBsuid: true, variants: [target] }
  }

  const sanitized = sanitizePhoneForMeta(target)
  if (!isValidE164(sanitized)) return { ok: false, reason: 'invalid_phone' }

  return {
    ok: true,
    target: sanitized,
    isBsuid: false,
    variants: phoneVariants(sanitized),
  }
}
