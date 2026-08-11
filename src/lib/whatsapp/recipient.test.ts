import { describe, expect, it } from 'vitest'

import {
  isBsuid,
  buildRecipientFields,
  resolveSendTarget,
  prepareRecipient,
  BSUID_UNSUPPORTED_TEMPLATE_CATEGORIES,
} from './recipient'

describe('isBsuid', () => {
  it('accepts Meta\'s documented BSUID shape (CC.alphanumeric)', () => {
    expect(isBsuid('US.13491208655302741918')).toBe(true)
    expect(isBsuid('BR.1A2B3C4D5E6F7G8H9I0J')).toBe(true)
    expect(isBsuid('ES.abc123')).toBe(true)
  })

  it('accepts parent BSUIDs (CC.ENT.alphanumeric)', () => {
    expect(isBsuid('US.ENT.11815799212886844830')).toBe(true)
  })

  it('rejects phone numbers in every format we store or receive', () => {
    expect(isBsuid('15551230000')).toBe(false)
    expect(isBsuid('+1 555-123-0000')).toBe(false)
    expect(isBsuid('37063949836')).toBe(false)
  })

  it('rejects empty and malformed values', () => {
    expect(isBsuid('')).toBe(false)
    expect(isBsuid('US.')).toBe(false)
    expect(isBsuid('.123')).toBe(false)
    expect(isBsuid('USA.123')).toBe(false) // country code is alpha-2
    expect(isBsuid('us.123')).toBe(false) // Meta uppercases the country code
    expect(isBsuid('US.123.456')).toBe(false) // only .ENT. is a valid infix
  })

  it('rejects an over-long identifier (Meta caps at 128 chars)', () => {
    expect(isBsuid(`US.${'a'.repeat(128)}`)).toBe(true)
    expect(isBsuid(`US.${'a'.repeat(129)}`)).toBe(false)
  })
})

describe('buildRecipientFields', () => {
  it('sends a phone number in `to`', () => {
    expect(buildRecipientFields('15551230000')).toEqual({ to: '15551230000' })
  })

  it('sends a BSUID in `recipient`', () => {
    expect(buildRecipientFields('US.13491208655302741918')).toEqual({
      recipient: 'US.13491208655302741918',
    })
  })

  it('never emits both keys — Meta lets `to` win, silently ignoring the BSUID', () => {
    for (const value of ['15551230000', 'US.13491208655302741918']) {
      const fields = buildRecipientFields(value)
      expect(Object.keys(fields)).toHaveLength(1)
    }
  })

  it('throws on an empty recipient rather than posting a body Meta will 400', () => {
    expect(() => buildRecipientFields('')).toThrow(/recipient/i)
  })
})

describe('resolveSendTarget', () => {
  it('prefers the phone number when the contact has one', () => {
    expect(
      resolveSendTarget({ phone: '15551230000', bsuid: 'US.abc123' })
    ).toBe('15551230000')
  })

  it('falls back to the BSUID for username-only contacts', () => {
    expect(resolveSendTarget({ phone: '', bsuid: 'US.abc123' })).toBe(
      'US.abc123'
    )
    expect(resolveSendTarget({ phone: null, bsuid: 'US.abc123' })).toBe(
      'US.abc123'
    )
  })

  it('returns null when neither identifier is usable', () => {
    expect(resolveSendTarget({ phone: '', bsuid: null })).toBeNull()
    expect(resolveSendTarget({ phone: null, bsuid: '' })).toBeNull()
    expect(resolveSendTarget({})).toBeNull()
  })

  it('ignores a whitespace-only phone rather than treating it as present', () => {
    expect(resolveSendTarget({ phone: '   ', bsuid: 'US.abc123' })).toBe(
      'US.abc123'
    )
  })
})

describe('prepareRecipient', () => {
  it('prepares a phone contact with the full trunk-prefix variant list', () => {
    const r = prepareRecipient({ phone: '+370 63949836' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.isBsuid).toBe(false)
    expect(r.target).toBe('37063949836') // sanitized to digits
    expect(r.variants[0]).toBe('37063949836') // original tried first
    expect(r.variants.length).toBeGreaterThan(1) // trunk-0 variants follow
  })

  it('prepares a BSUID contact verbatim with exactly one variant', () => {
    const r = prepareRecipient({ phone: '', bsuid: 'US.13491208655302741918' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.isBsuid).toBe(true)
    // Verbatim — no sanitizing, no case change, no variants.
    expect(r.target).toBe('US.13491208655302741918')
    expect(r.variants).toEqual(['US.13491208655302741918'])
  })

  it('prefers the phone when a contact carries both identities', () => {
    const r = prepareRecipient({ phone: '15551230000', bsuid: 'US.abc123' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.isBsuid).toBe(false)
    expect(r.target).toBe('15551230000')
  })

  it('reports no_identifier when the contact has neither', () => {
    const r = prepareRecipient({ phone: '', bsuid: null })
    expect(r).toEqual({ ok: false, reason: 'no_identifier' })
  })

  it('reports invalid_phone for a non-E.164 phone, and never for a BSUID', () => {
    expect(prepareRecipient({ phone: '123' })).toEqual({
      ok: false,
      reason: 'invalid_phone',
    })
    // A BSUID would fail isValidE164 — it must not be run through it.
    expect(prepareRecipient({ bsuid: 'US.abc123' }).ok).toBe(true)
  })
})

describe('BSUID_UNSUPPORTED_TEMPLATE_CATEGORIES', () => {
  it('lists authentication, which Meta refuses to deliver to a BSUID', () => {
    expect(BSUID_UNSUPPORTED_TEMPLATE_CATEGORIES).toContain('AUTHENTICATION')
  })
})
